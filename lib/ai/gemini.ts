import { AI_SCHEMA_DOC } from "./schema"

/**
 * Integrasi Gemini untuk chatbot analitik.
 *
 * Dua tahap, dan itu bukan gaya-gayaan:
 *
 *   Tahap 1 — pertanyaan user → SQL. Gemini hanya melihat SKEMA,
 *            tidak melihat data. Jadi model tidak bisa mengarang
 *            angka; dia cuma memilih query.
 *
 *   Tahap 2 — hasil query → jawaban naratif. Gemini baru melihat
 *            angka ASLI hasil eksekusi. Jadi kalimatnya dijamin
 *            berbasis data, bukan tebakan.
 *
 * Kalau satu tahap dilewati, kesalahan yang paling mungkin
 * adalah "angka yang terlihat sangat meyakinkan tapi sepenuhnya
 * fiktif" — dan itu fatal untuk dasbor yang dipakai orang beda.
 *
 * Sengaja memakai `fetch` bawaan Node, bukan SDK Google, supaya
 * tidak menambah dependency di aplikasi yang sekarang sudah irit.
 *
 * CATATAN: berkas ini hanya boleh diimpor dari Route Handler
 * (`app/api/...`). Import dari komponen client akan membocorkan
 * GOOGLE_API_KEY ke bundle browser.
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

export interface AiQueryResult {
  /** SQL yang dijalankan — ditampilkan ke user agar bisa diaudit. */
  sql: string
  /** Baris hasil query (sudah di-limit server-side oleh SQL). */
  rows: Array<Record<string, unknown>>
  /** Jawaban naratif dalam Bahasa Indonesia. */
  answer: string
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "rate" | "no_answer" | "sql" | "unknown" = "unknown",
  ) {
    super(message)
    this.name = "AiError"
  }
}

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY
  if (!key) {
    throw new AiError(
      "GOOGLE_API_KEY belum diisi. Tambahkan di Settings → Environment, lalu redeploy.",
      "config",
    )
  }
  return key
}

interface GeminiPart {
  text: string
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

/**
 * Panggil Gemini dan kembalikan teks balasan.
 *
 * Sengaja `generationConfig.temperature = 0`: untuk=text-to-SQL
 * determinisme lebih berharga daripada keragaman bahasa, karena
 * query yang sama harus menghasilkan SQL yang sama.
 */
async function callGemini(prompt: string): Promise<string> {
  const key = getApiKey()

  let response: Response
  try {
    response = await fetch(`${API_BASE}/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    })
  } catch {
    throw new AiError("Tidak bisa menghubungi layanan AI. Coba lagi sebentar.", "unknown")
  }

  if (response.status === 429) {
    throw new AiError("Batas pemakaian AI tercapai. Coba lagi nanti.", "rate")
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    const body = (await response.json().catch(() => null)) as GeminiResponse | null
    throw new AiError(
      body?.error?.message ?? "API key AI ditolak. Periksa GOOGLE_API_KEY di Vercel.",
      "auth",
    )
  }
  if (!response.ok) {
    throw new AiError(`Layanan AI mengembalikan error (${response.status}).`, "unknown")
  }

  const body = (await response.json()) as GeminiResponse

  // Model bisa menolak menjawab (misal prompt injection dari data).
  // Perlakukan sebagai "tidak ada jawaban", bukan crash.
  if (body.promptFeedback?.blockReason) {
    throw new AiError("Pertanyaan itu tidak bisa dijawab dari data yang tersedia.", "no_answer")
  }

  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text).join("")?.trim()
  if (!text) throw new AiError("Layanan AI tidak mengembalikan jawaban.", "no_answer")
  return text
}

/** Ambil objek JSON pertama yang ada di teks balasan model. */
function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? text).trim()
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

export interface RunQueryFn {
  (sql: string): Promise<Array<Record<string, unknown>>>
}

/**
 * Dua tahap: pertanyaan → SQL → (data asli) → jawaban.
 *
 * `runQuery` dipakai untuk mengeksekusi SQL yang dibuat model.
 * Implementasi Dependency Injection-nya ada di route handler, yang
 * meneruskan JWT user agar RLS tetap berlaku — sehingga model tidak
 * pernah menyentuh koneksi admin.
 */
export async function answerQuestion(
  question: string,
  runQuery: RunQueryFn,
): Promise<AiQueryResult> {
  // ── Tahap 1: SQL ──────────────────────────────────────────────
  const sqlResponse = await callGemini(
    `${AI_SCHEMA_DOC}

Permintaan user: ${question}

Balas HANYA dengan JSON seperti ini, tanpa penjelasan lain:
{"sql": "<query select>", "ringkasan": "<1 kalimat tentang apa yang dicek>"}`,
  )

  const parsed = extractJson<{ sql?: unknown; ringkasan?: unknown }>(sqlResponse)
  const sql = typeof parsed?.sql === "string" ? parsed.sql.trim().replace(/;\s*$/, "") : ""

  // Model kadang menjawab "data ini tidak tersedia" tanpa SQL.
  // Itu jawaban yang benar dan harus diteruskan apa adanya.
  if (!sql) {
    return {
      sql: "",
      rows: [],
      answer:
        typeof parsed?.ringkasan === "string" && parsed.ringkasan.trim()
          ? parsed.ringkasan.trim()
          : "Data untuk pertanyaan itu belum tersedia di dasbor ini.",
    }
  }

  // Validasi dasar di sisi server. Fungsi SQL `exec_ai_query` juga
  // memvalidasi sendiri — ini lapisan kedua supaya query yang jelas-jelas
  // salah tidak sempat menyentuh database.
  if (!/^\s*(select|with)\s/i.test(sql)) {
    throw new AiError("Model menghasilkan query yang tidak diizinkan.", "sql")
  }

  // ── Eksekusi dengan hak akses user ────────────────────────────
  const rows = await runQuery(sql)

  // ── Tahap 2: narasi berbasis data ─────────────────────────────
  if (rows.length === 0) {
    return {
      sql,
      rows,
      answer:
        "Query sudah dijalankan tapi tidak ada baris yang cocok. " +
        "Coba longgarkan rentang tanggal, atau periksa apakah filter yang dipakai terlalu spesifik.",
    }
  }

  const answer = await callGemini(
    `${AI_SCHEMA_DOC}

User bertanya: ${question}

Hasil query (JSON, sudah diformat dari database):
${JSON.stringify(rows)}

Tulis jawaban dalam BAHASA INDONESIA yang ringkas untuk operator lapangan:
- Maksimal 4 kalimat pendek. Langsung tohok, tanpa basa-basi.
- Pakai HANYA angka yang ada di JSON di atas. Kalau angkanya tidak ada,
  katakan tidak ada — jangan menebak.
- Sebut causes-nya kalau polanya terlihat (mis. naik karena volume naik,
  atau naik karena nilai per dokumen naik).
- Nominal rupiah ditulis dengan titik ribuan (contoh: 1.500.000).
- Jangan mengulang query SQL dalam jawaban.

Balas hanya teks jawaban, tanpa JSON, tanpa markdown.`,
  )

  return { sql, rows, answer }
}
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

/**
 * Model default.
 *
 * PENTING: jangan hardcode nama model lama. `gemini-2.5-flash` sudah
 * "no longer available to new users" (error 404 dari Google), yang
 * membuat fitur mati total bagi siapa pun yang membuat key baru.
 * `gemini-flash-latest` selalu menunjuk ke flash terbaru yang tersedia.
 * Bisa ditimpa lewat GEMINI_MODEL kalau perlu.
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest"
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

/**
 * Daftar model cadangan.
 *
 * Layanan Gemini sesekali membalas "high demand" pada model tertentu
 * (sebagai 503) meski model lain sehat — mencoba model berikutnya
 * membuat fitur tetap jalan saat satu endpoint sedang padat.
 *
 * Nama di sini harus ada di daftar Models API; nama yang salah akan
 * dibalas 404 dan percobaan itu mubazir. `gemini-flash-latest` dan
 * `gemini-flash-lite-latest` adalah alias resmi yang ikut naik versi
 * sendiri, jadi keduanya tidak perlu diubah saat Google merilis model
 * baru. Semua nama di bawah sudah dicek terhadap Models API.
 */
const FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-flash-lite-latest",
  "gemini-3.7-flash",
]

/** Error yang layak dicoba ulang: rate limit, kuota habis, atau model sibuk. */
function isRetryableStatus(status: number, message: string): boolean {
  if (status === 429) return true
  const m = message.toLowerCase()
  return (
    m.includes("high demand") ||
    m.includes("exceeded your current quota") ||
    m.includes("resource_exhausted") ||
    m.includes("overloaded")
  )
}

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
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

/** Batas token keluaran per tahap — lihat penjelasan di callGeminiOnce. */
const MAX_TOKENS_SQL = 1024
const MAX_TOKENS_NARASI = 512

/**
 * Baris maksimal yang dikirim ke tahap narasi.
 *
 * Query boleh mengembalikan 200 baris (batas `exec_ai_query`), tapi
 * mengirim semuanya ke model itu boros besar: 200 baris × belasan kolom
 * bisa memakan puluhan ribu token, padahal untuk menulis ringkasan
 * empat kalimat cukup beberapa baris pertama. Tabel lengkapnya tetap
 * ditampilkan di UI — yang dibatasi hanya yang dibaca model.
 */
const MAX_ROWS_FOR_NARRATION = 40

/**
 * Panggil Gemini dan kembalikan teks balasan.
 *
 * Sengaja `generationConfig.temperature = 0`: untuk=text-to-SQL
 * determinisme lebih berharga daripada keragaman bahasa, karena
 * query yang sama harus menghasilkan SQL yang sama.
 */
/**
 * Panggil satu model sekali.
 *
 * `maxOutputTokens` sengaja diminta per-panggilan, bukan angka besar
 * yang sama untuk semua: tahap SQL hanya menghasilkan satu kalimat SQL,
 * tahap narasi menghasilkan maksimal empat kalimat. Memasang 2048 di
 * keduanya membiarkan model menulis jauh lebih banyak daripada yang
 * dibutuhkan — dan di paket gratis Google, token keluaran ikut dihitung
 * terhadap kuota.
 */
async function callGeminiOnce(
  prompt: string,
  model: string,
  maxOutputTokens: number,
): Promise<string> {
  const key = getApiKey()

  let response: Response
  try {
    response = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens },
      }),
    })
  } catch {
    throw new AiError("Tidak bisa menghubungi layanan AI. Coba lagi sebentar.", "unknown")
  }

  // Pesan error selalu dibaca lebih dulu: kondisi seperti kuota habis
  // atau "high demand" muncul sebagai 403/400, bukan 429 — jadi
  // klasifikasi harus membaca teksnya, bukan hanya kode status.
  const body = (await response.json().catch(() => null)) as GeminiResponse | null
  const message = body?.error?.message ?? ""

  // Catat pemakaian token ke log server. Di paket gratis Google, kuota
  // adalah batas yang paling sering bikin fitur mati mendadak; tanpa
  // angka ini penyebabnya cuma bisa ditebak. Tidak dikirim ke browser.
  if (body?.usageMetadata) {
    console.log("[ai] token", {
      model,
      masuk: body.usageMetadata.promptTokenCount,
      keluar: body.usageMetadata.candidatesTokenCount,
      total: body.usageMetadata.totalTokenCount,
    })
  }

  // 404 = nama model tidak dikenal atau tidak tersedia untuk akun ini.
  // Nama model ikut disebut supaya mudah diperbaiki.
  if (response.status === 404) {
    throw new AiError(`Model AI "${model}" tidak tersedia untuk akun ini.`, "auth")
  }

  if (isRetryableStatus(response.status, message)) {
    throw new AiError(message || "Batas pemakaian AI tercapai. Coba lagi nanti.", "rate")
  }

  if (response.status === 401 || response.status === 403) {
    throw new AiError(
      message || "API key AI ditolak. Periksa GOOGLE_API_KEY di Vercel.",
      "auth",
    )
  }
  if (response.status === 400) {
    throw new AiError(message || "Permintaan AI tidak valid.", "sql")
  }
  if (!response.ok) {
    throw new AiError(`Layanan AI mengembalikan error (${response.status}).`, "unknown")
  }

  // Model bisa menolak menjawab (mis. prompt injection dari data).
  // Perlakukan sebagai "tidak ada jawaban", bukan crash.
  if (body?.promptFeedback?.blockReason) {
    throw new AiError("Pertanyaan itu tidak bisa dijawab dari data yang tersedia.", "no_answer")
  }

  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("")?.trim()
  if (!text) throw new AiError("Layanan AI tidak mengembalikan jawaban.", "no_answer")
  return text
}

/**
 * Panggil Gemini dengan fallback antar-model.
 *
 * Model pertama yang dipakai adalah MODEL (atau GEMINI_MODEL). Kalau
 * model itu sedang sibuk atau kuartanya habis, coba model cadangan —
 * karena "high demand" bersifat sementara dan model lain sering tetap
 * sehat. Dengan begitu fitur tidak mati total hanya karena satu endpoint
 * sedang padat.
 */
async function callGemini(prompt: string, maxOutputTokens: number): Promise<string> {
  const candidates = Array.from(
    new Set([MODEL, ...FALLBACK_MODELS].filter(Boolean)),
  )

  let lastError: AiError | null = null

  for (const model of candidates) {
    try {
      return await callGeminiOnce(prompt, model, maxOutputTokens)
    } catch (error) {
      // Hanya kondisi sementara yang layak dicoba ke model lain.
      // Key ditolak akan gagal di semua percobaan, jadi langsung dilempar
      // supaya tidak menghabiskan kuota dengan percobaan sia-sia.
      if (error instanceof AiError && error.kind !== "rate") throw error
      lastError = error instanceof AiError ? error : null
    }
  }

  throw (
    lastError ??
    new AiError("Layanan AI sedang tidak tersedia. Coba lagi sebentar.", "rate")
  )
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
    MAX_TOKENS_SQL,
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

  // Nol baris: jawab langsung tanpa memanggil model sama sekali —
  // memanggilnya hanya akan menghasilkan kalimat basi dan membuang kuota.
  if (rows.length === 0) {
    return {
      sql,
      rows,
      answer:
        "Query sudah dijalankan tapi tidak ada baris yang cocok. " +
        "Coba longgarkan rentang tanggal, atau periksa apakah filter yang dipakai terlalu spesifik.",
    }
  }

  // ── Tahap 2: narasi berbasis data ─────────────────────────────
  //
  // PENTING (hemat token): tahap ini TIDAK lagi mengirim AI_SCHEMA_DOC.
  // Deskripsi skema hanya berguna untuk menyusun SQL; di sini model cuma
  // perlu menuliskan angka yang sudah ada. Mengirimnya ulang membuat
  // ~92% isi prompt terbuang, dan itu terjadi di setiap pertanyaan.
  //
  // Baris juga dipotong ke MAX_ROWS_FOR_NARRATION — lihat alasannya di
  // definisi konstanta itu.
  const rowsForModel = rows.slice(0, MAX_ROWS_FOR_NARRATION)
  const answer = await callGemini(
    `Kamu menulis jawaban singkat untuk operator armada trucking "Midaa", dalam BAHASA INDONESIA.

User bertanya: ${question}

Data hasil query database (JSON):
${JSON.stringify(rowsForModel)}

Tulis jawaban:
- Maksimal 4 kalimat pendek. Langsung ke pokoknya, tanpa basa-basi.
- Pakai HANYA angka yang ada di JSON di atas. Kalau tidak ada, katakan
  tidak ada — jangan menebak.
- Sebut penyebabnya kalau polanya terlihat (mis. naik karena jumlah
  dokumen naik, atau karena nilai per dokumen naik).
- Nominal rupiah ditulis dengan titik ribuan (contoh: 1.500.000).
- Jangan mengulang SQL. Jangan pakai markdown.

Balas hanya teks jawaban.`,
    MAX_TOKENS_NARASI,
  )

  return { sql, rows, answer }
}
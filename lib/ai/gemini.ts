import { AI_SCHEMA_DOC } from "./schema"
import { callOpenKey, OpenKeyError } from "./openkey"
import {
  AI_PERSONA,
  AI_USER_CONTEXT,
  buildHistoryBlock,
  buildKpiBlock,
  buildMemoryBlock,
  type ConversationTurn,
} from "./persona"

/**
 * Integrasi Gemini untuk chatbot analitik.
 *
 * Dua tahap, dan itu bukan gaya-gayaan:
 * * Tahap 1 — pertanyaan user -> SQL. Gemini hanya melihat SKEMA,
 *            tidak melihat data. Jadi model tidak bisa mengarang
 *            angka; dia cuma memilih query.
 *
 *   Tahap 2 — hasil query -> jawaban naratif. Gemini baru melihat
 *            angka ASLI hasil eksekusi. Jadi kalimatnya dijamin
 *            berbasis data, bukan tebakan.
 *
 * Kalau satu tahap dilewati, kesalahan yang paling mungkin
 * adalah "angka yang terlihat sangat meyakinkan tapi sepenuhnya
 * fiktif" — dan itu fatal untuk dasbor yang dipakai orang beda.
 *
 * Tahap 2 sekaligus menulis JSON berisi jawaban + butir memori baru,
 * jadi ekstraksi memori tidak memakai panggilan model tambahan.
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
 * sendiri, jadi keduanya tidak perlu diubah saat Google rilis model baru.
 */
const FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-flash-lite-latest",
  "gemini-3.7-flash",
]

/**
 * Batas waktu per panggilan OpenKey dari chatbot analitik.
 *
 * Satu pertanyaan bisa memanggil model 2-3 kali (SQL, percobaan ulang,
 * narasi). Dengan 25 detik per panggilan, worst-case tetap jauh di
 * bawah batas 90 detik yang dipakai briefing — dipilih khusus model
 * reasoning lama, bukan untuk percakapan interaktif.
 */
const CHAT_TIMEOUT_OPENKEY_MS = 25_000

/**
 * Rantai prompt yang dipakai seluruh tahap chatbot: OpenKey UTAMA
 * (kunci OPENKEY_API_KEY — berbayar, kuota jelas, tidak ikut paket
 * gratis Google yang mudah habis), dengan Gemini sebagai cadangan
 * otomatis.
 *
 * Pola ini sama dengan route /api/analisa/summary: provider utama
 * gagal (kuota, rate limit, key ditolak, gantung/timeout) → tangan ke
 * provider kedua dengan prompt identik. Hanya `no_answer` yang TIDAK
 * di-switch: menyuru model lain menulis ulang jawaban yang sengaja
 * dikosongkan hanya membuang kredit.
 *
 * Kalau OPENKEY_API_KEY belum diisi (mis. preview tanpa kunci), fungsi
 * ini otomatis memakai Gemini persis seperti sebelumnya — degradasi
 * aman, tidak ada jalur yang mati.
 */
export async function callAi(
  prompt: string,
  maxOutputTokens: number,
  temperature: number,
  /** Batas waktu yang disarankan untuk kaki OpenKey. */
  timeoutMs?: number,
): Promise<string> {
  if (process.env.OPENKEY_API_KEY) {
    try {
      return await callOpenKey(prompt, maxOutputTokens, temperature, timeoutMs ?? CHAT_TIMEOUT_OPENKEY_MS)
    } catch (error) {
      const switchable = error instanceof OpenKeyError && error.kind !== "no_answer"
      if (!switchable) throw asAiError(error)
      console.error("[ai] OpenKey gagal, beralih ke Gemini:", error.message)
    }
  }
  return callGemini(prompt, maxOutputTokens, temperature)
}

/**
 * OpenKeyError ke AiError supaya klasifikasi status HTTP di route
 * handler (config/auth/rate/no_answer) tetap konsisten di kedua
 * provider. error bukan keduanya diperlakukan "unknown".
 */
function asAiError(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof OpenKeyError) {
    const kind: AiError["kind"] =
      error.kind === "config" ||
      error.kind === "auth" ||
      error.kind === "rate" ||
      error.kind === "no_answer"
        ? error.kind
        : "unknown"
    return new AiError(error.message, kind)
  }
  return new AiError("Tidak bisa menghubungi layanan AI. Coba lagi sebentar.", "unknown")
}

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
  /** Saran tanya-lanjutan (maksimal 3) — opsional, bisa kosong. */
  saran?: string[]
  /**
   * Butir memori yang layak diingat dari percakapan barusan.
   *
   * Dikembalikan, bukan langsung disimpan, supaya route handler yang
   * memutuskan cara menyimpannya — sehingga ada jalur untuk memfilter,
   * menggabungkan, atau mengabaikan tanpa mengubah lapisan model.
   */
  remembered: string[]
}

/**
 * Saran tanya-lanjutan dari model — maksimal 3, non-wajib. Bila model
 * tidak memberi saran (malah formatnya rusak/ld), daftar kosong dan UI
 * tidak menampilkan chip apa pun — fitur ini tidak boleh membuat
 * jawaban jadi gagal.
 */
export interface SaranContextual {
  saran: string[]
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "rate" | "no_answer" | "sql" | "unknown" = "unknown",
    /**
     * Detail teknis apa adanya (mis. pesan asli PostgreSQL).
     *
     * Sengaja terpisah dari `message`: yang dilihat user sudah
     * diterjemahkan jadi kalimat ramah, tapi model perlu melihat
     * pesan aslinya untuk memperbaiki query-nya. Tanpa ini, satu
     * kesalahan nama kolom langsung berakhir dengan jawaban "gagal
     * dijalankan" padahal sebenarnya bisa diperbaiki sendiri.
     */
    readonly detail?: string,
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
// Dinaikkan dari 512 karena tahap 2 sekarang menulis JSON berisi jawaban
// PLUS daftar memori baru — dua field itu tidak muat di 512 token begitu
// kalimatnya mulai membawa penjelasan.
const MAX_TOKENS_NARASI = 700

/**
 * Temperature per tahap.
 *
 * Tahap SQL tetap 0: hasil query harus bisa direproduksi, dan prompt
 * yang sedikit beda tidak boleh mengubah kolom yang dipilih.
 *
 * Tahap narasi memakai 0.7 supaya jawaban terasa hidup dan santai.
 * Angka di dalam jawaban sudah terkunci oleh data, jadi keragaman di
 * sini hanya memengaruhi kalimat — bukan isi faktualnya.
 */
const TEMPERATURE_SQL = 0
const TEMPERATURE_NARASI = 0.7

/**
 * Baris maksimal yang dikirim ke tahap narasi.
 *
 * Query boleh mengembalikan 200 baris (batas `exec_ai_query`), tapi
 * mengirim semuanya ke model itu boros besar: 200 baris x belasan kolom
 * bisa memakan puluhan ribu token, padahal untuk menulis ringkasan
 * empat kalimat cukup beberapa baris pertama. Tabel lengkapnya tetap
 * ditampilkan di UI — yang dibatasi hanya yang dibaca model.
 */
const MAX_ROWS_FOR_NARRATION = 40

/**
 * Berapa kali model boleh mencoba menulis ulang query yang gagal.
 *
 * Text-to-SQL tanpa percobaan ulang itu rapuh: satu nama kolom yang
 * meleset sudah cukup untuk membuat seluruh pertanyaan gagal, padahal
 * skema yang sama ada di depan mata model. Satu percobaan perbaikan
 * hampir selalu berhasil, dua sudah lebih dari yang perlu.
 *
 * Biayanya satu panggilan model tambahan, dan HANYA dibayar kalau
 * query pertamanya benar-benar gagal — kasus yang jarang.
 */
const MAX_SQL_ATTEMPTS = 2

/** Batas token untuk jawaban singkat tanpa query (sapaan, identitas, umum). */
const MAX_TOKENS_CHAT = 400

/**
 * Berapa butir memori baru yang boleh keluar dari satu jawaban.
 *
 * Dipisah dari `MAX_MEMORY_ITEMS` di memory.ts: itu batas total yang
 * disimpan di database, sedangkan ini batas yang boleh diminta model
 * per percakapan supaya daftar ingatan tidak cepat penuh.
 */
const MAX_NEW_MEMORIES = 2

/**
 * Panggil satu model sekali.
 *
 * `maxOutputTokens` dan `temperature` sengaja diminta per-panggilan,
 * bukan angka global yang sama untuk semua. Tahap SQL butuh satu
 * kalimat SQL yang deterministik; tahap narasi butuh paragraf pendek
 * yang terasa manusiawi. Memasang batas besar di keduanya membiarkan
 * model menulis jauh lebih banyak daripada yang dibutuhkan — dan di
 * paket gratis Google, token keluaran ikut dihitung terhadap kuota.
 */
async function callGeminiOnce(
  prompt: string,
  model: string,
  maxOutputTokens: number,
  temperature: number,
  signal?: AbortSignal,
): Promise<string> {
  const key = getApiKey()

  let response: Response
  try {
    response = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens },
      }),
      // Opsional — dipakai pemanggil yang butuh batas waktu ketat (mis.
      // fallback analisa supaya request tidak menggantung tanpa akhir).
      signal,
    })
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AiError("Layanan AI terlalu lama merespons.", "rate")
    }
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
 *
 * Diekspor supaya route /api/analisa/summary bisa memakainya sebagai
 * fallback provider: kredensialnya sama-sama server-side, dan analisa
 * tidak mati hanya karena kredit OpenKey habis.
 */
export async function callGemini(
  prompt: string,
  maxOutputTokens: number,
  temperature: number,
  /** Batas waktu opsional per pemanggilan (semua model kandidat). */
  signal?: AbortSignal,
): Promise<string> {
  const candidates = Array.from(
    new Set([MODEL, ...FALLBACK_MODELS].filter(Boolean)),
  )

  let lastError: AiError | null = null

  for (const model of candidates) {
    try {
      return await callGeminiOnce(prompt, model, maxOutputTokens, temperature, signal)
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

/** Potongan SQL yang boleh diulang ke model saat memperbaiki query. */
const MAX_REPAIR_SQL_LENGTH = 600

/**
 * Susun prompt tahap 1.
 *
 * `failures` berisi hasil percobaan yang sudah gagal. Isinya bukan
 * pesan error mentah untuk dibaca user, tapi bekal bagi model supaya
 * tahu persis salah di mana query sebelumnya — nama kolom yang tidak
 * ada, fungsi yang salah tipe, dan seterusnya.
 */
function buildSqlPrompt(
  question: string,
  historyBlock: string,
  viewBlock: string,
  failures: SqlFailure[],
): string {
  const parts = [AI_SCHEMA_DOC, historyBlock]

  if (viewBlock) parts.push("", viewBlock)

  if (failures.length > 0) {
    parts.push(
      "",
      "## Percobaan sebelumnya GAGAL — perbaiki, jangan ulangi",
      ...failures.map(
        (f, i) =>
          `Percobaan ${i + 1}:` +
          `\nSQL: ${f.sql.slice(0, MAX_REPAIR_SQL_LENGTH)}` +
          `\nError: ${f.error}`,
      ),
      "",
      "Baca error itu baik-baik. Nama kolom dan nama fungsi HARUS ditulis",
      "persis seperti tertulis di skema di atas, tidak boleh ditebak.",
      "Kalau memang tidak ada kolom yang cocok, pakai kolom terdekat yang",
      "nilainya setara, atau balas dengan sql kosong.",
    )
  }

  parts.push(
    "",
    `Permintaan user: ${question}`,
    "",
    "Balas HANYA dengan JSON seperti ini, tanpa penjelasan lain:",
    '{"sql": "<query select>", "ringkasan": "<1 kalimat tentang apa yang dicek>"}',
    "",
    "PENTING soal sql kosong:",
    "Kalau pertanyaannya TIDAK bisa dijawab dengan SELECT di atas — misalnya",
    "sapaan, tanya siapa kamu, minta perkenalan, atau opini/fakta umum di luar",
    "data armada — maka tulis \"sql\": \"\" dan isi ringkasan dengan jawaban",
    "singkatnya. JANGAN memaksakan query yang tidak nyambung. Pertanyaan umum",
    "TETAP dijawab (tahap berikutnya yang menuliskannya) — hanya bukan diminta",
    "lewat query.",
  )

  return parts.join("\n")
}

interface SqlFailure {
  sql: string
  error: string
}

/**
 * Ambil pesan Postgres asli dari error.
 *
 * `AiError.detail` dipakai kalau ada (route handler sudah memisahkannya
 * dari kalimat yang dilihat user). Kalau tidak, `message` dipakai
 * sebagai cadangan supaya blok perbaikan tetap punya sesuatu.
 */
function sqlErrorDetail(error: unknown): string {
  if (error instanceof AiError) return error.detail || error.message
  if (error instanceof Error) return error.message
  return "Error tidak diketahui."
}

/**
 * Jawab pertanyaan yang TIDAK jalannya tanpa query database.
 *
 * Dipakai untuk dua hal yang berbeda, dan penting keduanya tidak
 * diblokir:
 *
 *   1. Sapaan / "siapa kamu" / pertanyaan identitas — dijawab dari
 *      persona dan ingatan.
 *   2. Pertanyaan umum DI LUAR data dasbor (apa itu SLA, tips;
 *      hitungan kecil) — dijawab dari pengetahuan umum model.
 *      Modelnya general-purpose, jadi tidak ada alasan menolak.
 *
 * Yang satu-satunya dilarang: mengarang angka dasbor. Di jalur ini
 * tidak ada data yang diberikan, jadi angka dasbor yang bukan dari
 * query TIDAK BOLEH muncul — itu konsequensi utama seluruh ini.
 */
async function answerChatQuestion(
  question: string,
  memories: string[],
  viewBlock: string = "",
): Promise<{ answer: string; remembered: string[]; saran: string[] }> {
  const raw = await callAi(
    [
      AI_PERSONA,
      "",
      AI_USER_CONTEXT,
      buildKpiBlock(),
      ...(viewBlock ? ["", viewBlock] : []),
      "",
      buildMemoryBlock(memories),
      "",
      `User bertanya: ${question}`,
      "",
      "Catatan: pertanyaan ini dijawab TANPA data database — kamu tidak",
      "melihat angka apa pun dari dasbor sekarang. Maka:",
      "- Pertanyaan umum: jawab langsung dari pengetahuanmu, ringkas,",
      "  boleh pakai isi ingatan di atas kalau relevan.",
      "- Yang butuh angka dasbor: jangan mengarang angkanya. Bilang",
      "  datanya perlu dicek ulang di dasbor, dan tawarkan bentuk",
      "  pertanyaan yang bisa dijawab dari data (mis. rentang waktunya,",
      "  plat atau rute yang dicek).",
      "- Pertanyaan tentang kamu atau user: jawab dari persona + ingatan,",
      "  jangan mengarang identitas baru.",
      "",
      "Balas HANYA dengan JSON, tanpa penjelasan lain:",
      '{"jawaban": "<teks jawaban>", "ingat": ["<butir yang layak diingat>"], "saran": ["<maksimal 3 pertanyaan lanjutan yang relevan>"]}',
      "",
      "Aturan untuk field \"saran\": tanya-lanjutan yang menggali ke arah data",
      "yang bisa dijawab dasbor (mis. kuncinya rentang waktu / plat) — singkat,",
      "maksimal 3, kosong bila tidak ada yang relevan.",
    ].join("\n"),
    MAX_TOKENS_CHAT,
    TEMPERATURE_NARASI,
  )

  return parseNarration(raw)
}

/**
 * Baca JSON {jawaban, ingat} dari balasan model.
 *
 * Model kadang membalas teks biasa dan mengabaikan format JSON.
 * Daripada membuang seluruh panggilan, teks mentah dipakai sebagai
 * jawaban — isinya tetap kalimat yang benar, hanya bagian memorinya
 * yang kosong.
 */function parseNarration(raw: string): { answer: string; remembered: string[]; saran: string[] } {
  const narration = extractJson<{ jawaban?: unknown; ingat?: unknown; saran?: unknown }>(raw)
  const answer =
    typeof narration?.jawaban === "string" && narration.jawaban.trim()
      ? narration.jawaban.trim()
      : raw

  const remembered = Array.isArray(narration?.ingat)
    ? narration.ingat
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length >= 3)
        .slice(0, MAX_NEW_MEMORIES)
    : []

  // Saran follow-up: divalidasi ketat — hanya kalimat pendek yang bersih.
  // Format rusak / terlalu panjang dibuang diam-diam, bukan menggagalkan
  // jawaban yang sudah jadi.
  const saran = Array.isArray(narration?.saran)
    ? (narration.saran as unknown[])
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 120))
        .filter((item) => item.length >= 5)
        .slice(0, 3)
    : []

  return { answer, remembered, saran }
}

/**
 * Konteks tambahan yang boleh ikut dipertimbangkan saat menjawab.
 *
 * Dua sumber, sengaja dipisah karena sifatnya berbeda: `history`
 * membawa percakapan yang sedang berjalan (singkat, cepat basi),
 * sedangkan `memories` membawa catatan jangka panjang user (bertahan
 * lintas sesi dan lintas perangkat).
 */
export interface QuestionContext {
  history?: ConversationTurn[]
  memories?: string[]
  /** Menu UI yang sedang dibuka user — di-whitelist, dipakai sebagai hint konteks */
  view?: string
}

/**
 * Menu yang BULIH disebut ke model — whitelist, bukan string bebas dari
 * klien. Isinya cuma label Indonesia; bila klien mengirim id lain, bloknya
 * kosong dan tidak ada apa pun yang berubah di prompt.
 */
const VIEW_PROMPT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  equipment: "Equipment",
  maintenance: "Histories",
  monitoring: "Monitoring",
  skr: "SKR",
  pengiriman: "Pengiriman",
  ban: "Analisa Ban",
  weather: "Perkiraan Cuaca",
  traffic: "Lalu Lintas",
  analisa: "Analisa",
}

function buildViewBlock(view?: string): string {
  if (!view) return ""
  const label = VIEW_PROMPT_LABELS[view]
  if (!label) return ""
  return [
    "## Konteks UI",
    `User sedang membuka menu "${label}" — sapukan jawaban ke data yang`,
    "nyambung dengan menu itu bila relevan. Isi datanya TIDAK ada di sini;",
    "bila perlu angka, susun SQL sesuai skema di atas.",
  ].join("\n")
}

/**
 * Dua tahap: pertanyaan -> SQL -> (data asli) -> jawaban.
 *
 * `runQuery` dipakai untuk mengeksekusi SQL yang dibuat model.
 * Implementasi Dependency Injection-nya ada di route handler, yang
 * meneruskan JWT user agar RLS tetap berlaku — sehingga model tidak
 * pernah menyentuh koneksi admin.
 */
export async function answerQuestion(
  question: string,
  runQuery: RunQueryFn,
  context: QuestionContext = {},
): Promise<AiQueryResult> {
  // ── Tahap 1: SQL ─────────────────────────────────────────────
  //
  // Riwayat percakapan ikut di sini, bukan di tahap 2: pertanyaan
  // lanjutan seperti "yang bulan lalu berapa?" hanya bisa jadi SQL
  // yang benar kalau model tahu apa yang dimaksud "yang".
  //
  // Memori jangka panjang SENGAJA tidak ikut di tahap ini. Isinya
  // kalimat preferensi user, bukan filter query, dan menambahkannya
  // hanya menambah token tanpa memperbaiki SQL.
  const historyBlock = buildHistoryBlock(context.history ?? [])
  const viewBlock = buildViewBlock(context.view)
  const failures: SqlFailure[] = []

  let sql = ""
  let ringkasan = ""
  let rows: Array<Record<string, unknown>> = []

  for (let attempt = 1; attempt <= MAX_SQL_ATTEMPTS; attempt++) {
    const sqlResponse = await callAi(
      buildSqlPrompt(question, historyBlock, viewBlock, failures),
      MAX_TOKENS_SQL,
      TEMPERATURE_SQL,
      CHAT_TIMEOUT_OPENKEY_MS,
    )

    const parsed = extractJson<{ sql?: unknown; ringkasan?: unknown }>(sqlResponse)
    const candidate =
      typeof parsed?.sql === "string" ? parsed.sql.trim().replace(/;\s*$/, "") : ""
    if (typeof parsed?.ringkasan === "string") ringkasan = parsed.ringkasan.trim()

    // Model kadang menjawab "data ini tidak tersedia" tanpa SQL.
    // Itu jawaban yang benar dan harus diteruskan apa adanya.
    if (!candidate) break

    // Validasi dasar di sisi server. Fungsi SQL `exec_ai_query` juga
    // memvalidasi sendiri — ini lapisan kedua supaya query yang jelas-jelas
    // salah tidak sempat menyentuh database.
    if (!/^\s*(select|with)\s/i.test(candidate)) {
      throw new AiError("Model menghasilkan query yang tidak diizinkan.", "sql")
    }

    try {
      rows = await runQuery(candidate)
      sql = candidate
      break
    } catch (error) {
      // Percobaan terakhir: error diteruskan apa adanya supaya
      // route handler bisa menulis detail aslinya ke log server.
      if (attempt === MAX_SQL_ATTEMPTS) throw error
      failures.push({ sql: candidate, error: sqlErrorDetail(error) })
    }
  }

  // ── Jalur tanpa SQL ────────────────────────────────────────────
  //
  // Dua kemungkinan sampai ke sini, dan keduanya BUKAN error:
  //   1. Model memutuskan pertanyaannya tidak bisa dijawab dari
  //      database (mis. "siapa kamu", "terima kasih").
  //   2. Datanya memang tidak tersedia.
  //
  // Keduanya dijawab lewat panggilan model sendiri yang memakai
  // persona + memori, TANPA data. Dulu jalur ini langsung memakai
  // `ringkasan` dari tahap SQL apa adanya, dan hasilnya jadi aneh:
  // pertanyaan identitas dijawab dengan query sia-sia, dan
  // Midaa mengarang nama peran sendiri ("Midaa Fleet Analytics
  // Assistant") yang tidak ada di mana pun.
  //
  // Memakai persona di sini juga membuat ingatan yang tersimpan
  // ("pengembangmu adalah Audy Al Vasyah") bisa dipakai menjawab
  // pertanyaan identitas — itu justru gunanya memori.
  if (!sql) {
    const chat = await answerChatQuestion(question, context.memories ?? [], viewBlock)
    return {
      sql: "",
      rows: [],
      answer: chat.answer || ringkasan || "Data untuk pertanyaan itu belum tersedia di dasbor ini.",
      remembered: chat.remembered,
      saran: chat.saran,
    }
  }

  // Nol baris: jawab langsung tanpa memanggil model sama sekali —
  // memanggilnya hanya akan menghasilkan kalimat basi dan membuang kuota.
  //
  // Kalimatnya sengaja NETRAL. Dulu yang ditulis di sini menyebut
  // "rentang tanggalnya kepilih terlalu sempit", padahal penyebabnya
  // belum tentu begitu: bisa jadi memang tidak ada data > 24 jam, bukan
  // karena filter terlalu sempit. Menyebutkan penyebab yang belum
  // diketahui membuat user mengejar masalah yang tidak ada.
  if (rows.length === 0) {
    return {
      sql,
      rows,
      answer:
        "Sudah aku cek dan tidak ada data yang cocok dengan filter itu. " +
        "Kalau biasanya ada, coba longgarkan rentang tanggalnya atau plat yang dicari.",
      remembered: [],
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

  // Prompt dirakit dengan array + join, bukan template literal: teksnya
  // panjang dan penuh kutip, jadi bentuknya lebih mudah diawasi dan tidak
  // ada backtick yang bisa menutup literal lebih awal.
  const raw = await callAi(
    [
      AI_PERSONA,
      "",
      AI_USER_CONTEXT,
      buildKpiBlock(),
      ...(viewBlock ? ["", viewBlock] : []),
      "",
      `User bertanya: ${question}`,
      buildMemoryBlock(context.memories ?? []),
      "",
      "Data hasil query database (JSON):",
      JSON.stringify(rowsForModel),
      "",
      "Struktur jawaban (WAJIB untuk pertanyaan analitik):",
      "- Mulai dari angka utama hasil query — persis seperti datanya, tanpa pembulatan sendiri.",
      "- Lalu artinya: naik/turun/stabil, membanding kalau datanya mendukung",
      "  (pakai kolom persen atau bulan lalu bila ada di hasil).",
      "- Tutup dengan SATU insight yang bisa dipakai memutuskan: apa yang paling",
      "  mencurigakan atau menjanjikan dari angka itu, dan satu langkah lanjutan",
      "  yang masuk akal untuk Head of Transport (mis. cek plat X, tekan ulang",
      "  vendor Y, geser ritase rute Z).",
      "- Penilaian boleh tajam, tapi JANGAN mengarang penyebab yang tidak ada di data.",
    "",
    "Balas HANYA dengan JSON, tanpa penjelasan lain:",
    '{"jawaban": "<teks jawaban>", "ingat": ["<butir yang layak diingat>"], "saran": ["<maksimal 3 pertanyaan lanjutan yang relevan>"]}',
    "",
    "Aturan untuk field \"saran\":",
    "- PERTANYAAN lanjutan yang membantu user menggali lebih dalam dari",
    "  jawaban barusan — bukan tanya yang sudah terjawab, bukan juga",
    "  pertanyaan bermakna umum yang sudah jelas tidak akan terjawab di sini.",
    "- Masing-masing satu kalimat pendek (maks ~80 karakter), tanpa tanda kutip.",
    "- Maksimal 3; kalau tidak ada yang relevan, kirim array kosong.",
    "",
    "Aturan untuk field \"ingat\":",
      "- Ini bukan catatan-opsional: kalau user menyuruhmu ingat sesuatu",
      "  (kata \"ingat\", \"selalu\", \"biasanya\", \"mulai sekarang\", \"jangan lupa\",",
      "  \"preferensiku\"), itu WAJIB masuk. Jangan tunggu dia minta dua kali.",
      "- Catat juga preferensi yang muncul tanpa diminta: rentang tanggal",
      "  kesukaan, unit atau toko yang selalu difilter, istilah yang dia pakai",
      "  untuk sesuatu, format export yang diminta berulang.",
      "- Bentuk kalimatnya harus bisa dipakai ulang sendiri di percakapan",
      "  berikutnya, contoh: \"User selalu memakai rentang 3 bulan\".",
      "  Kalimatnya berbahasa Indonesia yang wajar, tanpa simbol aneh.",
      "- JANGAN simpan angka hasil query, nilai, atau tanggal — semuanya cepat basi.",
      "- JANGAN simpan apa pun yang cuma berlaku untuk pertanyaan ini.",
      `- Maksimal ${MAX_NEW_MEMORIES} butir, masing-masing satu kalimat pendek tanpa tanda kutip.`,
      "- Kalau tidak ada yang layak diingat, kirim array kosong.",
    ].join("\n"),
    MAX_TOKENS_NARASI,
    TEMPERATURE_NARASI,
  )

  const { answer, remembered, saran } = parseNarration(raw)

  return { sql, rows, answer, remembered, saran }
}

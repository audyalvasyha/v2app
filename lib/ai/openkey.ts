/**
 * Klien OpenKey — provider AI kompatibel OpenAI Chat Completions.
 *
 * Sengaja memakai `fetch` bawaan Node, bukan SDK `openai`, supaya tidak
 * menambah dependency di aplikasi yang sudah irit — pola yang sama dengan
 * `lib/ai/gemini.ts`. Format request/response mengikuti OpenAI:
 *
 *   { model, messages } → { choices: [{ message: { content } }] }
 *
 * Env yang diisi user (Settings → Environment / freebuff-env):
 *   OPENKEY_API_KEY   — kunci `ok_live_…` (WAJIB, tanpa prefix NEXT_PUBLIC_)
 *   OPENKEY_MODEL     — opsional, default "auto" (provider memilih modelnya)
 *   OPENKEY_BASE_URL  — opsional, default https://open.api-github.com/v1
 *
 * CATATAN: hanya boleh diimpor dari Route Handler (`app/api/**`). Import
 * dari komponen client akan membocorkan OPENKEY_API_KEY ke bundle browser.
 */

const BASE_URL = (process.env.OPENKEY_BASE_URL || "https://open.api-github.com/v1").replace(/\/$/, "")
/**
 * Model default: flagship OpenKey (claude-opus-5.5).
 *
 * Dinas transport brief ini tugasnya kecil (satu paragraf berbasis angka),
 * tapi flagship dipilih supaya narasi paling stabil mengikuti aturan
 * "angka jangan diubah" — model kecil cenderung menyisipkan pembulatan
 * sendiri. Kalau kredit jadi perhatian, timpa lewat env OPENKEY_MODEL
 * tanpa mengubah kode (mis. claude-sonnet-5.5 atau gemini-3.8-flash).
 */
const MODEL = process.env.OPENKEY_MODEL || "claude-sonnet-5.5"

export class OpenKeyError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "rate" | "no_answer" | "unknown" = "unknown",
  ) {
    super(message)
    this.name = "OpenKeyError"
  }
}

function getApiKey(): string {
  const key = process.env.OPENKEY_API_KEY
  if (!key) {
    throw new OpenKeyError(
      "OPENKEY_API_KEY belum diisi. Tambahkan di Settings → Environment, lalu reload halaman.",
      "config",
    )
  }
  return key
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

export async function chatCompletion(opts: {
  /** Pesan system — persona + aturan output. */
  system: string
  /** Pesan user — konteks data yang harus dijawab. */
  user: string
  /** Batas token jawaban; default 800 — cukup untuk brief 5 paragraf. */
  maxTokens?: number
  /** Default 0.4: narasi analisa harus konsisten, bukan berimprovisasi. */
  temperature?: number
}): Promise<string> {
  const key = getApiKey()
  const max_tokens = opts.maxTokens ?? 800
  const temperature = opts.temperature ?? 0.4

  let response: Response
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_tokens,
        temperature,
        // Tidak streaming — jawaban analisa dibaca sekaligus, bukan
        // diketik secara bertahap, jadi SSE hanya menambah kompleksitas.
        stream: false,
      }),        // WAJIB ada batas waktu. Tanpa ini, satu provider yang menggantung
        // membuat request analisa menunggu tanpa akhir — user hanya melihat
        // tampilan loading selamanya.
        //
        // 90 detik (bukan 20): model reasoning yang dipilih via OPENKEY_MODEL
        // diukur butuh 27-82 detik per briefing (27% - 79% di antaranya
        // adalah token pertimbangan, bukan jawaban). Dengan tape pendek,
        // OpenKey hampir selalu timeout dan seluruh trafik jatuh ke
        // Gemini flash-lite — briefing yang keluar dangkal. Masih memakai
        // fallback dengan jendela Gemini tersendiri (AbortSignal di route),
        // sehingga user tak pernah ditahan lewat 110-120 detik.
        signal: AbortSignal.timeout(90_000),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new OpenKeyError(
        "Layanan AI terlalu lama merespons (>30 detik) — coba provider cadangan.",
        "rate",
      )
    }
    throw new OpenKeyError("Tidak bisa menghubungi layanan AI. Coba lagi sebentar.", "unknown")
  }

  const body = (await response.json().catch(() => null)) as ChatResponse | null
  const message = body?.error?.message ?? ""

  if (response.status === 401 || response.status === 403) {
    throw new OpenKeyError(message || "Kunci OPENKEY_API_KEY ditolak. Periksa nilainya.", "auth")
  }
  if (response.status === 429) {
    throw new OpenKeyError(message || "Kuota AI tercapai. Coba lagi sebentar.", "rate")
  }
  if (response.status === 404 && message.toLowerCase().includes("model")) {
    throw new OpenKeyError(`Model "${MODEL}" tidak tersedia di provider ini.`, "auth")
  }
  if (!response.ok) {
    throw new OpenKeyError(`Layanan AI mengembalikan error (${response.status}).`, "unknown")
  }

  const text = body?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new OpenKeyError("Layanan AI tidak mengembalikan jawaban.", "no_answer")
  return text
}

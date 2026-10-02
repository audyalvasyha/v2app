import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { answerQuestion, AiError } from "@/lib/ai/gemini"

/**
 * Endpoint chatbot analitik.
 *
 * ── Kenapa JWT user diteruskan, bukan pakai service_role ──
 *
 * Ini keputusan desain paling penting di seluruh fitur ini.
 *
 * Kalau route ini memakai SUPABASE_SERVICE_ROLE_KEY, maka setiap
 * query yang dibuat AI berjalan sebagai admin: melewati semua RLS.
 * Digabung dengan teks-to-SQL, itu berarti model — atau siapa pun
 * yang mengetik di kolom chat — punya jalur baca yang berbeda dari
 * yang kamu lihat di dashboard. `auth_lockdown.sql` jadi tidak berarti apa-apa.
 *
 * Jadi: route ini tidak pernah membaca SUPABASE_SERVICE_ROLE_KEY.
 * Ia meneruskan access token milik user yang sedang login, sehingga
 * query dijalankan dengan identitas user itu sendiri dan RLS
 * `authenticated_baca_*` tetap berlaku persis seperti di halaman lain.
 *
 * Praktisnya untuk Midaa: user login tetap hanya membaca baris yang
 * memang dia boleh baca, dan tidak ada jalur escalation，即使
 * token bocor.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Batas question dipotong di sini supaya prompt tidak bisa dipakai
// untuk menyelundupkan instruksi panjang.
const MAX_QUESTION_LENGTH = 500

// ── Rate limit per user ─────────────────────────────────────────
// Kuota Gemini gratis sangat kecil (~15 request/menit), dan SETIAP
// pertanyaan di sini memakan dua panggilan model (SQL lalu narasi).
// Tanpa batas ini, satu tab yang dikirim spam — atau satu script yang
// memegang sesi login — bisa menghabiskan seluruh kuota dalam hitungan
// detik dan mematikan fitur ini untuk semua orang sekaligus.
//
// Peta in-memory: berlaku per instance serverless (berkurang tiap cold
// start). Cukup untuk meredam spam dari satu proses; rate limit di edge
// tetap lebih kuat bila suatu saat diperlukan.
const RATE_LIMIT_PER_MINUTE = 8
const RATE_WINDOW_MS = 60_000
const recentHits = new Map<string, number[]>()

function withinRateLimit(userId: string): boolean {
  const now = Date.now()
  const list = (recentHits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (list.length >= RATE_LIMIT_PER_MINUTE) {
    recentHits.set(userId, list)
    return false
  }
  list.push(now)
  recentHits.set(userId, list)
  // Jaga peta tetap kecil — kalau tidak, setiap user yang pernah
  // bertanya meninggalkan entri selamanya (kebocoran memori per-instance).
  if (recentHits.size > 2000) recentHits.clear()
  return true
}

export async function POST(request: Request) {
  let question: unknown
  try {
    const body = await request.json()
    question = body?.question
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON." }, { status: 400 })
  }

  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "Pertanyaan tidak boleh kosong." }, { status: 400 })
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Pertanyaan maksimal ${MAX_QUESTION_LENGTH} karakter.` },
      { status: 400 },
    )
  }

  // ── Auth ────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? ""
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!accessToken) {
    return NextResponse.json(
      { error: "Sesi tidak ditemukan. Silakan masuk ulang." },
      { status: 401 },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Konfigurasi Supabase server belum lengkap." },
      { status: 500 },
    )
  }

  // Klien dengan identitas user: anon key untuk handshake, tapi
  // setiap request membawa JWT user sehingga PostgREST mengevaluasi
  // RLS sebagai role `authenticated`.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Verifikasi token benar-benar valid sebelum menghabiskan token AI.
  const { data: userData, error: authError } = await userClient.auth.getUser(accessToken)
  if (authError || !userData.user) {
    return NextResponse.json(
      { error: "Sesi tidak valid. Silakan masuk ulang." },
      { status: 401 },
    )
  }

  // Baru setelah identitas pasti: kuota dihitung per user, bukan per IP,
  // supaya refresh halaman atau IP kantor yang sama tidak saling
  // mematikan kuota. 429 (bukan 400) supaya jelas ini bukan kesalahan
  // dari isi pertanyaannya.
  if (!withinRateLimit(userData.user.id)) {
    return NextResponse.json(
      {
        error:
          "Terlalu banyak pertanyaan dalam waktu singkat. " +
          `Tunggu satu menit (maksimal ${RATE_LIMIT_PER_MINUTE} pertanyaan per menit).`,
      },
      { status: 429 },
    )
  }

  // ── Tanya AI, jalankan query, susun jawaban ────────────────────
  try {
    const result = await answerQuestion(question.trim(), async (sql) => {
      const { data, error } = await userClient.rpc("exec_ai_query", { p_query: sql })
      if (error) {
        // Pesan dari exec_ai_query sengaja dibuat ramah user (mis.
        // "Hanya query SELECT yang diizinkan"), jadi apa adanya
        // sudah informatif.
        //
        // SQL-nya ikut dicatat di log server (bukan dikirim ke browser)
        // supaya kegagalan seperti "function to_char(text, unknown) does
        // not exist" bisa langsung dilihat query mana yang menyebabkannya —
        // tanpa itu, kita cuma menebak dari pesan error Postgres.
        console.error("[ai/ask] SQL gagal:", { sql, error: error.message })
        throw new AiError(error.message, "sql")
      }
      return (data as Array<Record<string, unknown>>) ?? []
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AiError) {
      // 503 untuk rate limit: ini kondisi sementara, bukan permintaan
      // yang salah. Status 400 akan membuat klien (dan kamu saat debug)
      // mengira pertanyaannya bermasalah, padahal masalahnya di sisi kita.
      const status =
        error.kind === "config" || error.kind === "auth"
          ? 500
          : error.kind === "rate"
            ? 503
            : 400
      return NextResponse.json({ error: error.message }, { status })
    }
    // Jangan kirim detail tak terduga ke browser — bisa memuat
    // informasi internal yang tidak perlu dilihat pengguna.
    console.error("[ai/ask] tidak terduga:", error)
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memproses pertanyaan." },
      { status: 500 },
    )
  }
}
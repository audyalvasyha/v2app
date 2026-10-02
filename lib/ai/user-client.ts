import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Klien Supabase dengan hak akses milik user yang sedang login.
 *
 * Dipisah karena sekarang ada dua route AI (`/api/ai/ask` dan
 * `/api/ai/memory`) yang butuh hal yang persis sama: ambil JWT dari
 * header `Authorization`, pastikan env ada, lalu validasi token. Menyalin
 * ulang potongan itu di dua berkas berarti aturan "jangan pernah pakai
 * service role di sini" punya dua salinan yang bisa berbeda someday.
 *
 * ── Kenapa TIDAK pernah ada service role di berkas ini ──
 *
 * Kalau route AI memakai SUPABASE_SERVICE_ROLE_KEY, semua query yang
 * ditulis model akan berjalan sebagai admin: melewati seluruh RLS.
 * Digabung dengan text-to-SQL, itu berarti ada jalur baca yang berbeda
 * dari yang kamu lihat di dasbor, dan `auth_lockdown.sql` jadi tidak
 * berarti apa pun. Karena itu seluruh akses memori juga lewat identitas
 * user yang sama — RLS `user_id = auth.uid()` yang menjaga isi memorinya.
 */

export interface AuthedUserClient {
  client: SupabaseClient
  userId: string
}

export type AuthResult =
  | { ok: true; value: AuthedUserClient }
  | { ok: false; response: NextResponse }

/**
 * Header bearer wajib. Tanpa ini tidak ada identitas yang bisa
 * dipastikan, jadi request ditolak (bukan "coba dulu", fail-closed).
 */
function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? ""
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null
}

/**
 * Bangun klien beridentitas user dari sebuah Request.
 *
 * Dijalankan dua kali (sekali untuk membuat klien, sekali untuk
 * memvalidasi token) karena `auth.getUser()` butuh round-trip ke
 * Supabase Auth. Round-trip itu memang mahal: tanpanya, Route Handler
 * akan menghabiskan kuota Gemini untuk permintaan yang sebenarnya sudah
 * tidak punya sesi aktif.
 */
export async function requireUserClient(request: Request): Promise<AuthResult> {
  const accessToken = readBearerToken(request)
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sesi tidak ditemukan. Silakan masuk ulang." },
        { status: 401 },
      ),
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Konfigurasi Supabase server belum lengkap." },
        { status: 500 },
      ),
    }
  }

  // Anon key hanya untuk handshake; setiap request tetap membawa JWT user
  // sehingga PostgREST mengevaluasi RLS sebagai role `authenticated`.
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sesi tidak valid. Silakan masuk ulang." },
        { status: 401 },
      ),
    }
  }

  return { ok: true, value: { client, userId: data.user.id } }
}

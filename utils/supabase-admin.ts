import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Klien Supabase server-side dengan SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
 *
 * Dipakai HANYA oleh API route server (mis. cron reminder). Key ini tidak
 * pernah sampai ke browser: file ini hanya diimpor dari route server dan env
 * `SUPABASE_SERVICE_ROLE_KEY` TIDAK memakai prefix NEXT_PUBLIC.
 *
 * Setelah supabase/sql/auth_lockdown.sql dijalankan (SELECT dikunci khusus
 * authenticated), cron wajib memakai klien ini — klien anon tidak lagi bisa
 * membaca tabel. Bila key belum di-set, getSupabaseAdmin() mengembalikan null
 * dan pemanggil boleh jatuh ke klien anon (masih jalan selama RLS belum
 * dikunci) dengan pesan error yang menjelaskan.
 */
let cachedClient: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient | null {
    if (cachedClient) return cachedClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return null

    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    return cachedClient
}

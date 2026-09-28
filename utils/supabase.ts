import {createClient, type SupabaseClient} from '@supabase/supabase-js'

// Klien dibuat lazy + defensif: jika env belum terisi, aplikasi tetap jalan
// (UI menampilkan error) alih-alih crash saat module load dengan halaman blank.

let cachedClient: SupabaseClient | null = null
let configError: string | null = null

function getClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    configError = "Konfigurasi Supabase belum tersedia (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    return null
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey)
  return cachedClient
}

// Proxy agar pemakaian tetap sama: supabase.from('...').select(...)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient()
    if (!client) {
      // Lempar error yang informatif — tertangkap oleh caller (fetchData) dan
      // ditampilkan sebagai pesan error, bukan halaman blank.
      throw new Error(configError || "Supabase client belum siap.")
    }
    const value = Reflect.get(client, prop, client)
    return typeof value === "function" ? value.bind(client) : value
  },
})

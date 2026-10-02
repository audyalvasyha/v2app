import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Ingatan jangka panjang untuk Tanya Data.
 *
 * ── Kenapa bukan localStorage ──
 *
 * Riwayat percakapan memang disimpan di browser (lihat `ai-chat.tsx`),
 * tapi memori yang sesungguhnya perlu dua hal yang localStorage tidak
 * punya:
 *
 *   1. bertahan lintas perangkat — hari ini dicek dari laptop, besok dari
 *      HP di lapangan, konteksnya harus sama;
 *   2. bertahan lintas sesi — hasil query bulan lalu tetap relevan
 *      minggu depan.
 *
 * Karena itu memorinya hidup di Postgres, di tabel `ai_memory`.
 *
 * ── Isolasi per user ──
 *
 * Tiap baris punya `user_id` dan policy RLS-nya cuma mengizinkan
 * `auth.uid()`. Route handler selalu memakai klien beridentitas user
 * (lihat `user-client.ts`), TIDAK pernah service role — jadi user A
 * tidak punya jalur apa pun untuk membaca ingatan user B, dan conjunta
 * dengan penguncian data di `auth_lockdown.sql`.
 *
 * ── Degradasi aman ──
 *
 * Tabel ini belum tentu ada (script-nya opsional). Semua fungsi di sini
 * tidak melempar error kalau tabel belum ada: chatbot tetap jalan tanpa
 * memori, cuma tidak ingat apa-apa. Membiarkan fitur dies total karena
 * satu migration belum dijalankan akan jauh lebih buruk.
 */

const TABLE = "ai_memory"

/** Batas isi per item — prompt tidak boleh ditumpuk catatan panjang. */
export const MAX_MEMORY_LENGTH = 300

/**
 * Batas jumlah item per user.
 *
 * Dua alasan: prompt tidak boleh membengkak tanpa batas (biaya token),
 * dan ingatan yang menumpuk terlalu banyak justru membuat model
 * memilih yang salah — 20 catatan yang relevan lebih berguna dari 200
 * yang setengah basi.
 */
export const MAX_MEMORY_ITEMS = 40

export interface MemoryItem {
  id: string
  content: string
  created_at: string
}

export interface MemorySnapshot {
  items: MemoryItem[]
  /** false = tabel belum ada / tidak bisa diakses. bukan error fatal. */
  available: boolean
}

/** PostgreSQL "undefined_table" — artinya script SQL belum dijalankan. */
function isMissingTable(message: string): boolean {
  return message.includes("ai_memory") || message.toLowerCase().includes("does not exist")
}

/** Buang spasi ganda, rapatkan, potong ke batas. */
export function normalizeMemoryContent(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_LENGTH)
}

/**
 * Baca semua memori milik user.
 *
 * Urutan terbaru dulu supaya saat hanya 20 dari 40 yang boleh ikut
 * prompt, yang terbawa adalah yang paling baru — bukan yang paling lama.
 */
export async function loadMemories(client: SupabaseClient): Promise<MemorySnapshot> {
  const { data, error } = await client
    .from(TABLE)
    .select("id, content, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_MEMORY_ITEMS)

  if (error) {
    if (!isMissingTable(error.message)) {
      console.error("[ai/memory] gagal membaca memori:", error.message)
    }
    return { items: [], available: false }
  }

  const items = (data ?? []) as MemoryItem[]
  return { items, available: true }
}

/**
 * Simpan beberapa memori baru sekaligus.
 *
 * Dipanggil setelah satu pertanyaan dijawab, dengan butir yang perlu
 * diingat oleh model (mis. "user selalu pakai filter 3 bulan"). Hasil
 * balikannya dipakai route handler untuk memberi tahu UI apa saja yang
 * baru masuk.
 *
 * Best-effort: kegagalan menulis memori tidak boleh menggagalkan jawaban
 * yang sudah berhasil dihitung.
 */
export async function saveMemories(
  client: SupabaseClient,
  contents: string[],
): Promise<MemoryItem[]> {
  const fresh = contents.map(normalizeMemoryContent).filter((c) => c.length >= 3)
  if (fresh.length === 0) return []

  // Dedupe dulu terhadap isi yang sudah ada. Tanpa ini, pertanyaan yang
  // sama diulang beberapa kali akan menumpuk salinan ingatan yang
  // isinya identik — dan setiap salinan memakan kuota prompt.
  const existing = await loadMemories(client)
  if (!existing.available) return []

  const seen = new Set(existing.items.map((item) => item.content.toLowerCase()))
  const unique = fresh.filter((content) => {
    const key = content.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (unique.length === 0) return []

  const rows = unique.slice(0, 3).map((content) => ({
    id: crypto.randomUUID(),
    content,
  }))

  const { data, error } = await client.from(TABLE).insert(rows).select("id, content, created_at")
  if (error) {
    console.error("[ai/memory] gagal menyimpan memori:", error.message)
    return []
  }

  // Sisipkan memotong daftar lama supaya batas per user tetap berlaku
  // tanpa perlu pembersihan terjadwal.
  const stale = existing.items
    .map((item) => item.id)
    .slice(rows.length)
  if (stale.length > 0) {
    const { error: pruneError } = await client.from(TABLE).delete().in("id", stale)
    if (pruneError) {
      console.error("[ai/memory] gagal memangkas memori lama:", pruneError.message)
    }
  }

  return (data ?? []) as MemoryItem[]
}

/** Hapus satu memori. Penghapusan milik user lain tetap ditolak RLS. */
export async function deleteMemory(client: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await client.from(TABLE).delete().eq("id", id)
  if (error) {
    if (!isMissingTable(error.message)) {
      console.error("[ai/memory] gagal menghapus memori:", error.message)
    }
    return false
  }
  return true
}

/** Kosongkan seluruh memori user (dipakai tombol "Lupakan semua"). */
export async function clearMemories(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from(TABLE).delete().neq("id", "")
  if (error) {
    if (!isMissingTable(error.message)) {
      console.error("[ai/memory] gagal mengosongkan memori:", error.message)
    }
    return false
  }
  return true
}

/**
 * Isi memori dalam bentuk string, siap ditempel ke prompt.
 *
 * Dipisah dari tabel supaya prompt hanya menerima teks yang sudah
 * dibersihkan — tidak pernah ada ID atau timestamp yang bocor ke model.
 */
export function toPromptMemories(items: MemoryItem[]): string[] {
  return items.map((item) => item.content).filter((content) => content.length > 0)
}

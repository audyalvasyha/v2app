/**
 * Saran pertanyaan untuk chatbot.
 *
 * Dipisah dari `schema.ts` dengan sengaja: `schema.ts` berisi
 * deskripsi database lengkap dan hanya boleh dipakai di server.
 * Kalau komponen client mengimpornya, seluruh deskripsi tabel ikut
 * masuk ke bundle browser — bukan rahasia besar, tapi tetap menambah
 * ukuran bundle tanpa guna.
 *
 * Isinya juga serves sebagai contoh gaya bahasa user, sehingga
 * pertanyaan yang diketik orang cenderung mirip dengan yang
 * dilatih di prompt.
 */

export const AI_SUGGESTIONS: string[] = [
  "SKR kita kenapa tinggi bulan ini?",
  "Alasan redelivery apa yang paling sering?",
  "Unit mana yang paling boros biaya perbaikan?",
  "Berapa rata-rata durasi outbound per hari?",
  "Unit mana yang telat servis?",
  "Ban mana yang perlu tindakan?",
]

/**
 * Saran PER MENU — panel chat announce di semua halaman, jadi contoh
 * pertanyaannya ikut konteks menu yang sedang dibuka. Kuncinya anggota
 * `View` dari dashboard-layout; menu yang tidak dicantumkan di sini
 * otomatis jatuh ke daftar umum `AI_SUGGESTIONS`.
 */
export const AI_SUGGESTIONS_BY_VIEW: Record<string, string[]> = {
  dashboard: [
    "Ringkas kondisi armada hari ini",
    "Unit mana yang telat servis?",
    "Berapa rata-rata durasi outbound per hari?",
  ],
  equipment: [
    "Unit mana yang sudah lewat jadwal servis?",
    "Berapa unit yang belum punya jadwal servis?",
    "Armada tipe apa yang paling banyak di DC?",
  ],
  maintenance: [
    "Biaya perbaikan 30 hari terakhir di unit mana saja?",
    "Unit apa yang paling boros biaya perbaikan?",
    "Perbaikan apa yang paling sering terjadi?",
  ],
  monitoring: [
    "Unit mana yang servisnya paling mendesak?",
    "Berapa unit yang odometer-nya hampir masuk jadwal servis?",
  ],
  skr: [
    "SKR kita kenapa tinggi bulan ini?",
    "Alasan redelivery apa yang paling sering?",
    "Customer mana yang SKR-nya paling banyak?",
  ],
  pengiriman: [
    "Ritase hari ini berapa dibanding minggu lalu?",
    "Unit apa yang keluar paling sering minggu ini?",
    "Ada hari tanpa keberangkatan dalam 30 hari terakhir?",
  ],
  ban: [
    "Ban mana yang perlu tindakan?",
    "Kapan terakhir unit tertekan diperiksa ban-nya?",
    "Berapa ban yang sudah gundul di armada ini?",
  ],
  analisa: [
    "Ritase saya vs target 1,1 gimana?",
    "Redelivery masih di atas target?",
    "KPI mana yang paling jauh dari target?",
  ],
  weather: [
    "Rute mana yang rentan hujan besok?",
    "Jam berapa hari ini aman untuk berangkat?",
  ],
}

/** Pilih saran sesuai menu aktif — gagal aman ke daftar umum. */
export function suggestionsForView(view: string | undefined | null): string[] {
  if (!view) return AI_SUGGESTIONS
  return AI_SUGGESTIONS_BY_VIEW[view] ?? AI_SUGGESTIONS
}
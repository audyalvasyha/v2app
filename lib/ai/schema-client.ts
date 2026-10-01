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
]
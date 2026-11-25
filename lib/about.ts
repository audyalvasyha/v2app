/**
 * Sumber tunggal konten halaman Tentang.
 *
 * Dipakai oleh `components/organisms/about-view.tsx` untuk tampilan dan
 * `lib/ai/persona.ts` untuk konteks Tanya Midaa. Kalau teks di sini berubah,
 * halaman dan jawaban AI ikut berubah — tidak ada dua salinan yang bisa
 * saling menyimpang.
 */

export interface AboutSpec {
  label: string
  value: string
}

export interface AboutCapability {
  index: string
  title: string
  desc: string
}

export const ABOUT_VERSION = "v2.2"

export const ABOUT_SUMMARY =
  "Satu dasbor operasional untuk mengelola armada kendaraan: inventaris " +
  "unit, riwayat perbaikan, pengingat servis, sisa kiriman, keadaan lalu " +
  "lintas rute pengiriman, perkiraan cuaca, sampai asisten AI yang menjawab " +
  "pertanyaan data langsung dari database. Satu kotak pencarian di header " +
  "menembus seluruh menu — sampai nama toko di SKR maupun freight order — " +
  "dan kartu ringkasan di dashboard membuka pintu ke setiap menu dalam satu " +
  "klik. Dibangun agar tim lapangan dan tim administrasi membaca angka yang " +
  "sama."

// Data teknis ditulis sebagai baris spesifikasi (bukan badge) agar terasa
// seperti lembar data produk, bukan deretan chip generik.
export const ABOUT_SPECS: readonly AboutSpec[] = [
  { label: "Framework", value: "Next.js 16 · App Router" },
  { label: "Bahasa", value: "TypeScript" },
  { label: "Antarmuka", value: "Tailwind CSS + shadcn/ui + Framer Motion" },
  { label: "Basis Data", value: "Supabase · PostgreSQL · RLS" },
  {
    label: "Integrasi",
    value: "TomTom · OSRM · Open-Meteo · Gemini · Resend · AppSheet",
  },
  { label: "Visualisasi", value: "Recharts · Leaflet" },
]

export const ABOUT_CAPABILITIES: readonly AboutCapability[] = [
  {
    index: "01",
    title: "Inventaris Unit",
    desc: "Setiap unit tercatat lengkap dengan nomor plat, tahun konstruksi, dan odometer terakhir. Status ketersediaan langsung terbaca dari tabel.",
  },
  {
    index: "02",
    title: "Riwayat Perbaikan & Ban",
    desc: "Seluruh pengeluaran pemeliharaan tersimpan per unit, dirangkum jadi tren biaya harian — termasuk analisa ban dengan peta posisi roda interaktif.",
  },
  {
    index: "03",
    title: "Servis Rutin & Reminder Email",
    desc: "Status servis dari tanggal dan odometer; unit terlewat atau mendekati jadwal dikirim otomatis lewat email harian.",
  },
  {
    index: "04",
    title: "Sisa Kiriman (SKR)",
    desc: "Dasbor Sisa Kiriman per armada, sales, dan toko: dokumen, qty, dan nilai berdampingan dengan tren harian. Mencari via header langsung menampilkan daftar detail dokumen yang cocok — tanpa grafik mengganggu.",
  },
  {
    index: "05",
    title: "Pengiriman Outbound",
    desc: "Jam keluar dan kembali tiap armada dirangkap durasi tempuh, dengan filter rentang tanggal dan pencarian cepat nomor polisi.",
  },
  {
    index: "06",
    title: "Monitoring Lalu Lintas",
    desc: "Peta 19 rute dari pool Bagan Batu: garis jalan asli OSRM, kondisi live TomTom dengan fallback estimator, ETA yang memperhitungkan kepadatan, dan pola historis per jam.",
  },
  {
    index: "07",
    title: "Perkiraan Cuaca",
    desc: "Ramalan 7 hari untuk 20 titik Rokan Hilir dengan penilaian risiko perjalanan dan rekomendasi jam berangkat ideal — menggabungkan cuaca dan kebiasaan macet.",
  },
  {
    index: "08",
    title: "Tanya Data (AI)",
    desc: "Pertanyaan bahasa sehari-hari diubah jadi SQL dan dijawab dari angka database asli. Sadar konteks menu yang sedang dibuka, jawaban tampil terformat (bold, poin), ingat preferensi antar sesi, bisa dibuka dengan Alt+A, dan percakapan bisa diunduh untuk laporan.",
  },
  {
    index: "09",
    title: "Analisa KPI Eksekutif",
    desc: "Matriks KPI manajemen transport — biaya perbaikan, redelivery, sisa kiriman, ritase — dianalisis AI bergaya briefing pagi seorang Head of Transport, dengan angka tabel yang dibangun server (tidak pernah dikarang model) dan fallback dua provider.",
  },
  {
    index: "10",
    title: "Ban Harian",
    desc: "Hasil pemeriksaan ban driver app per posisi roda: tekanan psi, ketebalan mm, kondisi, dan foto — dipetakan ke peta roda interaktif, daftar prioritas unit yang perlu tindakan, dan export CSV untuk tim bengkel.",
  },
  {
    index: "11",
    title: "Import Data Harian",
    desc: "Halaman terproteksi login untuk mengunggah CSV dari sistem: baris yang sama ditimpa, yang baru ditambah — data hari sebelumnya tetap aman.",
  },
  {
    index: "12",
    title: "Pencarian Global Lintas-Menu",
    desc: "Satu kotak pencarian di header (Ctrl + /) menyaring semua menu sekaligus: nopol, nama toko, salesman, freight order. Hasilnya tampil sebagai dropdown lintas menu berpola command palette — klik lompat langsung ke menunya, dari menu mana pun termasuk dashboard.",
  },
]

export const ABOUT_SKILLS: readonly string[] = [
  "Next.js",
  "TypeScript",
  "Tailwind",
  "Supabase",
  "Framer Motion",
  "GitHub",
  "Vercel",
]

export const ABOUT_PROFILE = {
  name: "Audy Al Vasyah",
  role: "Transport Planner & Operations Tech",
  bio: "Menggabungkan sisi *engineering* dengan pengelolaan armada: menyusun arsitektur aplikasi, merancang antarmuka, hingga mengintegrasi *database* dari hulu ke hilir.",
  email: "audialfasha@gmail.com",
  instagramHandle: "@audysignin",
  instagramUrl:
    "https://www.instagram.com/audysignin?stkn=d3hubDN6eTBnMG8x",
} as const

export const ABOUT_PROCESS_NOTE =
  "Pengoptimalan komponen ke pola *Atomic Design*, penajaman performa di " +
  "ekosistem Next.js, serta penyempurnaan antarmuka dengan Tailwind dan " +
  "shadcn/ui dikerjakan bersama asisten AI sebagai rekan peninjau memeriksa " +
  "keputusan teknis."

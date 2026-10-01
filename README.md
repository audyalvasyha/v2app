# Transport Management System — Midaa

Dasbor operasional untuk mengelola armada kendaraan: inventaris unit, riwayat perbaikan,
pengingat servis, sisa kiriman (SKR), dan pengiriman outbound — agar tim lapangan dan
tim administrasi membaca angka yang sama.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?style=flat-square&logo=vercel)

---

## Fitur

### Akses Login (Autentikasi)
Seluruh aplikasi berada di balik **gerbang login Supabase Auth** — hanya user
terdaftar yang bisa mengakses:

- Pengunjung yang belum masuk otomatis disodori halaman login; sesi tersimpan
  dan tetap aktif antar kunjungan sampai tombol **Keluar** ditekan di header
  (yang juga menampilkan email yang sedang login).
- Akun yang sama dipakai dashboard dan halaman import SKR
  (`skr.transportbaganbatu.com`) — satu login untuk semuanya.
- **Membuat user baru**: Supabase Dashboard → Authentication → Users →
  Add user (email + password).
- **Penting — matikan pendaftaran mandiri**: Authentication → Sign In /
  Providers → Email → matikan "Allow new users to sign up", supaya orang luar
  tidak bisa membuat akun sendiri dan lolos sebagai user terdaftar.
- **Penguncian data (disarankan)**: jalankan `supabase/sql/auth_lockdown.sql`
  di SQL Editor (sekali, aman diulang) supaya API Supabase menolak pembacaan
  tanpa login — tanpa ini, kunci anon yang tertanam di browser masih bisa
  dipakai menarik data langsung lewat API. Setelah script dijalankan, cron
  reminder wajib memakai `SUPABASE_SERVICE_ROLE_KEY` (lihat Konfigurasi
  Environment).

### Dashboard
Ringkasan satu layar untuk inventaris unit, ketersediaan, biaya, dan jadwal servis.

- **6 kartu statistik**: total unit, unit tersedia (+persentase kapasitas), biaya 30 hari
  beserta delta persen dibanding 30 hari sebelumnya, rata-rata biaya per unit, servis
  terlewat, dan total biaya keseluruhan.
- **Panel "Perlu Tindakan Segera"**: 5 unit dengan prioritas servis tertinggi (terlewat →
  segera → aman), lengkap dengan tombol pintas ke Monitoring Servis.
- **Grafik tren biaya** harian selama 3 bulan terakhir, tanpa mengubah sumber data.
- **Distribusi Status Unit**: bar bertumpuk per status asli + legenda persentase.
- **Ringkasan 30 Hari**: jumlah entri perbaikan, unit paling boros, dan biaya tertinggi.
- **Riwayat terbaru**: label waktu relatif ("Hari ini", "Kemarin", "12 hari lalu"),
  nomor plat, serta penanda *outlier* untuk biaya ≥ 2× rata-rata.

### Monitoring Servis
- Chip KPI untuk memfilter status: Terlewat, Segera, Aman, Tanpa jadwal.
- Urutan berdasarkan prioritas, jarak servis (hari/km), dan biaya.
- Bar progres siklus servis per unit; baris bisa diklik untuk membuka riwayat servis.
- Pagination internal.

### Equipment
- Empat kartu statistik armada, pencarian + filter status yang saling tersinkron.
- Kolom biaya dan riwayat per unit beserta bar relatif terhadap unit termahal.
- Panel detail expand: identitas unit, status, odometer, dan Siklus servis.
- Pagination internal serta banner error/cache.

### Histories
- Rentang waktu siap pakai (30 hari, 3 bulan, 6 bulan, semua waktu) dan pengurutan.
- Dikelompokkan per bulan dengan subtotal, bar biaya relatif, dan penanda *outlier*.
- Ringkasan total periode.

### SKR — Sisa Kiriman
Dasbor sisa kiriman dari tabel `skr_detail` (parsing tanggal & nilai dipindah ke database
lewat view `skr_ringkasan`):

- **Kartu ringkas**: total qty, total nilai, toko terlibat, alasan POD terbanyak.
- **Tren harian**: grafik kolom berkelompok bulan terakhir vs bulan sebelumnya per
  tanggal 1–31, dengan toggle metrik Qty/Nilai, total per bulan, dan indikator selisih
  yang dibaca dari sisi perbaikan (turun = hijau, naik = primer).
- **Jendela otomatis**: bila bulan berjalan belum berisi (awal bulan), grafik bergeser
  sendiri membandingkan dua bulan terakhir yang punya data.
- **5 Toko dengan SKR Terbesar**: nama toko dari join tabel `customers`, lengkap jumlah
  dokumen, qty, dan nilai — klik baris untuk membuka rincian dokumennya (nomor dokumen,
  tanggal, plat, sales, alasan).
- **Peringkat Armada & Sales**: top/bottom 5 per metrik aktif.
- **Filter**: rentang tanggal (popover preset WIB), pencarian toko/plat/sales/alasan,
  dan chip kategori POD berhitung.
- **Toolbar konsisten** dengan menu Pengiriman: tanggal + pencarian sejajar satu baris.

### Pengiriman
- Tabel `armada_outbound` dengan filter rentang tanggal WIB + pencarian.
- Status keberangkatan per durasi tempuh; export CSV dari sisi klien.

### Import SKR (sub-app `skr.transportbaganbatu.com`)
Halaman `/skr/input` terproteksi **Supabase Auth** — login yang sama dengan
dashboard utama:

- Upload CSV dengan **pemetaan header longgar** — spasi/kapital pada header asli
  ("Delivery Number", "SKR Value", dst.) dikenali otomatis ke kolom database.
- **Upsert harian**: kombinasi `delivery_number + pod_date + skr_base_unit +
  skr_sales_unit + skr_value` jadi sidik jari — baris yang ada ditimpa, yang baru
  ditambah, data hari sebelumnya tetap aman. (Nilai klaim ikut jadi kunci karena
  ada kasus nyata DO & tanggal sama, qty 0, tapi nilai berbeda.)
- Seluruh batch berjalan dalam **satu transaksi atomik** via RPC `upsert_skr_detail`;
  gagal di tengah berarti tidak ada yang berubah.
- Preview 8 baris pertama + peta header sebelum unggah; unduh template CSV standar.
- Middleware mengarahkan subdomain `skr.transportbaganbatu.com` ke halaman ini.

### Tentang
- Spesifikasi teknis, cakupan kemampuan aplikasi, dan profil pengembang.

---

## Catatan Performa

- **Dead-code**: komponen & dependensi sisa template v0 sudah dibersihkan.
  Cek berkala dengan `node scripts/find-unused.mjs` — daftar file yang tak
  terjangkau dari entrypoint `app/`, plus kandidat dependensi yang bisa dicabut.
- **Code splitting per tab**: tiap menu dimuat lewat `next/dynamic`
  (`ssr: false`) sehingga chart `recharts` dan tabel besar baru diunduh saat
  tabnya dibuka.
- **Build**: type checking aktif saat `next build` (`ignoreBuildErrors: false`).

---

## Tumpukan Teknologi

| Lapisan | Teknologi |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19.2, TypeScript 5 |
| Styling | Tailwind CSS v4, shadcn/ui, Radix UI, `lucide-react` |
| Visualisasi | Recharts 2.15 |
| Data | Supabase (PostgreSQL) via `@supabase/supabase-js` |
| State | React Context + hooks kustom |
| Ikon | Lucide React |
| Uji | Vitest (parser CSV) |
| Hosting | Vercel |

---

## Menjalankan Secara Lokal

Repo ini memakai **npm** (berkas `package-lock.json`).

```bash
# 1. Pasang dependensi
npm install

# 2. Siapkan environment
cp .env.example .env.local   # lalu isi nilainya

# 3. Jalankan server pengembangan
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### Perintah yang Tersedia

```bash
npm run dev     # server pengembangan (Turbopack)
npm run build   # build produksi
npm run start   # jalankan hasil build produksi
npm run lint    # ESLint
npm test        # unit test parser CSV (Vitest)
npx tsc --noEmit  # pemeriksaan tipe tanpa emit
```

---

## Konfigurasi Environment

Buat berkas `.env.local` di root proyek:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>

# Wajib setelah supabase/sql/auth_lockdown.sql dijalankan — dipakai cron
# reminder membaca data melewati RLS. Ambil di Supabase Dashboard →
# Project Settings → API → service_role. JANGAN pakai prefix NEXT_PUBLIC
# agar tidak pernah ikut ke bundle browser.
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Dua variabel pertama wajib; service-role baru dibutuhkan setelah akses data
dikunci khusus user terdaftar (sebelum itu cron masih berjalan dengan klien
anon). Klien Supabase dibuat secara **lazy** dan defensif: jika env belum
terisi, aplikasi tetap berjalan dan menampilkan pesan error di dalam UI —
bukan halaman kosong.

Di Vercel, kedua variabel yang sama diisi di Project → Settings → Environment Variables
untuk environment Production dan Preview.

> Jangan pernah meng-commit berkas `.env.local`.

---

## Struktur Data (Supabase)

### Tabel baca dashboard

| Tabel | Isi |
| --- | --- |
| `equipment` | Inventaris unit: plat, tahun, odometer, status |
| `maintenance_histories` | Riwayat perbaikan per unit + biaya (IDR) |
| `service_logs` | Jadwal servis: terakhir & berikutnya (tanggal + odometer) |
| `armada_outbound` | Pengiriman: freight order, plat, jam keluar/kembali |
| `customers` | Master customer: `customer_id`, `customer_name` |

### SKR: `skr_detail` dan view `skr_ringkasan`

`skr_detail` menyimpan baris mentah POD (`pod_date` bertipe TEXT). View
`skr_ringkasan` memindahkan parsing ke database:

- `pod_date` → `pod_d` (DATE, bisa difilter server-side)
- `skr_value` ("169,300") → `nilai` (NUMERIC, bisa di-SUM)
- kolom ikut tersedia: `customer_id`, `delivery_number`, `sales_office`,
  `distribution_channel`, `qty`, `nilai`, dst.

View `customers_ringkas` mengekspos hanya `customer_id` + `customer_name`
(tanpa nomor telepon / NIK sales) untuk kebutuhan join nama toko.

### Import harian (upsert)

Sidik jari baris = `delivery_number + pod_date + skr_base_unit + skr_sales_unit +
skr_value` (unique index). RPC `upsert_skr_detail(jsonb)` — hanya untuk role
`authenticated`, dipanggil dari halaman yang sudah login:

- kombinasi sudah ada → baris ditimpa dengan nilai CSV terbaru
- kombinasi baru → baris ditambah
- baris lama yang tidak ada di CSV → dibiarkan
- seluruh batch dalam satu transaksi (gagal di tengah = tidak ada perubahan)

Role `anon` hanya diberi SELECT (baca dashboard); tidak ada policy tulis.
SQL lengkap: `supabase/sql/skr_ringkasan.sql` dan `supabase/sql/skr_upload.sql`.

---

## Struktur Proyek

```
app/
  layout.tsx            # Root layout, font Geist Mono, Toaster
  page.tsx              # Orkestrasi data + routing antar-tab
  skr/input/page.tsx    # Sub-app import CSV (login gate)
  globals.css           # Token tema, direktif Tailwind
  loading.tsx
components/
  templates/            # Layout dashboard (shell + sidebar)
  organisms/            # Tampilan per halaman + tabel + grafik
  molecules/            # Komponen reusable (StatTile, FilterToolbar, DateRangeField)
  ui/                   # shadcn/ui
  sidebar.tsx           # Navigasi, bisa dikecilkan
  search-bar.tsx        # Pencarian + filter status
hooks/
  use-theme.ts, use-keyboard-shortcuts.ts, use-page-title.ts
lib/
  format.ts             # Format rupiah, angka, tanggal, zona WIB
  service-status.ts     # Perhitungan status jadwal servis
  skr-status.ts         # Helper SKR: tanggal POD, nilai, kategori POD
  skr-analytics.ts      # Agregasi SKR: totals, ranking, tren harian, per toko
  skr-csv.ts            # Parser CSV + pemetaan header + template
  skr-csv.test.ts       # Unit test parser (Vitest)
middleware.ts           # Rewrite subdomain skr.* ke /skr/input
scripts/
  find-unused.mjs       # Audit dead-code (file & dependency tak terjangkau)
supabase/sql/           # Skrip view, RPC & lockdown RLS (SQL Editor)
utils/
  supabase.ts           # Klien Supabase lazy + defensif (browser)
  supabase-admin.ts     # Klien service-role (server/cron saja)
```

Pola **Atomic Design** dipakai konsisten: `ui` → `molecules` → `organisms` → `templates`.

---

## Pintasan Keyboard

| Pintasan | Fungsi |
| --- | --- |
| `Ctrl` + `/` | Fokus ke kolom pencarian |
| `Alt` + `D` | Buka tab Dashboard |
| `Alt` + `M` | Buka tab Monitoring Servis |
| `Alt` + `E` | Buka tab Equipment |
| `Alt` + `H` | Buka tab Histories |
| `Alt` + `T` | Ganti tema terang/gelap |

---

## Catatan Performa

- **Stale-while-revalidate**: hasil fetch disimpan di `localStorage` (kunci `fleet-cache-v2`),
  lalu dirender seketika sambil refresh di latar belakang.
- **Selective column fetch**: hanya kolom yang dipakai UI yang diambil.
- **Memoization**: agregasi dashboard, filter, dan grafik dihitung sekali per perubahan
  dependensi (`useMemo`), bukan di setiap render.
- **Parsing di database**: filter tanggal & penjumlahan nilai SKR dikerjakan view
  `skr_ringkasan` — browser hanya menerima baris yang benar-benar ditampilkan.
- **Single source of truth**: helper format, status servis, dan analitik SKR dipusatkan
  di `lib/`, sehingga nominal rupiah dan badge status konsisten di seluruh aplikasi.

---

## Deployment

Setiap push ke `main` otomatis ter-deploy ke Vercel. Subdomain
`skr.transportbaganbatu.com` diarahkan ke project yang sama (CNAME
`cname.vercel-dns.com`) dan diteruskan ke `/skr/input` oleh middleware.

---

## Pengembang

**Audy Al Vasyah** — Transport Planner & Operations Tech

---

## Lisensi

Proyek ini bersifat privat.

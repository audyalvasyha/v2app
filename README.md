# Fleet Management System

Dasbor operasional untuk mengelola armada kendaraan: inventaris unit, riwayat perbaikan,
dan pengingat servis yang dihitung dari tanggal maupun odometer — agar tim lapangan dan
tim administrasi membaca angka yang sama.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)

---

## Fitur

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

### Tentang
- Spesifikasi teknis, cakupan kemampuan aplikasi, dan profil pengembang.

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
npx tsc --noEmit  # pemeriksaan tipe tanpa emit
```

---

## Konfigurasi Environment

Buat berkas `.env.local` di root proyek:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
```

Keduanya wajib. Klien Supabase dibuat secara **lazy** dan defensif: jika env belum terisi,
aplikasi tetap berjalan dan menampilkan pesan error di dalam UI — bukan halaman kosong.

> Jangan pernah meng-commit berkas `.env.local`.

---

## Struktur Data (Supabase)

Aplikasi membaca tiga tabel. Hanya kolom yang benar-benar dipakai UI yang diambil, sehingga
payload lebih kecil dan query lebih cepat.

### `equipment`

| Kolom | Keterangan |
| --- | --- |
| `id` | Kunci primer |
| `equipment_id` | Kode unit |
| `license_plate` | Nomor plat |
| `description` | Nama/deskripsi unit |
| `company_code` | Kode perusahaan |
| `construction_year` | Tahun pembuatan |
| `last_odometer` | Odometer terakhir (km) |
| `status` | Status unit |
| `created_at` | Waktu pembuatan (untuk pengurutan) |

### `maintenance_histories`

| Kolom | Keterangan |
| --- | --- |
| `id` | Kunci primer |
| `tanggal` | Tanggal perbaikan |
| `equipment_id` | Kode unit |
| `license_plate` | Nomor plat |
| `nama_barang_atau_jasa` | Item/perbaikan yang dilakukan |
| `jumlah_harga` | Biaya (IDR) |

### `service_logs`

| Kolom | Keterangan |
| --- | --- |
| `equipment_id` | Kode unit |
| `service_date` | Tanggal servis terakhir |
| `next_service_date` | Jatuh tempo servis berikutnya |
| `next_service_odometer` | Target odometer servis berikutnya |
| `odometer_at_service` | Odometer saat servis |

### Status Servis

Status dihitung di sisi klien lewat satu fungsi bersama (`lib/service-status.ts`) dengan
ambang batas: **14 hari** atau **1.000 km** sebelum jatuh tempo.

| Status | Keterangan |
| --- | --- |
| Terlewat | Sudah melewati tanggal atau odometer target |
| Segera servis | Remaining ≤ 14 hari atau ≤ 1.000 km |
| Aman | Masih jauh dari jatuh tempo |
| Tanpa jadwal | Unit belum punya log servis |

---

## Struktur Proyek

```
app/
  layout.tsx            # Root layout, provider, font Geist
  page.tsx              # Orkestrasi data + routing antar-tab
  globals.css           # Token tema, direktif Tailwind
  loading.tsx
components/
  templates/            # Layout dashboard (shell + sidebar)
  organisms/            # Tampilan per halaman + tabel + grafik
  molecules/            # Komponen reusable (StatTile, PaginationInput)
  ui/                   # shadcn/ui
  sidebar.tsx           # Navigasi, bisa dikecilkan
  search-bar.tsx        # Pencarian + filter status
hooks/                  # use-theme, use-keyboard-shortcuts, use-mobile
lib/
  format.ts             # Format rupiah, angka, tanggal (sumber tunggal)
  service-status.ts     # Perhitungan status jadwal servis (sumber tunggal)
  unit-status.ts        # Tone warna per status unit
utils/
  supabase.ts           # Klien Supabase lazy + defensif
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

- **Stale-while-revalidate**: hasil fetch disimpan di `localStorage` (kunci `fleet-cache-v1`),
  lalu dirender seketika sambil refresh di latar belakang.
- **Selective column fetch**: hanya kolom yang dipakai UI yang diambil.
- **Memoization**: agregasi dashboard, filter, dan grafik dihitung sekali per perubahan
  dependensi (`useMemo`), bukan di setiap render.
- **Lazy chart**: komponen grafik dimuat saat dibutuhkan.
- **Single source of truth**: helper format dan status servis dipusatkan di `lib/`, sehingga
  nominal rupiah dan badge status konsisten di seluruh aplikasi.

---

## Deployment

Setiap merge ke `main` otomatis ter-deploy. Untuk build manual:

```bash
npm run build
npm run start
```

---

## Pengembang

**Audy Al Vasyah** — Transport Planner & Operations Tech

---

## Lisensi

Proyek ini bersifat privat.

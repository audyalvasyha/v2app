/**
 * Uji skrip SQL terhadap Postgres sungguhan (in-memory).
 *
 * ⚠️ BELUM PERNAH DIJALANKAN SAMPAI TUNTAS.
 * PGlite butuh memori jauh lebih besar daripada yang tersedia di sandbox
 * pengembangan tempat berkas ini ditulis — setiap percobaan dibunuh
 * karena kehabisan memori (exit 137), bahkan sesudah proses preview
 * dihentikan. Jadi harness ini BELUM TERBUKTI, dan kalau ada bug di
 * dalamnya itu belum ketahuan. Jalankan dulu di mesin/CI yang RAM-nya
 * cukup, dan perbaiki apa pun yang gagal sebelum mempercayainya.
 *
 *
 * ── Kenapa ini ada ──
 *
 * Sebelum ini, skrip di `supabase/sql/` hanya pernah dijalankan di
 * SQL Editor Supabase — artinya setiap kesalahan baru ketahuan setelah
 * dikirim ke database produksi. Empat kegagalan beruntun pernah terjadi
 * (42601, 2BP01, 42883, 22007) dan semuanya sebenarnya bisa tertangkap
 * di sini.
 *
 * Harness ini membuat tabel dasar tiruan, lalu menjalankan BERKAS ASLI
 * dari `supabase/sql/` — bukan salinannya — sehingga yang diuji adalah
 * artefak yang benar-benar dipakai.
 *
 * ── Cara menjalankan ──
 *
 * PGlite (Postgres versi WASM) sengaja TIDAK dijadikan dependensi
 * proyek, supaya repo tetap ringan. Pasang di luar proyek:
 *
 *   mkdir -p /tmp/pgtest && cd /tmp/pgtest && npm init -y
 *   npm install @electric-sql/pglite
 *
 * Lalu dari root proyek:
 *
 *   PGLITE_MODULE=/tmp/pgtest/node_modules/@electric-sql/pglite/dist/index.js \
 *     node scripts/test-sql.mjs
 *
 * ── Batasannya ──
 *
 * PGlite berjalan sebagai superuser tanpa peran `anon`/`authenticated`,
 * jadi harness ini TIDAK membuktikan RLS benar-benar menahan akses dari
 * luar. Yang diuji: sintaks SQL, urutan eksekusi, nama kolom, dan logika
 * perhitungan. Pengujian RLS tetap harus lewat Supabase langsung.
 */

const PGLITE_MODULE =
  process.env.PGLITE_MODULE || "/tmp/pgtest/node_modules/@electric-sql/pglite/dist/index.js"

const { PGlite } = await import(PGLITE_MODULE)

const db = new PGlite()

let failures = 0

function check(label, ok, detail = "") {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

/** Jalankan isi sebuah berkas SQL dari repo. */
async function runFile(path) {
  const { readFile } = await import("node:fs/promises")
  const sql = await readFile(path, "utf8")
  await db.exec(sql)
}

// ═══════════════════════════════════════════════════════════════
//  1. Tabel dasar tiruan
//
//  Hanya kolom yang dirujuk skrip SQL di repo yang dibuat. Tabel
//  aslinya punya lebih banyak kolom, tapi itu tidak relevan untuk
//  menguji view.
// ═══════════════════════════════════════════════════════════════
console.log("\n— Menyiapkan tabel dasar —")

await db.exec(`
  -- Peran yang dirujuk grant/policy di skrip repo. Di Supabase sudah
  -- ada; di PGlite harus dibuat sendiri supaya grant tidak gagal.
  create role anon;
  create role authenticated;

  create table public.skr_detail (
    id                bigserial primary key,
    license_no        text,
    salesman          text,
    pod_reason        text,
    skr_base_unit     text,
    pod_date          text,
    skr_sales_unit    bigint,
    skr_value         text,
    customer_id       bigint,
    delivery_number   text
  );

  create table public.customers (
    customer_id   text primary key,
    customer_name text,
    telephone_number text,
    nik_salesman  text
  );

  create table public.equipment (
    id bigserial primary key,
    equipment_id text,
    license_plate text,
    description text,
    company_code text,
    construction_year int,
    last_odometer int,
    status text
  );

  create table public.maintenance_histories (
    id bigserial primary key,
    tanggal date,
    equipment_id text,
    license_plate text,
    nama_barang_atau_jasa text,
    jumlah_harga numeric
  );

  create table public.service_logs (
    equipment_id text,
    service_date date,
    next_service_date date,
    next_service_odometer int,
    odometer_at_service int
  );

  create table public.armada_outbound (
    freight_order text,
    no_polisi text,
    jam_out timestamptz,
    jam_in timestamptz,
    created_at timestamptz
  );
`)

// Data contoh: sengaja memakai format TANGGAL YANG BERBEDA-BEDA, karena
// justru itu sumber masalah di produksi — pod_date datang sebagai teks
// bebas dari sistem lain.
await db.exec(`
  insert into public.skr_detail
    (license_no, salesman, pod_reason, skr_base_unit, pod_date,
     skr_sales_unit, skr_value, customer_id, delivery_number)
  values
    ('B 1234 XY', 'Andi', 'Toko tutup',      'KARUNG', '30-09-2026', 10, '1.500.000', 101, 'DO-001'),
    ('B 1234 XY', 'Andi', 'Alamat salah',    'KARUNG', '23 May 2026', 5,  '750.000',   102, 'DO-002'),
    ('B 5678 ZZ', 'Budi', 'Toko tutup',      'KARUNG', '20260930',    8,  '2.000.000', 101, 'DO-003'),
    ('B 5678 ZZ', 'Budi', 'Penerima tidak ada','KARUNG','30-09-2026',  3,  '450.000',   103, 'DO-004'),
    ('B 9012 AB', 'Cici', 'Toko tutup',      'KARUNG', '31-08-2026',  12,  '1.200.000', 102, 'DO-005'),
    ('B 9012 AB', 'Cici', 'Toko pindah',     'KARUNG', '2026-07-15',   4,  '600.000',   101, 'DO-006'),
    ('B 3456 CD', 'Dedi', 'Tidak ada orang', 'KARUNG', '15-07-2026',   6,  '900.000',   103, 'DO-007');

  insert into public.customers (customer_id, customer_name) values
    ('101', 'Toko Merah'), ('102', 'Toko Biru'), ('103', 'Toko Hijau');

  insert into public.maintenance_histories
    (tanggal, equipment_id, license_plate, nama_barang_atau_jasa, jumlah_harga)
  values
    ('2026-09-05', 'EQ-1', 'B 1234 XY', 'Ganti oli',     500000),
    ('2026-09-18', 'EQ-1', 'B 1234 XY', 'Kampas rem',   2750000),
    ('2026-08-11', 'EQ-2', 'B 5678 ZZ', 'Servis besar', 7000000),
    ('2026-07-02', 'EQ-3', 'B 9012 AB', 'Ganti ban',    1900000);

  insert into public.service_logs
    (equipment_id, service_date, next_service_date, next_service_odometer, odometer_at_service)
  values
    ('EQ-1', '2026-09-05', '2026-11-05', 160000, 148000),
    ('EQ-2', '2026-08-11', '2026-10-01', 210000, 205000);
`)

console.log("  OK   tabel dasar + data contoh siap")

// ═══════════════════════════════════════════════════════════════
//  2. Jalankan berkas SQL ASLI dari repo
//
//  kalau ada error sintaks di sini, skrip ini gagal dengan pesan
//  PostgreSQL yang sebenarnya — bukan tebakan.
// ═══════════════════════════════════════════════════════════════
console.log("\n— Menjalankan supabase/sql/skr_ringkasan.sql (berkas asli) —")
try {
  await runFile("supabase/sql/skr_ringkasan.sql")
  console.log("  OK   skr_ringkasan.sql dijalankan tanpa error")
} catch (error) {
  console.log(" FAIL  skr_ringkasan.sql:", error.message)
  failures++
}

console.log("\n— Menjalankan supabase/sql/ai_query.sql (berkas asli) —")
try {
  await runFile("supabase/sql/ai_query.sql")
  console.log("  OK   ai_query.sql dijalankan tanpa error")
} catch (error) {
  console.log(" FAIL  ai_query.sql:", error.message)
  failures++
}

// ═══════════════════════════════════════════════════════════════
//  3. View: apakah benar-benar bisa DIBACA, dan angkanya benar?
//
//  Membuat view tidak membuktikan view bisa dibaca — bug 22007
//  (`b.bulan::date`) lolos saat CREATE VIEW tapi meledak saat SELECT.
//  Jadi setiap view di sini benar-benar di-query.
// ═══════════════════════════════════════════════════════════════
console.log("\n— Membaca setiap view (bukan cuma membuatnya) —")

// pod_d harus terparse dari ketiga format tanggal yang berbeda di atas
const podDates = await db.query(`
  select count(*)::int as total,
         count(pod_d)::int as terparse
  from public.skr_ringkasan
`)
check(
  "skr_ringkasan: pod_d terparse dari format tanggal campuran",
  podDates.rows[0].total === 7 && podDates.rows[0].terparse === 7,
  `terparse ${podDates.rows[0].terparse}/${podDates.rows[0].total}`,
)

// nilai harus jadi numeric (bukan teks "1.500.000")
const nilai = await db.query(`select sum(nilai)::numeric as total from public.skr_ringkasan`)
check(
  "skr_ringkasan: nilai berupa numeric, bukan teks",
  Number(nilai.rows[0].total) === 7400000,
  `total = ${nilai.rows[0].total} (harusnya 7400000)`,
)

const bulanan = await db.query(`
  select bulan, jml_dokumen, total_nilai
  from public.ai_skr_bulanan
  order by bulan
`)
check(
  "ai_skr_bulanan: bisa dibaca dan mengelompokkan per bulan",
  bulanan.rows.length === 3,
  `bulan: ${bulanan.rows.map((r) => r.bulan).join(", ")}`,
)
check(
  "ai_skr_bulanan: urutan bulan kronologis (teks 'YYYY-MM' sudah cukup)",
  bulanan.rows.every((r, i) => i === 0 || r.bulan > bulanan.rows[i - 1].bulan),
)

// Inilah view yang dulu gagal 22007 — sekarang harus benar-benar terbaca
const mom = await db.query(`
  select bulan, total_nilai, total_nilai_lalu, persen_nilai_vs_lalu
  from public.ai_skr_mom
  order by bulan
`)
check("ai_skr_mom: BISA DIBACA (bug 22007 sudah hilang)", mom.rows.length === 3)

const juli = mom.rows.find((r) => r.bulan === "2026-07")
const agustus = mom.rows.find((r) => r.bulan === "2026-08")
check(
  "ai_skr_mom: bulan pertama tidak punya pembanding",
  juli && juli.total_nilai_lalu === null && juli.persen_nilai_vs_lalu === null,
)

check(
  "ai_skr_mom: LAG() mengambil bulan SEBELUMNYA, bukan sesudahnya",
  agustus && Number(agustus.total_nilai_lalu) === 900000,
  `total_nilai_lalu Agustus = ${agustus?.total_nilai_lalu} (harusnya 900000 = Juli)`,
)

const persenOk =
  agustus &&
  Number(agustus.persen_nilai_vs_lalu) ===
    Math.round(((1200000 - 900000) / 900000) * 1000) / 10
check(
  "ai_skr_mom: persen_nilai_vs_lalu dihitung benar",
  Boolean(persenOk),
  `Agustus = ${agustus?.persen_nilai_vs_lalu}% (harusnya 33.3%)`,
)

const alasan = await db.query(`
  select alasan, jml_dokumen from public.ai_skr_alasan order by jml_dokumen desc
`)
check(
  "ai_skr_alasan: bisa dibaca dan mengelompokkan alasan POD",
  alasan.rows.length === 5 && alasan.rows[0].alasan === "Toko tutup",
  `alasan terbanyak = ${alasan.rows[0]?.alasan}`,
)

const biaya = await db.query(`
  select bulan, total_biaya from public.ai_biaya_bulanan order by bulan
`)
check(
  "ai_biaya_bulanan: bisa dibaca",
  biaya.rows.length === 3 && Number(biaya.rows[0].total_biaya) === 7000000,
  `Juli = ${biaya.rows[0]?.total_biaya} (harusnya 7000000)`,
)

// ═══════════════════════════════════════════════════════════════
//  4. exec_ai_query: SELECT harus lolos, tulis harus ditolak
//
//  Inilah yang dipakai chatbot. Diuji lewat jalur yang sama dengan
//  produksi: query dikirim sebagai teks.
// ═══════════════════════════════════════════════════════════════
console.log("\n— exec_ai_query: penjaga SELECT —")

async function runAiQuery(sql) {
  const result = await db.query(`select public.exec_ai_query($1) as out`, [sql])
  return result.rows[0].out
}

const harusLolos = [
  ["SELECT sederhana", "select bulan, total_nilai from ai_skr_bulanan order by bulan desc limit 3"],
  ["SELECT dengan baris baru & indentasi", "\n  select 1 as ok\n"],
  ["WITH (CTE) yang sah", "with x as (select 1 as a) select a from x"],
  ["SELECT tanpa LIMIT (dipaksa 200 baris)", "select * from skr_ringkasan"],
  ["SELECT dengan komentar pembuka", "/* cek */ select 1 as ok"],
]

for (const [label, sql] of harusLolos) {
  try {
    const out = await runAiQuery(sql)
    check(`${label} → lolos`, Array.isArray(out), `mengembalikan ${out.length} baris`)
  } catch (error) {
    check(`${label} → lolos`, false, error.message)
  }
}

const harusDitolak = [
  ["DELETE", "delete from skr_detail"],
  ["UPDATE", "update equipment set status = 'x'"],
  ["INSERT", "insert into equipment (license_plate) values ('x')"],
  ["DROP", "drop table skr_detail"],
  ["TRUNCATE", "truncate skr_detail"],
  ["WITH + DELETE (jalan pintas CTE)", "with x as (delete from skr_detail returning id) select * from x"],
  ["Dua statement dipisah titik koma", "select 1; select 2"],
]

for (const [label, sql] of harusDitolak) {
  try {
    await runAiQuery(sql)
    check(`${label} → DITOLAK`, false, "query tulis malah lolos!")
  } catch {
    check(`${label} → ditolak`, true)
  }
}

// Batas 200 baris: SELECT yang mengembalikan sangat banyak baris harus
// dipotong, supaya Route Handler tidak kebanjiran data.
await db.exec(`
  insert into public.skr_detail (license_no, pod_date, skr_sales_unit, skr_value)
  select 'B 0000 ZZ', '01-01-2026', 1, '1000' from generate_series(1, 500);
`)
try {
  const out = await runAiQuery("select * from skr_ringkasan")
  check("batas 200 baris diberlakukan", out.length === 200, `mengembalikan ${out.length} baris`)
} catch (error) {
  check("batas 200 baris diberlakukan", false, error.message)
}

// ═══════════════════════════════════════════════════════════════
console.log(
  `\n${failures === 0 ? "✅ SEMUA LOLOS" : `❌ ${failures} PEMERIKSAAN GAGAL`}\n`,
)
process.exit(failures === 0 ? 0 : 1)

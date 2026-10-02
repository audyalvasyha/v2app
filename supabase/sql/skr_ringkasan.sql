-- ═══════════════════════════════════════════════════════════════
--  View ringkasan SKR
--  Dipakai oleh dashboard SKR di aplikasi Midaa.
--
--  Tujuan: memindahkan parsing pod_date & skr_value dari browser ke
--  database, sehingga filter tanggal dan penjumlahan tidak perlu
--  menarik seluruh tabel ke browser.
--
--  Jalankan ulang script ini aman (menggunakan OR REPLACE / IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

-- RLS tabel dasar. Bagian ini aman diulang — pakai DROP IF EXISTS
-- supaya tidak gagal bila policy-nya sudah pernah dibuat.
--
-- PENTING (keamanan): dasbor ini HANYA membaca data. Kunci anon bersifat
-- publik (tertanam di bundle browser), jadi policy INSERT/UPDATE/DELETE
-- untuk anon berarti siapa pun yang membuka situs ini bisa menghapus atau
-- memalsukan baris SKR. Karena aplikasi tidak pernah menulis, policy tulis
-- di-drop di sini. Jalankan ulang script ini untuk menutup celah tersebut.
--
-- Penulisan data tetap dilakukan lewat SQL Editor / service_role, yang
-- tidak tunduk pada RLS peran ini.
alter table public.skr_detail enable row level security;

drop policy if exists "baca_skr_detail" on public.skr_detail;
create policy "baca_skr_detail" on public.skr_detail
  for select to anon using (true);

drop policy if exists "tulis_skr_detail" on public.skr_detail;
drop policy if exists "ubah_skr_detail" on public.skr_detail;
drop policy if exists "hapus_skr_detail" on public.skr_detail;


-- ── View ringkasan ─────────────────────────────────────────────
-- pod_date TEXT "30-09-2026" → pod_d DATE  (bisa di-index & difilter)
-- skr_value TEXT "1.500.000"  → nilai NUMERIC (bisa di-SUM)
--
-- CATATAN: view sengaja dibuat TANPA "with (security_invoker = true)"
-- agar tidak bergantung pada fitur tersebut. Konsekuensinya, membaca
-- view memakai hak akses pemilik view sehingga RLS skr_detail tidak
-- berlaku saat membaca view. Ini tidak menambah eksposur apa pun di
-- sini, karena policy select di atas memang sudah terbuka untuk anon
-- (dashboard ini memang tanpa login). Jangan pernah memberi policy
-- select terbatas di masa depan tanpa menambahkan security_invoker
-- pada view ini.
-- View di-drop lebih dulu: CREATE OR REPLACE VIEW tidak boleh mengubah
-- urutan/nama kolom yang sudah ada (error 42P16). View hanya query, jadi
-- data tetap aman di tabel skr_detail.
--
-- CATATAN URUTAN: script ini me-join ke public.salesman, jadi
-- salesman.sql harus dijalankan lebih dulu. View di-drop dulu di
-- bawah, jadi mengulang script ini setelahnya aman.
--
-- Drop dependent DULU, tanpa CASCADE. View ai_* (dari ai_query.sql)
-- dibangun di atas view ini, jadi selama masih ada, `drop view
-- skr_ringkasan` gagal dengan:
--
--   ERROR: 2BP01: cannot drop view skr_ringkasan because other
--          objects depend on it
--
-- CASCADE sengaja TIDAK dipakai di sini. CASCADE akan ikut menghapus
-- apa pun yang bergantung, termasuk view yang mungkin tidak kita
-- kenal — dan kalau ai_query.sql tidak dijalankan ulang setelahnya,
-- Tanya Midaa kehilangan semua view-nya tanpa ada yang memberi tahu.
-- Drop di bawah ini eksplisit: kalau suatu saat ada dependensi baru
-- yang lupa dicatat, script ini GAGAL dengan pesan jelas — jauh lebih
-- baik daripada menghapus view orang diam-diam.
--
-- Jalankan ai_query.sql SETELAH script ini untuk membangun ulang
-- view ai_* di atas skr_ringkasan yang baru.
drop view if exists public.ai_skr_mom;
drop view if exists public.ai_skr_alasan;
drop view if exists public.ai_sales_bulanan;
drop view if exists public.ai_skr_bulanan;

drop view if exists public.skr_ringkasan;

create view public.skr_ringkasan as
with base as (
  select
    d.id,
    d.license_no,
    d.salesman,
    d.pod_reason,
    d.skr_base_unit,
    -- id customer dipakai dashboard untuk join ke tabel customers
    -- (tipe di skr_detail bigint, di customers TEXT — dinormalkan
    -- lewat string di sisi aplikasi).
    d.customer_id,
    -- nomor dokumen pengiriman — ditampilkan di detail per customer
    d.delivery_number,
    d.pod_date,
    -- pod_date diisi nama bulan bahasa Inggris, mis. "23 May 2026" atau
    -- "04 April 2026". Spasi dirapikan agar to_date() pasti bisa membaca.
    regexp_replace(btrim(coalesce(d.pod_date, '')), '\s+', ' ', 'g') as pod_clean,
    -- Hanya digit pod_date, untuk mendeteksi format angka (DD/MM/YYYY)
    regexp_replace(coalesce(d.pod_date, ''), '[^0-9]', '', 'g') as d8,
    coalesce(d.skr_sales_unit, 0)::bigint as qty,
    case
      when nullif(regexp_replace(coalesce(d.skr_value, ''), '[^0-9]', '', 'g'), '') is null then 0
      when coalesce(d.skr_value, '') ~ '[.,][0-9]{1,2}$'
           and coalesce(d.skr_value, '') !~ '[.,][0-9]{3}$'
        then regexp_replace(coalesce(d.skr_value, ''), '[^0-9]', '', 'g')::numeric / 100
      else regexp_replace(coalesce(d.skr_value, ''), '[^0-9]', '', 'g')::numeric
    end as nilai
  from public.skr_detail d
)
select
  id,
  license_no,
  salesman,
  -- Nama & afiliasi salesman, hasil join ke tabel master `salesman`.
  --
  -- Kenapa LEFT JOIN dan bukan JOIN: skr_detail berisi banyak baris
  -- dengan salesman NULL atau "-1" (placeholder), dan tidak semua
  -- NIK yang muncul di sana punya entri di tabel salesman. JOIN
  -- biasa akan membuat baris-baris itu hilang dari seluruh
  -- dashboard — jumlah sisa kiriman jadi lebih kecil dari aslinya.
  -- Kolomnya nullable, jadi "-1" tetap tampil sebagai "-1" ketika
  -- nama salesmannya tidak ditemukan.
  s.nama         as salesman_nama,
  s.supervisor   as supervisor,
  s.kode_area    as kode_area,
  pod_reason,
  skr_base_unit,
  customer_id,
  delivery_number,
  qty,
  nilai,
  pod_date,
  -- pod_d: tanggal POD hasil parsing.
  --   Prioritas 1 — nama bulan bahasa Inggris: "23 May 2026", "04 April 2026"
  --   Prioritas 2 — format angka, dideteksi otomatis:
  --     "20260930" → YYYY-MM-DD   (2 digit pertama > 31)
  --     "30092026" → DD-MM-YYYY   (2 digit tengah > 31, sisanya asumsi Indonesia)
  --     "09302026" → MM-DD-YYYY
  case
    when pod_clean ~ '^[0-9]{1,2} [A-Za-z]+ [0-9]{4}$'
      then to_date(pod_clean, 'DD Month YYYY')
    when d8 !~ '^[0-9]{8}$' then null
    -- YYYYMMDD
    when substring(d8, 1, 4)::int between 1900 and 2100
      then to_date(substring(d8,1,4)||'-'||substring(d8,5,2)||'-'||substring(d8,7,2), 'YYYY-MM-DD')
    -- DDMMYYYY (konvensi Indonesia, dicoba lebih dulu)
    when substring(d8, 5, 4)::int between 1900 and 2100
         and substring(d8, 3, 2)::int between 1 and 12
         and substring(d8, 1, 2)::int between 1 and 31
      then to_date(substring(d8,5,4)||'-'||substring(d8,3,2)||'-'||substring(d8,1,2), 'YYYY-MM-DD')
    -- MMDDYYYY (gaya Amerika, hanya bila versi di atas tidak valid)
    when substring(d8, 5, 4)::int between 1900 and 2100
         and substring(d8, 1, 2)::int between 1 and 12
         and substring(d8, 3, 2)::int between 1 and 31
      then to_date(substring(d8,5,4)||'-'||substring(d8,1,2)||'-'||substring(d8,3,2), 'YYYY-MM-DD')
    else null
  end as pod_d
from base
-- Regex '^S0([0-9]{8})$' memotong "S090091477" menjadi "90091477".
-- Nol di depan ikut hilang, jadi ini BUKAN sekadar menghapus huruf S.
-- Nilai yang tidak cocok pola ("-1", NULL) menghasilkan NULL dan baris
-- itu tetap muncul lewat LEFT JOIN — dengan nama kosong.
left join public.salesman s
  on s.nik = substring(base.salesman from '^S0([0-9]{8})$');


-- ── CATATAN INDEX ──────────────────────────────────────────────
-- PostgreSQL TIDAK mendukung CREATE INDEX pada view
-- (error 42809: "This operation is not supported for views").
-- Untuk tabel berukuran puluhan ribu baris, sequential scan masih
-- jauh lebih cepat daripada memindahkan seluruh data ke browser, jadi
-- index tidak diperlukan. Baris yang gagal lolos filter tidak pernah
-- dikirim ke client — itu sudah poin utama yang kita kejar.
--
-- Bila data tumbuh menjadi ratusan ribu baris dan muncul kebutuhan
-- index, gunakan salah satu dari:
--   a) Kolom nyata pod_d date di tabel skr_detail + trigger, lalu
--      index kolom tersebut (to_date() bersifat STABLE sehingga tidak
--      bisa dipakai pada generated column).
--   b) Materialized view skr_ringkasan_mv yang di-refresh berkala
--      (matview mendukung index, tetapi tidak menerapkan RLS).


-- ── Grant agar anon bisa membaca view ───────────────────────────
grant select on public.skr_ringkasan to anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
--  View minimal customers untuk dashboard SKR
--
--  Tabel customers punya telephone_number & nik_salesman yang tidak
--  perlu terekspos ke kunci anon (yang tertanam di bundle browser).
--  View ini cuma membocorkan dua kolom yang benar-benar dipakai
--  dashboard: customer_id + customer_name. View dibaca dengan hak
--  akses pemilik (default Postgres), jadi RLS di customers tidak
--  menghalangi pembacaan dua kolom ini.
-- ═══════════════════════════════════════════════════════════════
drop view if exists public.customers_ringkas;

create view public.customers_ringkas as
select
  customer_id,
  customer_name
from public.customers;

grant select on public.customers_ringkas to anon, authenticated;

-- Verifikasi (harus mengembalikan baris, bukan []):
--   select * from public.customers_ringkas limit 3;


-- ═══════════════════════════════════════════════════════════════
--  Verifikasi — jalankan setelah script di atas:
----  select license_no, pod_date, pod_d, qty, nilai
--    from public.skr_ringkasan
--    order by pod_d desc nulls last
--    limit 5;
--
--  Nama salesman harus ikut terisi (bukan NIK lagi):
--    select salesman, salesman_nama, supervisor, kode_area
--      from public.skr_ringkasan
--     where salesman_nama is not null
--     limit 5;
--
--  Kalau kolomnya NULL semua, berarti NIK di salesman.sql tidak
--  cocok dengan format di skr_detail — periksa keduanya.
--
--  Kalau pod_d masih NULL padahal ada data, periksa isi mentahnya:
--
--  select pod_date, count(*) as jml
--  from public.skr_detail
--  where coalesce(pod_date, '') <> ''
--  group by pod_date
--  order by jml desc
--  limit 20;
--
--  Kalau pod_d terisi tanggal dan nilai terisi angka (mis. 1500000),
--  berarti view berjalan dan menu SKR otomatis pindah ke mode cepat.
-- ═══════════════════════════════════════════════════════════════

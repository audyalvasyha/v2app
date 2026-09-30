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
drop view if exists public.skr_ringkasan;

create view public.skr_ringkasan as
with base as (
  select
    d.id,
    d.license_no,
    d.salesman,
    d.pod_reason,
    d.skr_base_unit,
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
  pod_reason,
  skr_base_unit,
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
from base;


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
--  Verifikasi — jalankan setelah script di atas:
--
--  select license_no, pod_date, pod_d, qty, nilai
--  from public.skr_ringkasan
--  order by pod_d desc nulls last
--  limit 5;
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

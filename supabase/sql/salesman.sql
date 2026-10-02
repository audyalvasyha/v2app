-- ═══════════════════════════════════════════════════════════════
--  salesman — master data salesperson
--
--  Jalankan di Supabase SQL Editor. Aman diulang (idempoten).
--
--  URUTAN PENTING: script ini harus dijalankan SEBELUM
--  skr_ringkasan.sql, karena view SKR nanti me-join ke tabel ini.
-- ═══════════════════════════════════════════════════════════════

-- ── Tabel ──────────────────────────────────────────────────────
--
-- SOAL FORMAT NIK — ini yang paling mudah salah, jadi ditulis lengkap:
--
--   skr_detail.salesman  : S090091477   (huruf S + 0 + 8 digit)
--   tabel ini, kolom nik : 90091477     (8 digit, TANPA "S" dan TANPA 0)
--
-- Jadi NIK di tabel ini BUKAN sekadar kolom salesman tanpa huruf "S".
-- Angka nol di depan ikut hilang. View join memotong keduanya lewat
-- regex '^S0([0-9]{8})$', yang sudah diuji terhadap seluruh data:
-- semua 1931 baris SKR dengan salesman valid cocok, dan placeholder
-- "-1" tidak ikut terpotong.
--
-- Kenapa tabel ini ada: sebelum ini, semua yang muncul di dashboard
-- dan Tanya Midaa adalah kode S090091477 — tidak bisa dibaca orang
-- dan tidak bisa dicari berdasarkan nama. Tabel ini memetakan kode itu
-- ke nama, supervisor, dan area.
--
-- telepon disimpan sebagai digit saja (82171846672, TANPA "+62"),
-- mengikuti konvensi customers.telephone_number yang sudah dipakai
-- di proyek ini. Kalau dua-duanya nanti dicocokkan, formatnya sudah
-- sama sejak awal.
create table if not exists public.salesman (
  nik         text primary key,
  nama        text not null,
  supervisor  text,
  kode_area   text,
  telepon     text,
  created_at  timestamptz not null default now(),

  -- Menangkap salah paste. Yang ditolak: "S090091477" (ada prefix),
  -- "090091477" (nol depan belum dibuang), "90091477 " (ada spasi).
  -- Tanpa constraint ini, baris seperti itu gagal diam-diam saat join
  -- dan tetap tampil sebagai NIK di seluruh dashboard.
  constraint salesman_nik_hanya_digit check (nik ~ '^[0-9]{8}$')
);

comment on table public.salesman is
  'Master data salesperson. NIK tanpa prefix "S" (90091477), berbeda dari skr_detail.salesman yang memakai prefix (S090091477).';
comment on column public.salesman.nik is
  'NIK salesman 8 digit, tanpa prefix "S" dan tanpa nol depan. skr_detail.salesman menyimpan format S090091477 untuk NIK yang sama.';
comment on column public.salesman.supervisor is
  'Nama atasan/area leader yang menaungi salesman ini.';
comment on column public.salesman.kode_area is
  'Kode area/wilayah penjualan, mis. C096 atau C09A.';
comment on column public.salesman.telepon is
  'Nomor HP format digit saja tanpa kode negara, mis. 82171846672.';

-- Index untuk lookup yang paling sering dipakai Tanya Midaa:
-- "salesman siapa saja di area C096?" dan "siapa anak RIANTO?".
create index if not exists salesman_kode_area_idx  on public.salesman (kode_area);
create index if not exists salesman_supervisor_idx on public.salesman (supervisor);


-- ── Hak akses ──────────────────────────────────────────────────
--
-- Mengikuti pola yang sudah dipakai customers di auth_lockdown.sql:
-- tabel ini memuat nomor HP (PII), jadi role `anon` — yang kuncinya
-- tertanam di bundle browser — TIDAK boleh membacanya. Hanya
-- `authenticated` (JWT user yang login) yang boleh, termasuk Tanya
-- Midaa yang menjalankan query dengan JWT user yang sama.
--
-- Nomor HP sengaja TIDAK ikut ke view skr_ringkasan: nama,
-- supervisor, dan kode area cukup untuk dashboard, sedangkan nomor
-- HP hanya perlu oleh Tanya Midaa yang sudah pasti login.
alter table public.salesman enable row level security;

drop policy if exists "authenticated_baca_salesman" on public.salesman;
create policy "authenticated_baca_salesman" on public.salesman
  for select to authenticated using (true);

drop policy if exists "anon_baca_salesman" on public.salesman;
drop policy if exists "tulis_salesman" on public.salesman;
drop policy if exists "ubah_salesman" on public.salesman;
drop policy if exists "hapus_salesman" on public.salesman;

-- Default privilege Supabase memberi SELECT penuh ke authenticated
-- untuk semua tabel di public, jadi grant di bawah hanya memastikan —
-- dan revoke ke anon menutup jalur PostgREST langsung.
revoke all on public.salesman from anon;
grant select on public.salesman to authenticated;

-- Penulisan data sengaja tidak diberi policy apa pun: tabel ini
-- diisi lewat SQL Editor (script ini), bukan dari aplikasi.


-- ── Data awal ──────────────────────────────────────────────────
--
-- on conflict do update supaya skrip ini aman dijalankan berkali-
-- kali: menempel ulang daftar terbaru tidak akan gagal dan tidak
-- akan menduplikasi baris.
--
-- 24 baris. Data ini milik user dan dipaste apa adanya,
-- termasuk kapitalisasi nama yang campur ("Yusra" vs "SUPANDI
-- DAMANIK"). Kalau mau diseragamkan someday, jalankan:
--
--   update public.salesman set nama = upper(nama);
--
insert into public.salesman (nik, nama, supervisor, kode_area, telepon) values
  ('90091477', 'ROY SANDI HUTAPEA',            'RIANTO ZALUKHU',     'C096', '82171846672'),
  ('90091481', 'AGUNG PRASETIO',                'RIANTO ZALUKHU',     'C096', '82382996472'),
  ('90091714', 'SUPANDI DAMANIK',               'RIANTO ZALUKHU',     'C096', '81363574414'),
  ('90092003', 'Yusra',                         'RIANTO ZALUKHU',     'C096', '85232300820'),
  ('90091998', 'Wan syaiful',                   'RIANTO ZALUKHU',     'C096', '82268394336'),
  ('90091863', 'WILLY ALBANI',                  'RIANTO ZALUKHU',     'C096', '81365030535'),
  ('90091380', 'NURMAN APRIALDI',               'RIANTO ZALUKHU',     'C096', '85271705941'),
  ('90091142', 'NGATIRAN',                      'RIANTO ZALUKHU',     'C096', '82268546388'),
  ('90091753', 'EKO BASTIAN',                   'RIANTO ZALUKHU',     'C096', '82277866070'),
  ('90091604', 'SURYANTO',                      'RIANTO ZALUKHU',     'C096', '81268083554'),
  ('90091896', 'JECKY JHONHEN ROLLY',           'RIANTO ZALUKHU',     'C096', '83186329209'),
  ('90091480', 'Martuani Yogi Lamberto Sihombi','PINO SAMSUL EFENDI', 'C09A', '82174966560'),
  ('90091808', 'Zul Amri',                      'PINO SAMSUL EFENDI', 'C09A', '85355018322'),
  ('90091757', 'Bilal Auli Siregar',            'PINO SAMSUL EFENDI', 'C09A', '82253911962'),
  ('90091326', 'Syarianto',                     'PINO SAMSUL EFENDI', 'C09A', '85264089478'),
  ('90091821', 'Dede Ardhi',                    'PINO SAMSUL EFENDI', 'C09A', '82236345989'),
  ('90091788', 'Mhd. Ravi',                     'PINO SAMSUL EFENDI', 'C09A', '85210238832'),
  ('90091903', 'Uli Amri',                      'PINO SAMSUL EFENDI', 'C09A', '85961562022'),
  ('90091849', 'W. Indra Laksono',              'Agus Priyanto',      'C096', '82245057825'),
  ('90092019', 'Ivan marshandy',                'PINO SAMSUL EFENDI', 'C09A', '81534255896'),
  ('90091828', 'M Aras',                        'PINO SAMSUL EFENDI', 'C09A', '81276532153'),
  ('90091625', 'Devani Dedek Wirawan',          'PINO SAMSUL EFENDI', 'C09A', '87875557593'),
  ('90091761', 'Ahmad Julian Siregar',          'PINO SAMSUL EFENDI', 'C09A', '81360212302'),
  ('90092057', 'Ardiandi',                      'PINO SAMSUL EFENDI', 'C09A', '82284853850')
on conflict (nik) do update set
  nama       = excluded.nama,
  supervisor = excluded.supervisor,
  kode_area  = excluded.kode_area,
  telepon    = excluded.telepon;


-- ═══════════════════════════════════════════════════════════════
--  Verifikasi — jalankan setelah script di atas
--
--  Harus mengembalikan 24:
--   select count(*) from public.salesman;
--
-- Uji constraint: NIK dengan prefix "S" harus ditolak:
--   insert into public.salesman (nik, nama) values ('S090091477', 'Uji');
--   → error: violates check constraint "salesman_nik_hanya_digit"
--
-- Uji join: hitung berapa baris SKR yang salesman-nya TIDAK punya
-- entri di tabel ini. Kalau ada yang muncul, NIK-nya belum terdaftar
-- dan dashboard akan menampilkan NIK, bukan nama:
--   select substring(salesman from '^S0([0-9]{8})$') as nik,
--          count(*) as jml_skr
--     from public.skr_ringkasan
--    where substring(salesman from '^S0([0-9]{8})$')
--          not in (select nik from public.salesman)--   group by 1 order by 2 desc;
--
-- CATATAN per 2026-10-02: NIK ini ada di SKR tapi BELUM ada di daftar
-- di atas, jadi 152 baris SKR akan tetap menampilkan NIK:
--   90091824 (57 baris) | 90091826 (57) | 90091571 (37) | 90091230 (1)
-- Tambahkan lewat insert yang sama kalau datanya sudah diperoleh.
--
--  Setelah semua script terpasang, NIK di tabel ini harus cocok dengan
--  salesman di SKR — kalau tidak, join di skr_ringkasan diam-diam
--  menghasilkan null dan dashboard tetap menampilkan NIK:
--   select count(*) as belum_terpetakan
--     from public.skr_ringkasan r
--    where r.salesman is not null
--      and r.salesman <> '-1'
--      and 'S' || r.salesman not in (select nik from public.salesman);
-- ═══════════════════════════════════════════════════════════════

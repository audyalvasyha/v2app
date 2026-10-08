-- ============================================================================
-- Kunci akses tabel pemeriksaan ban harian (app driver → dashboard)
-- Jalankan di Supabase SQL Editor. Aman diulang (idempotent).
--
-- Sebelum script ini dijalankan, kunci anon BISA membaca ketiga tabel ini
-- langsung dari REST API tanpa login (sudah diverifikasi). Setelah dijalankan:
--   - anon         : tidak punya hak apa-apa (SELECT/INSERT/UPDATE/DELETE ditolak)
--   - authenticated: boleh baca & tulis pemeriksaan — sesi login dashboard
--                    maupun app driver yang login memakai akun Supabase Auth
--
-- PENTING: bila app driver mengunggah pemeriksaan memakai kunci anon
-- (tanpa login), unggahan akan GAGAL setelah RLS aktif. Pastikan app driver
-- login (auth.signInWithPassword) SEBELUM menjalankan script ini.
-- ============================================================================

begin;

-- 1. Aktifkan RLS di ketiga tabel -------------------------------------------
alter table public.daily_tire_inspections enable row level security;
alter table public.tire_check_details     enable row level security;
alter table public.tires                  enable row level security;

-- 2. Anon tidak boleh apa-apa ------------------------------------------------
revoke all on public.daily_tire_inspections from anon;
revoke all on public.tire_check_details     from anon;
revoke all on public.tires                  from anon;

-- 3. Authenticated: baca + tulis pemeriksaan; tires hanya baca ---------------
grant select, insert, update, delete on public.daily_tire_inspections to authenticated;
grant select, insert, update, delete on public.tire_check_details     to authenticated;
grant select on public.tires to authenticated;

-- 4. Policy daily_tire_inspections -------------------------------------------
drop policy if exists "ti_ins_select" on public.daily_tire_inspections;
drop policy if exists "ti_ins_insert" on public.daily_tire_inspections;
drop policy if exists "ti_ins_update" on public.daily_tire_inspections;
drop policy if exists "ti_ins_delete" on public.daily_tire_inspections;

create policy "ti_ins_select" on public.daily_tire_inspections
  for select to authenticated using (true);
create policy "ti_ins_insert" on public.daily_tire_inspections
  for insert to authenticated with check (true);
create policy "ti_ins_update" on public.daily_tire_inspections
  for update to authenticated using (true) with check (true);
create policy "ti_ins_delete" on public.daily_tire_inspections
  for delete to authenticated using (true);

-- 5. Policy tire_check_details ------------------------------------------------
drop policy if exists "tcd_select" on public.tire_check_details;
drop policy if exists "tcd_insert" on public.tire_check_details;
drop policy if exists "tcd_update" on public.tire_check_details;
drop policy if exists "tcd_delete" on public.tire_check_details;

create policy "tcd_select" on public.tire_check_details
  for select to authenticated using (true);
create policy "tcd_insert" on public.tire_check_details
  for insert to authenticated with check (true);
create policy "tcd_update" on public.tire_check_details
  for update to authenticated using (true) with check (true);
create policy "tcd_delete" on public.tire_check_details
  for delete to authenticated using (true);

-- 6. Policy tires (baca saja — referensi master ban) --------------------------
drop policy if exists "tires_select" on public.tires;
create policy "tires_select" on public.tires
  for select to authenticated using (true);

commit;

-- ============================================================================
-- OPSIONAL — foto ban: sampel `sidewall_img_url` menyimpan path Storage
-- ("tire_check_details_Images/<file>.jpg"), tetapi saat pengecekan project ini
-- BELUM punya bucket Storage sama sekali, jadi path itu tidak bisa dibuka.
-- Bila foto memang seharusnya diunggah ke project ini, jalankan blok di bawah
-- untuk membuat bucket public-nya (hapus tanda komentar):
--
-- insert into storage.buckets (id, name, public)
-- values ('tire_check_details_Images', 'tire_check_details_Images', true)
-- on conflict (id) do update set public = true;
--
-- Bila foto tersimpan di project/hosting lain, dashboard otomatis memakai
-- nilai URL lengkap (http...) apa adanya — isi kolomnya dengan URL penuh.
-- ============================================================================

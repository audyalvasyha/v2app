-- ═══════════════════════════════════════════════════════════════
--  app_users — peran user aplikasi (admin / terbatas)
--
--  Akun login tetap dibuat di Supabase Auth
--  (Authentication → Users → Add user) karena anon key TIDAK boleh
--  membuat user. Tabel ini hanya menyimpan PERAN per email:
--
--    admin     → semua menu
--    terbatas  → Complaint Board, Analisa, SKR, Pengiriman, Cuaca, Traffic,
--                About (tanpa Dashboard, Equipment, Histories, Monitoring,
--                dan Analisa Ban)
--
--  Aplikasi juga mengunci email: baris admin untuk email selain
--  audyal.vasyah@pekanbaru-dr.com tetap diperlakukan sebagai terbatas.
--
--  PENTING: aplikasi fail-closed. User yang TIDAK punya baris di tabel ini
--  dianggap `terbatas`; hanya baris dengan role `admin` yang membuka menu
--  admin. Seed admin utama ada di bagian bawah script ini.
--
--  Aplikasi hanya bisa MEMBACA tabel ini (grant select). Insert/update
--  hanya lewat SQL Editor / service role, sehingga user tidak bisa
--  menaikkan perannya sendiri dari browser.
--
--  Aman diulang.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.app_users (
  -- Email Supabase Auth, disimpan huruf kecil (dibandingkan apa adanya).
  email        text        primary key,
  role         text        not null default 'terbatas'
               check (role in ('admin', 'terbatas')),
  -- Nama tampilan yang dirender di sidebar dan atribusi komplain.
  display_name text,
  created_at   timestamptz not null default now()
);

-- ── RLS: baca untuk user login, tulis hanya service role ─────────
alter table public.app_users enable row level security;

revoke all on public.app_users from anon;
revoke all on public.app_users from authenticated;
grant select on public.app_users to authenticated;

drop policy if exists app_users_read on public.app_users;
-- Tiap user hanya perlu membaca barisnya sendiri untuk menentukan menu.
-- Jangan pakai `using (true)`: itu membocorkan seluruh daftar email dan
-- peran kolega ke setiap sesi yang login.
create policy app_users_read on public.app_users
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ── Nama tampilan untuk atribusi komplain ────────────────────────
-- Tugas menyimpan email pelaku; UI perlu nama lintas user. RLS app_users
-- hanya membolehkan user membaca barisnya sendiri, jadi sediakan RPC
-- security-definer yang HANYA mengembalikan email + display_name — bukan
-- role atau data lain.
create or replace function public.app_user_names()
returns table (email text, display_name text)
language sql
security definer
set search_path = public
as $$
  select lower(u.email) as email,
         coalesce(nullif(btrim(u.display_name), ''), split_part(lower(u.email), '@', 1)) as display_name
  from public.app_users u
$$;

revoke all on function public.app_user_names() from public;
grant execute on function public.app_user_names() to authenticated;

-- ═══════════════════════════════════════════════════════════════
--  1) Buat 3 akun di Supabase Dashboard:
--     Authentication → Users → Add user
--     isi email + password, lalu bagikan password ke orangnya.
--     (Pastikan "Allow new users to sign up" tetap MATI.)
--
--  2) Ganti email di bawah dengan 3 email tadi, lalu jalankan blok
--     ini. Semua user di blok ini mendapat akses terbatas.
-- ═══════════════════════════════════════════════════════════════

-- insert into public.app_users (email, role, display_name) values
--   ('user1@perusahaan.com', 'terbatas', 'User terbatas 1'),
--   ('user2@perusahaan.com', 'terbatas', 'User terbatas 2'),
--   ('user3@perusahaan.com', 'terbatas', 'User terbatas 3')
-- on conflict (email) do update
--   set role = excluded.role,
--       display_name = excluded.display_name;

-- ── Admin utama & kebijakan satu admin ──────────────────────────
-- Email ini satu-satunya yang mendapat role admin. Semua user lain
-- (termasuk yang belum punya baris) otomatis dibatasi aplikasi.
insert into public.app_users (email, role, display_name)
values ('audyal.vasyah@pekanbaru-dr.com', 'admin', 'Audy Al Vasyah')
on conflict (email) do update
  set role = 'admin',
      display_name = excluded.display_name;

update public.app_users
  set role = 'terbatas'
  where lower(email) <> lower('audyal.vasyah@pekanbaru-dr.com');

-- ── Contoh menaikkan/menurunkan peran user yang sudah terdaftar ──
-- update public.app_users set role = 'admin'    where email = 'nama@perusahaan.com';
-- update public.app_users set role = 'terbatas' where email = 'nama@perusahaan.com';
-- delete from public.app_users where email = 'nama@perusahaan.com'; -- kembali jadi terbatas

-- ═══════════════════════════════════════════════════════════════
--  Verifikasi
--    select email, role from public.app_users order by role desc, email;
--    → satu baris admin untuk audyal.vasyah@pekanbaru-dr.com, sisanya terbatas.
--
--    anon HARUS ditolak:
--    curl "$SUPABASE_URL/rest/v1/app_users?select=email" -H "apikey: <anon-key>"
--    → 401 / 42501
-- ═══════════════════════════════════════════════════════════════

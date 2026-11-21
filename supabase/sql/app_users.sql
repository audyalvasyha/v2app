-- ═══════════════════════════════════════════════════════════════
--  app_users — peran user aplikasi (admin / terbatas)
--
--  Akun login tetap dibuat di Supabase Auth
--  (Authentication → Users → Add user) karena anon key TIDAK boleh
--  membuat user. Tabel ini hanya menyimpan PERAN per email:
--
--    admin     → semua menu
--    terbatas  → Dashboard, Complaint Board, SKR, Pengiriman, Cuaca, Traffic,
--                About (tanpa Equipment, Histories, Monitoring,
--                Analisa Ban, dan Analisa AI)
--
--  PENTING: user yang TIDAK punya baris di tabel ini dianggap `admin`
--  — perilaku lama dipertahankan supaya 3 admin yang sudah ada tidak
--  terkunci setelah script ini dijalankan. Jadi untuk user baru yang
--  dibatasi, barisnya WAJIB ditambahkan di bawah.
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
  -- Nama tampilan untuk catatan admin (tidak dipakai di UI saat ini).
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

-- ── Contoh menaikkan/menurunkan peran user yang sudah terdaftar ──
-- update public.app_users set role = 'admin'    where email = 'nama@perusahaan.com';
-- update public.app_users set role = 'terbatas' where email = 'nama@perusahaan.com';
-- delete from public.app_users where email = 'nama@perusahaan.com'; -- kembali jadi admin

-- ═══════════════════════════════════════════════════════════════
--  Verifikasi
--    select email, role from public.app_users order by role, email;
--    → 3 baris role 'terbatas' (atau sesuai yang diisi).
--
--    anon HARUS ditolak:
--    curl "$SUPABASE_URL/rest/v1/app_users?select=email" -H "apikey: <anon-key>"
--    → 401 / 42501
-- ═══════════════════════════════════════════════════════════════

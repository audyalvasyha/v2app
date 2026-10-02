-- ═══════════════════════════════════════════════════════════════
--  Kunci akses data: hanya user terdaftar (Supabase Auth) yang bisa baca.
--
--  Latar: kunci anon tertanam di bundle browser dan bisa dipakai siapa pun.
--  Selama policy SELECT terbuka untuk anon, orang luar tetap bisa menarik
--  data langsung lewat API meskipun halaman sudah di balik login. Script ini
--  memindahkan hak baca dari role `anon` ke role `authenticated` — user yang
--  login lewat halaman web (JWT authenticated) tetap bisa membaca seperti
--  biasa, sisanya ditolak.
--
--  SEBELUM menjalankan, siapkan dua hal:
--  1. SUPABASE_SERVICE_ROLE_KEY di Vercel (dan .env.local untuk tes lokal).
--     Dipakai cron reminder untuk membaca data melewati RLS. Tanpa ini,
--     reminder email berhenti bekerja setelah script ini dijalankan.
--  2. Matikan pendaftaran mandiri agar orang luar tidak bisa membuat akun
--     sendiri dan lolos sebagai "authenticated":
--     Supabase Dashboard → Authentication → Sign In / Providers → Email →
--     matikan "Allow new users to sign up".
--     Tambah user: Authentication → Users → Add user (email + password).
--
--  Jalankan sekali di Supabase → SQL Editor. Aman diulang (idempoten):
--  policy lama (termasuk punya script ini) dihapus dulu, lalu dibuat ulang.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Hapus SEMUA policy SELECT/RLS pada tabel yang dilindungi ──
-- Nama policy tabel inti dibuat dari dashboard Supabase (tidak ada di repo),
-- jadi dihapus lewat katalog pg_policies, bukan berdasarkan nama.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'equipment',
        'maintenance_histories',
        'service_logs',
        'armada_outbound',
        'skr_detail',
        'customers'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ── 2. RLS tetap aktif + policy baca khusus authenticated ──────
alter table public.equipment            enable row level security;
alter table public.maintenance_histories enable row level security;
alter table public.service_logs         enable row level security;
alter table public.armada_outbound      enable row level security;
alter table public.skr_detail           enable row level security;

-- `customers` dulu terlewat: tabel ini memuat telephone_number dan
-- nik_salesman (PII) dan TIDAK pernah dibaca langsung oleh aplikasi —
-- halaman SKR memakai view customers_ringkas yang sudah di-grant terpisah.
-- Tanpa baris ini, siapa pun yang memegang kunci anon (ada di bundle
-- browser) bisa menarik nomor telepon & NIK lewat PostgREST,
-- melewati seluruh penguncian di atas.
alter table public.customers            enable row level security;

create policy "authenticated_baca_equipment"
  on public.equipment for select to authenticated using (true);

create policy "authenticated_baca_maintenance_histories"
  on public.maintenance_histories for select to authenticated using (true);

create policy "authenticated_baca_service_logs"
  on public.service_logs for select to authenticated using (true);

create policy "authenticated_baca_armada_outbound"
  on public.armada_outbound for select to authenticated using (true);

create policy "authenticated_baca_skr_detail"
  on public.skr_detail for select to authenticated using (true);

create policy "authenticated_baca_customers"
  on public.customers for select to authenticated using (true);
-- Catatan: policy di atas hanya mengatur baris mana yang terlihat. Ia TIDAK
-- membatasi kolom — tanpa grant per-kolom di bawah, user yang login masih
-- bisa menarik telephone_number & nik_salesman langsung dari tabel.

-- ── 3. Cabut hak anon di level grant (ganda pengaman di luar RLS) ──
revoke all on public.equipment,
              public.maintenance_histories,
              public.service_logs,
              public.armada_outbound,
              public.skr_detail,
              public.customers
  from anon;

-- grant eksplisit untuk authenticated (di sebagian proyek default privilege
-- Supabase sudah memberi, ini hanya memastikan).
grant select on public.equipment,
                public.maintenance_histories,
                public.service_logs,
                public.armada_outbound,
                public.skr_detail
  to authenticated;

-- ── 3b. customers: grant PER-KOLOM, bukan seluruh tabel ─────────
-- Tabel ini memuat PII: telephone_number (nomor HP) dan nik_salesman
-- (NIK pegawai salesman). Tidak ada satu pun bagian aplikasi yang
-- membutuhkannya — dashboard hanya butuh customer_id + customer_name,
-- dan itu sudah tersedia lewat view customers_ringkas.
--
-- Default privilege Supabase memberi SELECT penuh pada authenticated
-- untuk semua tabel di public, jadi policy RLS saja tidak cukup:
-- user yang login bisa `select telephone_number from customers`.
-- Karena kolom Tanya Data berjalan dengan JWT user yang sama, jalur
-- itu juga harus ditutup.
--
-- Postgres mengabaikan grant per-kolom selama role masih punya grant
-- tingkat tabel, jadi revoke select penuh WAJIB dilakukan lebih dulu.
--
-- Ada dua lapis yang harus dicabut, dan REVOKE tingkat tabel TIDAK
-- menyentuh lapis kedua:
--   1. grant SELECT tingkat tabel   -> dicabut oleh `revoke select on`
--   2. grant SELECT per kolom       -> harus dicabut dengan menyebut
--                                      nama kolomnya satu per satu
-- Supabase sering membuat lapis kedua lewat default privilege, jadi
-- telephone_number & nik_salesman tetap bisa dibaca walau grant tabelnya
-- sudah bersih.
--
-- Soal grantor: tidak perlu dipusingkan. Script ini dijalankan dari SQL
-- Editor sebagai owner (postgres) dari tabel customers, dan owner TIDAK
-- hanya bisa mencabut grant miliknya sendiri — owner berhak mencabut
-- grant siapa pun atas objek yang ia miliki. Jadi satu REVOKE di bawah
-- sudah menutup semua grantor sekaligus, tanpa perlu SET ROLE.
--
-- Yang wajib dipisah hanya tingkat aksesnya: REVOKE tingkat tabel tidak
-- menyentuh grant yang ditulis eksplisit per kolom, jadi keduanya
-- dicabut terpisah.
do $$
declare
    c record;
begin
    -- (1) grant SELECT tingkat tabel, untuk kedua role
    execute 'revoke select on public.customers from anon';
    execute 'revoke select on public.customers from authenticated';

    -- (2) grant SELECT per kolom — satu per satu, untuk kedua role.
    -- Namanya diambil dari katalog, jadi kolom PII baru pun ikut
    -- tertutup tanpa perlu diedit skrip ini.
    for c in
        select attname
          from pg_attribute
         where attrelid = 'public.customers'::regclass
           and attnum > 0
           and not attisdropped
    loop
        execute format(
            'revoke select (%I) on public.customers from anon, authenticated',
            c.attname
        );
    end loop;
end $$;

-- Pasang lagi hanya dua kolom yang memang dipakai dashboard.
grant select (customer_id, customer_name)
  on public.customers
  to authenticated;

-- ── 3c. Verifikasi keras (gagalkan script kalau masih bocor) ──
-- Kalau grant per-kolom tidak benar-benar berlaku karena sisa grant,
-- lebih baik script berhenti di sini dengan pesan jelas daripada
-- diam-diam meninggalkan PII bisa dibaca.
do $$
declare
    c text;
begin
    if has_table_privilege('authenticated', 'public.customers', 'SELECT') then
        raise exception 'LOCKDOWN GAGAL: authenticated masih punya grant SELECT tingkat tabel pada public.customers.';
    end if;
    if has_column_privilege('authenticated', 'public.customers', 'telephone_number', 'SELECT')
       or has_column_privilege('authenticated', 'public.customers', 'nik_salesman', 'SELECT') then
        raise exception 'LOCKDOWN GAGAL: kolom PII pada public.customers masih bisa dibaca authenticated.';
    end if;
    if has_table_privilege('anon', 'public.customers', 'SELECT')
       or has_column_privilege('anon', 'public.customers', 'telephone_number', 'SELECT') then
        raise exception 'LOCKDOWN GAGAL: anon masih punya akses ke public.customers.';
    end if;
    if not has_column_privilege('authenticated', 'public.customers', 'customer_id', 'SELECT')
       or not has_column_privilege('authenticated', 'public.customers', 'customer_name', 'SELECT') then
        raise exception 'LOCKDOWN GAGAL: customer_id / customer_name tidak bisa dibaca authenticated.';
    end if;

    -- Daftar kolom yang boleh dibaca. Kalau ada di luar daftar ini, PII.
    for c in
        select column_name from information_schema.column_privileges
         where grantee in ('anon', 'authenticated')
           and table_schema = 'public' and table_name = 'customers'
           and privilege_type = 'SELECT'
           and column_name not in ('customer_id', 'customer_name')
    loop
        raise exception 'LOCKDOWN GAGAL: kolom % masih punya grant SELECT untuk anon/authenticated.', c;
    end loop;
end $$;

-- View customers_ringkas tetap aman: view berjalan dengan hak akses
-- pemiliknya (bukan hak pemanggil), sehingga yang dibatasi di sini
-- hanya akses langsung ke tabel, bukan isi yang dibutuhkan dashboard.

-- ── 4. View ringkasan ──────────────────────────────────────────
-- View dibuat TANPA security_invoker (berjalan sebagai owner), sehingga
-- aksesnya murni dikontrol lewat grant pada view — bukan RLS tabel dasar.
-- Cabut dari anon, berikan ke authenticated. RPC upsert_skr_detail tidak
-- tersentuh (security definer + grant execute ke authenticated sudah ada
-- di skr_upload.sql).
revoke all on public.skr_ringkasan, public.customers_ringkas from anon;
grant select on public.skr_ringkasan, public.customers_ringkas to authenticated;

-- ── 5. Verifikasi (jalankan manual di SQL Editor bila ingin cek) ──
--   select tablename, policyname, roles from pg_policies
--     where schemaname = 'public'
--     order by tablename;
--   Harusnya hanya policy authenticated_baca_* di enam tabel:
--   equipment, maintenance_histories, service_logs, armada_outbound,
--   skr_detail, customers.
--
--   Cek grant kolom customers (harus TIDAK ada grant tingkat tabel):
--   select distinct column_name from information_schema.column_privileges
--    where grantee = 'authenticated'
--      and table_schema = 'public' and table_name = 'customers'
--    order by 1;
--   Expected: hanya customer_id + customer_name.
--
--   Kalau hasilnya masih memuat kolom lain, cek grant per kolom LANGSUNG
--   di katalog (information_schema sometimes hides the grantor):
--   select a.attname as kolom,
--          pg_get_userbyid(x.grantor) as grantor,
--          pg_get_userbyid(x.grantee) as grantee
--     from pg_attribute a
--     cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem[])) x
--    where a.attrelid = 'public.customers'::regclass
--      and a.attnum > 0 and not a.attisdropped
--    order by 1, 2;
--
--   UjiPenolakan (jalankan sebagai authenticated / lewat sesi login):
--   select telephone_number from customers limit 1;
--     -- harus GAGAL: permission denied for table customers
--
--   Pakai kunci anon langsung (harus GAGAL / kosong setelah lockdown):
--   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/equipment?select=*" \
--     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"

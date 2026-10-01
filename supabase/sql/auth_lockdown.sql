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
        'skr_detail'
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

-- ── 3. Cabut hak anon di level grant (ganda pengaman di luar RLS) ──
revoke all on public.equipment,
              public.maintenance_histories,
              public.service_logs,
              public.armada_outbound,
              public.skr_detail
  from anon;

-- grant eksplisit untuk authenticated (di sebagian proyek default privilege
-- Supabase sudah memberi, ini hanya memastikan).
grant select on public.equipment,
                public.maintenance_histories,
                public.service_logs,
                public.armada_outbound,
                public.skr_detail
  to authenticated;

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
--   -- Harusnya hanya policy authenticated_baca_* di lima tabel.
--
--   Pakai kunci anon langsung (harus GAGAL / kosong setelah lockdown):
--   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/equipment?select=*" \
--     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"

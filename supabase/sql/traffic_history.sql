-- ═══════════════════════════════════════════════════════════════
--  traffic_history — snapshot kondisi lalu lintas per rute per jam
--
--  DIISI OLEH: server (route /api/traffic) memakai klien
--  SUPABASE_SERVICE_ROLE_KEY — tulisan TIDAK bisa dilakukan dari
--  browser (tidak ada grant insert untuk anon/authenticated).
--
--  DIBACA OLEH: endpoint /api/traffic/history — SELECT untuk
--  anon + authenticated (data bukan rahasia: rasio kepadatan per jam).
--
--  Jika script ini BELUM dijalankan: fitur historis & jadwal berangkat
--  ideal di menu Traffic tidak muncul (degradasi diam-diam), sisanya
--  berjalan normal — pola yang sama dengan ai_memory.sql.
--
--  Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.traffic_history (
  -- 'kec-bangko', 'kec-tanah-putih', dst. — id dari lib/weather.ts
  location_id     text        not null,
  -- 'YYYY-MM-DD"T"HH' dalam WIB (Asia/Jakarta) — satu snapshot per jam.
  -- PK gabungan membuat insert berulang pada jam yang sama diabaikan,
  -- jadi tidak bisa tumpuk data walau endpoint dipukul tiap menit.
  observed_hour   text        not null,
  level           text        not null, -- good | warning | critical | unknown
  source          text        not null, -- live | estimated
  current_speed   numeric     not null,
  free_flow_speed numeric     not null,
  -- rasio current/free — 1 = sekencang biasa, kecil = padat.
  -- Simpan terpisah supaya pola per jam bisa dirata-rata tanpa join.
  ratio           numeric     not null check (ratio >= 0 and ratio <= 1),
  observed_at     timestamptz not null default now(),

  primary key (location_id, observed_hour)
);

create index if not exists traffic_history_observed_idx
  on public.traffic_history (observed_at desc);

-- ── RLS ──────────────────────────────────────────────────────────
--  RLS nyala + TANPA policy tulis = default-deny untuk semua role
--  kecuali service_role (bypass RLS). Hanya SELECT yang di-grant.
alter table public.traffic_history enable row level security;

revoke all on public.traffic_history from anon;
revoke all on public.traffic_history from authenticated;

grant select on public.traffic_history to anon;
grant select on public.traffic_history to authenticated;

-- ── Retensi ──────────────────────────────────────────────────────
--  Pola per jam cukup dihitung dari 30 hari terakhir (UI memakai
--  14 hari). Hapus manual berikut boleh dijalankan sekali sebulan:
--
--  delete from public.traffic_history where observed_at < now() - interval '30 days';

-- ═══════════════════════════════════════════════════════════════
--  Fungsi agregasi pola — dipanggil /api/traffic/history via RPC.
--  Dibuat STABLE security definer supaya policy RLS tidak memfilter
--  datanya sendiri (tabel dibaca lewat service-role saja di sisi
--  tulis, tapi SELECT via anon perlu ROLE untuk membaca agregat).
-- ═══════════════════════════════════════════════════════════════

-- Pola rata-rata per jam WIB (0–23) dari 30 hari terakhir.
create or replace function public.traffic_hourly_pattern(p_location text)
returns table (hour int, avg_ratio numeric, samples bigint)
language sql stable
as $$
  select
    (split_part(t.observed_hour, 'T', 2))::int as hour,
    round(avg(t.ratio)::numeric, 3)           as avg_ratio,
    count(*)::bigint                          as samples
  from public.traffic_history t
  where t.location_id = p_location
    and t.observed_at >= now() - interval '30 days'
  group by 1
  order by 1;
$$;

-- Rata-rata per hari (maks 14 hari ke belakang) untuk chart trend.
create or replace function public.traffic_daily_pattern(p_location text)
returns table (date text, avg_ratio numeric, samples bigint)
language sql stable
as $$
  select
    split_part(t.observed_hour, 'T', 1) as date,
    round(avg(t.ratio)::numeric, 3)     as avg_ratio,
    count(*)::bigint                    as samples
  from public.traffic_history t
  where t.location_id = p_location
    and t.observed_at >= now() - interval '14 days'
  group by 1
  order by 1;
$$;

grant execute on function public.traffic_hourly_pattern(text) to anon, authenticated;
grant execute on function public.traffic_daily_pattern(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
--  Verifikasi
--  1) insert dari anon HARUS ditolak:
--     curl -X POST "$SUPABASE_URL/rest/v1/traffic_history" \
--       -H "apikey: <anon-key>" -H "Prefer: return=minimal" \
--       -H "Content-Type: application/json" \
--       -d '{"location_id":"x","observed_hour":"x","level":"good","source":"estimated","current_speed":1,"free_flow_speed":1,"ratio":1}'
--     → 42501 (permission denied)
--
--  2) Fungsi agregasi boleh dipanggil siapa pun yang bisa baca:
--     curl "$SUPABASE_URL/rest/v1/rpc/traffic_hourly_pattern" \
--       -H "apikey: <anon-key>" \
--       -H "Content-Type: application/json" \
--       -d '{"p_location":"kec-bangko"}'
--     → 200 dengan array (mungkin kosong bila datanya belum ada)
-- ═══════════════════════════════════════════════════════════════

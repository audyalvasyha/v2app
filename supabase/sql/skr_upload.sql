-- ═══════════════════════════════════════════════════════════════
--  Akses upload SKR (sub-app skr.transportbaganbatu.com)
--
--  Sifat halaman : login wajib (Supabase Auth, admin tunggal)
--  Akses DB      : authenticated — INSERT via RPC atomik "replace penuh"
--
--  JANGAN pernah memberi INSERT/UPDATE/DELETE ke role `anon`:
--  kunci anon tertanam di bundle browser dan bisa dipakai siapa pun.
--  Dashboard utama tetap hanya-butuh SELECT anon dan tidak tersentuh
--  oleh script ini.
--
--  Jalankan sekali di Supabase → SQL Editor. Aman diulang.
-- ═══════════════════════════════════════════════════════════════

-- 1. RLS: role authenticated (hasil login Supabase Auth) boleh menulis.
alter table public.skr_detail enable row level security;

drop policy if exists "authenticated_tulis_skr_detail" on public.skr_detail;
create policy "authenticated_tulis_skr_detail" on public.skr_detail
  for all to authenticated
  using (true)
  with check (true);

-- 2. Fungsi atomic "replace penuh": hapus semua baris lalu masukkan batch
--    baru dalam SATU transaksi. Gagal di tengah → semua dibatalkan,
--    tabel tidak pernah dalam keadaan setengah kosong.
--    Rows dikirim sebagai JSON array dari browser (postgrest-js rpc).
create or replace function public.replace_skr_detail(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count bigint;
begin
  -- Hanya user yang sudah login lewat Supabase Auth yang boleh menjalankan.
  if auth.uid() is null then
    raise exception 'Harus login terlebih dahulu' using errcode = '42501';
  end if;

  if jsonb_typeof(rows) <> 'array' then
    raise exception 'Payload harus berupa array JSON' using errcode = '22P02';
  end if;

  delete from public.skr_detail;

  insert into public.skr_detail (
    license_no, salesman, pod_reason, skr_base_unit,
    pod_date, skr_sales_unit, skr_value, customer_id, delivery_number
  )
  select
    nullif(trim(r.item->>'license_no'), ''),
    nullif(trim(r.item->>'salesman'), ''),
    nullif(trim(r.item->>'pod_reason'), ''),
    nullif(trim(r.item->>'skr_base_unit'), ''),
    nullif(trim(r.item->>'pod_date'), ''),
    nullif(coalesce(r.item->>'skr_sales_unit', '0') ~ '^-?[0-9]+$',
           (r.item->>'skr_sales_unit')::bigint),
    nullif(trim(r.item->>'skr_value'), ''),
    nullif(trim(r.item->>'customer_id'), ''),
    nullif(trim(r.item->>'delivery_number'), '')
  from jsonb_array_elements(rows) as r(item);

  get diagnostics inserted_count = row_count;

  return jsonb_build_object('inserted', inserted_count);
end;
$$;

revoke all on function public.replace_skr_detail(jsonb) from public, anon;
grant execute on function public.replace_skr_detail(jsonb) to authenticated;

-- 3. Verifikasi:
--    select replaced from public.replace_skr_detail('[]'::jsonb);  -- harus 0
--    select count(*) from public.skr_detail;                       -- jumlah baris CSV

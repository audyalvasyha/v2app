-- ═══════════════════════════════════════════════════════════════
--  Akses upload SKR (sub-app skr.transportbaganbatu.com)
--
--  Sifat halaman : login wajib (Supabase Auth, admin tunggal)
--  Akses DB      : authenticated — UPSERT harian via RPC atomik
--
--  POLA IMPORT: harian H+1. File CSV berisi data terbaru dari sistem;
--  baris yang sidik jarinya sudah ada DITIMPA, yang belum ada DITAMBAH,
--  dan baris lama yang tidak ada di CSV DIBIARKAN (tidak dihapus).
--  Sidik jari = delivery_number + pod_date + skr_base_unit + skr_sales_unit
--  + skr_value. Empat kolom pertama saja TIDAK cukup: ditemukan kasus nyata
--  DO & tanggal sama, qty 0 (barang rusak/hilang), tapi nilai klaim beda
--  (0 vs 25.800) — dua klaim itu harus tetap tersimpan sebagai dua baris.
--  skr_value dipakai apa adanya: bila format nilainya berubah dari sistem
--  sumber ("25,800" jadi "25800"), baris dianggap kombinasi baru.
--
--  JANGAN pernah memberi INSERT/UPDATE/DELETE ke role `anon`:
--  kunci anon tertanam di bundle browser dan bisa dipakai siapa pun.
--  Dashboard utama tetap hanya-butuh SELECT anon dan tidak tersentuh
--  oleh script ini.
--
--  Jalankan sekali di Supabase → SQL Editor. Aman diulang.
-- ═══════════════════════════════════════════════════════════════

-- 1. RLS: TIDAK ada policy tulis untuk authenticated sekalipun.
-- Penulisan HANYA lewat fungsi upsert_skr_detail di bawah yang:
--   - security definer (tidak terkena RLS) sehingga tetap bisa menulis,
--   - atomik: seluruh batch dalam satu transaksi.
-- Kalau authenticated diberi policy INSERT/UPDATE/DELETE langsung,
-- admin bisa menghapus/mengubah baris sebagian lewat PostgREST dan
-- melewati jaminan atomik — cukup satu pintu (RPC) saja.
alter table public.skr_detail enable row level security;

drop policy if exists "authenticated_tulis_skr_detail" on public.skr_detail;

-- 2. Sidik jari baris. Delivery_number saja tidak unik (satu DO beberapa
--    item), dan DO+tanggal+unit+qty pun belum unik (kasus klaim qty 0
--    dengan nilai berbeda), jadi skr_value ikut jadi penentu "baris sama".
create unique index if not exists "skr_detail_fingerprint_idx"
  on public.skr_detail (delivery_number, pod_date, skr_base_unit, skr_sales_unit, skr_value);

-- 3. Fungsi upsert atomik. Gagal di tengah → seluruh batch dibatalkan.
--    Rows dikirim sebagai JSON array dari browser (postgrest-js rpc).
create or replace function public.upsert_skr_detail(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted bigint;
  v_updated  bigint;
  v_dupes bigint;
begin
  -- Hanya user yang sudah login lewat Supabase Auth yang boleh menjalankan.
  if auth.uid() is null then
    raise exception 'Harus login terlebih dahulu' using errcode = '42501';
  end if;

  -- Import SKR mengubah data operasional seluruh armada. Jangan hanya
  -- mengandalkan menu UI: siapa pun yang memegang JWT authenticated bisa
  -- memanggil RPC ini langsung lewat PostgREST. Samakan dengan lib/roles.ts:
  -- hanya admin utama yang boleh menulis.
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> lower('audyal.vasyah@pekanbaru-dr.com')
     or (
       to_regclass('public.app_users') is not null
       and exists (
         select 1
           from public.app_users u
          where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            and u.role <> 'admin'
       )
     ) then
    raise exception 'Hanya admin yang boleh import SKR' using errcode = '42501';
  end if;

  if jsonb_typeof(rows) <> 'array' then
    raise exception 'Payload harus berupa array JSON' using errcode = '22P02';
  end if;

  -- Batas batch: upload normal puluhan ribu baris, tapi payload raksasa
  -- dari script tidak boleh menyandera database/Route Handler.
  if jsonb_array_length(rows) > 50000 then
    raise exception 'Maksimal 50.000 baris per upload' using errcode = '22023';
  end if;

  -- CSV sistem sering berisi baris kembar dengan sidik jari SAMA
  -- (delivery_number + pod_date + base_unit + sales_unit + value).
  -- Tanpa dedup, Postgres menolak seluruh batch:
  -- "ON CONFLICT DO UPDATE command cannot affect row a second time".
  -- Jadi saring dulu: satu sidik jari = satu baris, baris TERAKHIR menang.
  -- DISTINCT ON menganggap NULL sama dengan NULL, jadi baris bersidik
  -- NULL pun ikut ciut — aman karena unique index mengabaikan NULL.
  with parsed as (
    select
      nullif(trim(r.item->>'license_no'), '') as license_no,
      nullif(trim(r.item->>'salesman'), '') as salesman,
      nullif(trim(r.item->>'pod_reason'), '') as pod_reason,
      nullif(trim(r.item->>'skr_base_unit'), '') as skr_base_unit,
      nullif(trim(r.item->>'pod_date'), '') as pod_date,
      case
        when btrim(r.item->>'skr_sales_unit') ~ '^-?[0-9]+$'
          then btrim(r.item->>'skr_sales_unit')::bigint
        else null
      end as skr_sales_unit,
      nullif(trim(r.item->>'skr_value'), '') as skr_value,
      case
        when btrim(r.item->>'customer_id') ~ '^-?[0-9]+$'
          then btrim(r.item->>'customer_id')::bigint
        else null
      end as customer_id,
      nullif(trim(r.item->>'delivery_number'), '') as delivery_number,
      nullif(trim(r.item->>'sales_office'), '') as sales_office,
      nullif(trim(r.item->>'distribution_channel'), '') as distribution_channel,
      r.ord as ord
    from jsonb_array_elements(rows) with ordinality as r(item, ord)
  ),
  deduped as (
    select distinct on (delivery_number, pod_date, skr_base_unit, skr_sales_unit, skr_value)
      license_no, salesman, pod_reason, skr_base_unit,
      pod_date, skr_sales_unit, skr_value, customer_id, delivery_number,
      sales_office, distribution_channel
    from parsed
    order by delivery_number, pod_date, skr_base_unit, skr_sales_unit, skr_value, ord desc
  )
  insert into public.skr_detail (
    license_no, salesman, pod_reason, skr_base_unit,
    pod_date, skr_sales_unit, skr_value, customer_id, delivery_number,
    sales_office, distribution_channel
  )
  select
    license_no, salesman, pod_reason, skr_base_unit,
    pod_date, skr_sales_unit, skr_value, customer_id, delivery_number,
    sales_office, distribution_channel
  from deduped
  on conflict (delivery_number, pod_date, skr_base_unit, skr_sales_unit, skr_value) do update
    set license_no          = excluded.license_no,
        salesman            = excluded.salesman,
        pod_reason          = excluded.pod_reason,
        pod_date            = excluded.pod_date,
        skr_value           = excluded.skr_value,
        customer_id         = excluded.customer_id,
        sales_office        = excluded.sales_office,
        distribution_channel = excluded.distribution_channel;

  get diagnostics v_inserted = row_count;
  -- row_count mencakup insert + update; updated tidak bisa dipisah tanpa
  -- loop. Kembalikan total baris yang tersentuh saja.
  v_updated := v_inserted;

  return jsonb_build_object('affected', v_updated);
end;
$$;

revoke all on function public.upsert_skr_detail(jsonb) from public, anon;
grant execute on function public.upsert_skr_detail(jsonb) to authenticated;

-- 4. Fungsi lama (replace penuh) dihapus agar tidak terpakai secara keliru.
drop function if exists public.replace_skr_detail(jsonb);

-- 5. Verifikasi:
--    select * from public.upsert_skr_detail('[]'::jsonb);  -- affected 0
--    select count(*) from public.skr_detail;               -- tetap berisi data lama

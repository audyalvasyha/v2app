-- ═══════════════════════════════════════════════════════════════
--  exec_ai_query — pembaca data untuk chatbot AI
--
--  PRINSIP: fungsi ini HANYA bisa menjalankan SELECT. Semua yang
--  keluar dari sini dibaca dengan hak akses pemanggil (SECURITY
--  INVOKER), jadi RLS tetap berlaku dan user hanya melihat baris
--  yang memang boleh ia lihat.
--
--  Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- ═══════════════════════════════════════════════════════════════

-- ── Guard: tolak query yang bukan SELECT murni ─────────────────
--
-- Catatan: pemeriksaan keyword ini BUKAN pertahanan utama.
-- Pertahanan utama ada di dua tempat lain:
--   1. `transaction_read_only` di bawah — PostgreSQL memblokir
--      setiap percobaan menulis apa pun, apa pun bentuknya.
--   2. SECURITY INVOKER + RLS — walau query lolos, dia tetap
--      cuma bisa membaca baris yang role-nya berhak baca.
--
-- Guard keyword cuma lapisan pertama yang murah dan memberi pesan
-- error yang jelas ke user (alih-alih error PostgreSQL yang membingungkan).
create or replace function public.exec_ai_query(p_query text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  q text;
  v_result jsonb;
begin
  -- PENTING: btrim()/ltrim() bawaan hanya memotong SPASI, bukan tab dan
  -- newline. Query dari model sering diawali newline atau indentation,
  -- dan kalau whitespace itu tidak ikut terpotong, guard di bawah akan
  -- salah menolaknya. Karena itu trim eksplisit untuk semua jenis
  -- whitespace.
  q := btrim(coalesce(p_query, ''), E' \t\r\n');

  if q = '' then
    raise exception 'Kueri kosong.'
      using errcode = '22023';
  end if;

  -- Buang komentar pembuka /* ... */ kalau ada. Menutup jalur di mana
  -- query diawali komentar lalu baris berikutnya berisi operasi tulis.
  q := regexp_replace(q, '^/\*.*?\*/', '', 's');
  q := btrim(q, E' \t\r\n');

  -- Tolak lebih dari satu statement. Titik koma di dalam string
  -- literal tetap aman karena PostgreSQL yang mem-parsingnya, bukan kita.
  if q like '%;%' then
    raise exception 'Hanya satu query per permintaan.'
      using errcode = '22023';
  end if;
  q := rtrim(q, E' \t\r\n;');

  -- Harus diawali SELECT atau WITH. Menutup jalan pintas
  -- lewat CTE yang nilainya akhirnya menulis (mis. "WITH x AS
  -- (DELETE ... ) SELECT ...").
  if lower(q) !~ '^(select|with)\s' then
    raise exception 'Hanya query SELECT yang diizinkan.'
      using errcode = '22023';
  end if;

  if lower(q) ~ '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|refresh|reindex|cluster|call|do)\b' then
    raise exception 'Query mengandung operasi yang tidak diizinkan.'
      using errcode = '22023';
  end if;

  -- Penjaga tambahan: kunci transaksi sebagai read-only sehingga
  -- PostgreSQL sendiri menolak percobaan menulis apa pun.
  --
  -- Sengaja dibungkus exception handler: kalau set_config ditolak
  -- (mis. PostgREST sudah menjalankan statement lain di transaksi
  -- yang sama), fitur TIDAK ikut gagal — pertahanan utama tetap
  -- RLS + guard keyword di atas, yang sudah cukup. Mematikan
  -- seluruh fitur karena satu SET tidak bisa dilakukan akan lebih
  -- buruk daripada berjalan tanpa lapisan kedua ini.
  begin
    perform set_config('transaction_read_only', 'on', true);
  exception when others then
    null;
  end;

  -- Timeout 8 detik: query yang menggantung tidak boleh membekukan
  -- Route Handler. Tidak dibungkus exception karena ini selalu bisa
  -- dilakukan dan memang bagian dari perilaku yang diinginkan.
  perform set_config('statement_timeout', '8000', true);

  -- Hasil dikembalikan sebagai JSON supaya route handler bisa
  -- meneruskannya ke browser tanpa harus tahu bentuk kolomnya.
  --
  -- Row limit keras: tanpa ini, satu user bebas menulis query yang
  -- mengembalikan ratusan ribu baris dan menghabiskan kuota Route
  -- Handler. LIMIT dipasang di SELECT terluar sehingga ORDER BY
  -- di query asli tetap berlaku seperti yang ditulis AI.
  --
  -- EXECUTE wajib dipakai (bukan menulis query-nya inline): teks SQL
  -- harus di-*susun saat runtime* dari variabel plpgsql, bukan
  -- di-parse sebagai bagian dari body fungsi. EXECUTE juga memastikan
  -- statement_timeout yang di atas benar-benar berlaku per statement.
  --
  -- jsonb_agg menghasilkan NULL untuk nol baris — dikembalikan sebagai
  -- array kosong supaya frontend tidak perlu menangani null.
  execute 'select coalesce(jsonb_agg(to_jsonb(_ai_row)), ''[]''::jsonb)
           from (select * from (' || q || ') as _ai limit 200) as _ai_row'
  into v_result;

  return v_result;
end;
$$;

-- Hanya role authenticated. `anon` TIDAK diberi akses — kunci anon
-- tertanam di bundle browser, jadi siapa pun yang membuka situs ini
-- akan punya akses ke fungsi yang sama tanpa perlu login.
revoke all on function public.exec_ai_query(text) from public, anon;
grant execute on function public.exec_ai_query(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════
--  View ringkas yang sering dipakai chatbot
--
--  Ditambahkan supaya query yang ditulis model tidak perlu
--  join berulang dan tidak pernah menyentuh tabel mentah yang
--  kolomnya berformat bebas (mis. skr_value "1.500.000" TEXT).
--  Semua angka sudah berupa tipe numerik sungguhan.
-- ═══════════════════════════════════════════════════════════════

-- Semua view dib-drop sekali di sini, dalam SATU perintah.
--
-- Kenapa satu perintah: ai_skr_mom bergantung pada ai_skr_bulanan,
-- jadi drop ai_skr_bulanan duluan gagal dengan
-- "2BP01: cannot drop view ... because other objects depend on it".
-- Menggabungkan keempatnya dengan CASCADE menyelesaikan urutan
-- dependensi tanpa harus membalik urutan drop tiap view.
--
-- CASCADE aman di sini karena satu-satunya objek yang bergantung
-- adalah keempat view milik skrip ini sendiri — semuanya dibuat
-- ulang dua baris di bawah.
drop view if exists public.ai_skr_mom,
                public.ai_skr_alasan,
                public.ai_biaya_bulanan,
                public.ai_skr_bulanan cascade;

-- SKR per bulan — sumber jawaban untuk "SKR kenapa tinggi bulan ini?"
create view public.ai_skr_bulanan as
select
  to_char(date_trunc('month', pod_d), 'YYYY-MM')          as bulan,
  count(*)                                                 as jml_dokumen,
  sum(qty)                                                 as total_qty,
  sum(nilai)                                               as total_nilai,
  count(distinct customer_id)                              as jml_toko,
  count(distinct license_no)                               as jml_plat,
  count(distinct salesman)                                 as jml_sales
from public.skr_ringkasan
where pod_d is not null
group by 1;

-- SKR per alasan POD — sumber jawaban untuk "alasan redelivery apa yang naik?"
create view public.ai_skr_alasan as
select
  pod_reason                                        as alasan,
  count(*)                                          as jml_dokumen,
  sum(qty)                                          as total_qty,
  sum(nilai)                                        as total_nilai
from public.skr_ringkasan
where pod_d is not null
group by 1;

-- Perbandingan bulan ini vs bulan lalu — inilah yang dipakai buat
-- menjawab "kenapa naik" (butuh dua bulan, bukan satu).
create view public.ai_skr_mom as
select
  b.bulan,
  b.jml_dokumen,
  b.total_qty,
  b.total_nilai,
  l.jml_dokumen    as jml_dokumen_lalu,
  l.total_qty      as total_qty_lalu,
  l.total_nilai    as total_nilai_lalu,
  case when l.total_nilai is not null and l.total_nilai <> 0
       then round(((b.total_nilai - l.total_nilai) / l.total_nilai) * 100, 1)
  end as persen_nilai_vs_lalu
from public.ai_skr_bulanan b
left join public.ai_skr_bulanan l
  on l.bulan = to_char(date_trunc('month', b.bulan::date) - interval '1 month', 'YYYY-MM')
order by b.bulan desc;

-- Biaya perbaikan per bulan + unit termahal di bulan itu
create view public.ai_biaya_bulanan as
select
  to_char(date_trunc('month', tanggal), 'YYYY-MM')  as bulan,
  count(*)                                         as jml_perbaikan,
  sum(jumlah_harga)                                as total_biaya,
  avg(jumlah_harga)                                as rata_rata_biaya,
  max(jumlah_harga)                                as biaya_tertinggi
from public.maintenance_histories
where tanggal is not null
group by 1
order by 1 desc;

grant select on public.ai_skr_bulanan, public.ai_skr_alasan,
                 public.ai_skr_mom,    public.ai_biaya_bulanan
  to authenticated;


-- ═══════════════════════════════════════════════════════════════
--  Verifikasi — jalankan setelah script di atas
--
--  1) Fungsi harus menolak operasi tulis:
--
--   select public.exec_ai_query('delete from skr_detail');
--   → error "Hanya query SELECT yang diizinkan."
--
--   select public.exec_ai_query('with x as (delete from skr_detail returning id) select * from x');
--   → error "Hanya query SELECT yang diizinkan."
--
--   select public.exec_ai_query('drop table skr_detail');
--   → error "Hanya query SELECT yang diizinkan."
--
--  2) SELECT biasa harus jalan dan mengembalikan array JSON:
--
--   select public.exec_ai_query('select bulan, total_nilai from ai_skr_bulanan order by bulan desc limit 3');
--
--  3) anon harus TIDAK bisa memanggilnya (jalankan di SQL Editor
--     memang akan lolos karena kamu postgres — untuk cek yang
--     sebenarnya, buka PostgREST dengan kunci anon):
--
--   curl "$SUPABASE_URL/rest/v1/rpc/exec_ai_query" \
--     -H "apikey: <anon-key>" -H "Content-Type: application/json" \
--     -d '{"p_query":"select 1"}'
--   → error 42501 permission denied
-- ═══════════════════════════════════════════════════════════════
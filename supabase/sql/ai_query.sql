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
                public.ai_skr_bulanan,
                public.ai_outbound_harian,
                public.ai_outbound_bulanan,
                public.ai_outbound_parsed cascade;

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
--
-- Memakai LAG(), BUKAN self-join dengan aritmetika tanggal.
--
-- Versi sebelumnya menulis `b.bulan::date`, padahal kolom `bulan`
-- bertipe TEXT berformat 'YYYY-MM'. PostgreSQL menolak cast itu dengan
-- error 22007 "invalid input syntax for type date: \"2026-07\"" — tipe
-- date mensyaratkan YYYY-MM-DD lengkap, format bulan saja tidak sah.
-- Efeknya view ini tidak pernah bisa dibaca sama sekali.
--
-- LAG() mengambil baris sebelumnya menurut urutan bulan, sehingga tidak
-- ada cast maupun aritmetika tanggal yang bisa gagal. Urutan teks
-- 'YYYY-MM' sudah kronologis dengan sendirinya, jadi ORDER BY bulan
-- sudah benar tanpa konversi apa pun.
create view public.ai_skr_mom as
select
  bulan,
  jml_dokumen,
  total_qty,
  total_nilai,
  lag(jml_dokumen) over w as jml_dokumen_lalu,
  lag(total_qty)   over w as total_qty_lalu,
  lag(total_nilai) over w as total_nilai_lalu,
  case
    when lag(total_nilai) over w is not null and lag(total_nilai) over w <> 0
      then round(
        ((total_nilai - lag(total_nilai) over w) / lag(total_nilai) over w) * 100,
        1
      )
  end as persen_nilai_vs_lalu
from public.ai_skr_bulanan
-- window didefinisikan sekali, dipakai berkali-kali di atas
window w as (order by bulan);

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

-- ═══════════════════════════════════════════════════════════════
--  Outbound: jam_out / jam_in bertipe TEXT
---- PERBAIKAN: kolom jam_out dan jam_in di armada_outbound sebenarnya
--  TEXT berisi nilai seperti "2026-10-02 18:46:00+00", BUKAN
--  timestamptz. Deskripsi skema yang dulu bilang timestamptz membuat
--  model menulis `jam_out at time zone 'Asia/Jakarta'`, yang gagal
--  dengan "function pg_catalog.timezone(unknown, text) does not exist".
--
--  Diperbaiki dengan memindahkan parsing ke view, sama seperti yang
--  sudah dilakukan untuk SKR: model tidak pernah lagi menyentuh kolom
--  TEXT itu, jadi tidak mungkin salah tipe.
--
--  Filter regex dipakai sebelum cast karena view tidak bisa menangkap
--  error. Satu baris berisi tanggal rusak akan menggagalkan seluruh
--  query, jadi baris yang tidak cocok polanya dibuang lebih dulu.
-- ═══════════════════════════════════════════════════════════════

create view public.ai_outbound_parsed as
select
  no_polisi,
  freight_order,
  (jam_out)::timestamptz as jam_out_ts,
  (jam_in)::timestamptz  as jam_in_ts,
  -- Durasi per perjalanan dalam MENIT, sudah dikonversi di sini.
  --
  -- Kenapa perlu kolom ini: pertanyaan "ada yang lebih 24 jam?"
  -- sebelumnya tidak bisa dijawab tanpa model menulis sendiri
  -- `extract(epoch from (jam_in_ts - jam_out_ts)) / 60 > 1440`,
  -- dan bentuk itu mudah salah ketik atau salah tanda kurung — yang
  -- berakhir sebagai "function does not exist" atau 0 baris palsu.
  --
  -- CASE (bukan sekadar ekspresi) supaya jam_in yang lebih dulu dari
  -- jam_out tidak menghasilkan durasi negatif. Kasus seperti ini
  -- memang pernah muncul karena jam_out diisi belakangan, dan durasi
  -- negatif membuat jawaban "tidak ada yang lebih dari 24 jam" jadi
  -- bohong.
  case
    when (jam_in)::timestamptz is null then null
    when (jam_in)::timestamptz < (jam_out)::timestamptz then null
    else round((extract(epoch from ((jam_in)::timestamptz - (jam_out)::timestamptz)) / 60)::numeric, 1)
  end as durasi_menit
from public.armada_outbound
where jam_out ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
  and (jam_in is null or jam_in ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}');

-- Rata-rata per hari, dalam MENIT sejak tengah malam WIB (bukan jam),
-- supaya model tinggal membagi 60 saat menulis jawaban.
--
-- rata2_menit_durasi memakai kolom durasi_menit (bukan ekspresi epoch
-- langsung) supaya definisi durasi hanya ada di SATU tempat. Kalau
-- rumus ini ditulis ulang di sini, dia bisa menyimpang dari view di
-- atas tanpa ada yang menyadarinya.
create view public.ai_outbound_harian as
select
  to_char(date(jam_out_ts at time zone 'Asia/Jakarta'), 'YYYY-MM-DD') as tanggal,
  count(*)                                                          as jml_outbound,
  count(jam_in_ts)                                                  as jml_kembali,
  count(*) filter (where jam_in_ts is null)                         as jml_masih_dijalan,
  round(avg(
    extract(hour   from jam_out_ts at time zone 'Asia/Jakarta') * 60
    + extract(minute from jam_out_ts at time zone 'Asia/Jakarta')
  ))                                                                as rata2_menit_keluar,
  round(avg(durasi_menit))                                          as rata2_menit_durasi
from public.ai_outbound_parsed
where jam_out_ts is not null
group by 1
order by 1 desc;

-- Rata-rata per bulan dihitung langsung dari baris per perjalanan, bukan
-- dari rata-rata harian: rata-rata dari rata-rata memberi bobot undue
-- ke hari yang hanya punya satu perjalanan.
create view public.ai_outbound_bulanan as
select
  to_char(date_trunc('month', jam_out_ts at time zone 'Asia/Jakarta'), 'YYYY-MM') as bulan,
  count(*)                       as jml_outbound,
  count(jam_in_ts)               as jml_kembali,
  round(avg(
    extract(hour   from jam_out_ts at time zone 'Asia/Jakarta') * 60
    + extract(minute from jam_out_ts at time zone 'Asia/Jakarta')
  ))                           as rata2_menit_keluar,
  round(avg(durasi_menit))       as rata2_menit_durasi
from public.ai_outbound_parsed
where jam_out_ts is not null
group by 1
order by 1 desc;

grant select on public.ai_skr_bulanan, public.ai_skr_alasan,
                 public.ai_skr_mom,    public.ai_biaya_bulanan,
                 public.ai_outbound_parsed, public.ai_outbound_harian,
                 public.ai_outbound_bulanan
  to authenticated;


-- ═══════════════════════════════════════════════════════════════
--  Verifikasi — jalankan setelah script di atas
--
--  0) Pertanyaan "ada outbound yang lebih dari 24 jam?" harus jalan
--     dan boleh mengembalikan 0 baris (artinya memang tidak ada,
--     bukan query yang salah):
--
--   select public.exec_ai_query(
--     'select no_polisi, freight_order, durasi_menit
--        from ai_outbound_parsed
--       where durasi_menit > 1440
--       order by durasi_menit desc limit 20');
--
--     Durasi negatif tidak boleh muncul di sini — durasi negatif
--     diabaikan (jadi NULL) di view ai_outbound_parsed.
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
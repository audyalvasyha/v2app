-- ═══════════════════════════════════════════════════════════════
--  ai_tasks — view aman Complaint Board untuk chatbot Tanya Midaa
--
--  Jalankan SETELAH tasks.sql. Aman diulang.
--
--  View ini hanya membuka kolom yang dibutuhkan untuk menjawab
--  pertanyaan operasional. Path attachment dan identitas email user
--  sengaja tidak ikut supaya tidak pernah masuk prompt model.
--
--  RLS tetap berlaku lewat security_invoker: query AI berjalan dengan
--  JWT user, bukan sebagai owner tabel atau service role.
-- ═══════════════════════════════════════════════════════════════

drop view if exists public.ai_tasks;

create view public.ai_tasks as
select
  t.title,
  case when t.status = 'blocked' then 'progress' else t.status end as status,
  case
    when t.status = 'done' then 'Selesai'
    when t.status = 'todo' then 'Baru'
    else 'Diproses'
  end as status_label,
  t.license_plate,
  t.freight_order,
  t.delivery_no,
  t.sales_name,
  t.created_at,
  floor(greatest(0, extract(epoch from (now() - t.created_at)) / 86400))::integer as umur_hari,
  case
    when t.status = 'done' then 'selesai'
    when t.created_at <= now() - interval '7 days' then 'terlambat'
    when t.created_at <= now() - interval '3 days' then 'perlu_fu'
    else 'baru'
  end as level_umur,
  (t.status <> 'done') as belum_selesai,
  t.followed_up_at,
  t.resolved_at
from public.tasks as t;

alter view public.ai_tasks set (security_invoker = true);

revoke all on public.ai_tasks from anon;
grant select on public.ai_tasks to authenticated;


-- ═══════════════════════════════════════════════════════════════
--  Verifikasi — jalankan setelah script di atas
--
--  1) View harus bisa dibaca user login dan hanya berisi kolom aman:
--     select * from public.ai_tasks order by created_at desc limit 5;
--
--  2) Lewat jalur AI, umur dan level tiket harus sudah terhitung:
--     select public.exec_ai_query(
--       'select title, status_label, umur_hari, level_umur
--          from ai_tasks
--         where belum_selesai
--         order by umur_hari desc limit 10');
--
--  3) anon harus ditolak:
--     curl "$SUPABASE_URL/rest/v1/ai_tasks?select=title" \
--       -H "apikey: <anon-key>"
--     → error 401/42501
-- ═══════════════════════════════════════════════════════════════

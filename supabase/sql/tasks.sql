-- ═══════════════════════════════════════════════════════════════
--  tasks — papan follow-up komplain pengiriman (menu Complaint Board)
--
--  Satu baris = satu komplain kekurangan dari toko. Kolom identitas
--  pengiriman (sales, plat, delivery, freight order, pelanggan) dipakai
--  untuk menelusuri asal komplain; atribusi user DIPAKSA trigger dari
--  sesi Supabase Auth (bukan dipercaya dari payload browser):
--    created_by      → user yang mencatat komplain
--    followed_up_by  → user pertama yang memindahkan ke "sedang di-FU"
--    resolved_by     → user yang menandai selesai
--
--  Delete dibatasi ke pembuat komplain atau admin utama. Update tetap
--  terbuka untuk kolaborasi, tetapi kolom atribusi tidak bisa diubah.
--
--  DIBACA & DITULIS OLEH: browser dengan sesi user terdaftar (menu ada
--  di balik AuthGate). RLS: hanya role `authenticated`.
--
--  Jika script ini BELUM dijalankan: menu Complaint Board tetap terbuka dalam
--  mode lokal (localStorage browser itu) dan UI menampilkan penanda.
--
--  Aman diulang, termasuk pada tabel versi pertama (kolom baru
--  ditambahkan lewat ALTER di bagian bawah).
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  -- Isi komplain, mis. "Kekurangan turun barang 1 box Mie Sedap Soto".
  title       text        not null,
  -- Catatan tindakan / hasil follow up.
  description text,
  -- Kolom kanban.
  status      text        not null default 'todo'
              check (status in ('todo', 'progress', 'blocked', 'done')),
  priority    text        not null default 'normal'
              check (priority in ('high', 'normal', 'low')),
  -- Identitas pengiriman yang dikomplain.
  sales_name     text,
  license_plate  text,
  delivery_no    text,
  freight_order  text,
  customer_no    text,
  -- Daftar object key foto bukti komplain R2, satu path per baris.
  attachment_path text,
  -- Daftar object key dokumentasi penyelesaian, satu path per baris.
  resolution_attachment_path text,
  -- Atribusi user (email dari Supabase Auth).
  created_by      text,
  followed_up_by  text,
  followed_up_at  timestamptz,
  resolved_by     text,
  resolved_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ── Upgrade dari versi pertama tabel (tanpa kolom komplain) ───────
alter table public.tasks
  add column if not exists sales_name     text,
  add column if not exists license_plate  text,
  add column if not exists delivery_no    text,
  add column if not exists freight_order  text,
  add column if not exists customer_no    text,
  add column if not exists attachment_path text,
  add column if not exists resolution_attachment_path text,
  add column if not exists created_by     text,
  add column if not exists followed_up_by text,
  add column if not exists followed_up_at timestamptz,
  add column if not exists resolved_by    text,
  add column if not exists resolved_at    timestamptz;

-- Tidak ada kolom tenggat: tiket yang belum selesai otomatis naik ke
-- "Perlu FU" setelah 3 hari dan "Terlambat" setelah 7 hari, dihitung
-- aplikasi dari created_at. Kolom priority dipertahankan untuk data lama,
-- tetapi tidak lagi dipakai UI.
-- Status Selesai tidak boleh lolos tanpa dokumentasi penyelesaian. Form
-- sudah memvalidasi, tetapi constraint ini menjaga jalur tulis langsung ke
-- tabel/API tetap aman. NOT VALID membuat baris lama tidak memblokir migrasi;
-- constraint tetap berlaku untuk insert/update berikutnya.
alter table public.tasks
  drop constraint if exists tasks_done_requires_resolution;
alter table public.tasks
  add constraint tasks_done_requires_resolution
  check (status <> 'done' or nullif(btrim(resolution_attachment_path), '') is not null) not valid;

create index if not exists tasks_status_created_idx
  on public.tasks (status, created_at);
drop index if exists public.tasks_status_due_idx;
create index if not exists tasks_delivery_idx
  on public.tasks (delivery_no);

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.tasks enable row level security;

revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;

-- Satu papan untuk semua user terdaftar (bukan multi-tenant). Kalau
-- nanti perlu papan per orang, ganti `using (true)` dengan
-- `using (auth.uid() = owner_id)` dan tambahkan kolom owner_id.
drop policy if exists tasks_read   on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

create policy tasks_read   on public.tasks for select to authenticated using (true);

create policy tasks_insert on public.tasks for insert to authenticated with check (true);

create policy tasks_update on public.tasks for update to authenticated using (true) with check (true);

-- Helper admin untuk policy delete. Disalin dari is_app_admin() supaya
-- tasks.sql tetap bisa dijalankan mandiri sebelum auth_lockdown.sql.
create or replace function public.is_task_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email <> lower('audyal.vasyah@pekanbaru-dr.com') then
    return false;
  end if;

  if to_regclass('public.app_users') is null then
    return true;
  end if;

  return coalesce(
    (select u.role = 'admin'
       from public.app_users u
      where lower(u.email) = v_email
      limit 1),
    true
  );
end;
$$;

revoke all on function public.is_task_admin() from public, anon;
grant execute on function public.is_task_admin() to authenticated;

create policy tasks_delete on public.tasks for delete to authenticated using (
  public.is_task_admin()
  or (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(coalesce(created_by, '')) = lower(auth.jwt() ->> 'email')
  )
);

-- ── Atribusi audit dari sesi, bukan dari browser ─────────────────
-- RLS update sengaja terbuka agar tim bisa saling melanjutkan komplain.
-- Tanpa trigger ini, siapa pun bisa mengubah created_by/resolved_by atau
-- memundurkan created_at lewat PostgREST dan memalsukan jejak audit.
create or replace function public.enforce_task_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := lower(coalesce(auth.jwt() ->> 'email', auth.uid()::text));
begin
  -- Service role / migrasi tanpa JWT tidak punya auth.uid(); jangan blokir.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := actor;
    new.created_at := now();
    new.followed_up_by := null;
    new.followed_up_at := null;
    new.resolved_by := null;
    new.resolved_at := null;
  else
    -- Kolom identitas dan waktu pembuatan tidak boleh diubah setelah ada.
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.followed_up_by := old.followed_up_by;
    new.followed_up_at := old.followed_up_at;
    new.resolved_by := old.resolved_by;
    new.resolved_at := old.resolved_at;
  end if;

  if new.status = 'done' then
    if new.followed_up_by is null then
      new.followed_up_by := actor;
      new.followed_up_at := now();
    end if;
    if new.resolved_by is null then
      new.resolved_by := actor;
      new.resolved_at := now();
    end if;
  elsif new.status in ('progress', 'blocked') then
    if new.followed_up_by is null then
      new.followed_up_by := actor;
      new.followed_up_at := now();
    end if;
    new.resolved_by := null;
    new.resolved_at := null;
  else
    -- Kembali ke "Baru": dokumentasi selesai tidak lagi berlaku.
    new.resolved_by := null;
    new.resolved_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_task_audit_fields() from public, anon, authenticated;

drop trigger if exists tasks_enforce_audit_fields on public.tasks;
create trigger tasks_enforce_audit_fields
  before insert or update on public.tasks
  for each row execute function public.enforce_task_audit_fields();

-- ── Kepemilikan path lampiran ────────────────────────────────────
-- Endpoint /api/attachments mengizinkan user lain melihat lampiran yang
-- tercatat di task. Tanpa trigger ini, siapa pun bisa insert task dengan
-- attachment_path milik orang lain lalu memakai endpoint view untuk
-- membuka file korban. Path upload selalu complaints/<auth.uid()>/<uuid>.
create or replace function public.enforce_task_attachment_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := auth.uid()::text;
  old_attachment_paths text[] := array[]::text[];
  old_resolution_paths text[] := array[]::text[];
  new_path text;
begin
  -- Service role / migrasi tanpa JWT tidak punya auth.uid(); jangan blokir.
  if uid is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    old_attachment_paths := array(
      select btrim(p)
        from unnest(string_to_array(coalesce(old.attachment_path, ''), E'\n')) as u(p)
       where btrim(p) <> ''
    );
    old_resolution_paths := array(
      select btrim(p)
        from unnest(string_to_array(coalesce(old.resolution_attachment_path, ''), E'\n')) as u(p)
       where btrim(p) <> ''
    );
  end if;

  -- Satu kolom bisa berisi beberapa path, satu per baris. Hanya path baru
  -- yang wajib milik user yang sedang menyimpan; path lama (termasuk milik
  -- user lain) tetap boleh dipertahankan saat komplain diedit bersama.
  foreach new_path in array string_to_array(coalesce(new.attachment_path, ''), E'\n')
  loop
    new_path := btrim(new_path);
    if new_path <> ''
       and not (new_path = any(old_attachment_paths))
       and new_path not like ('complaints/' || uid || '/%') then
      raise exception 'Lampiran komplain harus diunggah oleh user yang membuat task'
        using errcode = '42501';
    end if;
  end loop;

  foreach new_path in array string_to_array(coalesce(new.resolution_attachment_path, ''), E'\n')
  loop
    new_path := btrim(new_path);
    if new_path <> ''
       and not (new_path = any(old_resolution_paths))
       and new_path not like ('complaints/' || uid || '/%') then
      raise exception 'Dokumentasi penyelesaian harus diunggah oleh user yang menyimpan task'
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.enforce_task_attachment_owner() from public, anon, authenticated;

drop trigger if exists tasks_enforce_attachment_owner on public.tasks;
create trigger tasks_enforce_attachment_owner
  before insert or update on public.tasks
  for each row execute function public.enforce_task_attachment_owner();

-- ── Lampiran (Cloudflare R2) ────────────────────────────────────
-- File tidak disimpan di Supabase Storage. Browser upload langsung ke
-- bucket privat R2 lewat presigned URL dari /api/attachments; kolom di
-- atas hanya menyimpan object key-nya.

-- ═══════════════════════════════════════════════════════════════
--  Verifikasi
--  1) anon HARUS ditolak:
--     curl "$SUPABASE_URL/rest/v1/tasks?select=id" -H "apikey: <anon-key>"
--     → 401 / 42501
--  2) user login bisa menulis satu baris uji, lalu menghapus baris
--     miliknya sendiri. Delete task milik user lain harus 0 baris:
--     insert into public.tasks (title, sales_name, delivery_no)
--     values ('tes', 'sales uji', 'DO-1') returning id;
--     delete from public.tasks where title = 'tes';
--  3) created_by tidak boleh berubah lewat update langsung:
--     update public.tasks set created_by = 'orang-lain@contoh.com'
--      where id = '<id-task>';  -- nilai tetap seperti semula
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
--  tasks — papan follow-up komplain pengiriman (menu Complaint Board)
--
--  Satu baris = satu komplain kekurangan dari toko. Kolom identitas
--  pengiriman (sales, plat, delivery, freight order, pelanggan) dipakai
--  untuk menelusuri asal komplain; atribusi user diisi aplikasi dari
--  sesi Supabase Auth:
--    created_by      → user yang mencatat komplain
--    followed_up_by  → user pertama yang memindahkan ke "sedang di-FU"
--    resolved_by     → user yang menandai selesai
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
  -- Object key foto bukti komplain Cloudflare R2 (PNG/JPEG).
  attachment_path text,
  -- Object key dokumentasi penyelesaian; wajib diisi saat status selesai.
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

-- Tidak ada kolom tenggat: tiket yang belum selesai 3 hari otomatis
-- ditampilkan prioritas Tinggi, dihitung aplikasi dari created_at.
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
create policy tasks_delete on public.tasks for delete to authenticated using (true);

-- ── Lampiran (Cloudflare R2) ────────────────────────────────────
-- File tidak disimpan di Supabase Storage. Browser upload langsung ke
-- bucket privat R2 lewat presigned URL dari /api/attachments; kolom di
-- atas hanya menyimpan object key-nya.

-- ═══════════════════════════════════════════════════════════════
--  Verifikasi
--  1) anon HARUS ditolak:
--     curl "$SUPABASE_URL/rest/v1/tasks?select=id" -H "apikey: <anon-key>"
--     → 401 / 42501
--  2) user login bisa menulis satu baris uji, lalu hapus lagi:
--     insert into public.tasks (title, sales_name, delivery_no)
--     values ('tes', 'sales uji', 'DO-1') returning id;
--     delete from public.tasks where title = 'tes';
-- ═══════════════════════════════════════════════════════════════

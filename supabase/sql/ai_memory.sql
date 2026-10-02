-- ═══════════════════════════════════════════════════════════════
--  ai_memory — ingatan jangka panjang untuk chatbot Tanya Data
--
--  PRINSIP: satu user hanya bisa membaca dan mengubah memorinya
--  sendiri. Tidak ada service role, tidak ada policy untuk anon, dan
--  tidak ada kolom yang menunjuk ke tabel operasional — isinya cuma
--  catatan singkat hasil percakapan.
--
--  Jalankan sekali di Supabase SQL Editor. Aman diulang.
--  Sifatnya OPSIONAL: tanpa tabel ini, chatbot tetap jalan normal,
--  hanya tidak mengingat apa-apa antar perangkat.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.ai_memory (
  id          uuid        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  content     text        not null,
  created_at  timestamptz not null default now(),

  -- Batas panjang per item ditegakkan di database, bukan cuma di
  -- aplikasi. Prompt harus tetap ringkas, dan satu catatan yang
  -- kelewat panjang tidak boleh memakan seluruh ruang konteks.
  constraint ai_memory_content_len check (char_length(content) between 1 and 300),

  -- Teks kosong / spasi doang ditolak di sini supaya tidak ada baris
  -- yang isinya tidak berguna tapi tetap memakan kuota prompt.
  constraint ai_memory_content_not_blank check (btrim(content) <> '')
);

-- Index untuk pola akses utama: "memori milik user X, terbaru dulu".
create index if not exists ai_memory_user_created_idx
  on public.ai_memory (user_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────
--
-- Tanpa baris di bawah ini, tabel ini bisa dibaca siapa pun yang punya
-- kunci anon — dan kunci itu tertanam di bundle browser.
alter table public.ai_memory enable row level security;

drop policy if exists ai_memory_own on public.ai_memory;

-- Satu policy untuk semua operasi, dengan auth.uid() di kedua sisi.
--
-- Sisi USING (baris yang boleh dibaca/diubah) dan WITH CHECK (nilai yang
-- boleh ditulis) sengaja keduanya dipakai: kalau hanya USING, user
-- bisa menyisipkan baris dengan user_id orang lain — baris itu tidak  -- akan bisa dia baca lagi, tapi akan tetap tersimpan dan bisa dibaca
-- oleh pemiliknya yang asli.
--
-- auth.uid() dibungkus (select ...) supaya Postgres bisa memakainya
-- sebagai index condition, bukan dievaluasi ulang per baris.
create policy ai_memory_own on public.ai_memory
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Grant ────────────────────────────────────────────────────────
--
-- revoke DULU, baru grant: kalau script ini dijalankan ulang, grant
-- yang sebelumnya ada dicabut lebih dulu sehingga tidak menumpuk.
revoke all on public.ai_memory from anon;
revoke all on public.ai_memory from authenticated;

grant select, insert, delete on public.ai_memory to authenticated;
-- Tidak ada grant update: memori hanya bisa ditambah atau dihapus,
-- sehingga tidak ada jalur untuk mengubah user_id lewat update.


-- ═══════════════════════════════════════════════════════════════
--  Verifikasi — jalankan setelah script di atas
--
--  1) Tabel harus menolak kolom PII / data operasional. Tidak ada
--     kolom apa pun selain id, user_id, content, created_at:
--
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'ai_memory';
--
--  2) anon harus DITOLAK (cek sungguhan lewat PostgREST, bukan SQL
--     Editor — di SQL Editor kamu berperan postgres, jadi policy RLS
--     dilewati):
--
--   curl "$SUPABASE_URL/rest/v1/ai_memory?select=content" \
--     -H "apikey: <anon-key>"
--   → error 401/42501
--
--  3) logged-in user hanya melihat memorinya sendiri: buka dasbor,
--     panel Tanya Midaa → Ingatan, lalu tambahkan satu catatan. Baris
--     itu harus punya user_id = auth.uid() user tersebut.
-- ═══════════════════════════════════════════════════════════════

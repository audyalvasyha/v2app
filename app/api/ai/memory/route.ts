import { NextResponse } from "next/server"
import { requireUserClient } from "@/lib/ai/user-client"
import {
  clearMemories,
  deleteMemory,
  loadMemories,
  saveMemories,
  normalizeMemoryContent,
} from "@/lib/ai/memory"

/**
 * CRUD memori jangka panjang Tanya Data.
 *
 * Dipisah dari `/api/ai/ask` karena operasinya beda sifat: yang satu
 * boros kuota AI dan harus dibatasi rate limit, yang ini ringan dan
 * dipanggil panel memori setiap kali panel dibuka. Memenggabungkannya di satu
 * route hanya bikin route yang satu jadi besar tanpa alasan yang jelas.
 *
 * Sama seperti `/api/ai/ask`, route ini tidak pernah membaca
 * SUPABASE_SERVICE_ROLE_KEY — klien dibangun dari JWT user, jadi tabel
 * `ai_memory` dijaga policy `user_id = auth.uid()`. Membaca memori
 * user lain mustahil lewat jalur ini.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Daftar memori milik user yang sedang login. */
export async function GET(request: Request) {
  const auth = await requireUserClient(request)
  if (!auth.ok) return auth.response

  const snapshot = await loadMemories(auth.value.client)
  // `available: false` berarti tabel ai_memory belum ada. Itu bukan
  // kegagalan — panel memori di UI bisa menampilkan "belum aktif" dan
  // menyuruh user menjalankan script SQL, bukan menampilkan error merah.
  return NextResponse.json({ items: snapshot.items, available: snapshot.available })
}

/** Tambah satu memori manual (ditulis user sendiri, bukan hasil ekstraksi). */
export async function POST(request: Request) {
  const auth = await requireUserClient(request)
  if (!auth.ok) return auth.response

  let content: unknown
  try {
    const body = await request.json()
    content = body?.content
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON." }, { status: 400 })
  }

  if (typeof content !== "string") {
    return NextResponse.json({ error: "Isi memori harus berupa teks." }, { status: 400 })
  }

  const normalized = normalizeMemoryContent(content)
  if (normalized.length < 3) {
    return NextResponse.json(
      { error: "Catatan terlalu pendek. Tulis minimal 3 huruf." },
      { status: 400 },
    )
  }

  const saved = await saveMemories(auth.value.client, auth.value.userId, [normalized])
  if (saved.length === 0) {
    return NextResponse.json(
      { error: "Catatan tidak bisa disimpan. Jalankan supabase/sql/ai_memory.sql lebih dulu." },
      { status: 503 },
    )
  }

  return NextResponse.json({ items: saved }, { status: 201 })
}

/**
 * Hapus satu memori (`?id=`) atau seluruhnya (`?all=1`).
 *
 * Penghapusan milik user lain tidak mungkin menembus policy RLS, jadi
 * tidak perlu cek user_id manual di sini.
 */
export async function DELETE(request: Request) {
  const auth = await requireUserClient(request)
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams

  if (params.get("all") === "1") {
    const ok = await clearMemories(auth.value.client)
    return NextResponse.json({ cleared: ok })
  }

  const id = params.get("id")
  if (!id) {
    return NextResponse.json(
      { error: "Sebutkan ?id=<uuid> atau ?all=1." },
      { status: 400 },
    )
  }

  const deleted = await deleteMemory(auth.value.client, id)
  return NextResponse.json({ deleted })
}

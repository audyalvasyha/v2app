import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { requireUserClient } from "@/lib/ai/user-client"
import { TASK_ATTACHMENT_MAX_BYTES, isTaskAttachmentType } from "@/lib/tasks"

/**
 * Upload, lihat, dan hapus lampiran komplain di Cloudflare R2.
 *
 * Kredensial R2 hanya hidup di server. Browser tidak pernah menerima
 * access key: untuk upload ia meminta presigned PUT URL, lalu mengirim
 * file langsung ke R2 supaya file tidak melewati server Next.js.
 *
 * Bucket tetap privat. Melihat file juga lewat presigned GET URL yang
 * berumur pendek; tidak ada URL publik permanen.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KEY_PREFIX = "complaints/"

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

let cachedClient: { key: string; client: S3Client } | null = null

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

function getClient(config: R2Config): S3Client {
  const key = `${config.accountId}:${config.accessKeyId}:${config.bucket}`
  if (cachedClient?.key === key) return cachedClient.client

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    // SDK AWS versi baru menambahkan checksum otomatis yang tidak selalu
    // didukung R2 saat upload lewat presigned URL. Minta hanya bila wajib.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
  cachedClient = { key, client }
  return client
}

/** Hanya menerima object key yang dibuat route ini, bukan path sembarang. */
function isSafeKey(value: unknown): value is string {
  if (typeof value !== "string") return false
  if (value.length < KEY_PREFIX.length + 5 || value.length > 320) return false
  if (!value.startsWith(KEY_PREFIX) || value.includes("..") || value.includes("\\")) return false
  return /^[A-Za-z0-9/_.-]+$/.test(value)
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/** Object key selalu dibuat route upload dengan prefix user yang login. */
function belongsToUser(path: string, userId: string): boolean {
  return path.startsWith(`${KEY_PREFIX}${userId}/`)
}

/**
 * Lampiran yang sudah tercatat di task boleh dilihat user login lain yang
 * memang bisa membaca papan komplain. Ini mencegah endpoint "view" dipakai
 * untuk menebak object key milik task/user lain di bucket yang sama.
 */
async function isTaskAttachment(
  client: SupabaseClient,
  path: string,
): Promise<boolean> {
  const [original, resolution] = await Promise.all([
    client.from("tasks").select("id").eq("attachment_path", path).limit(1),
    client.from("tasks").select("id").eq("resolution_attachment_path", path).limit(1),
  ])
  return (
    (!original.error && (original.data?.length ?? 0) > 0) ||
    (!resolution.error && (resolution.data?.length ?? 0) > 0)
  )
}

export async function POST(request: Request) {
  const auth = await requireUserClient(request)
  if (!auth.ok) return auth.response

  const config = readConfig()
  if (!config) {
    return fail(
      "Cloudflare R2 belum dikonfigurasi. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET_NAME di environment server.",
      503,
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return fail("Body harus berupa JSON.")
  }

  const client = getClient(config)
  const action = body.action

  try {
    if (action === "upload") {
      const contentType = String(body.contentType ?? "")
      const size = Number(body.size)
      if (!isTaskAttachmentType(contentType)) {
        return fail("Lampiran harus berupa gambar PNG atau JPEG.")
      }
      if (!Number.isInteger(size) || size <= 0) {
        return fail("Ukuran lampiran tidak valid.")
      }
      if (size > TASK_ATTACHMENT_MAX_BYTES) {
        return fail("Ukuran lampiran maksimal 5 MB.")
      }

      const ext = contentType === "image/png" ? "png" : "jpg"
      const key = `${KEY_PREFIX}${auth.value.userId}/${crypto.randomUUID()}.${ext}`
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: contentType,
          // Ikut ditandatangani: R2 menolak body yang ukurannya berbeda dari
          // ukuran yang divalidasi server, bukan sekadar percaya klaim client.
          ContentLength: size,
        }),
        { expiresIn: 5 * 60 },
      )

      return NextResponse.json({
        uploadUrl,
        path: key,
        headers: { "Content-Type": contentType },
      })
    }

    if (action === "view") {
      const path = body.path
      if (!isSafeKey(path)) return fail("Path lampiran tidak valid.")
      const isOwner = belongsToUser(path, auth.value.userId)
      if (!isOwner && !(await isTaskAttachment(auth.value.client, path))) {
        // Jangan bocorkan apakah object key itu ada atau bukan.
        return fail("Lampiran tidak ditemukan.", 404)
      }
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: path }),
        { expiresIn: 60 * 60 },
      )
      return NextResponse.json({ url })
    }

    if (action === "delete") {
      const path = body.path
      if (!isSafeKey(path)) return fail("Path lampiran tidak valid.")
      if (!belongsToUser(path, auth.value.userId)) {
        return fail("Tidak berwenang menghapus lampiran ini.", 403)
      }
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: path }))
      return NextResponse.json({ ok: true })
    }

    return fail("Aksi lampiran tidak dikenal.")
  } catch (error) {
    console.error("[attachments] R2 request failed:", error)
    return fail("Gagal memproses lampiran. Coba lagi sebentar.", 502)
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Gunakan POST untuk upload, lihat, atau hapus lampiran." },
    { status: 405 },
  )
}

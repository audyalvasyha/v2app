/**
 * Model & aturan papan komplain pengiriman (menu Complaint Board).
 *
 * Satu baris = satu komplain kekurangan dari toko, mis. "kurang turun 1 box
 * Mie Sedap Soto". Papan memantau progresnya: baru masuk → sedang di-FU →
 * menunggu toko → selesai.
 *
 * Sumber data utama tabel `tasks` di Supabase (supabase/sql/tasks.sql). Bila
 * tabel belum dibuat, papan jatuh ke mode lokal (localStorage browser ini)
 * supaya menu tetap bisa dipakai sebelum SQL dijalankan.
 *
 * Atribusi user TIDAK diisi manual: `created_by` diambil dari sesi Supabase
 * saat komplain dibuat, `followed_up_by` saat status pertama kali masuk
 * "sedang di-FU", dan `resolved_by` saat ditandai selesai.
 */

export type TaskStatus = "todo" | "progress" | "blocked" | "done"
export type TaskPriority = "high" | "normal" | "low"

export interface Task {
    id: string
    /** Isi komplain — mis. "Kekurangan turun barang 1 box Mie Sedap Soto" */
    title: string
    /** Catatan tindakan / hasil follow up */
    description: string | null
    status: TaskStatus
    priority: TaskPriority
    /** Identitas pengiriman yang dikomplain */
    sales_name: string | null
    license_plate: string | null
    delivery_no: string | null
    freight_order: string | null
    customer_no: string | null
    /** Object key foto bukti komplain di Cloudflare R2; null bila tidak ada. */
    attachment_path: string | null
    /** Object key dokumentasi penyelesaian; wajib saat status `done`. */
    resolution_attachment_path: string | null
    /** Atribusi otomatis dari sesi Supabase */
    created_by: string | null
    followed_up_by: string | null
    followed_up_at: string | null
    resolved_by: string | null
    resolved_at: string | null
    created_at: string
    /** Kolom lama — tidak dipakai lagi di UI, dibiarkan agar baris lama tetap valid */
    assignee?: string | null
}

/** Nilai yang bisa diisi lewat dialog form (atribusi user diisi otomatis). */
export interface TaskInput {
    title: string
    description: string | null
    status: TaskStatus
    priority: TaskPriority
    sales_name: string | null
    license_plate: string | null
    delivery_no: string | null
    freight_order: string | null
    customer_no: string | null
    attachment_path: string | null
    resolution_attachment_path: string | null
}

/** Batas lampiran komplain (PNG/JPEG), sama dengan validasi form dan API. */
export const TASK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

/** Pesan validasi saat komplain ditandai selesai tanpa dokumentasi penyelesaian. */
export const TASK_RESOLUTION_REQUIRED_MESSAGE =
    "Dokumentasi penyelesaian wajib diunggah saat status Selesai."
export const TASK_ATTACHMENT_TYPES = ["image/png", "image/jpeg"] as const

export function isTaskAttachmentType(type: string): boolean {
    return (TASK_ATTACHMENT_TYPES as readonly string[]).includes(type)
}

export const TASK_STATUSES: { id: TaskStatus; label: string }[] = [
    { id: "todo", label: "Baru masuk" },
    { id: "progress", label: "Di Proses" },
    { id: "done", label: "Selesai" },
]

/**
 * `blocked` adalah status lama "Menunggu toko" yang sudah dihapus dari papan.
 * Baris lama tetap harus muncul, jadi status itu diperlakukan sebagai
 * "Di Proses" sampai user menyimpannya ulang.
 */
export function normalizeTaskStatus(status: TaskStatus): TaskStatus {
    return status === "blocked" ? "progress" : status
}

export const TASK_PRIORITIES: { id: TaskPriority; label: string }[] = [
    { id: "high", label: "Tinggi" },
    { id: "normal", label: "Sedang" },
    { id: "low", label: "Rendah" },
]

export function statusLabel(status: TaskStatus): string {
    return TASK_STATUSES.find((s) => s.id === normalizeTaskStatus(status))?.label ?? status
}

export function priorityLabel(priority: TaskPriority): string {
    return TASK_PRIORITIES.find((p) => p.id === priority)?.label ?? priority
}

/**
 * Warna badge prioritas mengikuti tingkat urgensi: rendah hijau, sedang
 * kuning, tinggi merah — sama seperti palet status di papan.
 */
export function priorityClass(priority: TaskPriority): string {
    if (priority === "high") {
        return "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
    }
    if (priority === "low") {
        return "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    }
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
}

/** Ambang otomatis naik ke prioritas Tinggi (hari sejak tiket dibuat). */
export const ESCALATION_DAYS = 3

const DAY_MS = 86_400_000

/** Umur tiket dalam hari (pecahan), dihitung dari `created_at`. */
export function ticketAgeDays(
    task: Pick<Task, "created_at">,
    now: number = Date.now(),
): number {
    const created = new Date(task.created_at).getTime()
    if (Number.isNaN(created)) return 0
    return Math.max(0, (now - created) / DAY_MS)
}

/**
 * Prioritas EFEKTIF yang ditampilkan: tiket yang belum selesai lebih dari
 * `ESCALATION_DAYS` hari otomatis dianggap "high". Nilai `priority` di
 * database tidak ditimpa, jadi riwayat pilihan user tetap utuh.
 */
export function effectivePriority(
    task: Pick<Task, "status" | "priority" | "created_at">,
    now: number = Date.now(),
): TaskPriority {
    if (task.status !== "done" && ticketAgeDays(task, now) >= ESCALATION_DAYS) {
        return "high"
    }
    return task.priority
}

/** True bila tiket sudah melewati ambang eskalasi dan belum selesai. */
export function isEscalated(
    task: Pick<Task, "status" | "created_at">,
    now: number = Date.now(),
): boolean {
    return task.status !== "done" && ticketAgeDays(task, now) >= ESCALATION_DAYS
}

/** Urutan dalam kolom: prioritas efektif, lalu yang paling lama menunggu. */
const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 }

export function sortTasks(a: Task, b: Task, now: number = Date.now()): number {
    const pa = PRIORITY_WEIGHT[effectivePriority(a, now)] ?? 1
    const pb = PRIORITY_WEIGHT[effectivePriority(b, now)] ?? 1
    if (pa !== pb) return pa - pb
    return (a.created_at ?? "").localeCompare(b.created_at ?? "")
}

/** Kolom berikutnya saat tombol geser ditekan (Selesai tetap di ujung). */
export function nextStatus(status: TaskStatus): TaskStatus | null {
    const i = TASK_STATUSES.findIndex((s) => s.id === normalizeTaskStatus(status))
    if (i < 0 || i === TASK_STATUSES.length - 1) return null
    return TASK_STATUSES[i + 1].id
}

/**
 * Patch atribusi saat status berubah.
 *
 *  - Masuk "sedang di-FU" pertama kali → catat user yang mem-FU.
 *  - Masuk "selesai" → catat user yang menyelesaikan (dan pem-FU bila belum).
 *  - Keluar dari "selesai" (komplain dibuka lagi) → kosongkan penyelesaian,
 *    supaya kartu tidak mengaku selesai padahal statusnya sudah mundur.
 */
export function attributionPatch(
    previous: Pick<Task, "status" | "followed_up_by" | "resolved_by"> | null,
    status: TaskStatus,
    userEmail: string | null,
    now: string = new Date().toISOString(),
): Record<string, string | null> {
    const patch: Record<string, string | null> = {}

    if (status === "progress" && userEmail && !previous?.followed_up_by) {
        patch.followed_up_by = userEmail
        patch.followed_up_at = now
    }

    if (status === "done") {
        if (userEmail && !previous?.followed_up_by) {
            patch.followed_up_by = userEmail
            patch.followed_up_at = now
        }
        if (userEmail && !previous?.resolved_by) {
            patch.resolved_by = userEmail
            patch.resolved_at = now
        }
    }

    if (previous?.status === "done" && status !== "done") {
        patch.resolved_by = null
        patch.resolved_at = null
    }

    return patch
}

/**
 * Pesan error simpan yang lebih menolong bila tabel `tasks` masih versi lama:
 * PostgREST menyebut kolom baru tidak ada di schema cache, padahal solusinya
 * cuma menjalankan ulang SQL (ALTER-nya idempoten).
 */
export function withTaskSchemaHint(message: string): string {
    const m = message.toLowerCase()
    const missingColumn =
        m.includes("tasks") &&
        m.includes("column") &&
        (m.includes("schema cache") || m.includes("does not exist"))
    if (!missingColumn) return message
    return `${message} — jalankan ulang supabase/sql/tasks.sql untuk menambah kolom baru.`
}

/** "budi@perusahaan.com" → "budi" — email utuh tetap ada di tooltip. */
export function shortUser(email: string | null | undefined): string {
    if (!email) return "—"
    return email.split("@")[0] || email
}

/**
 * Error PostgREST saat tabel `tasks` belum dibuat. Hanya kondisi ini yang
 * memicu mode lokal — error lain (mis. jaringan) ditampilkan apa adanya agar
 * tidak diam-diam menyimpan data di tempat yang salah.
 */
export function isMissingTaskTable(message: string): boolean {
    const m = message.toLowerCase()
    // Kolom baru yang belum ditambahkan BUKAN alasan jatuh ke mode lokal.
    // Kalau salah diklasifikasi, papan menampilkan data lokal kosong dan
    // seolah-olah semua komplain hilang — padahal cukup jalankan ulang SQL.
    if (m.includes("column")) return false
    if (!m.includes("tasks") && !m.includes("relation")) return false
    return (
        m.includes("does not exist") ||
        m.includes("could not find the table")
    )
}

// ── Mode lokal (cadangan sebelum SQL dijalankan) ──────────────────────

export const TASK_LOCAL_KEY = "fleet-tasks-v1"

export function readLocalTasks(): Task[] {
    if (typeof window === "undefined") return []
    try {
        const raw = localStorage.getItem(TASK_LOCAL_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as Task[]) : []
    } catch {
        return []
    }
}

export function writeLocalTasks(tasks: Task[]): void {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(TASK_LOCAL_KEY, JSON.stringify(tasks))
    } catch {
        // Kuota penuh / mode privat — papan tetap jalan untuk sesi ini saja.
    }
}

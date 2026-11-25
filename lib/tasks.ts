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
    /** Kolom warisan; UI memakai level umur tiket, bukan prioritas manual. */
    priority: TaskPriority
    /** Identitas pengiriman yang dikomplain */
    sales_name: string | null
    license_plate: string | null
    delivery_no: string | null
    freight_order: string | null
    customer_no: string | null
    /**
     * Daftar object key foto bukti komplain di Cloudflare R2, satu path per
     * baris. Baris lama yang masih berisi satu path tetap terbaca.
     */
    attachment_path: string | null
    /** Daftar object key dokumentasi penyelesaian; wajib saat status `done`. */
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
    sales_name: string | null
    license_plate: string | null
    delivery_no: string | null
    freight_order: string | null
    customer_no: string | null
    attachment_path: string | null
    resolution_attachment_path: string | null
}

/** Batas per file lampiran komplain (PNG/JPEG), sama dengan validasi form dan API. */
export const TASK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

/**
 * Satu kolom teks menyimpan beberapa object key, dipisah baris baru. Format
 * ini kompatibel dengan baris lama yang masih berisi satu path; trigger SQL
 * memecah daftar untuk memvalidasi path yang benar-benar baru.
 */
export function parseTaskAttachmentPaths(value: string | null | undefined): string[] {
    if (!value) return []
    return Array.from(
        new Set(
            value
                .split(/\r?\n/)
                .map((path) => path.trim())
                .filter(Boolean),
        ),
    )
}

export function serializeTaskAttachmentPaths(paths: readonly string[]): string | null {
    const unique = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))
    return unique.length > 0 ? unique.join("\n") : null
}

/** Pesan validasi saat komplain ditandai selesai tanpa dokumentasi penyelesaian. */
export const TASK_RESOLUTION_REQUIRED_MESSAGE =
    "Dokumentasi penyelesaian wajib diunggah saat status Selesai."
export const TASK_ATTACHMENT_TYPES = ["image/png", "image/jpeg"] as const

export function isTaskAttachmentType(type: string): boolean {
    return (TASK_ATTACHMENT_TYPES as readonly string[]).includes(type)
}

export const TASK_STATUSES: { id: TaskStatus; label: string }[] = [
    { id: "todo", label: "Baru" },
    { id: "progress", label: "Diproses" },
    { id: "done", label: "Selesai" },
]

/**
 * `blocked` adalah status lama "Menunggu toko" yang sudah dihapus dari papan.
 * Baris lama tetap harus muncul, jadi status itu diperlakukan sebagai
 * "Diproses" sampai user menyimpannya ulang.
 */
export function normalizeTaskStatus(status: TaskStatus): TaskStatus {
    return status === "blocked" ? "progress" : status
}

export function statusLabel(status: TaskStatus): string {
    return TASK_STATUSES.find((s) => s.id === normalizeTaskStatus(status))?.label ?? status
}

/** Ambang tiket belum selesai mulai perlu di-FU (hari sejak dibuat). */
export const ESCALATION_DAYS = 3
/** Ambang tiket dianggap terlambat dan dieskalasi ke admin. */
export const OVERDUE_DAYS = 7

export type TaskAgeLevel = "fresh" | "attention" | "overdue"

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
 * Tingkat umur tiket yang dipakai seluruh UI. Prioritas manual tidak lagi
 * dibaca: tiket yang belum selesai otomatis naik ke "attention" setelah 3
 * hari dan "overdue" setelah 7 hari, sehingga tidak ada nilai yang perlu
 * dirawat manual dan semua tampilan memakai ambang yang sama.
 */
export function ticketAgeLevel(
    task: Pick<Task, "status" | "created_at">,
    now: number = Date.now(),
): TaskAgeLevel {
    if (task.status === "done") return "fresh"
    const days = ticketAgeDays(task, now)
    if (days >= OVERDUE_DAYS) return "overdue"
    if (days >= ESCALATION_DAYS) return "attention"
    return "fresh"
}

/** Label umur tiket untuk badge papan, Review, dan digest email. */
export function ticketAgeLabel(
    task: Pick<Task, "status" | "created_at">,
    now: number = Date.now(),
): string {
    const days = Math.floor(ticketAgeDays(task, now))
    const level = ticketAgeLevel(task, now)
    if (level === "overdue") return `Terlambat ${days} hari`
    if (level === "attention") return `Perlu FU ${days} hari`
    if (days <= 0) return "Hari ini"
    return `${days} hari`
}

/** Warna badge umur tiket: netral, kuning, lalu merah saat terlambat. */
export function ticketAgeClass(level: TaskAgeLevel): string {
    if (level === "overdue") {
        return "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
    }
    if (level === "attention") {
        return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    }
    return "border-border/70 bg-muted/40 text-muted-foreground"
}

/** True bila tiket sudah melewati ambang "perlu FU" dan belum selesai. */
export function isEscalated(
    task: Pick<Task, "status" | "created_at">,
    now: number = Date.now(),
): boolean {
    return task.status !== "done" && ticketAgeDays(task, now) >= ESCALATION_DAYS
}

/** True bila tiket sudah melewati ambang terlambat (7 hari). */
export function isOverdue(
    task: Pick<Task, "status" | "created_at">,
    now: number = Date.now(),
): boolean {
    return task.status !== "done" && ticketAgeDays(task, now) >= OVERDUE_DAYS
}

/** Urutan dalam kolom: yang paling terlambat, lalu paling lama menunggu. */
const AGE_WEIGHT: Record<TaskAgeLevel, number> = { overdue: 0, attention: 1, fresh: 2 }

export function sortTasks(a: Task, b: Task, now: number = Date.now()): number {
    const la = ticketAgeLevel(a, now)
    const lb = ticketAgeLevel(b, now)
    if (la !== lb) return AGE_WEIGHT[la] - AGE_WEIGHT[lb]
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

/** Event internal: data komplain berubah dan lonceng perlu memuat ulang. */
export const TASKS_CHANGED_EVENT = "midaa:tasks-changed"

export function announceTasksChanged(): void {
    if (typeof window === "undefined") return
    window.dispatchEvent(new Event(TASKS_CHANGED_EVENT))
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

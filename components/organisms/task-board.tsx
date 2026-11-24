"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Circle,
    Clock,
    Database,
    FileText,
    Flag,
    Hash,
    ImageIcon,
    Paperclip,
    Plus,
    RefreshCw,
    User,
    UserCheck,
    UserPlus,
    X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { BoardPageSkeleton } from "@/components/molecules/view-skeleton"
import { Textarea } from "@/components/ui/textarea"
import { SuggestField, type Suggestion } from "@/components/molecules/suggest-field"
import { FilterChips } from "@/components/molecules/filter-chips"
import { supabase } from "@/utils/supabase"
import { cn } from "@/lib/utils"
import { formatDateShort, formatDateTimeWIB, formatNumber } from "@/lib/format"
import {
    attributionPatch,
    ESCALATION_DAYS,
    effectivePriority,
    isEscalated,
    isMissingTaskTable,
    nextStatus,
    normalizeTaskStatus,
    priorityClass,
    priorityLabel,
    readLocalTasks,
    shortUser,
    sortTasks,
    statusLabel,
    TASK_ATTACHMENT_MAX_BYTES,
    TASK_PRIORITIES,
    TASK_RESOLUTION_REQUIRED_MESSAGE,
    TASK_STATUSES,
    isTaskAttachmentType,
    withTaskSchemaHint,
    writeLocalTasks,
    type Task,
    type TaskInput,
    type TaskPriority,
    type TaskStatus,
} from "@/lib/tasks"

/** Ikon per kolom — dipakai di header kolom supaya status terbaca tanpa warna. */
const STATUS_ICON: Record<TaskStatus, React.ComponentType<{ className?: string }>> = {
    todo: Circle,
    progress: Clock,
    // Status lama tetap punya ikon agar data lama tidak kehilangan tipe;
    // kolomnya sudah tidak ditampilkan lagi.
    blocked: Clock,
    done: CheckCircle2,
}

/** Semua kategori dibatasi per halaman supaya board tidak memanjang terus. */
const PAGE_SIZE = 5

const INITIAL_PAGES: Record<TaskStatus, number> = {
    todo: 1,
    progress: 1,
    blocked: 1,
    done: 1,
}

interface TaskPage {
    cards: Task[]
    page: number
    pageCount: number
    startIndex: number
    endIndex: number
}

function paginateTasks(tasks: Task[], requestedPage: number): TaskPage {
    const pageCount = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
    const page = Math.min(Math.max(1, requestedPage), pageCount)
    const startIndex = (page - 1) * PAGE_SIZE
    return {
        cards: tasks.slice(startIndex, startIndex + PAGE_SIZE),
        page,
        pageCount,
        startIndex,
        endIndex: Math.min(startIndex + PAGE_SIZE, tasks.length),
    }
}

/** Request ke route server R2 dengan access token Supabase user aktif. */
async function attachmentApi<T>(body: Record<string, unknown>): Promise<T> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error("Sesi tidak ditemukan. Silakan masuk ulang.")

    const response = await fetch("/api/attachments", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    })
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
        throw new Error(payload?.error || `Permintaan lampiran gagal (${response.status}).`)
    }
    return payload as T
}

/** Hapus object R2; kegagalan cleanup tidak boleh menggagalkan simpan/hapus task. */
async function removeR2Attachment(path: string | null | undefined): Promise<void> {
    if (!path) return
    try {
        await attachmentApi({ action: "delete", path })
    } catch {
        // Objek yatim lebih baik daripada memblokir operasi utama user.
    }
}

/** MIME yang didukung untuk lampiran; fallback dari ekstensi bila browser kosong. */
function attachmentMime(file: File): "image/png" | "image/jpeg" | null {
    if (isTaskAttachmentType(file.type)) return file.type as "image/png" | "image/jpeg"
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (ext === "png") return "image/png"
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
    return null
}

/** Validasi + upload satu lampiran ke R2. Mengembalikan object key bila sukses. */
async function uploadTaskAttachment(file: File): Promise<{ path: string } | { error: string }> {
    const mime = attachmentMime(file)
    if (!mime) return { error: "Lampiran harus berupa gambar PNG atau JPEG." }
    if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
        return { error: "Ukuran lampiran maksimal 5 MB." }
    }

    let ticket: { uploadUrl: string; path: string; headers?: Record<string, string> }
    try {
        ticket = await attachmentApi({
            action: "upload",
            filename: file.name,
            contentType: mime,
            size: file.size,
        })
    } catch (uploadError) {
        return {
            error: uploadError instanceof Error ? uploadError.message : "Gagal menyiapkan upload lampiran.",
        }
    }

    try {
        const uploadResponse = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: ticket.headers,
            body: file,
        })
        if (!uploadResponse.ok) {
            throw new Error(`Upload ke R2 gagal (${uploadResponse.status}).`)
        }
    } catch (uploadError) {
        const detail = uploadError instanceof Error ? uploadError.message : "tidak diketahui"
        return { error: `Gagal upload lampiran: ${detail}. Periksa konfigurasi CORS bucket R2.` }
    }

    return { path: ticket.path }
}

/** Nama tampilan untuk email atribusi; fallback ke bagian sebelum @. */
function displayNameFor(email: string | null | undefined, names: Record<string, string>): string {
    if (!email) return "—"
    return names[email.trim().toLowerCase()] || shortUser(email)
}

/** Normalisasi customer_id: buang spasi dan nol depan agar lookup konsisten. */
function customerKey(value: string | null | undefined): string {
    const raw = (value ?? "").trim()
    return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, "") : raw
}

/** Tipe penyimpanan aktif: tabel Supabase, atau cadangan localStorage. */
type StorageMode = "remote" | "local"

interface TaskBoardProps {
    /** Kata kunci dari search header — papan ikut menyaring semua identitas komplain */
    search: string
}

export function TaskBoard({ search }: TaskBoardProps) {
    const [tasks, setTasks] = useState<Task[]>([])
    const [mode, setMode] = useState<StorageMode>("remote")
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all")
    /** Tab status yang sedang dibuka di mobile; desktop tetap menampilkan semua kolom. */
    const [mobileStatus, setMobileStatus] = useState<TaskStatus>("todo")
    /** Halaman aktif per kategori (1-based). */
    const [pages, setPages] = useState<Record<TaskStatus, number>>(INITIAL_PAGES)
    /** Komplain yang sedang dibuka di dialog; null = dialog komplain baru */
    const [editing, setEditing] = useState<Task | null>(null)
    /** Status awal saat dialog dibuka dari aksi "pindah ke Selesai". */
    const [initialStatus, setInitialStatus] = useState<TaskStatus | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
    /** Email user login — dipakai untuk atribusi buat / FU / selesaikan */
    const [userEmail, setUserEmail] = useState<string | null>(null)
    /** email → display_name untuk kartu dan dialog atribusi. */
    const [userNames, setUserNames] = useState<Record<string, string>>({})
    /** Master untuk autocomplete: sales dari tabel `salesman`, plat dari `equipment` */
    const [salesOptions, setSalesOptions] = useState<{ nik: string; nama: string }[]>([])
    const [plateOptions, setPlateOptions] = useState<string[]>([])
    /** customer_id → customer_name, supaya kartu menampilkan nama toko. */
    const [customerNames, setCustomerNames] = useState<Record<string, string>>({})
    /** ID yang sudah diminta; mencegah effect fetch berulang saat toko tidak ditemukan. */
    const requestedCustomerIds = useRef<Set<string>>(new Set())

    const openCreate = () => {
        setEditing(null)
        setInitialStatus(null)
        setSheetOpen(true)
    }

    const openEdit = (task: Task, status?: TaskStatus) => {
        setEditing(task)
        setInitialStatus(status ?? null)
        setSheetOpen(true)
    }

    useEffect(() => {
        let cancelled = false
        try {
            void supabase.auth
                .getSession()
                .then(({ data }) => {
                    if (!cancelled) setUserEmail(data.session?.user.email ?? null)
                })
                .catch(() => {
                    if (!cancelled) setUserEmail(null)
                })
        } catch {
            // Env Supabase belum siap — atribusi jatuh ke null, papan tetap jalan.
            setUserEmail(null)
        }
        return () => {
            cancelled = true
        }
    }, [])

    // Nama pelaku lintas user; RPC hanya mengembalikan email + display_name.
    // Kalau SQL app_users.sql belum dijalankan, fallback ke bagian sebelum @.
    useEffect(() => {
        let cancelled = false
        void supabase
            .rpc("app_user_names")
            .then(
                ({ data, error }) => {
                    if (cancelled || error) return
                    const next: Record<string, string> = {}
                    for (const row of (data ?? []) as { email?: string; display_name?: string }[]) {
                        const email = String(row.email ?? "").trim().toLowerCase()
                        const name = String(row.display_name ?? "").trim()
                        if (email && name) next[email] = name
                    }
                    setUserNames(next)
                },
                () => {
                    // Nama tidak tersedia — tampilan memakai fallback lokal.
                },
            )
        return () => {
            cancelled = true
        }
    }, [])

    // Master data untuk kolom sales & plat. Gagal dimuat = kolom tetap bisa
    // diketik manual, jadi tidak perlu memblokir form.
    useEffect(() => {
        let cancelled = false

        /** Rapikan hasil beberapa sumber menjadi satu daftar nopol unik. */
        function uniquePlates(values: unknown[]): string[] {
            return Array.from(
                new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
            ).sort((a, b) => a.localeCompare(b))
        }

        async function loadPlateOptions(): Promise<string[]> {
            // RPC ini hanya mengembalikan nopol, sehingga aman untuk role
            // terbatas yang tabel equipment-nya sengaja dikunci RLS.
            try {
                const { data, error } = await supabase.rpc("app_equipment_plates")
                if (!error) {
                    const plates = uniquePlates((data ?? []).map((row: any) => row.license_plate))
                    if (plates.length > 0) return plates
                }
            } catch {
                // RPC belum dipasang — lanjut ke fallback di bawah.
            }

            // Sebelum SQL baru dijalankan: admin masih bisa membaca equipment,
            // sedangkan role terbatas memakai nopol SKR/outbound yang terbuka.
            const [equipmentRes, outboundRes, skrRes] = await Promise.all([
                supabase
                    .from("equipment")
                    .select("license_plate")
                    .not("license_plate", "is", null)
                    .order("license_plate", { ascending: true })
                    .limit(2000),
                supabase
                    .from("armada_outbound")
                    .select("no_polisi")
                    .not("no_polisi", "is", null)
                    .order("no_polisi", { ascending: true })
                    .limit(2000),
                supabase
                    .from("skr_detail")
                    .select("license_no")
                    .not("license_no", "is", null)
                    .order("license_no", { ascending: true })
                    .limit(2000),
            ])

            return uniquePlates([
                ...(equipmentRes.data ?? []).map((row: any) => row.license_plate),
                ...(outboundRes.data ?? []).map((row: any) => row.no_polisi),
                ...(skrRes.data ?? []).map((row: any) => row.license_no),
            ])
        }

        async function loadReferences() {
            try {
                const [salesRes, plates] = await Promise.all([
                    supabase
                        .from("salesman")
                        .select("nik,nama")
                        .order("nama", { ascending: true })
                        .limit(2000),
                    loadPlateOptions(),
                ])
                if (cancelled) return

                if (!salesRes.error) {
                    setSalesOptions(
                        (salesRes.data ?? [])
                            .map((row: any) => ({
                                nik: String(row.nik ?? ""),
                                nama: String(row.nama ?? "").trim(),
                            }))
                            .filter((row) => row.nama),
                    )
                }

                setPlateOptions(plates)
            } catch {
                // Tabel master belum tersedia — biarkan kosong, input tetap jalan.
            }
        }
        void loadReferences()
        return () => {
            cancelled = true
        }
    }, [])

    // ── Muat data ─────────────────────────────────────────────────────
    const load = useCallback(async () => {
        setIsLoading(true)
        try {
            const { data, error: fetchError } = await supabase
                .from("tasks")
                .select("*")
                .order("created_at", { ascending: false })

            if (fetchError) {
                if (isMissingTaskTable(fetchError.message)) {
                    // Tabel belum dibuat → mode lokal, bukan error yang bikin buntu.
                    setMode("local")
                    setTasks(readLocalTasks())
                    setError(null)
                } else {
                    setError(fetchError.message)
                }
                return
            }

            setMode("remote")
            setTasks(((data ?? []) as Task[]).slice().sort(sortTasks))
            setError(null)
        } catch (e) {
            // Env Supabase belum siap / jaringan mati → tetap bisa dipakai lokal.
            setMode("local")
            setTasks(readLocalTasks())
            setError(e instanceof Error ? e.message : "Gagal memuat komplain")
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    // ── Simpan / hapus / geser ────────────────────────────────────────
    const saveTask = async (input: TaskInput, target: Task | null): Promise<string | null> => {
        // Lapisan kedua: jangan pernah menyimpan status Selesai tanpa dokumentasi.
        if (input.status === "done" && !input.resolution_attachment_path) {
            return TASK_RESOLUTION_REQUIRED_MESSAGE
        }
        const patch = attributionPatch(target, input.status, userEmail)

        if (mode === "local") {
            const next = target
                ? tasks.map((t) => (t.id === target.id ? ({ ...t, ...input, ...patch } as Task) : t))
                : [
                    {
                        id: crypto.randomUUID(),
                        created_at: new Date().toISOString(),
                        created_by: userEmail,
                        followed_up_by: null,
                        followed_up_at: null,
                        resolved_by: null,
                        resolved_at: null,
                        ...input,
                        ...patch,
                    } as Task,
                    ...tasks,
                ]
            setTasks(next)
            writeLocalTasks(next)
            return null
        }

        try {
            if (target) {
                const { data, error: updateError } = await supabase
                    .from("tasks")
                    .update({ ...input, ...patch })
                    .eq("id", target.id)
                    .select()
                    .single()
                if (updateError) return withTaskSchemaHint(updateError.message)
                setTasks((prev) =>
                    prev.map((t) => (t.id === target.id ? ((data ?? t) as Task) : t)),
                )
                return null
            }

            const { data, error: insertError } = await supabase
                .from("tasks")
                .insert({ ...input, created_by: userEmail, ...patch })
                .select()
                .single()
            if (insertError) return withTaskSchemaHint(insertError.message)
            if (data) setTasks((prev) => [data as Task, ...prev])
            return null
        } catch (e) {
            return e instanceof Error ? e.message : "Gagal menyimpan komplain"
        }
    }

    const removeTask = async (target: Task): Promise<string | null> => {
        if (mode === "local") {
            const next = tasks.filter((t) => t.id !== target.id)
            setTasks(next)
            writeLocalTasks(next)
            if (target.attachment_path) void removeR2Attachment(target.attachment_path)
            if (target.resolution_attachment_path) void removeR2Attachment(target.resolution_attachment_path)
            return null
        }

        try {
            const { error: deleteError } = await supabase.from("tasks").delete().eq("id", target.id)
            if (deleteError) return deleteError.message
            setTasks((prev) => prev.filter((t) => t.id !== target.id))
            if (target.attachment_path) void removeR2Attachment(target.attachment_path)
            if (target.resolution_attachment_path) void removeR2Attachment(target.resolution_attachment_path)
            return null
        } catch (e) {
            return e instanceof Error ? e.message : "Gagal menghapus komplain"
        }
    }

    const moveTask = async (task: Task, status: TaskStatus) => {
        if (task.status === status) return
        // Status Selesai butuh dokumentasi. Buka dialog dengan status itu sudah
        // terpilih supaya user bisa langsung mengunggah lampirannya.
        if (status === "done" && !task.resolution_attachment_path) {
            openEdit(task, "done")
            return
        }
        const previous = tasks
        const patch = attributionPatch(task, status, userEmail)
        const next = previous.map((t) => (t.id === task.id ? ({ ...t, status, ...patch } as Task) : t))
        setTasks(next)
        setPages((prev) => ({ ...prev, [status]: 1 }))
        setError(null)

        if (mode === "local") {
            writeLocalTasks(next)
            return
        }

        try {
            const { error: updateError } = await supabase
                .from("tasks")
                .update({ status, ...patch })
                .eq("id", task.id)
            if (updateError) {
                setTasks(previous)
                setError(updateError.message)
            }
        } catch (e) {
            setTasks(previous)
            setError(e instanceof Error ? e.message : "Gagal memindahkan komplain")
        }
    }

    // Nama toko untuk kartu: ambil per customer_id yang belum punya nama.
    // Jangan pakai ref penanda "sudah diminta": di StrictMode effect pertama
    // dibatalkan dan penanda itu membuat percobaan kedua tidak jalan.
    useEffect(() => {
        const ids = Array.from(
            new Set(
                tasks
                    .map((task) => customerKey(task.customer_no))
                    .filter((value) => !!value && /^\d+$/.test(value)),
            ),
        ).filter((id) => !customerNames[id] && !requestedCustomerIds.current.has(id))
        if (ids.length === 0) return
        for (const id of ids) requestedCustomerIds.current.add(id)

        let cancelled = false
        supabase
            .from("customers_ringkas")
            .select("customer_id,customer_name")
            .in("customer_id", ids.map(Number))
            .then(({ data, error }) => {
                if (cancelled || error) return
                setCustomerNames((prev) => {
                    const next = { ...prev }
                    for (const row of data ?? []) {
                        next[String(row.customer_id)] = String(row.customer_name ?? "")
                    }
                    return next
                })
            })
        return () => {
            cancelled = true
        }
    }, [tasks, customerNames])

    // ── Turunan tampilan ──────────────────────────────────────────────
    const searchLower = search.trim().toLowerCase()

    const visible = useMemo(() => {
        return tasks.filter((t) => {
            if (priorityFilter !== "all" && effectivePriority(t) !== priorityFilter) return false
            if (!searchLower) return true
            return [
                t.title,
                t.description,
                t.sales_name,
                t.license_plate,
                t.delivery_no,
                t.freight_order,
                t.customer_no,
                t.customer_no ? customerNames[customerKey(t.customer_no)] : "",
                t.created_by,
                t.followed_up_by,
                t.resolved_by,
            ].some((value) => String(value ?? "").toLowerCase().includes(searchLower))
        })
    }, [tasks, priorityFilter, searchLower, customerNames])

    const byStatus = useMemo(() => {
        const map: Record<TaskStatus, Task[]> = { todo: [], progress: [], blocked: [], done: [] }
        for (const task of visible) {
            // `blocked` lama masuk ke kolom Diproses; data lama tidak
            // dihapus dan akan tersimpan sebagai progress saat diedit ulang.
            const column = map[normalizeTaskStatus(task.status)]
            if (column) column.push(task)
        }
        for (const status of TASK_STATUSES) map[status.id].sort(sortTasks)
        // Arsip selesai dibaca dari yang paling baru diselesaikan. Urutan
        // lama (prioritas lalu paling lama) membuat halaman pertama justru
        // berisi komplain selesai paling usang.
        map.done.sort((a, b) => {
            const at = a.resolved_at ?? a.created_at ?? ""
            const bt = b.resolved_at ?? b.created_at ?? ""
            return bt.localeCompare(at)
        })
        return map
    }, [visible])

    const pagedByStatus = useMemo(() => {
        const result = {} as Record<TaskStatus, TaskPage>
        for (const status of TASK_STATUSES) {
            result[status.id] = paginateTasks(byStatus[status.id], pages[status.id])
        }
        return result
    }, [byStatus, pages])

    // Filter baru selalu mulai dari halaman 1; saat data menyusut, halaman
    // aktif dijepit agar tidak menunjuk halaman kosong.
    useEffect(() => {
        setPages(INITIAL_PAGES)
    }, [searchLower, priorityFilter])
    useEffect(() => {
        setPages((prev) => {
            let changed = false
            const next = { ...prev }
            for (const status of TASK_STATUSES) {
                const pageCount = Math.max(1, Math.ceil(byStatus[status.id].length / PAGE_SIZE))
                if (next[status.id] > pageCount) {
                    next[status.id] = pageCount
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [byStatus])

    if (isLoading) {
        return <BoardPageSkeleton />
    }

    return (
        <div className="min-w-0 space-y-4">
            {mode === "local" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs">
                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <div className="space-y-0.5">
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                            Mode lokal — tabel <code className="font-mono">tasks</code> belum ada
                        </p>
                        <p className="leading-relaxed text-muted-foreground">
                            Hanya tersimpan di browser ini. Jalankan{" "}
                            <code className="font-mono">supabase/sql/tasks.sql</code> agar tersimpan
                            untuk semua user.
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                    <div className="min-w-0">
                        <p className="font-medium text-destructive">Gagal memuat papan komplain</p>
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">{error}</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-card" onClick={() => void load()}>
                        <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
                    </Button>
                </div>
            )}

            {/* Kontrol papan */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-xs tabular-nums text-muted-foreground">
                    {formatNumber(visible.length)} komplain ditampilkan
                    {searchLower || priorityFilter !== "all" ? " (terfilter)" : ""}
                </p>
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                    <FilterChips
                        ariaLabel="Filter prioritas"
                        className="w-full sm:w-auto"
                        options={
                            [
                                { id: "all", label: "Semua" },
                                ...TASK_PRIORITIES,
                            ] as { id: "all" | TaskPriority; label: string }[]
                        }
                        value={priorityFilter}
                        onChange={setPriorityFilter}
                    />
                    <Button
                        size="sm"
                        className="h-[42px] w-full gap-1.5 px-4 sm:w-auto"
                        onClick={openCreate}
                    >
                        <Plus className="h-4 w-4" /> Komplain baru
                    </Button>
                </div>
            </div>

            {/* Navigasi status khusus mobile: satu kolom per tab. */}
            <div
                role="tablist"
                aria-label="Kategori komplain"
                className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-muted/40 p-1 md:hidden"
            >
                {TASK_STATUSES.map((status) => {
                    const Icon = STATUS_ICON[status.id]
                    const active = mobileStatus === status.id
                    return (
                        <button
                            key={status.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-controls={`task-panel-${status.id}`}
                            onClick={() => setMobileStatus(status.id)}
                            className={cn(
                                "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium leading-tight transition-colors",
                                active
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{status.label}</span>
                        </button>
                    )
                })}
            </div>

            {/* Papan kanban — semua kolom hanya di desktop; mobile mengikuti tab. */}
            <div className="grid min-w-0 gap-3 md:grid-cols-3">
                {TASK_STATUSES.map((status) => {
                    const Icon = STATUS_ICON[status.id]
                    const column = byStatus[status.id]
                    const paged = pagedByStatus[status.id]
                    const displayed = paged.cards
                    return (
                        <section
                            key={status.id}
                            id={`task-panel-${status.id}`}
                            aria-label={`Kolom ${status.label}`}
                            onDragOver={(e) => {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = "move"
                                setDragOver(status.id)
                            }}
                            onDragLeave={(e) => {
                                // Hanya lepas highlight saat kursor benar-benar keluar kolom.
                                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                    setDragOver((prev) => (prev === status.id ? null : prev))
                                }
                            }}
                            onDrop={(e) => {
                                e.preventDefault()
                                setDragOver(null)
                                const id = e.dataTransfer.getData("text/plain")
                                const task = tasks.find((t) => t.id === id)
                                if (task) void moveTask(task, status.id)
                            }}
                            className={cn(
                                "flex min-w-0 flex-col rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-colors",
                                mobileStatus !== status.id && "hidden md:flex",
                                dragOver === status.id && "border-primary/50 bg-primary/5",
                            )}
                        >
                            <header className="mb-2 flex items-center justify-between gap-2 border-b border-border/60 px-1 pb-2">
                                <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Icon className="h-3.5 w-3.5" />
                                    {status.label}
                                </h2>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                    {column.length}
                                </span>
                            </header>

                            <div className="flex flex-col gap-2">
                                {displayed.map((task) => {
                                    const escalated = isEscalated(task)
                                    const priority = effectivePriority(task)
                                    const next = nextStatus(task.status)
                                    // Aksi terakhir: selesai → FU → dibuat.
                                    const latestAudit = task.resolved_by
                                        ? {
                                              icon: UserCheck,
                                              label: "Diselesaikan oleh",
                                              email: task.resolved_by,
                                              at: task.resolved_at,
                                          }
                                        : task.followed_up_by
                                          ? {
                                                icon: User,
                                                label: "Diproses oleh",
                                                email: task.followed_up_by,
                                                at: task.followed_up_at,
                                            }
                                          : {
                                                icon: UserPlus,
                                                label: "Dibuat oleh",
                                                email: task.created_by,
                                                at: task.created_at,
                                            }
                                    const LatestAuditIcon = latestAudit.icon
                                    return (
                                        <div
                                            key={task.id}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData("text/plain", task.id)
                                                e.dataTransfer.effectAllowed = "move"
                                            }}
                                            onClick={() => openEdit(task)}
                                            className={cn(
                                                "group cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:border-primary/40",
                                                escalated && "border-l-2 border-l-destructive",
                                                task.status === "done" && "bg-card/60",
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openEdit(task)
                                                    }}
                                                    className={cn(
                                                        "min-w-0 flex-1 break-words text-left text-sm font-medium leading-snug [overflow-wrap:anywhere]",
                                                        task.status === "done" && "text-muted-foreground line-through",
                                                    )}
                                                >
                                                    {task.title}
                                                </button>
                                                {next && (
                                                    <button
                                                        type="button"
                                                        title={`Pindahkan ke ${statusLabel(next)}`}
                                                        aria-label={`Pindahkan ${task.title} ke ${statusLabel(next)}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            void moveTask(task, next)
                                                        }}
                                                        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                                    >
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>

                                            {task.description && task.status !== "done" && (
                                                <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
                                                    {task.description}
                                                </p>
                                            )}

                                            {(task.license_plate || task.delivery_no || task.freight_order) && task.status !== "done" && (
                                                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                    {task.license_plate && (
                                                        <span className="min-w-0 break-words" title="No. plat mobil">{task.license_plate}</span>
                                                    )}
                                                    {task.delivery_no && (
                                                        <span className="inline-flex min-w-0 max-w-full items-center gap-1" title="No. delivery">
                                                            <FileText className="h-3 w-3 shrink-0" />
                                                            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{task.delivery_no}</span>
                                                        </span>
                                                    )}
                                                    {task.freight_order && (
                                                        <span className="inline-flex min-w-0 max-w-full items-center gap-1" title="No. freight order">
                                                            <Hash className="h-3 w-3 shrink-0" />
                                                            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{task.freight_order}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {(task.sales_name || task.customer_no) && task.status !== "done" && (
                                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                    {task.sales_name && (
                                                        <span className="min-w-0 break-words" title="Nama sales">{task.sales_name}</span>
                                                    )}
                                                    {task.sales_name && task.customer_no && (
                                                        <span aria-hidden className="text-muted-foreground/60">
                                                            •
                                                        </span>
                                                    )}
                                                    {task.customer_no && (
                                                        <span
                                                            className="inline-flex min-w-0 items-center gap-1"
                                                            title={`ID pelanggan ${task.customer_no}`}
                                                        >
                                                            <span className="truncate">
                                                                {customerNames[customerKey(task.customer_no)] ||
                                                                    (/^\d+$/.test(task.customer_no)
                                                                        ? `#${task.customer_no}`
                                                                        : task.customer_no)}
                                                            </span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Footer: prioritas + indikator lampiran, lalu pelaku terakhir.
                                                flex-wrap mencegah ikon dan nama saling menimpa di kartu sempit. */}
                                            <div
                                                className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/60 pt-2 text-xs leading-snug text-muted-foreground"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <Badge
                                                        variant="outline"
                                                        title={
                                                            escalated
                                                                ? `Otomatis Tinggi — belum selesai ${ESCALATION_DAYS} hari+`
                                                                : "Prioritas"
                                                        }
                                                        className={cn("shrink-0", priorityClass(priority))}
                                                    >
                                                        <Flag className="h-2.5 w-2.5" />
                                                        {priorityLabel(priority)}
                                                    </Badge>
                                                    {(task.attachment_path || task.resolution_attachment_path) && (
                                                        <div className="flex items-center gap-1.5 border-l border-border/60 pl-2">
                                                            {task.attachment_path && (
                                                                <span
                                                                    title="Ada foto bukti komplain"
                                                                    className="inline-flex h-4 w-4 items-center justify-center"
                                                                >
                                                                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                                    <span className="sr-only">Ada foto bukti komplain</span>
                                                                </span>
                                                            )}
                                                            {task.resolution_attachment_path && (
                                                                <span
                                                                    title="Ada dokumentasi penyelesaian"
                                                                    className="inline-flex h-4 w-4 items-center justify-center"
                                                                >
                                                                    <ImageIcon className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                                    <span className="sr-only">Ada dokumentasi penyelesaian</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <span
                                                    className="ml-auto flex min-w-0 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap"
                                                    title={`${latestAudit.label} ${displayNameFor(latestAudit.email, userNames)}`}
                                                >
                                                    <LatestAuditIcon
                                                        className="h-3 w-3 shrink-0"
                                                        aria-label={latestAudit.label}
                                                    />
                                                    <span className="truncate">
                                                        <span className="font-medium text-foreground">
                                                            {displayNameFor(latestAudit.email, userNames)}
                                                        </span>
                                                        {latestAudit.at ? ` · ${formatDateShort(latestAudit.at)}` : ""}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}

                                {column.length === 0 && (
                                    <p className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                                        {status.id === "todo" ? "Belum ada komplain" : "Kosong"}
                                    </p>
                                )}

                                {column.length > PAGE_SIZE && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-1 pt-2">
                                        <p className="text-[11px] tabular-nums text-muted-foreground">
                                            {paged.startIndex + 1}–{paged.endIndex} dari{" "}
                                            {formatNumber(column.length)}
                                        </p>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="icon-sm"
                                                className="h-9 w-9 bg-card sm:h-8 sm:w-8"
                                                aria-label={`Halaman ${status.label} sebelumnya`}
                                                disabled={paged.page <= 1}
                                                onClick={() =>
                                                    setPages((prev) => ({
                                                        ...prev,
                                                        [status.id]: Math.max(1, paged.page - 1),
                                                    }))
                                                }
                                            >
                                                <ChevronLeft className="h-3.5 w-3.5" />
                                            </Button>
                                            <span className="min-w-10 text-center text-[11px] tabular-nums text-muted-foreground">
                                                {paged.page}/{paged.pageCount}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="icon-sm"
                                                className="h-9 w-9 bg-card sm:h-8 sm:w-8"
                                                aria-label={`Halaman ${status.label} berikutnya`}
                                                disabled={paged.page >= paged.pageCount}
                                                onClick={() =>
                                                    setPages((prev) => ({
                                                        ...prev,
                                                        [status.id]: Math.min(paged.pageCount, paged.page + 1),
                                                    }))
                                                }
                                            >
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    )
                })}
            </div>

            {sheetOpen && (
                <TaskSheet
                    task={editing}
                    initialStatus={initialStatus}
                    onClose={() => setSheetOpen(false)}
                    onSave={saveTask}
                    onDelete={removeTask}
                    salesOptions={salesOptions}
                    plateOptions={plateOptions}
                    userNames={userNames}
                />
            )}
        </div>
    )
}

interface TaskSheetProps {
    task: Task | null
    /** Status yang langsung terpilih saat dialog dibuka (mis. dari drop ke Selesai). */
    initialStatus?: TaskStatus | null
    onClose: () => void
    onSave: (input: TaskInput, target: Task | null) => Promise<string | null>
    onDelete: (task: Task) => Promise<string | null>
    /** Daftar sales dari tabel `salesman` */
    salesOptions: { nik: string; nama: string }[]
    /** Daftar nopol dari tabel `equipment` */
    plateOptions: string[]
    /** email → display_name untuk atribusi di modal. */
    userNames: Record<string, string>
}

/**
 * Modal form komplain. Di-mount hanya saat dibuka (lihat TaskBoard), jadi
 * state-nya selalu mulai dari data yang sedang diedit — tanpa effect
 * sinkronisasi yang rawan nilai basi.
 */
function TaskSheet({ task, initialStatus, onClose, onSave, onDelete, salesOptions, plateOptions, userNames }: TaskSheetProps) {
    const [title, setTitle] = useState(task?.title ?? "")
    const [description, setDescription] = useState(task?.description ?? "")
    const [status, setStatus] = useState<TaskStatus>(
        normalizeTaskStatus(initialStatus ?? task?.status ?? "todo"),
    )
    const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal")
    const [salesName, setSalesName] = useState(task?.sales_name ?? "")
    const [licensePlate, setLicensePlate] = useState(task?.license_plate ?? "")
    const [deliveryNo, setDeliveryNo] = useState(task?.delivery_no ?? "")
    const [freightOrder, setFreightOrder] = useState(task?.freight_order ?? "")
    const [customerNo, setCustomerNo] = useState(task?.customer_no ?? "")
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
    const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
    const [existingAttachmentUrl, setExistingAttachmentUrl] = useState<string | null>(null)
    const [removeAttachment, setRemoveAttachment] = useState(false)
    const attachmentInputRef = useRef<HTMLInputElement | null>(null)
    const [resolutionFile, setResolutionFile] = useState<File | null>(null)
    const [resolutionPreviewUrl, setResolutionPreviewUrl] = useState<string | null>(null)
    const [existingResolutionUrl, setExistingResolutionUrl] = useState<string | null>(null)
    const [removeResolution, setRemoveResolution] = useState(false)
    const resolutionInputRef = useRef<HTMLInputElement | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /** Pelanggan yang dipilih/terdeteksi — nama toko hanya ditampilkan, bukan input. */
    const [pickedCustomer, setPickedCustomer] = useState<{ id: string; name: string } | null>(null)

    // Preview lokal untuk file baru; URL dibersihkan saat file diganti/ditutup.
    useEffect(() => {
        if (!attachmentFile) {
            setAttachmentPreviewUrl(null)
            return
        }
        const url = URL.createObjectURL(attachmentFile)
        setAttachmentPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [attachmentFile])

    // Lampiran lama ada di bucket privat, jadi tampilkan lewat signed URL.
    useEffect(() => {
        const path = task?.attachment_path
        if (!path) {
            setExistingAttachmentUrl(null)
            return
        }
        let cancelled = false
        void attachmentApi<{ url?: string }>({ action: "view", path })
            .then(({ url }) => {
                if (!cancelled) setExistingAttachmentUrl(url ?? null)
            })
            .catch(() => {
                if (!cancelled) setExistingAttachmentUrl(null)
            })
        return () => {
            cancelled = true
        }
    }, [task?.attachment_path])

    // Preview dan signed URL untuk dokumentasi penyelesaian.
    useEffect(() => {
        if (!resolutionFile) {
            setResolutionPreviewUrl(null)
            return
        }
        const url = URL.createObjectURL(resolutionFile)
        setResolutionPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [resolutionFile])

    useEffect(() => {
        const path = task?.resolution_attachment_path
        if (!path) {
            setExistingResolutionUrl(null)
            return
        }
        let cancelled = false
        void attachmentApi<{ url?: string }>({ action: "view", path })
            .then(({ url }) => {
                if (!cancelled) setExistingResolutionUrl(url ?? null)
            })
            .catch(() => {
                if (!cancelled) setExistingResolutionUrl(null)
            })
        return () => {
            cancelled = true
        }
    }, [task?.resolution_attachment_path])

    const clearAttachment = () => {
        setAttachmentFile(null)
        setRemoveAttachment(true)
        if (attachmentInputRef.current) attachmentInputRef.current.value = ""
    }

    const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null
        if (!file) {
            setAttachmentFile(null)
            return
        }
        if (!attachmentMime(file)) {
            setError("Lampiran harus berupa gambar PNG atau JPEG.")
            e.target.value = ""
            return
        }
        if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
            setError("Ukuran lampiran maksimal 5 MB.")
            e.target.value = ""
            return
        }
        setError(null)
        setRemoveAttachment(false)
        setAttachmentFile(file)
    }

    const clearResolutionAttachment = () => {
        setResolutionFile(null)
        setRemoveResolution(true)
        if (resolutionInputRef.current) resolutionInputRef.current.value = ""
    }

    const handleResolutionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null
        if (!file) {
            setResolutionFile(null)
            return
        }
        if (!attachmentMime(file)) {
            setError("Dokumentasi penyelesaian harus berupa gambar PNG atau JPEG.")
            e.target.value = ""
            return
        }
        if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
            setError("Ukuran dokumentasi penyelesaian maksimal 5 MB.")
            e.target.value = ""
            return
        }
        setError(null)
        setRemoveResolution(false)
        setResolutionFile(file)
    }
    const [customerSuggestions, setCustomerSuggestions] = useState<Suggestion[]>([])
    const [customerSearching, setCustomerSearching] = useState(false)
    const [customerSearchFailed, setCustomerSearchFailed] = useState(false)

    const salesSuggestions = useMemo<Suggestion[]>(() => {
        const q = salesName.trim().toLowerCase()
        return salesOptions
            .filter((sales) => !q || sales.nama.toLowerCase().includes(q) || sales.nik.includes(q))
            .slice(0, 8)
            .map((sales) => ({ key: sales.nik || sales.nama, label: sales.nama, hint: sales.nik }))
    }, [salesOptions, salesName])

    const plateSuggestions = useMemo<Suggestion[]>(() => {
        const q = licensePlate.trim().toLowerCase()
        return plateOptions
            .filter((plate) => !q || plate.toLowerCase().includes(q))
            .slice(0, 8)
            .map((plate) => ({ key: plate, label: plate }))
    }, [plateOptions, licensePlate])

    // Nama toko untuk nomor pelanggan yang sudah tersimpan (mode edit).
    useEffect(() => {
        const raw = task?.customer_no?.trim()
        if (!raw || !/^\d+$/.test(raw)) return
        let cancelled = false
        supabase
            .from("customers_ringkas")
            .select("customer_name")
            .eq("customer_id", Number(raw))
            .maybeSingle()
            .then(({ data }) => {
                if (!cancelled && data?.customer_name) {
                    setPickedCustomer({ id: raw, name: String(data.customer_name) })
                }
            })
        return () => {
            cancelled = true
        }
    }, [task?.customer_no])

    // Cari nama toko dari nomor pelanggan yang sedang diketik.
    useEffect(() => {
        const q = customerNo.trim()
        if ((pickedCustomer && q === pickedCustomer.id) || q.length < 2) {
            setCustomerSuggestions([])
            setCustomerSearching(false)
            setCustomerSearchFailed(false)
            return
        }
        let cancelled = false
        setCustomerSearching(true)
        const timer = setTimeout(async () => {
            try {
                const clean = q.replace(/[%,()*]/g, " ").trim()
                const numeric = /^\d+$/.test(q)
                const filters = [
                    numeric ? `customer_id.eq.${q}` : null,
                    clean ? `customer_name.ilike.%${clean}%` : null,
                ]
                    .filter(Boolean)
                    .join(",")
                if (!filters) {
                    setCustomerSuggestions([])
                    setCustomerSearching(false)
                    return
                }
                const { data, error } = await supabase
                    .from("customers_ringkas")
                    .select("customer_id,customer_name")
                    .or(filters)
                    .order("customer_name", { ascending: true })
                    .limit(8)
                if (cancelled) return
                if (error) {
                    setCustomerSuggestions([])
                    setCustomerSearchFailed(true)
                } else {
                    setCustomerSearchFailed(false)
                    setCustomerSuggestions(
                        (data ?? [])
                            .map((row: any) => ({
                                key: String(row.customer_id),
                                label: String(row.customer_name ?? ""),
                                hint: `#${row.customer_id}`,
                            }))
                            .filter((row) => row.label),
                    )
                }
            } catch {
                if (!cancelled) {
                    setCustomerSuggestions([])
                    setCustomerSearchFailed(true)
                }
            } finally {
                if (!cancelled) setCustomerSearching(false)
            }
        }, 300)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [customerNo, pickedCustomer])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const cleanTitle = title.trim()
        const cleanSales = salesName.trim()
        if (!cleanTitle) {
            setError("Isi dulu apa yang dikomplain.")
            return
        }
        if (!cleanSales) {
            setError("Nama sales wajib diisi supaya komplain bisa ditelusuri.")
            return
        }
        const cleanCustomer = customerNo.trim()
        if (cleanCustomer && !/^\d+$/.test(cleanCustomer)) {
            setError("ID pelanggan harus berupa angka — pilih dari daftar yang muncul.")
            return
        }
        let nextAttachmentPath = task?.attachment_path ?? null
        if (removeAttachment && !attachmentFile) nextAttachmentPath = null
        let nextResolutionPath = task?.resolution_attachment_path ?? null
        if (removeResolution && !resolutionFile) nextResolutionPath = null

        // Dokumentasi penyelesaian adalah syarat status Selesai. Lampiran lama
        // yang masih tersimpan tetap dihitung; kalau dihapus, wajib ganti baru.
        if (status === "done" && !resolutionFile && !nextResolutionPath) {
            setError(TASK_RESOLUTION_REQUIRED_MESSAGE)
            return
        }

        setIsSaving(true)
        setError(null)
        const uploadedPaths: string[] = []

        if (attachmentFile) {
            const result = await uploadTaskAttachment(attachmentFile)
            if ("error" in result) {
                setError(result.error)
                setIsSaving(false)
                return
            }
            uploadedPaths.push(result.path)
            nextAttachmentPath = result.path
        }

        if (resolutionFile) {
            const result = await uploadTaskAttachment(resolutionFile)
            if ("error" in result) {
                // Jangan tinggalkan lampiran komplain yang sudah terlanjur upload.
                for (const path of uploadedPaths) void removeR2Attachment(path)
                setError(result.error)
                setIsSaving(false)
                return
            }
            uploadedPaths.push(result.path)
            nextResolutionPath = result.path
        }

        const saveError = await onSave(
            {
                title: cleanTitle,
                description: description.trim() || null,
                status,
                priority,
                sales_name: cleanSales,
                license_plate: licensePlate.trim() || null,
                delivery_no: deliveryNo.trim() || null,
                freight_order: freightOrder.trim() || null,
                customer_no: cleanCustomer || null,
                attachment_path: nextAttachmentPath,
                resolution_attachment_path: nextResolutionPath,
            },
            task,
        )
        if (saveError) {
            // Jangan tinggalkan file yatim kalau penyimpanan baris gagal.
            for (const path of uploadedPaths) void removeR2Attachment(path)
            setIsSaving(false)
            setError(saveError)
            return
        }

        // Hapus objek lama yang diganti/dilepas setelah baris tersimpan.
        for (const oldPath of [task?.attachment_path, task?.resolution_attachment_path]) {
            if (oldPath && oldPath !== nextAttachmentPath && oldPath !== nextResolutionPath) {
                void removeR2Attachment(oldPath)
            }
        }
        onClose()
    }

    const handleDelete = async () => {
        if (!task) return
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        setIsSaving(true)
        setError(null)
        const deleteError = await onDelete(task)
        setIsSaving(false)
        if (deleteError) setError(deleteError)
        else onClose()
    }

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
                    <DialogTitle className="text-base">{task ? "Ubah komplain" : "Komplain baru"}</DialogTitle>
                    <DialogDescription className="sr-only">
                        Detail dan formulir komplain pengiriman.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        <div className="space-y-5">
                            <section className="space-y-3">
                                <h3 className="text-xs font-medium text-muted-foreground">Komplain</h3>
                                <div className="space-y-1.5">
                                    <Label htmlFor="task-title">Apa yang dikomplain</Label>
                                    <Textarea
                                        id="task-title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        rows={3}
                                        autoFocus
                                    />
                                </div>

                                <div className="max-w-[200px] space-y-1.5">
                                    <Label>Prioritas</Label>
                                    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TASK_PRIORITIES.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {task && isEscalated(task) && (
                                        <p className="text-xs text-amber-700 dark:text-amber-400">
                                            Otomatis Tinggi — belum selesai {ESCALATION_DAYS} hari+.
                                        </p>
                                    )}
                                </div>
                            </section>

                            <section className="space-y-3 border-t pt-5">
                                <h3 className="text-xs font-medium text-muted-foreground">Lampiran</h3>
                                <div className="space-y-1.5">
                                    <Label htmlFor="task-attachment">Foto bukti komplain</Label>
                                    <Input
                                        ref={attachmentInputRef}
                                        id="task-attachment"
                                        type="file"
                                        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                                        onChange={handleAttachmentChange}
                                        className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                                    />
                                    <p className="text-xs text-muted-foreground">PNG atau JPEG, maksimal 5 MB.</p>
                                </div>

                                {attachmentPreviewUrl && attachmentFile && (
                                    <div className="overflow-hidden rounded-md border bg-muted/30">
                                        {/* Preview lokal sebelum file diunggah saat Simpan. */}
                                        <img
                                            src={attachmentPreviewUrl}
                                            alt="Pratinjau lampiran"
                                            className="max-h-44 w-full object-contain"
                                        />
                                        <div className="flex items-center justify-between gap-2 border-t px-2.5 py-1.5">
                                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                                                {attachmentFile.name}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 shrink-0 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                onClick={clearAttachment}
                                            >
                                                <X className="h-3 w-3" /> Hapus
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {!attachmentFile && task?.attachment_path && !removeAttachment && (
                                    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
                                        {existingAttachmentUrl ? (
                                            <a
                                                href={existingAttachmentUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
                                            >
                                                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">Lihat lampiran</span>
                                            </a>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <ImageIcon className="h-3.5 w-3.5 shrink-0" /> Lampiran tersimpan
                                            </span>
                                        )}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={clearAttachment}
                                        >
                                            <X className="h-3 w-3" /> Hapus
                                        </Button>
                                    </div>
                                )}

                                {removeAttachment && task?.attachment_path && !attachmentFile && (
                                    <p className="text-xs text-muted-foreground">
                                        Lampiran akan dihapus saat Simpan.
                                    </p>
                                )}

                                <div className="space-y-1.5 border-t border-border/60 pt-3">
                                    <Label htmlFor="task-resolution-attachment">
                                        Dokumentasi penyelesaian
                                        {status === "done" && (
                                            <span aria-hidden className="text-destructive">*</span>
                                        )}
                                    </Label>
                                    <Input
                                        ref={resolutionInputRef}
                                        id="task-resolution-attachment"
                                        type="file"
                                        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                                        aria-required={status === "done"}
                                        onChange={handleResolutionChange}
                                        className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {status === "done"
                                            ? "Wajib diunggah saat status Selesai."
                                            : "Opsional, jadi wajib begitu status diubah ke Selesai."}{" "}
                                        PNG atau JPEG, maksimal 5 MB.
                                    </p>
                                </div>

                                {resolutionPreviewUrl && resolutionFile && (
                                    <div className="overflow-hidden rounded-md border bg-muted/30">
                                        <img
                                            src={resolutionPreviewUrl}
                                            alt="Pratinjau dokumentasi penyelesaian"
                                            className="max-h-44 w-full object-contain"
                                        />
                                        <div className="flex items-center justify-between gap-2 border-t px-2.5 py-1.5">
                                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                                                {resolutionFile.name}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 shrink-0 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                onClick={clearResolutionAttachment}
                                            >
                                                <X className="h-3 w-3" /> Hapus
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {!resolutionFile && task?.resolution_attachment_path && !removeResolution && (
                                    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
                                        {existingResolutionUrl ? (
                                            <a
                                                href={existingResolutionUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
                                            >
                                                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">Lihat dokumentasi penyelesaian</span>
                                            </a>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <ImageIcon className="h-3.5 w-3.5 shrink-0" /> Dokumentasi tersimpan
                                            </span>
                                        )}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={clearResolutionAttachment}
                                        >
                                            <X className="h-3 w-3" /> Hapus
                                        </Button>
                                    </div>
                                )}

                                {removeResolution && task?.resolution_attachment_path && !resolutionFile && (
                                    <p className="text-xs text-muted-foreground">
                                        Dokumentasi penyelesaian akan dihapus saat Simpan.
                                    </p>
                                )}
                            </section>

                            <section className="space-y-3 border-t pt-5">
                                <h3 className="text-xs font-medium text-muted-foreground">Identitas pengiriman</h3>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="task-sales">Nama sales</Label>
                            <SuggestField
                                id="task-sales"
                                value={salesName}
                                onValueChange={setSalesName}
                                onSelect={(sales) => setSalesName(sales.label)}
                                suggestions={salesSuggestions}
                                emptyText={
                                    salesOptions.length === 0
                                        ? "Daftar sales belum termuat"
                                        : "Sales tidak ditemukan"
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="task-plate">No. plat mobil</Label>
                            <SuggestField
                                id="task-plate"
                                value={licensePlate}
                                onValueChange={setLicensePlate}
                                onSelect={(plate) => setLicensePlate(plate.label)}
                                suggestions={plateSuggestions}
                                emptyText={
                                    plateOptions.length === 0
                                        ? "Daftar nopol belum termuat"
                                        : "Nopol tidak ditemukan"
                                }
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="task-delivery">No. delivery</Label>
                            <Input
                                id="task-delivery"
                                value={deliveryNo}
                                onChange={(e) => setDeliveryNo(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="task-fo">No. freight order</Label>
                            <Input
                                id="task-fo"
                                value={freightOrder}
                                onChange={(e) => setFreightOrder(e.target.value)}
                            />
                        </div>
                    </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="task-customer-no">ID pelanggan</Label>
                                    <SuggestField
                                        id="task-customer-no"
                                        value={customerNo}
                                        onValueChange={(value) => {
                                            setCustomerNo(value)
                                            setPickedCustomer(null)
                                        }}
                                        onSelect={(customer) => {
                                            setCustomerNo(customer.key)
                                            setPickedCustomer({ id: customer.key, name: customer.label })
                                            setCustomerSuggestions([])
                                        }}
                                        suggestions={customerSuggestions}
                                        loading={customerSearching}
                                        emptyText={
                                            customerSearchFailed
                                                ? "Gagal memuat data pelanggan"
                                                : "Pelanggan tidak ditemukan"
                                        }
                                    />
                                    {pickedCustomer && (
                                        <p className="text-xs text-muted-foreground">
                                            Toko: {pickedCustomer.name}
                                        </p>
                                    )}
                                </div>
                            </section>

                            <section className="space-y-3 border-t pt-5">
                                <h3 className="text-xs font-medium text-muted-foreground">Tindakan</h3>

                    {task && (
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <div className="grid min-w-0 grid-cols-2 gap-2">
                                {TASK_STATUSES.map((s) => {
                                    const Icon = STATUS_ICON[s.id]
                                    return (
                                        <Button
                                            key={s.id}
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            aria-pressed={status === s.id}
                                            className={cn(
                                                "h-auto min-h-8 min-w-0 justify-start gap-1.5 whitespace-normal px-2 py-1.5 text-left text-xs leading-tight [overflow-wrap:anywhere]",
                                                status === s.id
                                                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                                                    : "bg-card text-muted-foreground hover:bg-muted",
                                            )}
                                            onClick={() => setStatus(s.id)}
                                        >
                                            <Icon className="h-3.5 w-3.5 shrink-0" />
                                            {s.label}
                                        </Button>
                                    )
                                })}
                            </div>
                            {status === "done" && !resolutionFile && (!task?.resolution_attachment_path || removeResolution) && (
                                <p className="text-xs text-destructive">
                                    Dokumentasi penyelesaian wajib diunggah di bagian Lampiran.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="task-description">Catatan tindakan</Label>
                        <Textarea
                            id="task-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                        />
                    </div>

                    {task && (
                        <div className="space-y-1 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                            <p
                                className="flex items-start gap-1.5"
                                title={`Dibuat oleh ${displayNameFor(task.created_by, userNames)}`}
                            >
                                <UserPlus className="mt-0.5 h-3 w-3 shrink-0" aria-label="Dibuat oleh" />
                                <span>
                                    <span className="font-medium text-foreground">
                                        {displayNameFor(task.created_by, userNames)}
                                    </span>
                                    {task.created_at ? ` · ${formatDateTimeWIB(task.created_at)}` : ""}
                                </span>
                            </p>
                            {task.followed_up_by && (
                                <p
                                    className="flex items-start gap-1.5"
                                    title={`Diproses oleh ${displayNameFor(task.followed_up_by, userNames)}`}
                                >
                                    <User className="mt-0.5 h-3 w-3 shrink-0" aria-label="Diproses oleh" />
                                    <span>
                                        <span className="font-medium text-foreground">
                                            {displayNameFor(task.followed_up_by, userNames)}
                                        </span>
                                        {task.followed_up_at ? ` · ${formatDateTimeWIB(task.followed_up_at)}` : ""}
                                    </span>
                                </p>
                            )}
                            {task.resolved_by && (
                                <p
                                    className="flex items-start gap-1.5"
                                    title={`Diselesaikan oleh ${displayNameFor(task.resolved_by, userNames)}`}
                                >
                                    <UserCheck className="mt-0.5 h-3 w-3 shrink-0" aria-label="Diselesaikan oleh" />
                                    <span>
                                        <span className="font-medium text-foreground">
                                            {displayNameFor(task.resolved_by, userNames)}
                                        </span>
                                        {task.resolved_at ? ` · ${formatDateTimeWIB(task.resolved_at)}` : ""}
                                    </span>
                                </p>
                            )}
                        </div>
                    )}

                            </section>
                        </div>
                    </div>

                    {error && (
                        <p aria-live="polite" className="min-w-0 break-words px-5 pb-2 text-xs text-destructive">
                            {error}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
                        {task ? (
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => void handleDelete()}
                                disabled={isSaving}
                            >
                                {confirmDelete ? "Yakin hapus?" : "Hapus"}
                            </Button>
                        ) : (
                            <span />
                        )}
                        <div className="ml-auto flex gap-2">
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? "Menyimpan…" : "Simpan"}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

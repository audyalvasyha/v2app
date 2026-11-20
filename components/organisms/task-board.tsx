"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
    Ban,
    CheckCircle2,
    ChevronRight,
    Circle,
    Clock,
    Database,
    FileText,
    Flag,
    Hash,
    Plus,
    RefreshCw,
    User,
    UserCheck,
    UserPlus,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
    priorityClass,
    priorityLabel,
    readLocalTasks,
    shortUser,
    sortTasks,
    statusLabel,
    TASK_PRIORITIES,
    TASK_STATUSES,
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
    blocked: Ban,
    done: CheckCircle2,
}

/** Normalisasi customer_id: buang spasi dan nol depan agar lookup konsisten. */
function customerKey(value: string | null | undefined): string {
    const raw = (value ?? "").trim()
    return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, "") : raw
}

/** Warna border kartu sesuai langkah task. */
const STATUS_CARD_BORDER: Record<TaskStatus, string> = {
    todo: "border-sky-500/50",
    progress: "border-amber-500/50",
    blocked: "border-rose-500/50",
    done: "border-emerald-500/50",
}

/** Aksen border atas kartu — inline style supaya warnanya pasti terpasang. */
const STATUS_CARD_TOP_COLOR: Record<TaskStatus, string> = {
    todo: "#0ea5e9",
    progress: "#f59e0b",
    blocked: "#f43f5e",
    done: "#10b981",
}

/** Warna tombol status: aktif solid, tidak aktif tinted. */
const STATUS_BUTTON_TONE: Record<TaskStatus, { active: string; idle: string }> = {
    todo: {
        active: "border-sky-600 bg-sky-600 text-white hover:bg-sky-600/90 hover:text-white",
        idle: "border-sky-600/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-300",
    },
    progress: {
        active: "border-amber-500 bg-amber-500 text-amber-950 hover:bg-amber-500/90 hover:text-amber-950",
        idle: "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-300",
    },
    blocked: {
        active: "border-rose-600 bg-rose-600 text-white hover:bg-rose-600/90 hover:text-white",
        idle: "border-rose-600/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-300",
    },
    done: {
        active: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white",
        idle: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-300",
    },
}

/** Warna header kolom kanban — tint tipis, tanpa border tambahan. */
const STATUS_HEADER_TONE: Record<TaskStatus, { box: string; text: string }> = {
    todo: {
        box: "bg-sky-500/[0.06]",
        text: "text-sky-700 dark:text-sky-300",
    },
    progress: {
        box: "bg-amber-500/[0.06]",
        text: "text-amber-700 dark:text-amber-300",
    },
    blocked: {
        box: "bg-rose-500/[0.06]",
        text: "text-rose-700 dark:text-rose-300",
    },
    done: {
        box: "bg-emerald-500/[0.06]",
        text: "text-emerald-700 dark:text-emerald-300",
    },
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
    /** Tugas yang sedang dibuka di dialog; null = dialog komplain baru */
    const [editing, setEditing] = useState<Task | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
    /** Email user login — dipakai untuk atribusi buat / FU / selesaikan */
    const [userEmail, setUserEmail] = useState<string | null>(null)
    /** Master untuk autocomplete: sales dari tabel `salesman`, plat dari `equipment` */
    const [salesOptions, setSalesOptions] = useState<{ nik: string; nama: string }[]>([])
    const [plateOptions, setPlateOptions] = useState<string[]>([])
    /** customer_id → customer_name, supaya kartu menampilkan nama toko. */
    const [customerNames, setCustomerNames] = useState<Record<string, string>>({})

    const openCreate = () => {
        setEditing(null)
        setSheetOpen(true)
    }

    const openEdit = (task: Task) => {
        setEditing(task)
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

    // Master data untuk kolom sales & plat. Gagal dimuat = kolom tetap bisa
    // diketik manual, jadi tidak perlu memblokir form.
    useEffect(() => {
        let cancelled = false
        async function loadReferences() {
            try {
                const [salesRes, plateRes] = await Promise.all([
                    supabase
                        .from("salesman")
                        .select("nik,nama")
                        .order("nama", { ascending: true })
                        .limit(2000),
                    supabase
                        .from("equipment")
                        .select("license_plate")
                        .not("license_plate", "is", null)
                        .order("license_plate", { ascending: true })
                        .limit(2000),
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

                if (!plateRes.error) {
                    const unique = Array.from(
                        new Set(
                            (plateRes.data ?? [])
                                .map((row: any) => String(row.license_plate ?? "").trim())
                                .filter(Boolean),
                        ),
                    )
                    setPlateOptions(unique)
                }
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
            return null
        }

        try {
            const { error: deleteError } = await supabase.from("tasks").delete().eq("id", target.id)
            if (deleteError) return deleteError.message
            setTasks((prev) => prev.filter((t) => t.id !== target.id))
            return null
        } catch (e) {
            return e instanceof Error ? e.message : "Gagal menghapus komplain"
        }
    }

    const moveTask = async (task: Task, status: TaskStatus) => {
        if (task.status === status) return
        const previous = tasks
        const patch = attributionPatch(task, status, userEmail)
        const next = previous.map((t) => (t.id === task.id ? ({ ...t, status, ...patch } as Task) : t))
        setTasks(next)
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
        ).filter((id) => !customerNames[id])
        if (ids.length === 0) return

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
            // Data lokal lama bisa punya status di luar empat kolom; jangan
            // biarkan satu baris rusak menjatuhkan seluruh papan.
            const column = map[task.status]
            if (column) column.push(task)
        }
        for (const status of TASK_STATUSES) map[status.id].sort(sortTasks)
        return map
    }, [visible])

    if (isLoading) {
        return <BoardPageSkeleton />
    }

    return (
        <div className="space-y-4">
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
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                    <div>
                        <p className="font-medium text-destructive">Gagal memuat papan komplain</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-card" onClick={() => void load()}>
                        <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
                    </Button>
                </div>
            )}

            {/* Kontrol papan */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs tabular-nums text-muted-foreground">
                    {formatNumber(visible.length)} komplain ditampilkan
                    {searchLower || priorityFilter !== "all" ? " (terfilter)" : ""}
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                    <Button size="sm" className="gap-1.5" onClick={openCreate}>
                        <Plus className="h-4 w-4" /> Komplain baru
                    </Button>
                </div>
            </div>

            {/* Papan kanban */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {TASK_STATUSES.map((status) => {
                    const Icon = STATUS_ICON[status.id]
                    const column = byStatus[status.id]
                    return (
                        <section
                            key={status.id}
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
                                "flex flex-col rounded-xl border border-border/60 bg-background p-2.5 transition-colors",
                                dragOver === status.id && "border-primary/50 bg-primary/5",
                            )}
                        >
                            <header
                                className={cn(
                                    "mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                                    STATUS_HEADER_TONE[status.id].box,
                                )}
                            >
                                <h2
                                    className={cn(
                                        "flex items-center gap-1.5 text-xs font-medium",
                                        STATUS_HEADER_TONE[status.id].text,
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {status.label}
                                </h2>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                    {column.length}
                                </span>
                            </header>

                            <div className="flex flex-col gap-2">
                                {column.map((task) => {
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
                                                label: "Di-FU oleh",
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
                                                "group cursor-pointer rounded-lg border border-t-[3px] bg-card p-3 transition-colors hover:border-primary/40",
                                                STATUS_CARD_BORDER[task.status],
                                                task.status === "done" && "bg-card/60",
                                            )}
                                            style={{ borderTopColor: STATUS_CARD_TOP_COLOR[task.status] }}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openEdit(task)
                                                    }}
                                                    className={cn(
                                                        "min-w-0 text-left text-sm font-medium leading-snug",
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

                                            {task.description && (
                                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                                    {task.description}
                                                </p>
                                            )}

                                            {(task.license_plate || task.delivery_no || task.freight_order) && (
                                                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                    {task.license_plate && (
                                                        <span title="No. plat mobil">{task.license_plate}</span>
                                                    )}
                                                    {task.delivery_no && (
                                                        <span className="inline-flex items-center gap-1" title="No. delivery">
                                                            <FileText className="h-3 w-3 shrink-0" />
                                                            {task.delivery_no}
                                                        </span>
                                                    )}
                                                    {task.freight_order && (
                                                        <span className="inline-flex items-center gap-1" title="No. freight order">
                                                            <Hash className="h-3 w-3 shrink-0" />
                                                            {task.freight_order}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {(task.sales_name || task.customer_no) && (
                                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                    {task.sales_name && (
                                                        <span title="Nama sales">{task.sales_name}</span>
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

                                            {/* Footer satu baris: prioritas + user terakhir. */}
                                            <div
                                                className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs leading-snug text-muted-foreground"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Badge
                                                    variant="outline"
                                                    title={
                                                        escalated
                                                            ? `Otomatis Tinggi — belum selesai ${ESCALATION_DAYS} hari+`
                                                            : "Prioritas"
                                                    }
                                                    className={cn("shrink-0 gap-1 px-1.5 py-0 text-xs", priorityClass(priority))}
                                                >
                                                    <Flag className="h-2.5 w-2.5" />
                                                    {priorityLabel(priority)}
                                                </Badge>
                                                <span
                                                    className="flex min-w-0 items-center gap-1"
                                                    title={`${latestAudit.label} ${latestAudit.email ?? "—"}`}
                                                >
                                                    <LatestAuditIcon
                                                        className="h-3 w-3 shrink-0"
                                                        aria-label={latestAudit.label}
                                                    />
                                                    <span className="truncate">
                                                        <span className="font-medium text-foreground">
                                                            {shortUser(latestAudit.email)}
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
                            </div>
                        </section>
                    )
                })}
            </div>

            {sheetOpen && (
                <TaskSheet
                    task={editing}
                    onClose={() => setSheetOpen(false)}
                    onSave={saveTask}
                    onDelete={removeTask}
                    salesOptions={salesOptions}
                    plateOptions={plateOptions}
                />
            )}
        </div>
    )
}

interface TaskSheetProps {
    task: Task | null
    onClose: () => void
    onSave: (input: TaskInput, target: Task | null) => Promise<string | null>
    onDelete: (task: Task) => Promise<string | null>
    /** Daftar sales dari tabel `salesman` */
    salesOptions: { nik: string; nama: string }[]
    /** Daftar nopol dari tabel `equipment` */
    plateOptions: string[]
}

/**
 * Sheet form komplain. Di-mount hanya saat dibuka (lihat TaskBoard), jadi
 * state-nya selalu mulai dari data yang sedang diedit — tanpa effect
 * sinkronisasi yang rawan nilai basi.
 */
function TaskSheet({ task, onClose, onSave, onDelete, salesOptions, plateOptions }: TaskSheetProps) {
    const [title, setTitle] = useState(task?.title ?? "")
    const [description, setDescription] = useState(task?.description ?? "")
    const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo")
    const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal")
    const [salesName, setSalesName] = useState(task?.sales_name ?? "")
    const [licensePlate, setLicensePlate] = useState(task?.license_plate ?? "")
    const [deliveryNo, setDeliveryNo] = useState(task?.delivery_no ?? "")
    const [freightOrder, setFreightOrder] = useState(task?.freight_order ?? "")
    const [customerNo, setCustomerNo] = useState(task?.customer_no ?? "")
    const [isSaving, setIsSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /** Pelanggan yang dipilih/terdeteksi — nama toko hanya ditampilkan, bukan input. */
    const [pickedCustomer, setPickedCustomer] = useState<{ id: string; name: string } | null>(null)
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
        setIsSaving(true)
        setError(null)
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
            },
            task,
        )
        setIsSaving(false)
        if (saveError) setError(saveError)
        else onClose()
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
        <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
            <SheetContent
                side="right"
                className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
            >
                <SheetHeader className="border-b px-5 py-4 pr-12">
                    <SheetTitle>{task ? "Ubah komplain" : "Komplain baru"}</SheetTitle>
                </SheetHeader>

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
                            <div className="grid grid-cols-2 gap-2">
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
                                                "justify-start gap-1.5",
                                                status === s.id
                                                    ? STATUS_BUTTON_TONE[s.id].active
                                                    : STATUS_BUTTON_TONE[s.id].idle,
                                            )}
                                            onClick={() => setStatus(s.id)}
                                        >
                                            <Icon className="h-3.5 w-3.5 shrink-0" />
                                            {s.label}
                                        </Button>
                                    )
                                })}
                            </div>
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
                                title={`Dibuat oleh ${task.created_by ?? "—"}`}
                            >
                                <UserPlus className="mt-0.5 h-3 w-3 shrink-0" aria-label="Dibuat oleh" />
                                <span>
                                    <span className="font-medium text-foreground">{task.created_by ?? "—"}</span>
                                    {task.created_at ? ` · ${formatDateTimeWIB(task.created_at)}` : ""}
                                </span>
                            </p>
                            {task.followed_up_by && (
                                <p
                                    className="flex items-start gap-1.5"
                                    title={`Di-FU oleh ${task.followed_up_by}`}
                                >
                                    <User className="mt-0.5 h-3 w-3 shrink-0" aria-label="Di-FU oleh" />
                                    <span>
                                        <span className="font-medium text-foreground">{task.followed_up_by}</span>
                                        {task.followed_up_at ? ` · ${formatDateTimeWIB(task.followed_up_at)}` : ""}
                                    </span>
                                </p>
                            )}
                            {task.resolved_by && (
                                <p
                                    className="flex items-start gap-1.5"
                                    title={`Diselesaikan oleh ${task.resolved_by}`}
                                >
                                    <UserCheck className="mt-0.5 h-3 w-3 shrink-0" aria-label="Diselesaikan oleh" />
                                    <span>
                                        <span className="font-medium text-foreground">{task.resolved_by}</span>
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
                        <p aria-live="polite" className="px-5 pb-2 text-xs text-destructive">
                            {error}
                        </p>
                    )}

                    <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
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
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? "Menyimpan…" : "Simpan"}
                            </Button>
                        </div>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}

"use client"

import React, { Fragment, memo, useMemo, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"
import {
    ChevronDown,
    ChevronRight,
    ShieldCheck,
    AlertTriangle,
    Clock3,
    Gauge,
    ArrowUpDown,
    Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
// Aturan status servis & format tanggal kini tinggal di lib bersama
import { formatDateMedium as formatDateShort } from "@/lib/format"
import {
    evaluateServiceStatus,
    remainingDaysLabel as relativeDaysLabel,
    remainingKmLabel,
    type ServiceStatusId,
    type ServiceScheduleStatus,
} from "@/lib/service-status"

interface Row {
    item: any
    latestLog: any | null
    history: any[]
    status: ServiceScheduleStatus
}

interface Props {
    equipments: any[]
    serviceLogs: any[]
    isLoading: boolean
    statusFilter: string
    onStatusFilterChange?: (next: string) => void
}

const PAGE_SIZE = 10
type SortKey = "urgency" | "dueDate" | "odometer" | "equipmentId"

type KpiTone = "overdue" | "warning" | "safe" | "neutral"

/** Warna aksen per status — satu sumber untuk KPI, chip, dan baris tabel. */
const TONE: Record<
    KpiTone,
    { icon: string; surface: string; bar: string; ring: string }
> = {
    safe: {
        icon: "text-emerald-600 dark:text-emerald-400",
        surface: "bg-emerald-500/15",
        bar: "bg-emerald-500",
        ring: "ring-emerald-500/30",
    },
    warning: {
        icon: "text-amber-600 dark:text-amber-400",
        surface: "bg-amber-500/15",
        bar: "bg-amber-500",
        ring: "ring-amber-500/35",
    },
    overdue: {
        icon: "text-destructive",
        surface: "bg-destructive/15",
        bar: "bg-destructive",
        ring: "ring-destructive/35",
    },
    neutral: {
        icon: "text-muted-foreground",
        surface: "bg-muted/60",
        bar: "bg-muted-foreground/40",
        ring: "ring-border",
    },
}

function KpiCard({
    label,
    value,
    hint,
    active,
    tone = "neutral",
    icon,
    onClick,
}: {
    label: string
    value: number
    hint: string
    active?: boolean
    tone?: KpiTone
    icon: React.ReactNode
    onClick?: () => void
}) {
    const palette = TONE[tone]

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "group relative flex cursor-pointer flex-col gap-2.5 overflow-hidden rounded-xl border bg-card p-3.5 text-left shadow-sm transition-all",
                "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                active ? cn("ring-1", palette.ring) : "border-border/70",
            )}
        >
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full blur-2xl transition-opacity",
                    palette.surface,
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
            />
            <span className="relative flex items-center gap-2">
                <span
                    className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background/80 [&_svg]:h-3.5 [&_svg]:w-3.5",
                        palette.icon,
                    )}
                >
                    {icon}
                </span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {label}
                </span>
            </span>
            <span className="relative flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold leading-none tabular-nums">
                    {value.toLocaleString("id-ID")}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                    {hint}
                </span>
            </span>
            {active && (
                <span
                    aria-hidden
                    className={cn(
                        "absolute inset-x-0 bottom-0 h-0.5 rounded-full",
                        palette.bar,
                    )}
                />
            )}
        </button>
    )
}

function ServiceMonitoringTableImpl({
    equipments,
    serviceLogs,
    isLoading,
    statusFilter,
    onStatusFilterChange,
}: Props) {
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [sortKey, setSortKey] = useState<SortKey>("urgency")
    const today = useMemo(() => new Date(), [])

    const rows: Row[] = useMemo(() => {
        const byUnit = new Map<string, any[]>()
        for (const log of serviceLogs) {
            const k = String(log.equipment_id ?? "")
            if (!k) continue
            const arr = byUnit.get(k)
            if (arr) arr.push(log)
            else byUnit.set(k, [log])
        }
        return equipments.map((item) => {
            const key = String(item.equipment_id ?? "")
            const history = (byUnit.get(key) ?? []).slice().sort((a, b) => +new Date(b.service_date) - +new Date(a.service_date))
            const latestLog = history[0] ?? null
            return { item, latestLog, history, status: evaluateServiceStatus(item, latestLog, today) }
        })
    }, [equipments, serviceLogs, today])

    const counts = useMemo(() => {
        const c: Record<ServiceStatusId, number> = { safe: 0, warning: 0, overdue: 0, none: 0 }
        for (const r of rows) c[r.status.id]++
        return { ...c, total: rows.length }
    }, [rows])

    const filtered = useMemo(() => {
        if (!statusFilter || statusFilter === "all") return rows
        return rows.filter((r) => r.status.id === statusFilter)
    }, [rows, statusFilter])

    const sorted = useMemo(() => {
        const arr = [...filtered]
        if (sortKey === "equipmentId") arr.sort((a, b) => String(a.item.equipment_id).localeCompare(String(b.item.equipment_id)))
        else if (sortKey === "dueDate") {
            arr.sort((a, b) => {
                const da = a.status.remainingDays
                const db = b.status.remainingDays
                if (da == null && db == null) return 0
                if (da == null) return 1
                if (db == null) return -1
                return da - db
            })
        } else if (sortKey === "odometer") {
            arr.sort((a, b) => {
                const ka = a.status.remainingKm
                const kb = b.status.remainingKm
                if (ka == null && kb == null) return 0
                if (ka == null) return 1
                if (kb == null) return -1
                return ka - kb
            })
        } else {
            // urgency: overdue → warning → safe → none; lalu yang paling mendesak dulu
            arr.sort((a, b) => {
                if (a.status.rank !== b.status.rank) return a.status.rank - b.status.rank
                const da = a.status.remainingDays ?? 9999
                const db = b.status.remainingDays ?? 9999
                if (da !== db) return da - db
                const ka = a.status.remainingKm ?? 9999
                const kb = b.status.remainingKm ?? 9999
                return ka - kb
            })
        }
        return arr
    }, [filtered, sortKey])

    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
    const currentPage = Math.min(page, totalPages)
    const pageRows = useMemo(
        () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [sorted, currentPage],
    )

    // reset halaman saat filter/sort berubah
    React.useEffect(() => setPage(1), [statusFilter, sortKey, equipments.length, serviceLogs.length])

    const setFilter = (next: string) => {
        if (onStatusFilterChange) onStatusFilterChange(next)
        // fallback internal: jika parent tidak mengontrol, tidak ada state lokal terpisah —
        // SearchBar di atas tetap jadi sumber kebenaran via props statusFilter.
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="rounded-xl border bg-card p-3.5">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="mt-3 h-7 w-12" />
                        </div>
                    ))}
                </div>
                <div className="rounded-xl border bg-card">
                    <div className="border-b p-4">
                        <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="space-y-3 p-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-11 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    const chips: { id: string; label: string; count?: number }[] = [
        { id: "all", label: "Semua", count: counts.total },
        { id: "overdue", label: "Terlewat", count: counts.overdue },
        { id: "warning", label: "Segera", count: counts.warning },
        { id: "safe", label: "Aman", count: counts.safe },
        { id: "none", label: "Tanpa jadwal", count: counts.none },
    ]

    const activeFilter = statusFilter || "all"

    return (
        <div className="space-y-4">
            {/* KPI — klik untuk filter, sinkron dengan SearchBar */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard
                    label="Total dipantau"
                    value={counts.total}
                    hint="unit"
                    active={activeFilter === "all"}
                    tone="neutral"
                    icon={<Wrench />}
                    onClick={() => setFilter("all")}
                />
                <KpiCard
                    label="Aman"
                    value={counts.safe}
                    hint="siap pakai"
                    active={activeFilter === "safe"}
                    tone="safe"
                    icon={<ShieldCheck />}
                    onClick={() => setFilter("safe")}
                />
                <KpiCard
                    label="Segera servis"
                    value={counts.warning}
                    hint="≤14 hr / ≤1.000 km"
                    active={activeFilter === "warning"}
                    tone="warning"
                    icon={<Clock3 />}
                    onClick={() => setFilter("warning")}
                />
                <KpiCard
                    label="Terlewat"
                    value={counts.overdue}
                    hint="butuh tindakan"
                    active={activeFilter === "overdue"}
                    tone="overdue"
                    icon={<AlertTriangle />}
                    onClick={() => setFilter("overdue")}
                />
                <KpiCard
                    label="Tanpa jadwal"
                    value={counts.none}
                    hint="belum ada log"
                    active={activeFilter === "none"}
                    tone="neutral"
                    icon={<Gauge />}
                    onClick={() => setFilter("none")}
                />
            </div>

            {/* Toolbar: segmented filter + urutan */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div
                    role="group"
                    aria-label="Filter status servis"
                    className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
                >
                    {chips.map((chip) => {
                        const active = activeFilter === chip.id
                        return (
                            <button
                                key={chip.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setFilter(chip.id)}
                                className={cn(
                                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                                    active
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {chip.label}
                                {typeof chip.count === "number" && (
                                    <span
                                        className={cn(
                                            "rounded px-1 py-px text-[10px] tabular-nums",
                                            active
                                                ? "bg-muted text-muted-foreground"
                                                : "text-muted-foreground/70",
                                        )}
                                    >
                                        {chip.count}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div className="flex items-center gap-2 sm:shrink-0">
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                        <ArrowUpDown className="h-3.5 w-3.5" /> Urut
                    </span>
                    <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                        <SelectTrigger className="h-8 w-[180px] cursor-pointer bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="urgency">Paling mendesak</SelectItem>
                            <SelectItem value="dueDate">Jadwal terdekat</SelectItem>
                            <SelectItem value="odometer">Sisa km terkecil</SelectItem>
                            <SelectItem value="equipmentId">Equipment ID</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                {/* Kepala tabel — konteks jumlah & petunjuk interaksi */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold tracking-tight">Daftar unit</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {sorted.length.toLocaleString("id-ID")} unit pada filter ini · klik baris untuk melihat riwayat servis
                        </p>
                    </div>
                    <Badge
                        variant="outline"
                        className="shrink-0 border-border bg-background"
                    >
                        Halaman {currentPage} / {totalPages}
                    </Badge>
                </div>

                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow className="border-b-border/60 hover:bg-transparent">
                            <TableHead className="w-[36px]" />
                            <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-[0.08em]">Unit</TableHead>
                            <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-[0.08em]">Status</TableHead>
                            <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-[0.08em]">Jadwal servis</TableHead>
                            <TableHead className="min-w-[220px] text-[11px] uppercase tracking-[0.08em]">Odometer</TableHead>
                            <TableHead className="w-[96px] text-right text-[11px] uppercase tracking-[0.08em]">Sisa</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pageRows.length > 0 ? (
                            pageRows.map(({ item, latestLog, history, status }) => {
                                const isExpanded = expandedId === String(item.id)
                                const nextLabel = latestLog?.next_service_date
                                    ? formatDateShort(latestLog.next_service_date)
                                    : "—"
                                const rel = relativeDaysLabel(status.remainingDays)
                                const kmLabel = remainingKmLabel(status.remainingKm)

                                return (
                                    <Fragment key={String(item.id)}>
                                        <TableRow
                                            onClick={() => setExpandedId(isExpanded ? null : String(item.id))}
                                            aria-expanded={isExpanded}
                                            className={cn(
                                                "cursor-pointer border-l-2 transition-colors",
                                                status.tone.accent,
                                                isExpanded
                                                    ? "bg-muted/40"
                                                    : "hover:bg-muted/30",
                                            )}
                                        >
                                            <TableCell className="w-[36px] py-2.5">
                                                <span className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors">
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <div className="text-sm font-semibold leading-none tracking-tight">
                                                    {item.equipment_id}
                                                </div>
                                                <div className="mt-1.5 flex max-w-[200px] items-center gap-1.5 truncate text-xs text-muted-foreground">
                                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                                                        {item.license_plate || "—"}
                                                    </span>
                                                    {item.description && (
                                                        <span className="truncate">{item.description}</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <Badge
                                                    variant="outline"
                                                    className={cn("gap-1.5", status.tone.badge)}
                                                >
                                                    <span className={cn("h-1.5 w-1.5 rounded-[1px]", status.tone.dot)} />
                                                    {status.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <div className="text-sm font-medium tabular-nums">{nextLabel}</div>
                                                <div
                                                    className={cn(
                                                        "mt-0.5 text-xs",
                                                        status.id === "overdue"
                                                            ? "font-medium text-destructive"
                                                            : status.id === "warning"
                                                              ? "text-amber-700 dark:text-amber-400"
                                                              : "text-muted-foreground",
                                                    )}
                                                >
                                                    {rel}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                {latestLog?.next_service_odometer != null ? (
                                                    <div className="space-y-1.5 pr-2">
                                                        <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums">
                                                            <span className="font-medium">
                                                                {Number(item.last_odometer ?? 0).toLocaleString("id-ID")}
                                                                <span className="ml-0.5 font-normal text-muted-foreground">km</span>
                                                            </span>
                                                            <span className="text-muted-foreground">
                                                                target {Number(latestLog.next_service_odometer).toLocaleString("id-ID")} km
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full transition-all duration-500",
                                                                    status.tone.bar,
                                                                )}
                                                                style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
                                                            />
                                                        </div>
                                                        <div className="text-[11px] tabular-nums text-muted-foreground">
                                                            {kmLabel}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">— tanpa target km</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right">
                                                <div
                                                    className={cn(
                                                        "text-sm font-semibold tabular-nums leading-none",
                                                        status.id === "overdue"
                                                            ? "text-destructive"
                                                            : status.id === "warning"
                                                              ? "text-amber-700 dark:text-amber-400"
                                                              : "text-foreground",
                                                    )}
                                                >
                                                    {status.remainingDays != null ? (
                                                        status.remainingDays > 0 ? (
                                                            `H-${status.remainingDays}`
                                                        ) : status.remainingDays === 0 ? (
                                                            "Hari ini"
                                                        ) : (
                                                            `H+${Math.abs(status.remainingDays)}`
                                                        )
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </div>
                                                <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                                                    {status.remainingKm != null
                                                        ? status.remainingKm >= 0
                                                            ? `${status.remainingKm.toLocaleString("id-ID")} km`
                                                            : `+${Math.abs(status.remainingKm).toLocaleString("id-ID")} km`
                                                        : "—"}
                                                </div>
                                            </TableCell>
                                        </TableRow>

                                        {isExpanded && (
                                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                                                <TableCell colSpan={6} className="p-0">
                                                    <div className="border-t border-border/60 px-4 py-4 sm:px-6">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                                    Riwayat servis
                                                                </p>
                                                                <p className="mt-1 text-sm font-semibold tracking-tight">
                                                                    {item.equipment_id}
                                                                    {item.license_plate ? ` · ${item.license_plate}` : ""}
                                                                </p>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <Badge variant="outline" className="bg-background">
                                                                    Odo {Number(item.last_odometer ?? 0).toLocaleString("id-ID")} km
                                                                </Badge>
                                                                {item.construction_year && (
                                                                    <Badge variant="outline" className="bg-background">
                                                                        Tahun {item.construction_year}
                                                                    </Badge>
                                                                )}
                                                                <Badge variant="outline" className="bg-background">
                                                                    {history.length} entri
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        {history.length > 0 ? (
                                                            <div className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-background">
                                                                <Table>
                                                                    <TableHeader className="bg-muted/30">
                                                                        <TableRow className="hover:bg-transparent">
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-[10px] uppercase tracking-[0.08em]">Tgl servis</TableHead>
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-[10px] uppercase tracking-[0.08em]">Odo saat servis</TableHead>
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-[10px] uppercase tracking-[0.08em]">Jadwal berikut</TableHead>
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-[10px] uppercase tracking-[0.08em]">Odo berikut</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {history.slice(0, 8).map((log: any, idx: number) => (
                                                                            <TableRow
                                                                                key={`${log.equipment_id}-${log.service_date}-${idx}`}
                                                                                className={idx === 0 ? "bg-primary/[0.03]" : ""}
                                                                            >
                                                                                <TableCell className="py-2 text-xs tabular-nums">
                                                                                    {formatDateShort(log.service_date)}
                                                                                    {idx === 0 && (
                                                                                        <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                                                                                            terbaru
                                                                                        </span>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="py-2 text-xs tabular-nums">
                                                                                    {log.odometer_at_service != null
                                                                                        ? `${Number(log.odometer_at_service).toLocaleString("id-ID")} km`
                                                                                        : "—"}
                                                                                </TableCell>
                                                                                <TableCell className="py-2 text-xs tabular-nums">
                                                                                    {formatDateShort(log.next_service_date)}
                                                                                </TableCell>
                                                                                <TableCell className="py-2 text-xs tabular-nums">
                                                                                    {log.next_service_odometer != null
                                                                                        ? `${Number(log.next_service_odometer).toLocaleString("id-ID")} km`
                                                                                        : "—"}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                                {history.length > 8 && (
                                                                    <div className="border-t bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
                                                                        + {history.length - 8} entri lebih lama tidak ditampilkan
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <p className="mt-3 rounded-lg border border-dashed bg-background/60 px-4 py-6 text-center text-sm text-muted-foreground">
                                                                Belum ada riwayat servis untuk unit ini.
                                                            </p>
                                                        )}

                                                        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aman
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Segera (≤14 hari / ≤1.000 km)
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Terlewat
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                )
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-40 text-center">
                                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                                        <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                                            <Wrench className="h-4 w-4" />
                                        </span>
                                        <p className="text-sm font-semibold">Tidak ada unit yang cocok</p>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Coba ganti filter status, urutan, atau kata kunci pencarian di atas.
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-1 cursor-pointer"
                                            onClick={() => setFilter("all")}
                                        >
                                            Tampilkan semua
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Footer paginasi — selalu tampil supaya posisi data jelas */}
                {sorted.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-2.5">
                        <p className="text-xs tabular-nums text-muted-foreground">
                            Menampilkan{" "}
                            <span className="font-medium text-foreground">
                                {(currentPage - 1) * PAGE_SIZE + 1}–
                                {Math.min(currentPage * PAGE_SIZE, sorted.length)}
                            </span>{" "}
                            dari {sorted.length.toLocaleString("id-ID")} unit
                        </p>
                        <Pagination className="mx-0 w-auto justify-end">
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            if (currentPage > 1) setPage((p) => p - 1)
                                        }}
                                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                                <PaginationItem className="flex items-center gap-2 px-2">
                                    <input
                                        type="number"
                                        min={1}
                                        max={totalPages}
                                        value={currentPage}
                                        aria-label="Nomor halaman"
                                        onChange={(e) => {
                                            const v = Number.parseInt(e.target.value, 10)
                                            if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), totalPages))
                                        }}
                                        className="h-8 w-12 rounded-md border border-input bg-background text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    />
                                    <span className="text-xs text-muted-foreground">/ {totalPages}</span>
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            if (currentPage < totalPages) setPage((p) => p + 1)
                                        }}
                                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </div>

        </div>
    )
}

export const ServiceMonitoringTable = memo(ServiceMonitoringTableImpl)

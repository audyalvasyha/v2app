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

type ServiceStatusId = "safe" | "warning" | "overdue" | "none"

interface ServiceStatus {
    id: ServiceStatusId
    label: string
    badgeClass: string
    barClass: string
    dotClass: string
    rowAccent: string
    progress: number
    remainingDays: number | null // null jika tanpa jadwal tanggal
    remainingKm: number | null // null jika tanpa target odo; negatif = kelebihan
    rank: number // 0 paling gawat
}

interface Row {
    item: any
    latestLog: any | null
    history: any[]
    status: ServiceStatus
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

function buildStatus(equipment: any, latestLog: any): ServiceStatus {
    if (!latestLog) {
        return {
            id: "none",
            label: "Tanpa jadwal",
            badgeClass:
                "border-border text-muted-foreground bg-muted/20 hover:bg-muted/30",
            barClass: "bg-muted-foreground/30",
            dotClass: "bg-muted-foreground",
            rowAccent: "border-l-muted-foreground/40",
            progress: 0,
            remainingDays: null,
            remainingKm: null,
            rank: 3,
        }
    }

    const today = new Date()
    // normalisasi ke tengah hari biar diff hari stabil
    today.setHours(12, 0, 0, 0)
    const nextDate = latestLog.next_service_date ? new Date(latestLog.next_service_date) : null
    if (nextDate) nextDate.setHours(12, 0, 0, 0)

    const nextOdo: number | null =
        latestLog.next_service_odometer != null ? Number(latestLog.next_service_odometer) : null
    const prevOdo = Number(latestLog.odometer_at_service ?? 0)
    const currentOdo = Number(equipment.last_odometer ?? 0)

    let progress = 0
    let remainingKm: number | null = null
    if (nextOdo != null && Number.isFinite(nextOdo) && nextOdo > prevOdo) {
        remainingKm = nextOdo - currentOdo
        if (currentOdo >= nextOdo) progress = 100
        else if (currentOdo > prevOdo) progress = ((currentOdo - prevOdo) / (nextOdo - prevOdo)) * 100
        else progress = 0
    }

    let remainingDays: number | null = null
    if (nextDate) {
        const diff = Math.ceil((nextDate.getTime() - today.getTime()) / (86_400_000))
        remainingDays = diff
    }

    // urgency: overdue > warning (<=14 hari atau <=1000 km) > safe
    const odoWarning =
        remainingKm != null && remainingKm <= 1000 && remainingKm >= 0
    const dateWarning =
        remainingDays != null && remainingDays >= 0 && remainingDays <= 14
    const odoOverdue = remainingKm != null && remainingKm < 0
    const dateOverdue = remainingDays != null && remainingDays < 0

    const isOverdue = odoOverdue || dateOverdue
    const isWarning = !isOverdue && (odoWarning || dateWarning)

    if (isOverdue) {
        return {
            id: "overdue",
            label: "Terlewat",
            badgeClass:
                "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
            barClass: "bg-destructive",
            dotClass: "bg-destructive",
            rowAccent: "border-l-destructive",
            progress,
            remainingDays,
            remainingKm,
            rank: 0,
        }
    }
    if (isWarning) {
        return {
            id: "warning",
            label: "Segera servis",
            badgeClass:
                "border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15",
            barClass: "bg-amber-500",
            dotClass: "bg-amber-500",
            rowAccent: "border-l-amber-500",
            progress,
            remainingDays,
            remainingKm,
            rank: 1,
        }
    }
    return {
        id: "safe",
        label: "Aman",
        badgeClass:
            "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
        barClass: "bg-emerald-500",
        dotClass: "bg-emerald-500",
        rowAccent: "border-l-emerald-500",
        progress,
        remainingDays,
        remainingKm,
        rank: 2,
    }
}

function formatDateShort(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function relativeDaysLabel(n: number | null): string {
    if (n == null) return "Tanpa jadwal"
    if (n === 0) return "Hari ini"
    if (n === 1) return "Besok"
    if (n > 1) return `${n} hari lagi`
    return `Terlambat ${Math.abs(n)} hari`
}

function remainingKmLabel(n: number | null): string {
    if (n == null) return "—"
    if (n > 0) return `Sisa ${n.toLocaleString("id-ID")} km`
    if (n === 0) return "Tepat jadwal"
    return `Kelebihan ${Math.abs(n).toLocaleString("id-ID")} km`
}

function KpiCard({
    label,
    value,
    hint,
    active,
    tone,
    icon,
    onClick,
}: {
    label: string
    value: number
    hint: string
    active?: boolean
    tone?: "overdue" | "warning" | "safe" | "neutral"
    icon: React.ReactNode
    onClick?: () => void
}) {
    const toneDot =
        tone === "overdue"
            ? "bg-destructive"
            : tone === "warning"
              ? "bg-amber-500"
              : tone === "safe"
                ? "bg-emerald-500"
                : "bg-muted-foreground/60"
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition",
                active ? "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/15" : "hover:bg-muted/40",
            ].join(" ")}
        >
            <span className={["grid h-9 w-9 place-items-center rounded-lg border bg-background", active ? "border-primary/20" : ""].join(" ")}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                    <span className={["h-1.5 w-1.5 rounded-full", toneDot].join(" ")} />
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {label}
                    </span>
                </span>
                <span className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-semibold tabular-nums leading-none">{value}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{hint}</span>
                </span>
            </span>
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
            return { item, latestLog, history, status: buildStatus(item, latestLog) }
        })
    }, [equipments, serviceLogs])

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

    const activeTone: Record<string, Props["statusFilter"]> = {
        Aman: "safe",
        Segera: "warning",
        Terlewat: "overdue",
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="rounded-xl border bg-card px-4 py-3">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="mt-3 h-6 w-12" />
                        </div>
                    ))}
                </div>
                <div className="rounded-md border bg-card">
                    <div className="p-4 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* KPI — klik untuk filter, sinkron dengan SearchBar */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard
                    label="Total dipantau"
                    value={counts.total}
                    hint="unit"
                    active={statusFilter === "all" || !statusFilter}
                    tone="neutral"
                    icon={<Wrench className="h-4 w-4 text-muted-foreground" />}
                    onClick={() => setFilter("all")}
                />
                <KpiCard
                    label="Aman"
                    value={counts.safe}
                    hint="siap pakai"
                    active={statusFilter === "safe"}
                    tone="safe"
                    icon={<ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                    onClick={() => setFilter("safe")}
                />
                <KpiCard
                    label="Segera servis"
                    value={counts.warning}
                    hint="≤14 hr / ≤1.000 km"
                    active={statusFilter === "warning"}
                    tone="warning"
                    icon={<Clock3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                    onClick={() => setFilter("warning")}
                />
                <KpiCard
                    label="Terlewat"
                    value={counts.overdue}
                    hint="butuh tindakan"
                    active={statusFilter === "overdue"}
                    tone="overdue"
                    icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                    onClick={() => setFilter("overdue")}
                />
                <KpiCard
                    label="Tanpa jadwal"
                    value={counts.none}
                    hint="belum ada log"
                    active={statusFilter === "none"}
                    tone="neutral"
                    icon={<Gauge className="h-4 w-4 text-muted-foreground" />}
                    onClick={() => setFilter("none")}
                />
            </div>

            {/* Toolbar: chip filter cepat + urut */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                    {[
                        { id: "all", label: "Semua" },
                        { id: "overdue", label: "Terlewat" },
                        { id: "warning", label: "Segera" },
                        { id: "safe", label: "Aman" },
                        { id: "none", label: "Tanpa jadwal" },
                    ].map((chip) => {
                        const active = (statusFilter || "all") === chip.id
                        return (
                            <Button
                                key={chip.id}
                                variant={active ? "secondary" : "outline"}
                                size="sm"
                                className={active ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card"}
                                onClick={() => setFilter(chip.id)}
                            >
                                {chip.label}
                            </Button>
                        )
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                        <ArrowUpDown className="h-3.5 w-3.5" /> Urut
                    </span>
                    <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                        <SelectTrigger className="h-8 w-[180px] bg-card">
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

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[36px]" />
                            <TableHead className="whitespace-nowrap">Unit</TableHead>
                            <TableHead className="whitespace-nowrap">Status</TableHead>
                            <TableHead className="whitespace-nowrap">Jadwal servis</TableHead>
                            <TableHead className="min-w-[220px]">Odometer</TableHead>
                            <TableHead className="w-[88px] text-right whitespace-nowrap">Sisa</TableHead>
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
                                            className={[
                                                "cursor-pointer border-l-2 transition-colors hover:bg-muted/40",
                                                status.rowAccent,
                                                isExpanded ? "bg-muted/30" : "",
                                            ].join(" ")}
                                        >
                                            <TableCell className="w-[36px] py-2">
                                                {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <div className="font-medium leading-none">{item.equipment_id}</div>
                                                <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">
                                                    {item.license_plate || "—"} {item.description ? `· ${item.description}` : ""}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <Badge variant="outline" className={["gap-1.5 border font-medium", status.badgeClass].join(" ")}>
                                                    <span className={["h-1.5 w-1.5 rounded-full", status.dotClass].join(" ")} />
                                                    {status.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <div className="text-sm tabular-nums">{nextLabel}</div>
                                                <div
                                                    className={[
                                                        "text-xs",
                                                        status.id === "overdue"
                                                            ? "font-medium text-destructive"
                                                            : status.id === "warning"
                                                              ? "text-amber-700 dark:text-amber-400"
                                                              : "text-muted-foreground",
                                                    ].join(" ")}
                                                >
                                                    {rel}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                {latestLog?.next_service_odometer != null ? (
                                                    <div className="space-y-1.5 pr-2">
                                                        <div className="flex justify-between gap-3 text-xs tabular-nums">
                                                            <span className="font-medium">
                                                                {Number(item.last_odometer ?? 0).toLocaleString("id-ID")} km
                                                            </span>
                                                            <span className="text-muted-foreground">
                                                                / {Number(latestLog.next_service_odometer).toLocaleString("id-ID")} km
                                                            </span>
                                                        </div>
                                                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                                                            <div
                                                                className={["h-full rounded-full transition-all duration-500", status.barClass].join(" ")}
                                                                style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
                                                            />
                                                        </div>
                                                        <div className="text-xs tabular-nums text-muted-foreground">{kmLabel}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">— tanpa target km</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right">
                                                <div className="text-xs tabular-nums leading-none">
                                                    {status.remainingDays != null ? (
                                                        <span className={status.id === "overdue" ? "font-semibold text-destructive" : "text-foreground"}>
                                                            {status.remainingDays > 0
                                                                ? `H-${status.remainingDays}`
                                                                : status.remainingDays === 0
                                                                  ? "Hari ini"
                                                                  : `H+${Math.abs(status.remainingDays)}`}
                                                        </span>
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
                                                    <div className="px-4 py-4 sm:px-6">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <div className="text-sm font-semibold">Riwayat servis — {item.equipment_id}</div>
                                                                <div className="mt-1 text-xs text-muted-foreground">
                                                                    Odo saat ini {Number(item.last_odometer ?? 0).toLocaleString("id-ID")} km
                                                                    {latestLog?.odometer_at_service != null
                                                                        ? ` · terakhir servis di ${Number(latestLog.odometer_at_service).toLocaleString("id-ID")} km`
                                                                        : ""}
                                                                    {item.construction_year ? ` · tahun ${item.construction_year}` : ""}
                                                                </div>
                                                            </div>
                                                            {history.length > 0 && (
                                                                <span className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                                                                    {history.length} entri servis
                                                                </span>
                                                            )}
                                                        </div>

                                                        {history.length > 0 ? (
                                                            <div className="mt-3 overflow-hidden rounded-lg border bg-background">
                                                                <Table>
                                                                    <TableHeader className="bg-muted/40">
                                                                        <TableRow className="hover:bg-transparent">
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-xs">Tgl servis</TableHead>
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-xs">Odo saat servis</TableHead>
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-xs">Jadwal berikut</TableHead>
                                                                            <TableHead className="h-8 whitespace-nowrap py-1 text-xs">Odo berikut</TableHead>
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
                                                            <p className="mt-3 rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                                                                Belum ada riwayat servis untuk unit ini.
                                                            </p>
                                                        )}

                                                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Aman
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="h-2 w-2 rounded-full bg-amber-500" /> Segera (≤14 hari / ≤1.000 km)
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="h-2 w-2 rounded-full bg-destructive" /> Terlewat
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
                                <TableCell colSpan={6} className="h-32 text-center">
                                    <div className="mx-auto max-w-sm space-y-2">
                                        <p className="text-sm font-medium">Tidak ada unit yang cocok</p>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Coba ganti filter status, urutan, atau kata kunci pencarian di atas.
                                        </p>
                                        <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                                            Tampilkan semua
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {sorted.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs tabular-nums text-muted-foreground">
                        {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} dari{" "}
                        {sorted.length} unit
                    </p>
                    <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        if (currentPage > 1) setPage((p) => p - 1)
                                    }}
                                    className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                            <PaginationItem className="flex items-center gap-2 px-2">
                                <input
                                    type="number"
                                    min={1}
                                    max={totalPages}
                                    value={currentPage}
                                    onChange={(e) => {
                                        const v = Number.parseInt(e.target.value, 10)
                                        if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), totalPages))
                                    }}
                                    className="h-8 w-14 rounded-md border border-input bg-background text-center text-sm"
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
                                    className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    )
}

export const ServiceMonitoringTable = memo(ServiceMonitoringTableImpl)

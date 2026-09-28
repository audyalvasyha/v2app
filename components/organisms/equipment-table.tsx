"use client"

import React, { Fragment, memo, useEffect, useMemo, useState } from "react"
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
import { StatTile } from "@/components/molecules/stat-tile"
// Format & warna status kini dari lib bersama — konsisten dengan menu Dashboard
import { compactRupiah, formatDateMedium, formatKm, formatRupiah } from "@/lib/format"
import { unitStatusTone as statusTone } from "@/lib/unit-status"
import {
    AlertTriangle,
    ArrowUpDown,
    Building2,
    ChevronDown,
    ChevronRight,
    CircleDollarSign,
    Clock3,
    Hash,
    ShieldCheck,
    Truck,
    Wrench,
    X,
} from "lucide-react"

interface EquipmentTableProps {
    equipments: any[]
    histories: any[]
    isLoading: boolean
    error: string | null
    /** Sinkron dengan filter status di SearchBar (state induk) */
    statusFilter?: string
    onStatusFilterChange?: (next: string) => void
}

type SortKey = "default" | "id" | "odometer" | "cost" | "history"

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const RECENT_HISTORY_LIMIT = 8

const STATUS_CHIPS: { id: string; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "Available", label: "Available" },
    { id: "In Use", label: "In Use" },
    { id: "Maintenance", label: "Maintenance" },
]

/* ── Util tampilan ───────────────────────────────────────────────────────── */

/* ── Baris data + ringkasan biaya per unit ───────────────────────────────── */

interface UnitStat {
    count: number
    total: number
    last: string | null
}

interface EquipmentRow {
    item: any
    stat?: UnitStat
    history: any[]
}

function EquipmentTableImpl({
    equipments,
    histories,
    isLoading,
    error,
    statusFilter = "all",
    onStatusFilterChange,
}: EquipmentTableProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [sortKey, setSortKey] = useState<SortKey>("default")
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
    const [page, setPage] = useState(1)

    // Index riwayat per unit sekali — dipakai untuk kolom biaya, detail, dan panel expanded
    const { byUnit, statsByUnit } = useMemo(() => {
        const byUnit = new Map<string, any[]>()
        const statsByUnit = new Map<string, UnitStat>()
        for (const h of histories) {
            const key = String(h.equipment_id ?? "")
            if (!key) continue
            const list = byUnit.get(key)
            if (list) list.push(h)
            else byUnit.set(key, [h])

            const cost = Number(h.jumlah_harga) || 0
            const prev = statsByUnit.get(key)
            if (prev) {
                prev.count += 1
                prev.total += cost
                if (h.tanggal && (!prev.last || new Date(h.tanggal) > new Date(prev.last))) prev.last = h.tanggal
            } else {
                statsByUnit.set(key, { count: 1, total: cost, last: h.tanggal ?? null })
            }
        }
        for (const list of byUnit.values()) {
            list.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
        }
        return { byUnit, statsByUnit }
    }, [histories])

    const rows: EquipmentRow[] = useMemo(
        () =>
            equipments.map((item) => {
                const key = String(item.equipment_id ?? "")
                return { item, stat: statsByUnit.get(key), history: byUnit.get(key) ?? [] }
            }),
        [equipments, statsByUnit, byUnit],
    )

    const stats = useMemo(() => {
        let available = 0
        let totalMaintenance = 0
        let withoutHistory = 0
        for (const r of rows) {
            if (r.item.status === "Available") available += 1
            totalMaintenance += r.stat?.total ?? 0
            if (!r.stat) withoutHistory += 1
        }
        return { total: rows.length, available, attention: rows.length - available, totalMaintenance, withoutHistory }
    }, [rows])

    const maxUnitCost = useMemo(
        () => rows.reduce((m, r) => Math.max(m, r.stat?.total ?? 0), 0),
        [rows],
    )

    const sorted = useMemo(() => {
        if (sortKey === "default") {
            // Urutan asli dari query (created_at desc) — biarkan apa adanya, tidak di-copy ulang
            return rows
        }
        const arr = [...rows]
        const odo = (r: EquipmentRow) => Number(r.item.last_odometer ?? 0)
        switch (sortKey) {
            case "id":
                arr.sort((a, b) => String(a.item.equipment_id ?? "").localeCompare(String(b.item.equipment_id ?? "")))
                break
            case "odometer":
                arr.sort((a, b) => odo(b) - odo(a))
                break
            case "cost":
                arr.sort((a, b) => (b.stat?.total ?? 0) - (a.stat?.total ?? 0))
                break
            case "history":
                arr.sort((a, b) => (b.stat?.count ?? 0) - (a.stat?.count ?? 0))
                break
        }
        return arr
    }, [rows, sortKey])

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pageRows = useMemo(
        () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [sorted, currentPage, pageSize],
    )

    useEffect(() => {
        setPage(1)
    }, [equipments.length, sortKey, pageSize])

    const activeChip = statusFilter || "all"

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-xl border bg-card px-4 py-3">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="mt-3 h-5 w-24" />
                        </div>
                    ))}
                </div>
                <div className="overflow-hidden rounded-xl border bg-card">
                    <div className="space-y-3 p-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    // Error fatal hanya jika tidak ada data sama sekali; kalau masih ada cache, tetap tampilkan
    if (error && equipments.length === 0) {
        return (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
                <p className="mt-3 text-sm font-medium text-destructive">Gagal memuat data equipment</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* RINGKASAN ARMADA */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Total unit"
                    value={stats.total.toLocaleString("id-ID")}
                    hint={stats.withoutHistory > 0 ? `${stats.withoutHistory} unit tanpa riwayat` : "semua unit punya riwayat"}
                    icon={<Truck className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Available"
                    value={stats.available.toLocaleString("id-ID")}
                    hint={stats.total > 0 ? `${Math.round((stats.available / stats.total) * 100)}% siap pakai` : "—"}
                    icon={<ShieldCheck className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Perlu perhatian"
                    value={stats.attention.toLocaleString("id-ID")}
                    hint="In use / maintenance"
                    icon={<Wrench className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Nilai perawatan"
                    value={compactRupiah(stats.totalMaintenance)}
                    hint={formatRupiah(stats.totalMaintenance)}
                    title={formatRupiah(stats.totalMaintenance)}
                    icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                    emphasis
                />
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    <span>Menampilkan data tersimpan — pembaruan terakhir gagal: {error}</span>
                </div>
            )}

            {/* KONTROL: filter status cepat, urutan, jumlah baris */}
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-1.5">
                    {STATUS_CHIPS.map((chip) => {
                        const active = activeChip === chip.id
                        return (
                            <Button
                                key={chip.id}
                                variant={active ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => onStatusFilterChange?.(chip.id)}
                                className={active ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card"}
                            >
                                {chip.label}
                            </Button>
                        )
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                        <ArrowUpDown className="h-3.5 w-3.5" /> Urut
                    </span>
                    <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                        <SelectTrigger className="h-8 w-[190px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Terbaru ditambahkan</SelectItem>
                            <SelectItem value="id">Equipment ID (A–Z)</SelectItem>
                            <SelectItem value="odometer">Odometer tertinggi</SelectItem>
                            <SelectItem value="cost">Biaya perawatan tertinggi</SelectItem>
                            <SelectItem value="history">Riwayat terbanyak</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                        <SelectTrigger className="h-8 w-[112px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n} baris
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* TABEL ARMADA */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[44px]" />
                            <TableHead className="whitespace-nowrap">Unit</TableHead>
                            <TableHead className="whitespace-nowrap">Perusahaan</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Odometer</TableHead>
                            <TableHead className="min-w-[190px]">Riwayat &amp; biaya</TableHead>
                            <TableHead className="whitespace-nowrap">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pageRows.length > 0 ? (
                            pageRows.map(({ item, stat, history }) => {
                                const isExpanded = expandedId === String(item.id)
                                const tone = statusTone(item.status)
                                const unitCost = stat?.total ?? 0
                                const share = maxUnitCost > 0 ? Math.max(2, (unitCost / maxUnitCost) * 100) : 0

                                return (
                                    <Fragment key={String(item.id)}>
                                        <TableRow
                                            onClick={() => setExpandedId(isExpanded ? null : String(item.id))}
                                            className={[
                                                "cursor-pointer border-l-2 transition-colors hover:bg-muted/40",
                                                tone.accent,
                                                isExpanded ? "bg-muted/30" : "",
                                            ].join(" ")}
                                        >
                                            <TableCell className="py-2.5">
                                                {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <div className="font-medium leading-none">{item.equipment_id}</div>
                                                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <span className="rounded-sm border bg-muted/40 px-1.5 py-0.5 font-mono">
                                                        {item.license_plate || "—"}
                                                    </span>
                                                    {item.description && (
                                                        <span
                                                            className="max-w-[220px] truncate"
                                                            title={item.description}
                                                        >
                                                            {item.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {item.company_code || "—"}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {item.construction_year ? `Tahun ${item.construction_year}` : "Tahun —"}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right">
                                                <div className="font-mono text-sm tabular-nums">
                                                    {formatKm(item.last_odometer)}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {stat?.last ? `Servis ${formatDateMedium(stat.last)}` : "Belum pernah servis"}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                {stat ? (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-baseline justify-between gap-3">
                                                            <span className="text-xs text-muted-foreground">
                                                                {stat.count} entri
                                                            </span>
                                                            <span className="font-mono text-sm font-medium tabular-nums">
                                                                {formatRupiah(unitCost)}
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                            <div
                                                                className="h-full rounded-full bg-primary/70"
                                                                style={{ width: `${Math.min(100, share)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        Belum ada riwayat perbaikan
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <Badge variant="outline" className={["gap-1.5 border font-medium", tone.badge].join(" ")}>
                                                    <span className={["h-1.5 w-1.5 rounded-full", tone.dot].join(" ")} />
                                                    {item.status || "Tidak diketahui"}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>

                                        {isExpanded && (
                                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                                                <TableCell colSpan={6} className="p-0">
                                                    <div className="px-4 py-4 sm:px-6">
                                                        {/* Detail atribut unit */}
                                                        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                                                            <div>
                                                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                                                    Deskripsi
                                                                </dt>
                                                                <dd className="mt-1 text-sm">{item.description || "—"}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                                                    Perusahaan
                                                                </dt>
                                                                <dd className="mt-1 text-sm">{item.company_code || "—"}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                                                    Tahun konstruksi
                                                                </dt>
                                                                <dd className="mt-1 text-sm tabular-nums">
                                                                    {item.construction_year || "—"}
                                                                </dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                                                    Total perawatan
                                                                </dt>
                                                                <dd className="mt-1 text-sm font-medium tabular-nums text-primary">
                                                                    {stat ? formatRupiah(stat.total) : "—"}
                                                                </dd>
                                                            </div>
                                                        </dl>

                                                        {/* Riwayat perbaikan unit ini */}
                                                        <div className="mt-4">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 text-sm font-semibold">
                                                                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                                                                    Riwayat perbaikan
                                                                </div>
                                                                {stat && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {stat.count} entri
                                                                        {stat.last ? ` · terakhir ${formatDateMedium(stat.last)}` : ""}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {history.length > 0 ? (
                                                                <div className="mt-2 overflow-hidden rounded-lg border bg-background">
                                                                    <Table>
                                                                        <TableHeader className="bg-muted/40">
                                                                            <TableRow className="hover:bg-transparent">
                                                                                <TableHead className="h-8 whitespace-nowrap py-1 text-xs">
                                                                                    Tanggal
                                                                                </TableHead>
                                                                                <TableHead className="h-8 py-1 text-xs">
                                                                                    Barang / Jasa
                                                                                </TableHead>
                                                                                <TableHead className="h-8 whitespace-nowrap py-1 text-right text-xs">
                                                                                    Biaya
                                                                                </TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {history
                                                                                .slice(0, RECENT_HISTORY_LIMIT)
                                                                                .map((h, idx) => (
                                                                                    <TableRow
                                                                                        key={String(h.id ?? `${h.tanggal}-${idx}`)}
                                                                                        className={idx === 0 ? "bg-primary/[0.03]" : ""}
                                                                                    >
                                                                                        <TableCell className="py-2 text-xs tabular-nums">
                                                                                            {formatDateMedium(h.tanggal)}
                                                                                        </TableCell>
                                                                                        <TableCell
                                                                                            className="max-w-[320px] truncate py-2 text-xs"
                                                                                            title={h.nama_barang_atau_jasa || ""}
                                                                                        >
                                                                                            {h.nama_barang_atau_jasa || "—"}
                                                                                        </TableCell>
                                                                                        <TableCell className="py-2 text-right font-mono text-xs tabular-nums">
                                                                                            {formatRupiah(Number(h.jumlah_harga) || 0)}
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                    {history.length > RECENT_HISTORY_LIMIT && (
                                                                        <div className="border-t bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
                                                                            + {history.length - RECENT_HISTORY_LIMIT} entri lebih lama — buka menu{" "}
                                                                            <span className="font-medium">Histories</span> untuk daftar lengkapnya
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <p className="mt-2 rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                                                                    Belum ada riwayat perbaikan untuk unit ini.
                                                                </p>
                                                            )}
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
                                    <div className="mx-auto max-w-sm space-y-2">
                                        <p className="text-sm font-medium">Tidak ada equipment yang cocok</p>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Coba ubah filter status, kata kunci pencarian, atau urutan tabel.
                                        </p>
                                        {activeChip !== "all" && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5"
                                                onClick={() => onStatusFilterChange?.("all")}
                                            >
                                                <X className="h-3.5 w-3.5" /> Tampilkan semua status
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* PAGINASI */}
            {sorted.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                        <Hash className="h-3.5 w-3.5" />
                        Menampilkan {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)}{" "}
                        dari {sorted.length.toLocaleString("id-ID")} unit
                    </p>

                    {totalPages > 1 && (
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
                                            const val = parseInt(e.target.value)
                                            if (!isNaN(val)) setPage(Math.min(Math.max(1, val), totalPages))
                                        }}
                                        className="h-8 w-16 rounded-md border border-input bg-background text-center text-sm"
                                    />
                                    <span className="text-sm text-muted-foreground">dari {totalPages}</span>
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
                    )}
                </div>
            )}
        </div>
    )
}

export const EquipmentTable = memo(EquipmentTableImpl)

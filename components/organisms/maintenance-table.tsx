"use client"

import React, { memo, useEffect, useMemo, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
    ArrowUpDown,
    CalendarRange,
    ChevronDown,
    ChevronUp,
    CircleDollarSign,
    Hash,
    Layers,
    TrendingUp,
    X,
} from "lucide-react"
import { StatTile } from "@/components/molecules/stat-tile"
// Format nominal & tanggal kini dari lib bersama (satu sumber untuk semua menu)
import {
    compactRupiah,
    formatDateMedium,
    formatRupiah,
    periodLabel,
    relativeDayLabel,
} from "@/lib/format"

interface MaintenanceTableProps {
    /** Seluruh riwayat yang sudah difilter pencarian dari halaman induk */
    histories: any[]
    isLoading: boolean
}

type SortKey = "dateDesc" | "dateAsc" | "costDesc" | "costAsc"
type RangeKey = "all" | "30d" | "3m" | "6m" | "1y"

const RANGE_OPTIONS: { id: RangeKey; label: string; days?: number }[] = [
    { id: "all", label: "Semua" },
    { id: "30d", label: "30 hari", days: 30 },
    { id: "3m", label: "3 bulan", days: 90 },
    { id: "6m", label: "6 bulan", days: 182 },
    { id: "1y", label: "1 tahun", days: 365 },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/* ── Format & util ───────────────────────────────────────────────────────── */

function toDate(value: string): Date | null {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

function weekdayShort(iso: string): string {
    const d = toDate(iso)
    if (!d) return ""
    return d.toLocaleDateString("id-ID", { weekday: "short" })
}

function monthKey(iso: string): string {
    const d = toDate(iso)
    return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "0"
}

function monthLabel(iso: string): string {
    const d = toDate(iso)
    if (!d) return "Tanpa tanggal"
    return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" })
}

/* ── Baris isi tabel: pemisah bulan atau data ────────────────────────────── */

type BodyItem =
    | { type: "month"; key: string; label: string; count: number; total: number }
    | { type: "row"; key: string; hist: any; index: number }

const COLUMN_COUNT = 5

function MaintenanceTableImpl({ histories, isLoading }: MaintenanceTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("dateDesc")
    const [range, setRange] = useState<RangeKey>("all")
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
    const [page, setPage] = useState(1)

    // 1. Filter rentang waktu (di atas data yang sudah difilter pencarian)
    const rangeRows = useMemo(() => {
        const opt = RANGE_OPTIONS.find((o) => o.id === range)
        if (!opt?.days) return histories
        const cutoff = new Date()
        cutoff.setHours(0, 0, 0, 0)
        cutoff.setDate(cutoff.getDate() - opt.days)
        return histories.filter((h) => {
            const d = toDate(h.tanggal)
            return d ? d >= cutoff : false
        })
    }, [histories, range])

    // 2. Urutkan
    const rows = useMemo(() => {
        const arr = [...rangeRows]
        const cost = (h: any) => Number(h.jumlah_harga) || 0
        const time = (h: any) => toDate(h.tanggal)?.getTime() ?? 0
        switch (sortKey) {
            case "dateAsc":
                arr.sort((a, b) => time(a) - time(b))
                break
            case "costDesc":
                arr.sort((a, b) => cost(b) - cost(a))
                break
            case "costAsc":
                arr.sort((a, b) => cost(a) - cost(b))
                break
            default:
                arr.sort((a, b) => time(b) - time(a))
        }
        return arr
    }, [rangeRows, sortKey])

    const isDateSort = sortKey === "dateDesc" || sortKey === "dateAsc"

    // 3. Ringkasan dari data yang sedang tampil
    const stats = useMemo(() => {
        let total = 0
        let min: string | null = null
        let max: string | null = null
        const units = new Set<string>()
        for (const h of rows) {
            total += Number(h.jumlah_harga) || 0
            const t = toDate(h.tanggal)?.getTime()
            if (t != null) {
                if (min == null || t < new Date(min).getTime()) min = h.tanggal
                if (max == null || t > new Date(max).getTime()) max = h.tanggal
            }
            if (h.equipment_id) units.add(String(h.equipment_id))
        }
        const count = rows.length
        return {
            count,
            total,
            average: count > 0 ? total / count : 0,
            units: units.size,
            min,
            max,
        }
    }, [rows])

    const maxCost = useMemo(
        () => rows.reduce((m, h) => Math.max(m, Number(h.jumlah_harga) || 0), 0),
        [rows],
    )

    // 4. Subtotal per bulan (dihitung dari seluruh rentang, bukan hanya halaman aktif)
    const monthTotals = useMemo(() => {
        const m = new Map<string, { label: string; count: number; total: number }>()
        for (const h of rows) {
            const k = monthKey(h.tanggal)
            const prev = m.get(k)
            const c = Number(h.jumlah_harga) || 0
            if (prev) {
                prev.count += 1
                prev.total += c
            } else {
                m.set(k, { label: monthLabel(h.tanggal), count: 1, total: c })
            }
        }
        return m
    }, [rows])

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
    const currentPage = Math.min(page, totalPages)

    const pageRows = useMemo(
        () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [rows, currentPage, pageSize],
    )

    // Pindah ke halaman 1 ketika daftar/filter berubah; halaman selalu di-clamp ke rentang valid
    useEffect(() => {
        setPage(1)
    }, [rows.length, range, sortKey, pageSize])

    const body: BodyItem[] = useMemo(() => {
        const items: BodyItem[] = []
        let lastMonth: string | null = null
        pageRows.forEach((h, i) => {
            const mk = monthKey(h.tanggal)
            if (isDateSort && mk !== lastMonth) {
                const totals = monthTotals.get(mk)
                if (totals) items.push({ type: "month", key: `m-${mk}-${currentPage}`, ...totals })
                lastMonth = mk
            }
            items.push({
                type: "row",
                key: String(h.id ?? `${h.equipment_id}-${h.tanggal}-${i}`),
                hist: h,
                index: (currentPage - 1) * pageSize + i + 1,
            })
        })
        return items
    }, [pageRows, isDateSort, monthTotals, currentPage, pageSize])

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-xl border bg-card px-4 py-3">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="mt-3 h-5 w-28" />
                        </div>
                    ))}
                </div>
                <div className="overflow-hidden rounded-xl border bg-card">
                    <div className="space-y-3 p-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-9 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* RINGKASAN — biar nominal besar langsung terbaca tanpa menjumlah manual */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Entri riwayat"
                    value={stats.count.toLocaleString("id-ID")}
                    hint={range === "all" ? "seluruh rentang data" : `dalam ${RANGE_OPTIONS.find((o) => o.id === range)?.label}`}
                    icon={<Hash className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Total biaya"
                    value={compactRupiah(stats.total)}
                    hint={formatRupiah(stats.total)}
                    title={formatRupiah(stats.total)}
                    icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                    emphasis
                />
                <StatTile
                    label="Rata-rata / entri"
                    value={compactRupiah(stats.average)}
                    hint={formatRupiah(stats.average)}
                    title={formatRupiah(stats.average)}
                    icon={<TrendingUp className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Unit terlibat"
                    value={stats.units.toLocaleString("id-ID")}
                    hint={periodLabel(stats.min, stats.max)}
                    icon={<Layers className="h-3.5 w-3.5" />}
                />
            </div>

            {/* KONTROL: rentang cepat, urutan, jumlah baris */}
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-1.5">
                    {RANGE_OPTIONS.map((opt) => {
                        const active = range === opt.id
                        return (
                            <Button
                                key={opt.id}
                                variant={active ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setRange(opt.id)}
                                className={active ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card"}
                            >
                                {opt.label}
                            </Button>
                        )
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                        <ArrowUpDown className="h-3.5 w-3.5" /> Urut
                    </span>
                    <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                        <SelectTrigger className="h-8 w-[170px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="dateDesc">Tanggal terbaru</SelectItem>
                            <SelectItem value="dateAsc">Tanggal terlama</SelectItem>
                            <SelectItem value="costDesc">Biaya tertinggi</SelectItem>
                            <SelectItem value="costAsc">Biaya terendah</SelectItem>
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

            {/* TABEL */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[56px] text-right text-xs">#</TableHead>
                            <TableHead className="whitespace-nowrap">
                                <button
                                    type="button"
                                    onClick={() => setSortKey((k) => (k === "dateDesc" ? "dateAsc" : "dateDesc"))}
                                    className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
                                >
                                    Tanggal
                                    {sortKey === "dateAsc" ? (
                                        <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                    ) : sortKey === "dateDesc" ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                                    )}
                                </button>
                            </TableHead>
                            <TableHead className="whitespace-nowrap">Unit</TableHead>
                            <TableHead>Barang / Jasa</TableHead>
                            <TableHead className="text-right whitespace-nowrap">
                                <button
                                    type="button"
                                    onClick={() => setSortKey((k) => (k === "costDesc" ? "costAsc" : "costDesc"))}
                                    className="ml-auto inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
                                >
                                    Biaya
                                    {sortKey === "costAsc" ? (
                                        <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                    ) : sortKey === "costDesc" ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                                    )}
                                </button>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {body.length > 0 ? (
                            body.map((item) => {
                                if (item.type === "month") {
                                    return (
                                        <TableRow key={item.key} className="hover:bg-muted/40">
                                            <TableCell colSpan={COLUMN_COUNT} className="bg-muted/50 py-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                                                            {item.label}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            · {item.count} entri
                                                        </span>
                                                    </div>
                                                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                                        Subtotal {formatRupiah(item.total)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                }

                                const h = item.hist
                                const cost = Number(h.jumlah_harga) || 0
                                const share = maxCost > 0 ? Math.max(2, (cost / maxCost) * 100) : 0
                                const isOutlier = stats.average > 0 && cost >= stats.average * 2

                                return (
                                    <TableRow key={item.key} className="transition-colors hover:bg-muted/40">
                                        <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                            {item.index}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap py-2.5">
                                            <div className="text-sm tabular-nums">{formatDateMedium(h.tanggal)}</div>
                                            <div className="mt-0.5 text-xs text-muted-foreground">
                                                {weekdayShort(h.tanggal)}
                                                {weekdayShort(h.tanggal) && relativeDayLabel(h.tanggal) ? " · " : ""}
                                                {relativeDayLabel(h.tanggal)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <div className="font-medium leading-none">{h.equipment_id}</div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {h.license_plate || "—"}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <span
                                                className="block max-w-[320px] truncate text-sm"
                                                title={h.nama_barang_atau_jasa || ""}
                                            >
                                                {h.nama_barang_atau_jasa || "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <div className="flex flex-col items-end gap-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    {isOutlier && (
                                                        <TrendingUp
                                                            className="h-3.5 w-3.5 text-primary"
                                                            aria-label="Dua kali di atas rata-rata"
                                                        />
                                                    )}
                                                    <span className="font-mono text-sm font-medium tabular-nums">
                                                        {formatRupiah(cost)}
                                                    </span>
                                                </div>
                                                <div className="h-1 w-[110px] overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full bg-primary/70"
                                                        style={{ width: `${Math.min(100, share)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={COLUMN_COUNT} className="h-40 text-center">
                                    <div className="mx-auto max-w-sm space-y-2">
                                        <p className="text-sm font-medium">Tidak ada riwayat pada rentang ini</p>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Coba lebarkan rentang waktu, ubah kata kunci pencarian, atau urutkan dengan kriteria lain.
                                        </p>
                                        {range !== "all" && (
                                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRange("all")}>
                                                <X className="h-3.5 w-3.5" /> Tampilkan semua rentang
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
            {rows.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs tabular-nums text-muted-foreground">
                        Menampilkan {(currentPage - 1) * pageSize + 1}–
                        {Math.min(currentPage * pageSize, rows.length)} dari {rows.length.toLocaleString("id-ID")} entri
                        {stats.total > 0 && <> · total {formatRupiah(stats.total)}</>}
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

export const MaintenanceTable = memo(MaintenanceTableImpl)

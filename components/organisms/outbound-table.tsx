"use client"

import React, { memo, useEffect, useMemo, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
    ChevronDown,
    ChevronUp,
    Clock,
    Download,
    LogOut,
    Timer,
    Truck,
    X,
} from "lucide-react"
import { StatTile } from "@/components/molecules/stat-tile"
import { FilterToolbar } from "@/components/molecules/filter-toolbar"
import { APP_TIMEZONE, formatNumber } from "@/lib/format"
import {
    durationMinutesFromTimestamps,
    formatDuration,
    outboundStatus,
    type OutboundStatus,
} from "@/lib/outbound-status"

interface OutboundTableProps {
    /** Baris `armada_outbound` hasil query halaman induk (sudah terfilter tanggal) */
    outbounds: any[]
    isLoading: boolean
    error: string | null
    /** Rentang tanggal aktif — dikirim dari halaman induk (sumber fetch) */
    dateFrom: string
    dateTo: string
    onDateRangeChange: (from: string, to: string) => void
    /** True saat halaman induk sedang menjalankan ulang fetch rentang baru */
    isFetching: boolean
}

type SortKey = "createdDesc" | "createdAsc" | "orderAsc" | "orderDesc"
type StatusFilter = "all" | OutboundStatus

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "menunggu", label: "Menunggu" },
    { id: "berjalan", label: "Berjalan" },
    { id: "selesai", label: "Selesai" },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const COLUMN_COUNT = 7

function toTime(value: string | null | undefined): number {
    if (!value) return 0
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? 0 : t
}

/** freight_order dipakai sebagai id baris; dicadangkan bila kosong */
function rowKey(row: any, index: number): string {
    if (row.freight_order != null) return `fo-${row.freight_order}-${index}`
    if (row.created_at) return `ca-${row.created_at}-${index}`
    return `idx-${index}`
}

/** "3200409499" → "3200409499" (tanpa pemisah — tampil apa adanya) */
function formatFreightOrder(value: any): string {
    if (value == null) return "—"
    return String(value)
}

/** Menit sejak tengah malam → "14:32" */
function menitKeJam(totalMinutes: number): string {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440
    const h = Math.floor(normalized / 60)
    const m = normalized % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * "14:30" — jam:menit untuk kolom `jam_out` / `jam_in`.
 *
 * Nilai di database sudah tersimpan dalam waktu Asia/Jakarta, jadi klien
 * TIDAK lagi menggeser +7 jam — penggeseran itu membuat jam tampil 7 jam
 * lebih maju dari nilai aslinya. Dua bentuk nilai tetap ditangani:
 *  - ada penanda zona ("...T07:11:00+07:00" / "...Z") → konversi resmi ke
 *    Asia/Jakarta, aman lintas zona;
 *  - tanpa penanda zona ("...T07:11:00") → angka di dalam string dipakai
 *    apa adanya sebagai waktu Jakarta.
 */
function formatJam(value: string | null | undefined): string {
    const s = value == null ? "" : String(value).trim()
    if (!s) return "—"

    if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
        const d = new Date(s)
        if (Number.isNaN(d.getTime())) return "—"
        const parts = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: APP_TIMEZONE,
        }).formatToParts(d)
        const h = parts.find((p) => p.type === "hour")?.value ?? "00"
        const m = parts.find((p) => p.type === "minute")?.value ?? "00"
        return `${h}:${m}`
    }

    // Tanpa penanda zona: jam:menit di dalam string sudah waktu Jakarta.
    const match = /(\d{1,2}):(\d{2})/.exec(s)
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "—"
}

/**
 * Menit sejak tengah malam (waktu Jakarta) — diturunkan dari formatJam supaya
 * tabel dan kartu rata-rata selalu menampilkan jam yang identik.
 */
function menitJakarta(value: string | null | undefined): number | null {
    const jam = formatJam(value)
    if (jam === "—") return null
    const [h, m] = jam.split(":").map(Number)
    return h * 60 + m
}

/** "30 Sep 2026" dalam WIB — menerima tanggal YYYY-MM-DD maupun timestamp */
function tanggalWIB(value: string | null | undefined): string {
    const t = toTime(value)
    if (!t) return "—"
    return new Date(t).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: APP_TIMEZONE,
    })
}

function OutboundTableImpl({
    outbounds,
    isLoading,
    error,
    dateFrom,
    dateTo,
    onDateRangeChange,
    isFetching,
}: OutboundTableProps) {
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
    const [sortKey, setSortKey] = useState<SortKey>("createdDesc")
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
    const [page, setPage] = useState(1)

    const searchLower = search.trim().toLowerCase()

    // 1. Pencarian + filter status
    const filtered = useMemo(() => {
        return outbounds.filter((row) => {
            const matchesSearch = searchLower
                ? String(row.no_polisi ?? "").toLowerCase().includes(searchLower) ||
                  String(row.freight_order ?? "").toLowerCase().includes(searchLower)
                : true
            const matchesStatus =
                statusFilter === "all"
                    ? true
                    : outboundStatus(row.jam_out, row.jam_in).status === statusFilter
            return matchesSearch && matchesStatus
        })
    }, [outbounds, searchLower, statusFilter])

    // 2. Urutkan
    const rows = useMemo(() => {
        const arr = [...filtered]
        const order = (r: any) => Number(r.freight_order) || 0
        switch (sortKey) {
            case "createdAsc":
                arr.sort((a, b) => toTime(a.created_at) - toTime(b.created_at))
                break
            case "orderAsc":
                arr.sort((a, b) => order(a) - order(b))
                break
            case "orderDesc":
                arr.sort((a, b) => order(b) - order(a))
                break
            default:
                arr.sort((a, b) => toTime(b.created_at) - toTime(a.created_at))
        }
        return arr
    }, [filtered, sortKey])

    // 3. Ringkasan rata-rata unit keluar per hari/minggu/bulan dihitung dari
    //    seluruh data rentang aktif (bukan hanya halaman tampil).
    const stats = useMemo(() => {
        let selesai = 0
        let berjalan = 0
        let menunggu = 0
        const jamInMinutes: number[] = []
        const jamOutMinutes: number[] = []
        const durations: number[] = []

        for (const row of outbounds) {
            const info = outboundStatus(row.jam_out, row.jam_in)
            if (info.status === "selesai") selesai++
            else if (info.status === "berjalan") berjalan++
            else menunggu++

            // Rata-rata durasi perjalanan: selisih jam_out → jam_in per mobil selesai
            const durasi = durationMinutesFromTimestamps(row.jam_out, row.jam_in)
            if (durasi != null) durations.push(durasi)

            // Rata-rata jam masuk & keluar — memakai helper yang sama dengan
            // kolom tabel, jadi angkanya tidak bisa meleset dari barisnya.
            const masuk = menitJakarta(row.jam_in)
            if (masuk != null) jamInMinutes.push(masuk)

            const keluar = menitJakarta(row.jam_out)
            if (keluar != null) jamOutMinutes.push(keluar)
        }

        return {
            total: outbounds.length,
            selesai,
            berjalan,
            menunggu,
            avgDurasi: durations.length > 0
                ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
                : null,
            durasiCount: durations.length,
            avgJamIn: jamInMinutes.length > 0
                ? Math.round(jamInMinutes.reduce((a, b) => a + b, 0) / jamInMinutes.length)
                : null,
            jamInCount: jamInMinutes.length,
            avgJamOut: jamOutMinutes.length > 0
                ? Math.round(jamOutMinutes.reduce((a, b) => a + b, 0) / jamOutMinutes.length)
                : null,
            jamOutCount: jamOutMinutes.length,
        }
    }, [outbounds])

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
    const currentPage = Math.min(page, totalPages)

    const pageRows = useMemo(
        () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [rows, currentPage, pageSize],
    )

    useEffect(() => {
        setPage(1)
    }, [rows.length, searchLower, statusFilter, sortKey, pageSize])

    // ── EXPORT CSV ────────────────────────────────────────────────────────
    const handleExportCsv = () => {
        const header = ["Freight Order", "No. Polisi", "Jam Out", "Jam In", "Durasi (menit)", "Status"]
        const lines = rows.map((row) => {
            const info = outboundStatus(row.jam_out, row.jam_in)
            const durasi = durationMinutesFromTimestamps(row.jam_out, row.jam_in)
            // Escape CSV + netralkan formula injection (= + - @ tab CR) supaya
            // file aman dibuka di Excel/LibreOffice tanpa mengeksekusi formula.
            const escape = (v: string) => {
                const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
                return `"${safe.replace(/"/g, '""')}"`
            }
            return [
                escape(formatFreightOrder(row.freight_order)),
                escape(String(row.no_polisi ?? "")),
                escape(row.jam_out ?? ""),
                escape(row.jam_in ?? ""),
                durasi == null ? "" : String(durasi),
                escape(info.label),
            ].join(",")
        })
        const csv = [header.join(","), ...lines].join("\r\n")
        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `armada-outbound_${dateFrom}_${dateTo}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

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

    if (error) {
        return (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                <p className="font-medium text-destructive">Gagal memuat data pengiriman</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* RINGKASAN: rata-rata unit keluar per periode */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Total outbound"
                    value={formatNumber(stats.total)}
                    hint={`${formatNumber(stats.selesai)} selesai · ${formatNumber(stats.berjalan)} berjalan · ${formatNumber(stats.menunggu)} menunggu`}
                    icon={<Truck className="h-3.5 w-3.5" />}
                    emphasis
                />
                <StatTile
                    label="Rata-rata durasi"
                    value={formatDuration(stats.avgDurasi)}
                    hint={`${formatNumber(stats.durasiCount)} perjalanan selesai`}
                    icon={<Timer className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Rata-rata jam masuk"
                    value={stats.avgJamIn == null ? "—" : menitKeJam(stats.avgJamIn)}
                    hint={`${formatNumber(stats.jamInCount)} mobil dengan jam in`}
                    icon={<Clock className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Rata-rata jam keluar"
                    value={stats.avgJamOut == null ? "—" : menitKeJam(stats.avgJamOut)}
                    hint={`${formatNumber(stats.jamOutCount)} mobil dengan jam out`}
                    icon={<LogOut className="h-3.5 w-3.5" />}
                />
            </div>

            {/* KONTROL: rentang tanggal, pencarian, urutan, export (susunan sama dengan SKR) */}
            <FilterToolbar
                date={{
                    idPrefix: "outbound",
                    from: dateFrom,
                    to: dateTo,
                    onApply: onDateRangeChange,
                    isFetching,
                }}
                search={{
                    value: search,
                    onChange: setSearch,
                    placeholder: "Cari nomor polisi atau freight order...",
                    hint: search ? `${rows.length.toLocaleString("id-ID")} baris cocok` : "Ctrl + /",
                }}
                actions={
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 bg-card"
                            onClick={handleExportCsv}
                            disabled={rows.length === 0}
                        >
                            <Download className="h-3.5 w-3.5" /> Export CSV
                        </Button>

                        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                            <SelectTrigger className="h-8 w-[150px] bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="createdDesc">Terbaru</SelectItem>
                                <SelectItem value="createdAsc">Terlama</SelectItem>
                                <SelectItem value="orderDesc">Order tertinggi</SelectItem>
                                <SelectItem value="orderAsc">Order terendah</SelectItem>
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
                    </>
                }
            />

            {/* Baris chip status */}
            <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_FILTERS.map((opt) => {
                    const active = statusFilter === opt.id
                    return (
                        <Button
                            key={opt.id}
                            variant={active ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setStatusFilter(opt.id)}
                            className={
                                active
                                    ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "bg-card"
                            }
                        >
                            {opt.label}
                        </Button>
                    )
                })}
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
                                    onClick={() => setSortKey((k) => (k === "orderAsc" ? "orderDesc" : "orderAsc"))}
                                    className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
                                >
                                    Freight Order
                                    {sortKey === "orderAsc" ? (
                                        <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                    ) : sortKey === "orderDesc" ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                                    )}
                                </button>
                            </TableHead>
                            <TableHead className="whitespace-nowrap">No. Polisi</TableHead>
                            <TableHead className="whitespace-nowrap">Jam Out (WIB)</TableHead>
                            <TableHead className="whitespace-nowrap">Jam In (WIB)</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Durasi</TableHead>
                            <TableHead className="whitespace-nowrap">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pageRows.length > 0 ? (
                            pageRows.map((row, i) => {
                                const info = outboundStatus(row.jam_out, row.jam_in)
                                const durasi = durationMinutesFromTimestamps(row.jam_out, row.jam_in)
                                return (
                                    <TableRow key={rowKey(row, i)} className="transition-colors hover:bg-muted/40">
                                        <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                            {(currentPage - 1) * pageSize + i + 1}
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <div className="font-mono text-sm font-medium tabular-nums">
                                                {formatFreightOrder(row.freight_order)}
                                            </div>
                                            {row.created_at && (
                                                <div className="mt-0.5 text-xs text-muted-foreground">
                                                    {tanggalWIB(row.created_at)}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <span className="whitespace-nowrap text-sm">
                                                {row.no_polisi || "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-2.5 font-mono text-sm tabular-nums">
                                            {formatJam(row.jam_out)}
                                        </TableCell>
                                        <TableCell className="py-2.5 font-mono text-sm tabular-nums">
                                            {formatJam(row.jam_in)}
                                        </TableCell>
                                        <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums text-muted-foreground">
                                            {formatDuration(durasi)}
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <Badge variant="outline" className={info.className}>
                                                {info.label}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={COLUMN_COUNT} className="h-40 text-center">
                                    <div className="mx-auto max-w-sm space-y-2">
                                        <p className="text-sm font-medium">
                                            Tidak ada data pengiriman
                                        </p>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            {outbounds.length === 0
                                                ? `Tidak ada outbound pada rentang ${tanggalWIB(dateFrom)} – ${tanggalWIB(dateTo)}. Coba lebarkan rentangnya.`
                                                : "Coba kata kunci lain atau pilih filter status yang berbeda."}
                                        </p>
                                        {(search || statusFilter !== "all") && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5"
                                                onClick={() => {
                                                    setSearch("")
                                                    setStatusFilter("all")
                                                }}
                                            >
                                                <X className="h-3.5 w-3.5" /> Bersihkan filter
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
                        {Math.min(currentPage * pageSize, rows.length)} dari{" "}
                        {formatNumber(rows.length)} outbound
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
                                            if (!Number.isNaN(val)) setPage(Math.min(Math.max(1, val), totalPages))
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

export const OutboundTable = memo(OutboundTableImpl)

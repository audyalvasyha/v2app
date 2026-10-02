"use client"

import React, { memo, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
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
    ArrowUpDown,
    ChevronDown,
    ChevronUp,
    CircleDollarSign,
    Disc3,
    Download,
    Info,
    Layers,
    Package,
    TrendingUp,
    X,
} from "lucide-react"
import { StatTile } from "@/components/molecules/stat-tile"
import { SearchField } from "@/components/molecules/search-field"
import {
    BAN_CATEGORY_LABELS,
    BAN_POSITION_LABELS,
    banByUnit,
    banMonthly,
    banTotals,
    toBanRows,
    type BanCategory,
    type BanMonthlyPoint,
    type BanPosition,
    type BanRow,
} from "@/lib/ban-analytics"
import {
    compactRupiah,
    formatDateMedium,
    formatNumber,
    formatRupiah,
    periodLabel,
    relativeDayLabel,
} from "@/lib/format"

// Grafik lewat boundary recharts yang sama dengan menu lain, supaya library
// ini hanya dibuat satu chunk untuk seluruh aplikasi.
const BanMonthChart = dynamic(
    () => import("@/components/molecules/charts").then((m) => m.BanMonthChart),
    { loading: () => <Skeleton className="h-[240px] w-full" /> },
)

interface BanAnalysisProps {
    /** Seluruh riwayat perbaikan (sudah termasuk kolom nama_barang_atau_jasa & jumlah_harga) */
    histories: any[]
    isLoading: boolean
    error: string | null
}

type SortKey = "dateDesc" | "dateAsc" | "costDesc" | "costAsc"
type RangeKey = "all" | "90d" | "180d" | "365d"

const RANGE_OPTIONS: { id: RangeKey; label: string; days?: number }[] = [
    { id: "all", label: "Semua" },
    { id: "90d", label: "3 bulan", days: 90 },
    { id: "180d", label: "6 bulan", days: 180 },
    { id: "365d", label: "1 tahun", days: 365 },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const COLUMN_COUNT = 7

const CATEGORY_FILTERS: { id: BanCategory | "all"; label: string }[] = [
    { id: "all", label: "Semua jenis" },
    { id: "ganti", label: BAN_CATEGORY_LABELS.ganti },
    { id: "perbaikan", label: BAN_CATEGORY_LABELS.perbaikan },
    { id: "aksesori", label: BAN_CATEGORY_LABELS.aksesori },
    { id: "lainnya", label: BAN_CATEGORY_LABELS.lainnya },
]

const POSITION_FILTERS: { id: BanPosition | "all"; label: string }[] = [
    { id: "all", label: "Semua posisi" },
    { id: "depan", label: BAN_POSITION_LABELS.depan },
    { id: "belakang", label: BAN_POSITION_LABELS.belakang },
    { id: "serap", label: BAN_POSITION_LABELS.serap },
    { id: "campuran", label: BAN_POSITION_LABELS.campuran },
]

/** Jumlah hari ke belakang, dihitung dari tengah malam WIB. */
function cutoffDays(days: number): number {
    const now = new Date()
    const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const todayUtc = Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate())
    return todayUtc - days * 86_400_000 - 7 * 60 * 60 * 1000
}

/** "2026-02-09" → epoch ms tengah malam WIB */
function isoToTime(iso: string | null): number | null {
    if (!iso) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!m) return null
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 7 * 60 * 60 * 1000
}

/** Badge warna per jenis pekerjaan — oranye untuk penggantian, hijau untuk perbaikan. */
const CATEGORY_CLASS: Record<BanCategory, string> = {
    ganti: "border-primary/30 bg-primary/10 text-primary",
    perbaikan: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    aksesori: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    lainnya: "text-muted-foreground",
}

function BanAnalysisImpl({ histories, isLoading, error }: BanAnalysisProps) {
    const [search, setSearch] = useState("")
    const [range, setRange] = useState<RangeKey>("all")
    const [category, setCategory] = useState<BanCategory | "all">("all")
    const [position, setPosition] = useState<BanPosition | "all">("all")
    const [sortKey, setSortKey] = useState<SortKey>("dateDesc")
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
    const [page, setPage] = useState(1)

    // 1. Klasifikasi sekali saja per daftar riwayat. Semua angka di halaman ini
    //    diturunkan dari hasil saringan yang sama, jadi kartu, grafik, dan
    //    tabel tidak mungkin menghitung hal yang berbeda.
    const allRows = useMemo(() => toBanRows(histories ?? []), [histories])
    const allTotals = useMemo(() => banTotals(allRows), [allRows])

    const searchLower = search.trim().toLowerCase()

    // 2. Saring: rentang waktu, jenis, posisi, dan pencarian
    const filtered = useMemo(() => {
        const cutoff = range === "all" ? null : cutoffDays(RANGE_OPTIONS.find((o) => o.id === range)!.days!)
        return allRows.filter((r) => {
            if (cutoff != null) {
                const t = isoToTime(r.iso)
                if (t == null || t < cutoff) return false
            }
            if (category !== "all" && r.category !== category) return false
            if (position !== "all" && r.position !== position) return false
            if (searchLower) {
                const haystack = `${r.plat} ${r.unit} ${r.item}`.toLowerCase()
                if (!haystack.includes(searchLower)) return false
            }
            return true
        })
    }, [allRows, range, category, position, searchLower])

    // 3. Urutkan
    const rows = useMemo(() => {
        const arr = [...filtered]
        const time = (r: BanRow) => isoToTime(r.iso) ?? 0
        switch (sortKey) {
            case "dateAsc":
                arr.sort((a, b) => time(a) - time(b))
                break
            case "costDesc":
                arr.sort((a, b) => b.cost - a.cost)
                break
            case "costAsc":
                arr.sort((a, b) => a.cost - b.cost)
                break
            default:
                arr.sort((a, b) => time(b) - time(a))
        }
        return arr
    }, [filtered, sortKey])

    // 4. Ringkasan dari data yang sedang difilter (bukan data keseluruhan),
    //    supaya angka kartu selalu menjelaskan isi tabel di bawahnya.
    const stats = useMemo(() => banTotals(rows), [rows])
    const monthly = useMemo<BanMonthlyPoint[]>(() => banMonthly(rows), [rows])
    const topUnits = useMemo(() => banByUnit(rows, 5), [rows])

    const maxCost = useMemo(() => rows.reduce((m, r) => Math.max(m, r.cost), 0), [rows])
    const maxUnitCost = useMemo(
        () => topUnits.reduce((m, u) => Math.max(m, u.cost), 0),
        [topUnits],
    )

    // Berapa entri tiap pilihan filter - supaya chip bisa menampilkan hitungan
    // dan user tahu persis apa yang akan hilang bila memilihnya.
    const categoryCounts = useMemo(() => {
        const m: Record<string, number> = { all: rows.length }
        for (const r of rows) m[r.category] = (m[r.category] ?? 0) + 1
        return m
    }, [rows])
    const positionCounts = useMemo(() => {
        const m: Record<string, number> = { all: rows.length }
        for (const r of rows) {
            if (r.position) m[r.position] = (m[r.position] ?? 0) + 1
        }
        return m
    }, [rows])

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pageRows = useMemo(
        () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [rows, currentPage, pageSize],
    )

    useEffect(() => {
        setPage(1)
    }, [rows.length, searchLower, range, category, position, sortKey, pageSize])

    // ── EXPORT CSV ────────────────────────────────────────────────────────
    const handleExportCsv = () => {
        const header = ["Tanggal", "Unit", "No. Polo", "Uraian", "Jenis", "Posisi", "Jumlah Ban", "Biaya"]
        const escape = (v: string) => {
            // Escape CSV + netralkan formula injection (= + - @ tab CR) supaya
            // file aman dibuka di Excel/LibreOffice tanpa mengeksekusi formula.
            const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
            return `"${safe.replace(/"/g, '""')}"`
        }
        const lines = rows.map((r) =>
            [
                escape(r.iso ?? ""),
                escape(r.unit),
                escape(r.plat),
                escape(r.item),
                escape(BAN_CATEGORY_LABELS[r.category]),
                escape(r.position ? BAN_POSITION_LABELS[r.position] : ""),
                String(r.qty),
                String(r.cost),
            ].join(","),
        )
        const csv = [header.join(","), ...lines].join("\r\n")
        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `analisa-ban_${stats.first ?? "awal"}_${stats.last ?? "akhir"}.csv`
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
                <p className="font-medium text-destructive">Gagal memuat data perbaikan</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
        )
    }

    // Halaman kosong total (bukan karena filter) - jelaskan sumber datanya,
    // supaya user tidak mengira aplikasinya gagal memuat apa pun.
    if (allRows.length === 0) {
        return (
            <div className="rounded-xl border bg-card px-4 py-10 text-center shadow-sm">
                <Disc3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-3 text-sm font-medium">Belum ada catatan ban</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                    Menu ini membaca riwayat perbaikan yang uraiannya menyebut ban
                    (ganti ban, ban dalam, roker, gantungan ban). Kalau tidak muncul di sini,
                    berarti belum ada perbaikan yang tercatat dengan uraian tersebut.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* KARTU RINGKAS */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Biaya ban"
                    value={compactRupiah(stats.cost)}
                    hint={formatRupiah(stats.cost)}
                    title={formatRupiah(stats.cost)}
                    icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                    emphasis
                />
                <StatTile
                    label="Entri ban"
                    value={formatNumber(stats.entries)}
                    hint={`dari ${formatNumber(allTotals.entries)} catatan ban`}
                    icon={<Disc3 className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Ban terpasang"
                    value={formatNumber(stats.qty)}
                    hint={`rata-rata ${compactRupiah(stats.avgPerBan)} per ban`}
                    title={`Rata-rata ${formatRupiah(stats.avgPerBan)} per ban`}
                    icon={<Package className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Unit terdampak"
                    value={formatNumber(stats.units)}
                    hint={periodLabel(stats.first, stats.last)}
                    icon={<Layers className="h-3.5 w-3.5" />}
                />
            </div>

            {/* CATATAN SUMBER DATA - angka ban berasal dari uraian teks */}
            <div className="flex items-start gap-2.5 rounded-xl border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p>
                    Angka di halaman ini dibaca dari kolom uraian pada riwayat perbaikan
                    (mis. &quot;2PCS GANTI BAN BELAKANG KIRI&quot;). Jenis pekerjaan, posisi roda,
                    dan jumlah ban diturunkan dari teks tersebut, jadi catatan yang tidak
                    lengkap menuliskan detailnya bisa membuat baris masuk hitungan
                    &quot;lainnya&quot;.
                </p>
            </div>

            {/* GRAFIK + UNIT TERATAS */}
            <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-xl border bg-card p-4 shadow-sm xl:col-span-2">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold">Biaya ban per bulan</h3>
                        <p className="text-xs text-muted-foreground">
                            {monthly.length > 0
                                ? `${monthly.length} bulan · puncak ${compactRupiah(
                                      monthly.reduce((m, p) => Math.max(m, p.cost), 0),
                                  )}`
                                : "belum ada data"}
                        </p>
                    </div>
                    <BanMonthChart data={monthly} />
                </div>

                <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 text-sm font-semibold">5 unit dengan biaya ban tertinggi</h3>
                    {topUnits.length === 0 ? (
                        <p className="py-8 text-center text-xs text-muted-foreground">
                            Tidak ada unit pada filter ini.
                        </p>
                    ) : (
                        <ul className="space-y-3">
                            {topUnits.map((u, i) => (
                                <li key={u.key}>
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="min-w-0">
                                            <span className="mr-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                                                {i + 1}
                                            </span>
                                            <span className="font-medium">{u.plat || u.unit || "Tanpa plat"}</span>
                                        </div>
                                        <span className="shrink-0 font-mono text-xs tabular-nums">
                                            {compactRupiah(u.cost)}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary/70"
                                            style={{
                                                width: `${maxUnitCost > 0 ? Math.max(3, (u.cost / maxUnitCost) * 100) : 0}%`,
                                            }}
                                        />
                                    </div>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        {formatNumber(u.entries)} entri · {formatNumber(u.qty)} ban
                                        {u.last ? ` · terakhir ${formatDateMedium(u.last)}` : ""}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* KONTROL: pencarian, rentang, urutan, export */}
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
                    <SearchField
                        value={search}
                        onChange={setSearch}
                        placeholder="Cari plat, unit, atau uraian ban..."
                        hint={
                            search
                                ? `${formatNumber(rows.length)} baris cocok`
                                : `${formatNumber(allRows.length)} catatan ban`
                        }
                        className="lg:max-w-sm lg:flex-1"
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {RANGE_OPTIONS.map((opt) => {
                            const active = range === opt.id
                            return (
                                <Button
                                    key={opt.id}
                                    variant={active ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => setRange(opt.id)}
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
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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

            {/* CHIP FILTER: jenis pekerjaan & posisi roda */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Jenis
                    </span>
                    {CATEGORY_FILTERS.map((opt) => {
                        const active = category === opt.id
                        const count = categoryCounts[opt.id] ?? 0
                        return (
                            <Button
                                key={opt.id}
                                variant={active ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setCategory(opt.id)}
                                className={
                                    active
                                        ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90"
                                        : "bg-card"
                                }
                            >
                                {opt.label}
                                <span className={active ? "opacity-80" : "text-muted-foreground"}>
                                    {formatNumber(count)}
                                </span>
                            </Button>
                        )
                    })}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Posisi
                    </span>
                    {POSITION_FILTERS.map((opt) => {
                        const active = position === opt.id
                        const count = positionCounts[opt.id] ?? 0
                        return (
                            <Button
                                key={opt.id}
                                variant={active ? "secondary" : "outline"}
                                size="sm"
                                disabled={count === 0 && !active}
                                onClick={() => setPosition(opt.id)}
                                className={
                                    active
                                        ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90"
                                        : "bg-card"
                                }
                            >
                                {opt.label}
                                <span className={active ? "opacity-80" : "text-muted-foreground"}>
                                    {formatNumber(count)}
                                </span>
                            </Button>
                        )
                    })}
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
                            <TableHead>Uraian barang / jasa</TableHead>
                            <TableHead className="whitespace-nowrap">Jenis</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Ban</TableHead>
                            <TableHead className="whitespace-nowrap text-right">
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
                        {pageRows.length > 0 ? (
                            pageRows.map((r, i) => {
                                const share = maxCost > 0 ? Math.max(2, (r.cost / maxCost) * 100) : 0
                                const isOutlier = stats.avgPerEntry > 0 && r.cost >= stats.avgPerEntry * 3
                                return (
                                    <TableRow
                                        key={`${r.iso ?? "x"}-${r.plat}-${i}`}
                                        className="transition-colors hover:bg-muted/40"
                                    >
                                        <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                            {(currentPage - 1) * pageSize + i + 1}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap py-2.5">
                                            <div className="text-sm tabular-nums">{formatDateMedium(r.iso)}</div>
                                            <div className="mt-0.5 text-xs text-muted-foreground">
                                                {relativeDayLabel(r.iso)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <div className="font-medium leading-none">{r.plat || "—"}</div>
                                            {r.unit && (
                                                <div className="mt-1 text-xs text-muted-foreground">{r.unit}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <span className="block max-w-[320px] truncate text-sm" title={r.item}>
                                                {r.item}
                                            </span>
                                            <div className="mt-1 flex flex-wrap gap-1.5">
                                                {r.position && (
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        {BAN_POSITION_LABELS[r.position]}
                                                    </Badge>
                                                )}
                                                {r.side && (
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        {r.side === "dalam" ? "Inner" : "Outer"}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <Badge variant="outline" className={CATEGORY_CLASS[r.category]}>
                                                {BAN_CATEGORY_LABELS[r.category]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums">
                                            {r.qty > 0 ? r.qty : "—"}
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <div className="flex flex-col items-end gap-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    {isOutlier && (
                                                        <TrendingUp
                                                            className="h-3.5 w-3.5 text-primary"
                                                            aria-label="Tiga kali di atas rata-rata"
                                                        />
                                                    )}
                                                    <span className="font-mono text-sm font-medium tabular-nums">
                                                        {formatRupiah(r.cost)}
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
                                        <p className="text-sm font-medium">Tidak ada catatan ban pada filter ini</p>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Coba lebarkan rentang waktu, pilih jenis atau posisi lain,
                                            atau bersihkan kata kunci pencarian.
                                        </p>
                                        {(search || range !== "all" || category !== "all" || position !== "all") && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5"
                                                onClick={() => {
                                                    setSearch("")
                                                    setRange("all")
                                                    setCategory("all")
                                                    setPosition("all")
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
                        {formatNumber(rows.length)} catatan
                        {stats.cost > 0 && <> · total {formatRupiah(stats.cost)}</>}
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

export const BanAnalysis = memo(BanAnalysisImpl)
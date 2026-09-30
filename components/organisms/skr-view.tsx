"use client"

import React, { memo, useEffect, useMemo, useRef, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/molecules/stat-tile"
import { SkrMonthChart } from "@/components/molecules/skr-month-chart"
import { FilterToolbar } from "@/components/molecules/filter-toolbar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
    ArrowDownRight,
    ArrowUpRight,
    Boxes,
    CalendarRange,
    CircleDollarSign,
    TrendingUp,
    Truck,
    X,
} from "lucide-react"
import {
    compactNilai,
    formatNilai,
    formatQty,
    isoToTanggal,
    SKR_CATEGORIES,
    skrCategory,
    type SkrCategory,
    type SkrDateBounds,
} from "@/lib/skr-status"
import {
    daysInMonth,
    skrRanking,
    skrReasonBreakdown,
    skrTotals,
    type SkrAggregate,
    type SkrMetric,
} from "@/lib/skr-analytics"
import { startOfZonedDayMonthsAgo, zonedParts } from "@/lib/format"

interface SkrViewProps {
    /** Baris `skr_detail` (sudah difilter tanggal oleh halaman induk) */
    details: any[]
    /**
     * Baris untuk grafik: hasil fetch dua bulan (berjalan + sebelumnya) oleh
     * halaman induk. Kosong berarti rentang filter sudah mencakup dua bulan,
     * jadi grafik memakai `details`.
     */
    prevMonthRows: any[]
    /** Peta plat nomor → data equipment untuk memperjelas label armada */
    equipmentByPlate: Map<string, { equipment_id?: string; description?: string }>
    isLoading: boolean
    error: string | null
    /** Rentang tanggal aktif, format YYYY-MM-DD */
    dateFrom: string
    dateTo: string
    onDateRangeChange: (from: string, to: string) => void
    /** Jumlah baris yang berhasil dimuat dari database (sebelum filter tanggal) */
    totalRows: number
    /** Rentang tanggal nyata yang ada di data, untuk umpan balik */
    bounds: SkrDateBounds
    /** true bila data diambil lewat view (filter tanggal di database) */
    usingView: boolean
}

type FilterKey = SkrCategory | "all"
type RankGroup = "armada" | "sales"

interface MonthWindow {
    from: string
    to: string
    label: string
}

/** Bulan kalender (WIB) berjalan & sebelumnya — jendela X-axis grafik. */
function monthWindows(): { current: MonthWindow; previous: MonthWindow } {
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    const window = (p: { year: number; month: number }): MonthWindow => {
        const mm = String(p.month).padStart(2, "0")
        return {
            from: `${p.year}-${mm}-01`,
            to: `${p.year}-${mm}-${String(daysInMonth(p.year, p.month)).padStart(2, "0")}`,
            label: `${bulan[p.month - 1]} ${p.year}`,
        }
    }
    const current = window(zonedParts(new Date())!)
    const previous = window(zonedParts(new Date(startOfZonedDayMonthsAgo(1)))!)
    return { current, previous }
}

function SkrViewImpl({
    details,
    prevMonthRows,
    equipmentByPlate,
    isLoading,
    error,
    dateFrom,
    dateTo,
    onDateRangeChange,
    totalRows,
    bounds,
    usingView,
}: SkrViewProps) {
    const [search, setSearch] = useState("")
    const [categoryFilter, setCategoryFilter] = useState<FilterKey>("all")
    const [metric, setMetric] = useState<SkrMetric>("qty")
    const [rankGroup, setRankGroup] = useState<RankGroup>("armada")

    const searchLower = search.trim().toLowerCase()

    // 1. Pencarian (plat, sales, alasan POD) + filter kategori POD
    //    Hanya kolom yang benar-benar di-fetch view yang dicocokkan.
    const filtered = useMemo(() => {
        return details.filter((row) => {
            const info = skrCategory(row.pod_reason)
            const matchesCategory = categoryFilter === "all" || info.category === categoryFilter
            if (!matchesCategory) return false
            if (!searchLower) return true
            return (
                String(row.license_no ?? "").toLowerCase().includes(searchLower) ||
                String(row.salesman ?? "").toLowerCase().includes(searchLower) ||
                String(row.pod_reason ?? "").toLowerCase().includes(searchLower)
            )
        })
    }, [details, searchLower, categoryFilter])

    // 2. Ringkasan, peringkat, alasan — dari data yang sedang difilter
    const totals = useMemo(() => skrTotals(filtered), [filtered])

    const rankingOptions = useMemo(() => ({ equipmentByPlate }), [equipmentByPlate])
    const ranking = useMemo(
        () => skrRanking(filtered, rankGroup, metric, 5, rankingOptions),
        [filtered, rankGroup, metric, rankingOptions],
    )
    const reasons = useMemo(() => skrReasonBreakdown(filtered, 6), [filtered])

    const hasActiveFilter = searchLower !== "" || categoryFilter !== "all"

    // 3. Grafik dua bulan: sumber data = fetch khusus bila ada, selain itu
    //    details sudah mencakup kedua bulan (rentang "Semua" dsb).
    const monthWindow = useMemo(() => monthWindows(), [])
    const chartRows = prevMonthRows.length > 0 ? prevMonthRows : details

    // Filter yang tidak membuahkan hasil TIDAK menggeser ke menu lain dan tidak
    // mengganti tampilan — dashboard tetap di tempat, hanya muncul peringatan.
    const noRange = !dateFrom && !dateTo
    const emptyByFilter = hasActiveFilter && filtered.length === 0
    const activeCategoryLabel = SKR_CATEGORIES.find((c) => c.id === categoryFilter)?.label
    const filterLabel =
        categoryFilter !== "all"
            ? `kategori ${activeCategoryLabel ?? categoryFilter}`
            : `pencarian "${search.trim()}"`
    const filterRangeLabel = noRange
        ? "pada seluruh data yang dimuat."
        : `pada rentang ${isoToTanggal(dateFrom)} – ${isoToTanggal(dateTo)}.`

    // Toast muncul satu kali saat status berubah dari ada data → tidak ada
    // data, bukan setiap render.
    const wasEmpty = useRef(false)
    useEffect(() => {
        if (emptyByFilter && !wasEmpty.current) {
            toast.warning(`Tidak ada data ${filterLabel}`, {
                description: filterRangeLabel,
            })
        }
        wasEmpty.current = emptyByFilter
    }, [emptyByFilter, filterLabel, filterRangeLabel])

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
                <p className="font-medium text-destructive">Gagal memuat data SKR</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
        )
    }

    // Layar kosong total (tidak ada baris sama sekali pada rentang aktif).
    // Hasil filter kosong TIDAK masuk ke sini — itu hanya memunculkan peringatan.
    if (filtered.length === 0 && !hasActiveFilter) {
        const rangeLabel = noRange
            ? "tanpa batas tanggal"
            : `${isoToTanggal(dateFrom)} – ${isoToTanggal(dateTo)}`

        return (
            <div className="space-y-4">
                <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                    <div className="mx-auto max-w-lg space-y-2">
                        <p className="text-sm font-medium">
                            {totalRows === 0
                                ? "Tabel skr_detail masih kosong"
                                : "Tidak ada baris pada rentang ini"}
                        </p>

                        {totalRows === 0 ? (
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                Query berhasil tetapi tidak ada data sama sekali. Pastikan tabel{" "}
                                <code className="rounded bg-muted px-1">skr_detail</code> sudah berisi data.
                            </p>
                        ) : (
                            <>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Tidak ada baris pada rentang{" "}
                                    <span className="font-medium text-foreground">{rangeLabel}</span>.
                                </p>

                                {bounds.minIso && bounds.maxIso && (
                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                        Rentang data yang tersedia:{" "}
                                        <span className="font-medium text-foreground">
                                            {isoToTanggal(bounds.minIso)} – {isoToTanggal(bounds.maxIso)}
                                        </span>
                                    </p>
                                )}

                                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                                    {!noRange && (
                                        <Button size="sm" className="gap-1.5" onClick={() => onDateRangeChange("", "")}>
                                            <CalendarRange className="h-3.5 w-3.5" /> Tampilkan semua tanggal
                                        </Button>
                                    )}
                                    {bounds.minIso && bounds.maxIso && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() => onDateRangeChange(bounds.minIso!, bounds.maxIso!)}
                                        >
                                            Gunakan rentang data
                                        </Button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* PERINGATAN FILTER KOSONG — tampilan tetap di tempat */}
            {emptyByFilter && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm">
                    <p className="leading-snug">
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                            Tidak ada data {filterLabel}
                        </span>{" "}
                        <span className="text-muted-foreground">{filterRangeLabel}</span>
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 bg-card"
                        onClick={() => {
                            setSearch("")
                            setCategoryFilter("all")
                        }}
                    >
                        <X className="h-3.5 w-3.5" /> Tampilkan semua kategori
                    </Button>
                </div>
            )}

            {/* PERINGATAN MODE CADANGAN */}
            {!usingView && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs leading-relaxed">
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                        Mode lambat aktif.
                    </span>{" "}
                    <span className="text-muted-foreground">
                        View <code className="rounded bg-muted px-1">skr_ringkasan</code> belum dibuat di
                        database, jadi data ditarik penuh lalu difilter di browser. Buat view tersebut di
                        Supabase → SQL Editor untuk membuat filter tanggal berjalan di server.
                    </span>
                </div>
            )}

            {/* RINGKASAN */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Total sisa kiriman (qty)"
                    value={formatQty(totals.qty)}
                    hint={`sum skr_sales_unit · ${totals.rows.toLocaleString("id-ID")} baris data`}
                    icon={<Boxes className="h-3.5 w-3.5" />}
                    emphasis
                />
                <StatTile
                    label="Total nilai"
                    value={compactNilai(totals.nilai)}
                    hint={formatNilai(totals.nilai)}
                    title={formatNilai(totals.nilai)}
                    icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Armada terlibat"
                    value={totals.armada.toLocaleString("id-ID")}
                    hint={`${totals.sales.toLocaleString("id-ID")} sales · ${totals.customer.toLocaleString("id-ID")} customer`}
                    icon={<Truck className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Alasan POD terbanyak"
                    value={reasons[0] ? formatQty(reasons[0].rows, "baris") : "—"}
                    hint={reasons[0]?.reason ?? "Belum ada data pada rentang ini"}
                    title={reasons[0]?.reason}
                    icon={<TrendingUp className="h-3.5 w-3.5" />}
                />
            </div>

            {/* GRAFIK: bulan ini vs bulan lalu, satu sumbu-X 1..31 */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <h3 className="text-sm font-semibold">Perbandingan Bulanan</h3>
                    <p className="text-xs text-muted-foreground">
                        {monthWindow.current.label} vs {monthWindow.previous.label} · per tanggal (1–
                        {daysInMonth(
                            Number(monthWindow.current.from.slice(0, 4)),
                            Number(monthWindow.current.from.slice(5, 7)),
                        )}
                        )
                    </p>
                </div>
                <div className="p-4 pt-2">
                    <SkrMonthChart
                        currentRows={chartRows}
                        previousRows={chartRows}
                        currentIso={{ from: monthWindow.current.from, to: monthWindow.current.to }}
                        previousIso={{ from: monthWindow.previous.from, to: monthWindow.previous.to }}
                        metric={metric}
                        currentLabel={`${monthWindow.current.label} — bulan ini`}
                        previousLabel={`${monthWindow.previous.label} — bulan lalu`}
                    />
                </div>
            </div>

            {/* KONTROL: rentang tanggal + pencarian (susunan sama dengan Pengiriman) */}
            <FilterToolbar
                date={{
                    idPrefix: "skr",
                    from: dateFrom,
                    to: dateTo,
                    onApply: onDateRangeChange,
                }}
                search={{
                    value: search,
                    onChange: setSearch,
                    placeholder: "Cari plat, sales, atau alasan POD...",
                    hint: hasActiveFilter
                        ? `${filtered.length.toLocaleString("id-ID")} baris cocok`
                        : "Ctrl + /",
                }}
            />

            {/* CHIP KATEGORI POD dengan hitungan — sekaligus filter. Kategori
                tanpa data tetap bisa diklik: tampilan tidak berganti, hanya
                muncul peringatan. */}
            <div className="flex flex-wrap items-center gap-1.5">
                {SKR_CATEGORIES.map((opt) => {
                    const active = categoryFilter === opt.id
                    const count =
                        opt.id === "all"
                            ? totals.rows
                            : totals.categories[opt.id as SkrCategory] ?? 0
                    return (
                        <Button
                            key={opt.id}
                            variant={active ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setCategoryFilter(opt.id)}
                            className={
                                active
                                    ? "h-8 border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90"
                                    : count === 0
                                      ? "h-8 bg-card text-muted-foreground/60"
                                      : "h-8 bg-card"
                            }
                        >
                            {opt.label}
                            <span
                                className={
                                    active
                                        ? "ml-1.5 font-mono text-xs tabular-nums opacity-80"
                                        : "ml-1.5 font-mono text-xs tabular-nums text-muted-foreground"
                                }
                            >
                                {count.toLocaleString("id-ID")}
                            </span>
                        </Button>
                    )
                })}
                {hasActiveFilter && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-muted-foreground"
                        onClick={() => {
                            setSearch("")
                            setCategoryFilter("all")
                        }}
                    >
                        <X className="h-3.5 w-3.5" /> Bersihkan filter
                    </Button>
                )}
            </div>

            {/* TOP 5 / BOTTOM 5 — license_no (armada) & salesman */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <div className="flex items-center gap-1">
                        <Button
                            variant={rankGroup === "armada" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7"
                            onClick={() => setRankGroup("armada")}
                        >
                            Armada (license_no)
                        </Button>
                        <Button
                            variant={rankGroup === "sales" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7"
                            onClick={() => setRankGroup("sales")}
                        >
                            Sales (salesman)
                        </Button>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="mr-1 text-xs text-muted-foreground">Diurutkan</span>
                        <Button
                            variant={metric === "qty" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7"
                            onClick={() => setMetric("qty")}
                        >
                            Qty
                        </Button>
                        <Button
                            variant={metric === "nilai" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7"
                            onClick={() => setMetric("nilai")}
                        >
                            Nilai
                        </Button>
                    </div>
                </div>

                <div className="grid xl:grid-cols-2 xl:divide-x">
                    <RankingTable
                        title="5 Teratas"
                        icon={<ArrowUpRight className="h-3.5 w-3.5 text-primary" />}
                        items={ranking.top}
                        metric={metric}
                        rankGroup={rankGroup}
                        equipmentByPlate={equipmentByPlate}
                        highlight
                    />
                    <RankingTable
                        title="5 Terbawah"
                        icon={<ArrowDownRight className="h-3.5 w-3.5 text-amber-500" />}
                        items={ranking.bottom}
                        metric={metric}
                        rankGroup={rankGroup}
                        equipmentByPlate={equipmentByPlate}
                    />
                </div>
            </div>

            {/* SEBARAN ALASAN POD — satu baris per alasan, tinggi baris tetap
                pendek supaya padat dan tidak pernah meluber di layar sempit. */}
            {reasons.length > 0 && (
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                        <h3 className="text-sm font-semibold">Alasan POD Terbanyak</h3>
                        <p className="text-[11px] text-muted-foreground">6 teratas · nilai terbesar</p>
                    </div>
                    <ul className="divide-y">
                        {reasons.map((r, i) => {
                            const max = reasons[0]?.nilai ?? 0
                            return (
                                <li
                                    key={r.reason}
                                    className="flex items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-muted/40"
                                >
                                    <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                        {i + 1}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm" title={r.reason}>
                                        {r.reason}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "hidden h-5 shrink-0 px-1.5 text-[10px] sm:inline-flex",
                                            r.className,
                                        )}
                                    >
                                        {r.label}
                                    </Badge>
                                    <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                        {r.rows.toLocaleString("id-ID")} b
                                    </span>
                                    <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                                        <span
                                            className="block h-full rounded-full bg-primary/70"
                                            style={{ width: `${barWidth(r.nilai, max)}%` }}
                                        />
                                    </span>
                                    <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums">
                                        {compactNilai(r.nilai)}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}

            {/* FOOTER FILTER */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs tabular-nums text-muted-foreground">
                    {hasActiveFilter
                        ? `${filtered.length.toLocaleString("id-ID")} dari ${details.length.toLocaleString("id-ID")} baris sesuai filter`
                        : noRange
                          ? `${details.length.toLocaleString("id-ID")} baris tanpa batas tanggal`
                          : `${details.length.toLocaleString("id-ID")} baris pada rentang ${isoToTanggal(dateFrom)} – ${isoToTanggal(dateTo)}`}
                </p>
            </div>
        </div>
    )
}

interface RankingTableProps {
    title: string
    icon: React.ReactNode
    items: SkrAggregate[]
    metric: SkrMetric
    rankGroup: RankGroup
    equipmentByPlate: Map<string, { equipment_id?: string; description?: string }>
    highlight?: boolean
}

/** Setengah kartu peringkat: 5 teratas atau 5 terbawah dalam satu tabel. */
function RankingTable({ title, icon, items, metric, rankGroup, equipmentByPlate, highlight }: RankingTableProps) {
    if (items.length === 0) {
        return (
            <div className="p-4">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    {icon}
                    {title}
                </div>
                <p className="py-6 text-center text-xs text-muted-foreground">
                    Tidak ada data pada filter ini.
                </p>
            </div>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                    {icon}
                    {title}
                </div>
                <p className="text-xs text-muted-foreground">
                    {rankGroup === "armada" ? "plat nomor" : "salesman"}
                </p>
            </div>
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[40px] text-right text-xs">#</TableHead>
                        <TableHead className="whitespace-nowrap">{rankGroup === "armada" ? "No. Polisi" : "Nama"}</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Nilai</TableHead>
                        <TableHead className="w-[52px] whitespace-nowrap text-right">Item</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item, i) => {
                        const eq = rankGroup === "armada" ? equipmentByPlate.get(item.key) : undefined
                        const sublabel =
                            eq && (eq.equipment_id || eq.description)
                                ? [eq.equipment_id, eq.description].filter(Boolean).join(" · ")
                                : undefined
                        return (
                            <TableRow
                                key={item.key}
                                className={
                                    highlight
                                        ? "transition-colors hover:bg-muted/40"
                                        : "bg-amber-500/[0.04] transition-colors hover:bg-muted/40"
                                }
                            >
                                <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                    {i + 1}
                                </TableCell>
                                <TableCell className="max-w-[180px] py-2.5">
                                    <div className="truncate font-mono text-sm font-medium" title={item.label}>
                                        {item.label}
                                    </div>
                                    {sublabel && (
                                        <div className="truncate text-xs text-muted-foreground" title={sublabel}>
                                            {sublabel}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell
                                    className={
                                        metric === "qty"
                                            ? "py-2.5 text-right font-mono text-sm font-medium tabular-nums"
                                            : "py-2.5 text-right font-mono text-sm tabular-nums text-muted-foreground"
                                    }
                                >
                                    {formatQty(item.qty)}
                                </TableCell>
                                <TableCell
                                    className={
                                        metric === "nilai"
                                            ? "py-2.5 text-right font-mono text-sm font-medium tabular-nums"
                                            : "py-2.5 text-right font-mono text-sm tabular-nums text-muted-foreground"
                                    }
                                >
                                    {compactNilai(item.nilai)}
                                </TableCell>
                                <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                    {item.rows}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}

/** Skala relatif untuk bar indikator di tabel alasan POD. */
function barWidth(value: number, max: number): number {
    if (max <= 0 || !Number.isFinite(value)) return 0
    return Math.max(4, Math.min(100, (value / max) * 100))
}

export const SkrView = memo(SkrViewImpl)

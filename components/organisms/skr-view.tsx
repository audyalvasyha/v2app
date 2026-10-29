"use client"

import React, { memo, useEffect, useMemo, useRef, useState } from "react"
import {
    BadgeCheck,
    ChevronDown,
    CircleDollarSign,
    FileText,
    Store,
    TrendingUp,
    Truck,
    X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/molecules/stat-tile"
import dynamic from "next/dynamic"

// Grafik ikut boundary bersama dengan grafik dashboard (satu chunk recharts).
const SkrMonthChart = dynamic(() =>
    import("@/components/molecules/charts").then((m) => m.SkrMonthChart),
    { loading: () => <Skeleton className="h-[220px] w-full" /> },
)
const SkrReasonPie = dynamic(() =>
    import("@/components/molecules/charts").then((m) => m.SkrReasonPie),
    { loading: () => <Skeleton className="h-[300px] w-full" /> },
)
import { FilterToolbar } from "@/components/molecules/filter-toolbar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
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
    skrCustomerSummary,
    skrRanking,
    skrReasonBreakdown,
    skrTotals,
    type SkrCustomerSummary,
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
    /** Peta customer_id → nama toko (hasil join tabel customers) */
    customerById: Map<string, string>
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
    /** Kata pencarian header aktif → mode fokus: hanya daftar detail baris,
     *  agregasi (KPI/grafik/peringkat) disembunyikan supaya hasil langsung terlihat */
    searchActive?: boolean
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

/**
 * Jendela bulan yang digeser `shift` bulan ke belakang — dipakai saat bulan
 * berjalan belum punya data supaya grafik tetap membandingkan dua bulan
 * yang benar-benar berisi.
 */
function monthWindowsShifted(
    base: { current: MonthWindow; previous: MonthWindow },
    shift: number,
): { current: MonthWindow; previous: MonthWindow } {
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    const shifted = (w: MonthWindow, months: number): MonthWindow => {
        const year = Number(w.from.slice(0, 4))
        const month = Number(w.from.slice(5, 7))
        const zero = year * 12 + (month - 1) - months
        const ny = Math.floor(zero / 12)
        const nm = (zero % 12) + 1
        const mm = String(nm).padStart(2, "0")
        return {
            from: `${ny}-${mm}-01`,
            to: `${ny}-${mm}-${String(daysInMonth(ny, nm)).padStart(2, "0")}`,
            label: `${bulan[nm - 1]} ${ny}`,
        }
    }
    return {
        current: shifted(base.current, shift),
        previous: shifted(base.previous, shift),
    }
}

function SkrViewImpl({
    details,
    prevMonthRows,
    equipmentByPlate,
    customerById,
    isLoading,
    error,
    dateFrom,
    dateTo,
    onDateRangeChange,
    totalRows,
    bounds,
    usingView,
    searchActive,
}: SkrViewProps) {
    // Pencarian (toko/plat/sales/POD) berada di search header — data detail yang
    // masuk sudah terfilter dari DashboardContent; internal menu cukup kategori POD.
    const [categoryFilter, setCategoryFilter] = useState<FilterKey>("all")
    const [metric, setMetric] = useState<SkrMetric>("qty")
    const [rankGroup, setRankGroup] = useState<RankGroup>("armada")
    /** customer_id yang baris detailnya sedang dibuka */
    const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)

    // 1. Filter kategori POD saja — pencarian ke text search header; detail
    //    yang masuk sudah terfilter (prop `details`, dari DashboardContent).
    const filtered = useMemo(() => {
        return details.filter((row) => {
            const info = skrCategory(row.pod_reason)
            return categoryFilter === "all" || info.category === categoryFilter
        })
    }, [details, categoryFilter])

    // 2. Ringkasan, peringkat, alasan, per customer — dari data terfilter
    const totals = useMemo(() => skrTotals(filtered), [filtered])

    const rankingOptions = useMemo(
        () => ({ equipmentByPlate, customerById }),
        [equipmentByPlate, customerById],
    )
    const ranking = useMemo(
        () => skrRanking(filtered, rankGroup, metric, 5, rankingOptions),
        [filtered, rankGroup, metric, rankingOptions],
    )
    const reasons = useMemo(() => skrReasonBreakdown(filtered, 200), [filtered])

    const redeliveryRows = useMemo(
        () => filtered.filter((row) => skrCategory(row.pod_reason).category === "redelivery"),
        [filtered],
    )
    const redeliveryRanking = useMemo(
        () => skrRanking(redeliveryRows, rankGroup, metric, 5, rankingOptions),
        [redeliveryRows, rankGroup, metric, rankingOptions],
    )

    const reasonsByCategory = useMemo(() => {
        type ReasonRow = (typeof reasons)[number]
        const groups = new Map<
            SkrCategory,
            { category: SkrCategory; label: string; className: string; rows: number; nilai: number; reasons: ReasonRow[] }
        >()
        for (const r of reasons) {
            const info = skrCategory(r.reason)
            const g = groups.get(info.category)
            if (g) {
                g.rows += r.rows
                g.nilai += r.nilai
                g.reasons.push(r)
            } else {
                groups.set(info.category, {
                    category: info.category,
                    label: info.label,
                    className: info.className,
                    rows: r.rows,
                    nilai: r.nilai,
                    reasons: [r],
                })
            }
        }
        const list = [...groups.values()]
        for (const g of list) {
            g.reasons = g.reasons.sort((a, b) => b.nilai - a.nilai).slice(0, 3)
        }
        return list.sort((a, b) => b.nilai - a.nilai)
    }, [reasons])

    const customers = useMemo(
        () => skrCustomerSummary(filtered, customerById),
        [filtered, customerById],
    )

    const topCustomers = useMemo(
        () =>
            [...customers]
                .sort((a, b) =>
                    metric === "qty"
                        ? b.qty - a.qty || b.nilai - a.nilai
                        : b.nilai - a.nilai || b.qty - a.qty,
                )
                .slice(0, 5),
        [customers, metric],
    )

    const hasActiveFilter = categoryFilter !== "all"

    // 3. Grafik dua bulan: sumber data = fetch khusus bila ada, selain itu details
    const chartRows = prevMonthRows.length > 0 ? prevMonthRows : details

    const rawWindow = useMemo(() => monthWindows(), [])
    const monthWindow = useMemo(() => {
        const has = (w: MonthWindow) =>
            chartRows.some((r) => r.pod_d && r.pod_d >= w.from && r.pod_d <= w.to)
        if (has(rawWindow.current) || !has(rawWindow.previous)) return rawWindow
        return monthWindowsShifted(rawWindow, 1)
    }, [chartRows, rawWindow])

    const chartTotals = useMemo(() => {
        const slice = (iso: { from: string; to: string }) =>
            chartRows
                .filter((r) => r.pod_d && r.pod_d >= iso.from && r.pod_d <= iso.to)
                .reduce((a, r) => a + (metric === "nilai" ? Number(r.nilai ?? 0) : Number(r.qty ?? 0)), 0)
        return {
            current: slice(monthWindow.current),
            previous: slice(monthWindow.previous),
        }
    }, [chartRows, metric, monthWindow])

    const chartDelta =
        chartTotals.previous > 0
            ? ((chartTotals.previous - chartTotals.current) / chartTotals.previous) * 100
            : null
    const fmtChart = (v: number) =>
        metric === "nilai" ? compactNilai(v) : formatQty(v)

    const noRange = !dateFrom && !dateTo
    const emptyByFilter = hasActiveFilter && filtered.length === 0
    const activeCategoryLabel = SKR_CATEGORIES.find((c) => c.id === categoryFilter)?.label
    // Kata pencarian sekarang hidup di header; label filter layar mengikuti kategori POD aktif
    const filterLabel = `kategori ${activeCategoryLabel ?? "Semua"}`
    const filterRangeLabel = noRange
        ? "pada seluruh data yang dimuat."
        : `pada rentang ${isoToTanggal(dateFrom)} – ${isoToTanggal(dateTo)}.`

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

    // Saat pencarian aktif, hasil kosong dibawa ke mode fokus (kartu detail
    // menampilkan pesan kosong) — JANGAN jatuh ke empty-state rentang tanggal,
    // karena penyebabnya kata pencarian, bukan rentang.
    if (filtered.length === 0 && !hasActiveFilter && !searchActive) {
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
                                            Tampilkan semua tanggal
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

    // ── Mode fokus: kata pencarian header aktif ──
    // User sedang mencari baris spesifik (toko/nopol/dokumen), bukan tren —
    // KPI, grafik, top-5, dan peringkat disembunyikan, yang tampil hanya
    // detail baris yang cocok. Kontrol tanggal & kategori POD tetap ada.
    if (searchActive) {
        return (
            <div className="space-y-4">
                {/* KONTROL — kiri: rentang tanggal; kanan: reset kategori saat aktif */}
                <FilterToolbar
                    date={{
                        idPrefix: "skr-focus",
                        from: dateFrom,
                        to: dateTo,
                        onApply: onDateRangeChange,
                    }}
                    actions={
                        hasActiveFilter ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-muted-foreground"
                                onClick={() => setCategoryFilter("all")}
                            >
                                <X className="h-3.5 w-3.5" /> Bersihkan filter
                            </Button>
                        ) : undefined
                    }
                />

                {/* CHIP KATEGORI POD — membantu menyekop jenis dokumen dari hasil */}
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
                </div>

                {/* Daftar detail baris — inti mode fokus */}
                <SearchDetailRows details={filtered} customerById={customerById} />

                <p className="text-xs tabular-nums text-muted-foreground">
                    {filtered.length.toLocaleString("id-ID")} baris hasil · kosongkan kata pencarian di header untuk kembali ke ringkasan lengkap
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
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
                            setCategoryFilter("all")
                        }}
                    >
                        Tampilkan semua kategori
                    </Button>
                </div>
            )}

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
                    label="Sisa kiriman"
                    value={formatQty(totals.qty)}
                    hint={
                        noRange
                            ? `${totals.rows.toLocaleString("id-ID")} baris · tanpa batas tanggal`
                            : `${totals.rows.toLocaleString("id-ID")} baris · ${isoToTanggal(dateFrom)} – ${isoToTanggal(dateTo)}`
                    }
                    icon={<Truck className="h-3.5 w-3.5" />}
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
                    label="Toko terlibat"
                    value={totals.customer.toLocaleString("id-ID")}
                    hint={`${totals.armada.toLocaleString("id-ID")} armada · ${totals.sales.toLocaleString("id-ID")} sales`}
                    icon={<Store className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Alasan POD terbanyak"
                    value={reasons[0] ? formatQty(reasons[0].rows, "baris") : "—"}
                    hint={reasons[0]?.reason ?? "Belum ada data pada rentang ini"}
                    title={reasons[0]?.reason}
                    icon={<TrendingUp className="h-3.5 w-3.5" />}
                />
            </div>

            {/* KONTROL — kiri: rentang tanggal; kanan: reset filter kategori saat aktif */}
            <FilterToolbar
                date={{
                    idPrefix: "skr",
                    from: dateFrom,
                    to: dateTo,
                    onApply: onDateRangeChange,
                }}
                actions={
                    hasActiveFilter ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-muted-foreground"
                            onClick={() => setCategoryFilter("all")}
                        >
                            <X className="h-3.5 w-3.5" /> Bersihkan filter
                        </Button>
                    ) : undefined
                }
            />

            {/* CHIP KATEGORI POD */}
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
            </div>

            {/* GRAFIK & SEBARAN ALASAN SKR PER KATEGORI */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b bg-muted/40 px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold">Tren Harian</h3>
                            <span className="text-xs text-muted-foreground">
                                {monthWindow.current.label} vs {monthWindow.previous.label}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                            <span className="mr-1 text-xs text-muted-foreground">Metrik</span>
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
                            <span className="ml-1.5 text-xs text-muted-foreground">
                                qty kolom · nilai garis
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid lg:grid-cols-2">
                    <div className="p-4">
                        <div className="grid gap-px bg-border sm:grid-cols-3">
                            <div className="bg-card px-4 py-3">
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                    {monthWindow.current.label}
                                </p>
                                <p className="mt-1 text-lg font-semibold leading-none tabular-nums text-primary">
                                    {fmtChart(chartTotals.current)}
                                </p>
                            </div>
                            <div className="bg-card px-4 py-3">
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                    {monthWindow.previous.label}
                                </p>
                                <p className="mt-1 text-lg font-semibold leading-none tabular-nums">
                                    {chartTotals.previous > 0 ? fmtChart(chartTotals.previous) : "—"}
                                </p>
                            </div>
                            <div className="bg-card px-4 py-3">
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                    Selisih
                                </p>
                                <p
                                    className={cn(
                                        "mt-1 flex items-center gap-1.5 text-lg font-semibold leading-none tabular-nums",
                                        chartDelta == null
                                            ? "text-muted-foreground"
                                            : chartDelta >= 0
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : "text-primary",
                                    )}
                                >
                                    {chartDelta == null
                                        ? "—"
                                        : `${chartDelta >= 0 ? "+" : "−"}${Math.abs(chartDelta).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
                                </p>
                            </div>
                        </div>

                        <div className="-mx-2 mt-2 ring-1 ring-border">
                            <SkrMonthChart
                                currentRows={chartRows}
                                previousRows={chartRows}
                                currentIso={{ from: monthWindow.current.from, to: monthWindow.current.to }}
                                previousIso={{ from: monthWindow.previous.from, to: monthWindow.previous.to }}
                                currentLabel={monthWindow.current.label}
                                previousLabel={monthWindow.previous.label}
                            />
                        </div>
                    </div>

                    {reasonsByCategory.length > 0 ? (
                        <div className="p-4">
                            <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2">
                                <h3 className="text-sm font-semibold">Sebaran Alasan SKR per Kategori</h3>
                                <p className="text-[11px] text-muted-foreground">porsi nilai per kategori POD</p>
                            </div>
                            <div className="-mx-2 ring-1 ring-border">
                                <SkrReasonPie
                                    data={reasonsByCategory.map((g) => ({
                                        category: g.category,
                                        label: g.label,
                                        rows: g.rows,
                                        nilai: g.nilai,
                                    }))}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="hidden lg:block p-4" />
                    )}
                </div>
            </div>

            {/* DETAIL PER CUSTOMER */}
            <CustomerDetailCard
                items={topCustomers}
                totalCount={customers.length}
                details={filtered}
                metric={metric}
                expandedKey={expandedCustomer}
                onToggle={(key) => setExpandedCustomer((cur) => (cur === key ? null : key))}
            />

            {/* PERINGKAT */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <div className="flex items-center gap-1">
                        {(
                            [
                                ["armada", "Armada"],
                                ["sales", "Sales"],
                            ] as [RankGroup, string][]
                        ).map(([id, label]) => (
                            <Button
                                key={id}
                                variant={rankGroup === id ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7"
                                onClick={() => setRankGroup(id)}
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Top & bottom 5 · metrik{" "}
                        <span className="font-medium text-foreground">
                            {metric === "qty" ? "qty" : "nilai"}
                        </span>{" "}
                        · detail toko di kartu di atas
                    </p>
                </div>

                <div className="grid xl:grid-cols-2 xl:divide-x">
                    <RankingTable
                        title="5 Bottom by"
                        items={ranking.top}
                        metric={metric}
                        rankGroup={rankGroup}
                        equipmentByPlate={equipmentByPlate}
                        highlight
                    />
                    <RankingTable
                        title="5 Bottom Redelivery"
                        items={redeliveryRanking.top}
                        metric={metric}
                        rankGroup={rankGroup}
                        equipmentByPlate={equipmentByPlate}
                        emptyHint="Tidak ada baris redelivery pada filter ini."
                    />
                </div>
            </div>

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

/* ── Daftar detail baris — mode fokus pencarian ────────────────────── */

function SearchDetailRows({
    details,
    customerById,
}: {
    details: any[]
    customerById: Map<string, string>
}) {
    const rows = useMemo(
        () => details.filter((row) => row.salesman !== "-1" && row.salesman !== -1),
        [details],
    )

    return (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <h3 className="text-xs font-semibold">Detail SKR — hasil pencarian</h3>
                    <span className="hidden text-[10px] text-muted-foreground sm:inline">
                        {rows.length.toLocaleString("id-ID")} dokumen · satu baris = satu SKR
                    </span>
                </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
                {rows.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                        Tidak ada baris SKR yang cocok dengan pencarian.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {rows.map((row, i) => {
                            const toko = customerById.get(String(row.customer_id ?? "").trim())
                            return (
                                <li
                                    key={`${row.pod_d ?? "x"}-${row.delivery_number ?? "no-num"}-${i}`}
                                    className="flex items-center gap-3 px-3 py-2 text-xs transition-colors hover:bg-muted/30"
                                >
                                    <span className="w-24 shrink-0 font-mono tabular-nums text-muted-foreground">
                                        {row.pod_d ? isoToTanggal(row.pod_d) : "—"}
                                    </span>
                                    <span
                                        className="w-32 shrink-0 truncate font-mono font-medium"
                                        title={row.delivery_number ?? ""}
                                    >
                                        {row.delivery_number || "—"}
                                    </span>
                                    <span
                                        className="w-28 shrink-0 truncate font-mono font-medium"
                                        title={row.license_no ?? ""}
                                    >
                                        {row.license_no || "—"}
                                    </span>
                                    <span
                                        className="hidden w-32 shrink-0 truncate text-muted-foreground md:block"
                                        title={
                                            row.salesman_nama
                                                ? `${row.salesman_nama} (${row.salesman})`
                                                : (row.salesman ?? "")
                                        }
                                    >
                                        {row.salesman_nama || row.salesman || "—"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate" title={toko ?? ""}>
                                        {toko || "(toko tidak terdaftar)"}
                                    </span>
                                    <span
                                        className="hidden min-w-0 flex-1 truncate text-muted-foreground lg:block"
                                        title={row.pod_reason ?? ""}
                                    >
                                        {row.pod_reason || "(tanpa alasan)"}
                                    </span>
                                    <span className="w-14 shrink-0 text-right font-mono tabular-nums">
                                        {formatQty(row.qty ?? 0)}
                                    </span>
                                    <span className="w-20 shrink-0 text-right font-mono font-medium tabular-nums">
                                        {compactNilai(Number(row.nilai) || 0)}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}

/* ── Detail per customer ──────────────────────────────────────────────── */

interface CustomerDetailCardProps {
    items: SkrCustomerSummary[]
    totalCount: number
    details: any[]
    metric: SkrMetric
    expandedKey: string | null
    onToggle: (key: string) => void
}

function CustomerDetailCard({
    items,
    totalCount,
    details,
    metric,
    expandedKey,
    onToggle,
}: CustomerDetailCardProps) {
    const totalDocs = items.reduce((s, c) => s + c.docs, 0)
    const totalQty = items.reduce((s, c) => s + c.qty, 0)
    const totalNilai = items.reduce((s, c) => s + c.nilai, 0)

    const lastPodByKey = useMemo(() => {
        const map = new Map<string, string>()
        for (const row of details) {
            const key = row.customer_id == null ? "" : String(row.customer_id).trim()
            if (!key) continue
            const d = row.pod_d
            if (d && d > (map.get(key) ?? "")) map.set(key, d)
        }
        return map
    }, [details])

    if (items.length === 0) return null

    return (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <h3 className="text-xs font-semibold">5 Bottom SKR by Customer</h3>
                    <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
                        dari {totalCount.toLocaleString("id-ID")} customer · klik baris untuk rincian dokumen
                    </span>
                </div>
                <p className="shrink-0 text-[10px] text-muted-foreground">
                    Diurutkan {metric === "qty" ? "Qty" : "Nilai"} terbesar
                </p>
            </div>

            <div className="flex items-center gap-2 border-b px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                <span className="min-w-0 flex-[3]">Customer</span>
                <span className="w-10 shrink-0 text-right">Dok</span>
                <span className="w-14 shrink-0 text-right">Qty</span>
                <span className="w-20 shrink-0 text-right">Nilai</span>
            </div>

            <ul className="divide-y">
                {items.map((c, rank) => {
                    const open = expandedKey === c.key
                    const lastPod = lastPodByKey.get(c.key)
                    const docRows = open
                        ? details
                            .filter(
                                (row) =>
                                    (row.customer_id == null ? "" : String(row.customer_id).trim()) === c.key,
                            )
                            .sort((a, b) => (b.pod_d ?? "").localeCompare(a.pod_d ?? ""))
                        : []
                    return (
                        <li key={c.key} className={cn(open && "bg-muted/40")}>
                            <button
                                type="button"
                                onClick={() => onToggle(c.key)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
                                aria-expanded={open}
                            >
                                <span className="min-w-0 flex-[3]">
                                    <span className="flex items-center gap-1">
                                        <span
                                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[9px] font-semibold text-primary"
                                            title={`Ranking ke-${rank + 1} dari 5 customer dengan SKR terbesar`}
                                        >
                                            {rank + 1}
                                        </span>
                                        <span className="truncate text-xs font-medium" title={c.nama}>
                                            {c.nama}
                                        </span>
                                        {c.known ? (
                                            <BadgeCheck className="h-3 w-3 shrink-0 text-primary/70" />
                                        ) : null}
                                    </span>
                                    <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground">
                                        {c.known ? `ID ${c.key}` : "ID tidak terdaftar di tabel customers"}
                                        {" · "}
                                        {c.armada} armada
                                        {lastPod ? ` · ${isoToTanggal(lastPod)}` : ""}
                                    </span>
                                </span>
                                <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums">
                                    {c.docs.toLocaleString("id-ID")}
                                </span>
                                <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums">
                                    {formatQty(c.qty)}
                                </span>
                                <span className="w-20 shrink-0 text-right font-mono text-xs font-medium tabular-nums">
                                    {compactNilai(c.nilai)}
                                </span>
                                <ChevronDown
                                    className={cn(
                                        "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                        open && "rotate-180",
                                    )}
                                />
                            </button>

                            {open && (
                                <div className="border-t bg-muted/20 px-3 py-1.5">
                                    {docRows.length === 0 ? (
                                        <p className="py-3 text-center text-xs text-muted-foreground">
                                            Tidak ada dokumen pada filter ini.
                                        </p>
                                    ) : (
                                        <ul className="divide-y">
                                            {docRows.filter((row) => row.salesman !== "-1" && row.salesman !== -1).map((row, i) => (
                                                <li
                                                    key={`${row.pod_d ?? "x"}-${row.delivery_number ?? "no-num"}-${i}`}
                                                    className="flex items-center gap-3 py-1 text-xs"
                                                >
                                                    <span
                                                        className="w-32 shrink-0 truncate font-mono font-medium"
                                                        title={row.delivery_number ?? ""}
                                                    >
                                                        {row.delivery_number || "—"}
                                                    </span>
                                                    <span className="w-24 shrink-0 font-mono tabular-nums text-muted-foreground">
                                                        {row.pod_d ? isoToTanggal(row.pod_d) : "—"}
                                                    </span>
                                                    <span
                                                        className="w-28 shrink-0 truncate font-mono font-medium"
                                                        title={row.license_no ?? ""}
                                                    >
                                                        {row.license_no || "—"}
                                                    </span>
                                                    <span
                                                        className="hidden w-32 shrink-0 truncate text-muted-foreground md:block"
                                                        title={
                                                            row.salesman_nama
                                                                ? `${row.salesman_nama} (${row.salesman})`
                                                                : (row.salesman ?? "")
                                                        }
                                                    >
                                                        {row.salesman_nama || row.salesman || "—"}
                                                    </span>
                                                    <span
                                                        className="min-w-0 flex-1 truncate text-muted-foreground"
                                                        title={row.pod_reason ?? ""}
                                                    >
                                                        {row.pod_reason || "(tanpa alasan)"}
                                                    </span>
                                                    <span className="w-14 shrink-0 text-right font-mono tabular-nums">
                                                        {formatQty(Number(row.qty ?? 0) || 0)}
                                                    </span>
                                                    <span className="w-20 shrink-0 text-right font-mono tabular-nums">
                                                        {compactNilai(Number(row.nilai ?? 0) || 0)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <FileText className="h-3 w-3" />
                                        {docRows.length.toLocaleString("id-ID")} dokumen ·{" "}
                                        {metric === "qty"
                                            ? `${formatQty(c.qty)} unit`
                                            : formatNilai(c.nilai)}{" "}
                                        total
                                    </p>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>

            <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-3 py-1 text-[10px] text-muted-foreground">
                <span>Total 5 customer ini</span>
                <span className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
                    <span>{totalDocs.toLocaleString("id-ID")} dok</span>
                    <span>{formatQty(totalQty)}</span>
                    <span className="font-medium">{compactNilai(totalNilai)}</span>
                </span>
            </div>
        </div>
    )
}

/* ── Peringkat ────────────────────────────────────────────────────────── */

interface RankingTableProps {
    title: string
    items: import("@/lib/skr-analytics").SkrAggregate[]
    metric: SkrMetric
    rankGroup: RankGroup
    equipmentByPlate: Map<string, { equipment_id?: string; description?: string }>
    highlight?: boolean
    emptyHint?: string
}

function RankingTable({
    title,
    items,
    metric,
    rankGroup,
    equipmentByPlate,
    highlight,
    emptyHint,
}: RankingTableProps) {
    const leadingIcon = title.startsWith("5 Teratas")

    if (items.length === 0) {
        return (
            <div className="p-4">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    {leadingIcon ? (
                        <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                    ) : (
                        <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    {title}
                </div>
                <p className="py-6 text-center text-xs text-muted-foreground">
                    {emptyHint ?? "Tidak ada data pada filter ini."}
                </p>
            </div>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                    {leadingIcon ? (
                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="truncate">{title}</span>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                    {rankGroup === "armada" ? "plat nomor" : "salesman"}
                </p>
            </div>
            <ul className="divide-y">
                {items.map((item, i) => {
                    const eq = rankGroup === "armada" ? equipmentByPlate.get(item.key) : undefined
                    const sublabel =
                        eq && (eq.equipment_id || eq.description)
                            ? [eq.equipment_id, eq.description].filter(Boolean).join(" · ")
                            : undefined
                    return (
                        <li
                            key={item.key}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40",
                                !highlight && "bg-amber-500/[0.04]",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] tabular-nums",
                                    highlight
                                        ? "bg-primary/10 font-semibold text-primary"
                                        : "bg-muted font-medium text-muted-foreground",
                                )}
                            >
                                {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-mono text-sm font-medium" title={item.label}>
                                    {item.label}
                                </div>
                                <div className="flex items-center gap-2">
                                    {sublabel && (
                                        <span className="truncate text-xs text-muted-foreground" title={sublabel}>
                                            {sublabel}
                                        </span>
                                    )}
                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                                        {item.rows} item
                                    </span>
                                </div>
                            </div>
                            <div className="w-24 shrink-0 text-right">
                                <div className="font-mono text-sm font-medium tabular-nums">
                                    {metric === "qty" ? formatQty(item.qty) : compactNilai(item.nilai)}
                                </div>
                                <div className="text-[11px] tabular-nums text-muted-foreground">
                                    {metric === "qty" ? compactNilai(item.nilai) : formatQty(item.qty)}
                                </div>
                            </div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

export const SkrView = memo(SkrViewImpl)
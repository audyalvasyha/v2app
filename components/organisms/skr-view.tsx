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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/molecules/stat-tile"
import dynamic from "next/dynamic"

// Grafik ikut boundary bersama dengan grafik dashboard (satu chunk recharts).
const SkrMonthChart = dynamic(() =>
    import("@/components/molecules/charts").then((m) => m.SkrMonthChart),
    { loading: () => <Skeleton className="h-[220px] w-full" /> },
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
}: SkrViewProps) {
    const [search, setSearch] = useState("")
    const [categoryFilter, setCategoryFilter] = useState<FilterKey>("all")
    const [metric, setMetric] = useState<SkrMetric>("qty")
    const [rankGroup, setRankGroup] = useState<RankGroup>("armada")
    /** customer_id yang baris detailnya sedang dibuka */
    const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)

    const searchLower = search.trim().toLowerCase()

    // 1. Pencarian (plat, sales, alasan POD, nama toko) + filter kategori POD.
    //    Hanya kolom yang benar-benar di-fetch view yang dicocokkan.
    const filtered = useMemo(() => {
        return details.filter((row) => {
            const info = skrCategory(row.pod_reason)
            const matchesCategory = categoryFilter === "all" || info.category === categoryFilter
            if (!matchesCategory) return false
            if (!searchLower) return true
            const custId = row.customer_id == null ? "" : String(row.customer_id).trim()
            const custName = custId ? customerById.get(custId) ?? "" : ""
            return (
                String(row.license_no ?? "").toLowerCase().includes(searchLower) ||
                String(row.salesman ?? "").toLowerCase().includes(searchLower) ||
                String(row.pod_reason ?? "").toLowerCase().includes(searchLower) ||
                custId.toLowerCase().includes(searchLower) ||
                custName.toLowerCase().includes(searchLower)
            )
        })
    }, [details, searchLower, categoryFilter, customerById])

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
    const reasons = useMemo(() => skrReasonBreakdown(filtered, 6), [filtered])

    //_5 Teratas Redelivery: peringkat & alasan difokuskan ke kategori
    // redelivery, menggantikan "5 Terbawah" dan "Alasan POD Terbanyak"
    //(semua alasan) yang sebelumnya menempati dua kartu tersebut.
    const redeliveryRows = useMemo(
        () => filtered.filter((row) => skrCategory(row.pod_reason).category === "redelivery"),
        [filtered],
    )
    const redeliveryRanking = useMemo(
        () => skrRanking(redeliveryRows, rankGroup, metric, 5, rankingOptions),
        [redeliveryRows, rankGroup, metric, rankingOptions],
    )
    const redeliveryReasons = useMemo(
        () => reasons.filter((r) => skrCategory(r.reason).category === "redelivery").slice(0, 5),
        [reasons],
    )
    const customers = useMemo(
        () => skrCustomerSummary(filtered, customerById),
        [filtered, customerById],
    )
    //_5 toko dengan sisa kiriman terbesar — urutan mengikuti metrik aktif
    //(qty atau nilai), tie-break pakai metrik satunya.
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

    const hasActiveFilter = searchLower !== "" || categoryFilter !== "all"

    // 3. Grafik dua bulan: sumber data = fetch khusus bila ada, selain itu
    //    details sudah mencakup kedua bulan (rentang "Semua" dsb).
    const chartRows = prevMonthRows.length > 0 ? prevMonthRows : details

    //    Awal bulan berjalan sering belum ada data sama sekali (upload POD
    //    selalu tertinggal beberapa hari), sehingga kolom "bulan ini" kosong.
    //    Kalau begitu, jendela grafik digeser otomatis ke dua bulan terakhir
    //    yang benar-benar punya data, dan labelnya ikut disesuaikan.
    const rawWindow = useMemo(() => monthWindows(), [])
    const monthWindow = useMemo(() => {
        const has = (w: MonthWindow) =>
            chartRows.some((r) => r.pod_d && r.pod_d >= w.from && r.pod_d <= w.to)
        if (has(rawWindow.current) || !has(rawWindow.previous)) return rawWindow
        //_Bulan berjalan kosong → mundur satu bulan: "current" = bulan lalu,
        //"previous" = dua bulan yang lalu.
        return monthWindowsShifted(rawWindow, 1)
    }, [chartRows, rawWindow])

    // 3b. Total per bulan untuk header grafik — mengikuti metrik aktif.
    // Dua jendela bulan dipangkas dari baris yang sama, lalu disatukan
    // sebelum masuk skrDailySeries agar current & previous tidak saling
    // menghitung baris yang sama dua kali.
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
    // Indikator selisih dibaca dari sisi perbaikan: sisa kiriman (SKR) yang
    // LEBIH RENDAH dari bulan sebelumnya = bagus → tampil +X% hijau.
    // Sebaliknya, naik dari bulan lalu = makin banyak kiriman tersisa
    // → tampil −X% dengan warna primer (perlu perhatian).
    const chartDelta =
        chartTotals.previous > 0
            ? ((chartTotals.previous - chartTotals.current) / chartTotals.previous) * 100
            : null
    const fmtChart = (v: number) =>
        metric === "nilai" ? compactNilai(v) : formatQty(v)

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
                        Tampilkan semua kategori
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
                    placeholder: "Cari toko, plat, sales, atau alasan POD...",
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
                        Bersihkan filter
                    </Button>
                )}
            </div>

            {/* GRAFIK: dua bulan terakhir yang punya data. Metrik aktif
                (qty/nilai) berlaku untuk grafik sekaligus peringkat di
                bawahnya — satu kontrol, dua panel, biar tidak ada angka yang
                dianggap bertentangan. */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">Tren Harian</h3>
                        <span className="text-xs text-muted-foreground">
                            {monthWindow.current.label} vs {monthWindow.previous.label}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
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
                    </div>
                </div>

                {/* Total per bulan + delta — pembaca langsung tahu hasilnya
                    tanpa harus menelusuri garis. */}
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

                <div className="p-4 pt-2">
                    <SkrMonthChart
                        currentRows={chartRows}
                        previousRows={chartRows}
                        currentIso={{ from: monthWindow.current.from, to: monthWindow.current.to }}
                        previousIso={{ from: monthWindow.previous.from, to: monthWindow.previous.to }}
                        metric={metric}
                        currentLabel={monthWindow.current.label}
                        previousLabel={monthWindow.previous.label}
                    />
                </div>
            </div>

            {/* DETAIL PER CUSTOMER — inti pertanyaan "sisa kiriman ini atas
                customer id berapa, nama tokonya siapa, berapa dokumen, qty,
                dan nilainya". Baris bisa dibuka untuk melihat dokumennya. */}
            <CustomerDetailCard
                items={topCustomers}
                totalCount={customers.length}
                details={filtered}
                metric={metric}
                expandedKey={expandedCustomer}
                onToggle={(key) => setExpandedCustomer((cur) => (cur === key ? null : key))}
            />

            {/* PERINGKAT: grup armada/sales/customer, mengikuti metrik aktif */}
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
                        title="5 Teratas"
                        items={ranking.top}
                        metric={metric}
                        rankGroup={rankGroup}
                        equipmentByPlate={equipmentByPlate}
                        highlight
                    />
                    <RankingTable
                        title="5 Teratas Redelivery"
                        items={redeliveryRanking.top}
                        metric={metric}
                        rankGroup={rankGroup}
                        equipmentByPlate={equipmentByPlate}
                        emptyHint="Tidak ada baris redelivery pada filter ini."
                    />
                </div>
            </div>

            {/* SEBARAN ALASAN REDELIVERY — hanya kategori redelivery,
                maksimal 5 baris, tinggi baris tetap pendek supaya padat. */}
            {redeliveryReasons.length > 0 && (
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                        <h3 className="text-sm font-semibold">Alasan Redelivery Terbanyak</h3>
                        <p className="text-[11px] text-muted-foreground">5 teratas · nilai terbesar</p>
                    </div>
                    <ul className="divide-y">
                        {redeliveryReasons.map((r, i) => (
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
                                <span
                                    className="shrink-0 whitespace-nowrap text-right font-mono text-sm font-medium tabular-nums"
                                    title={formatNilai(r.nilai)}
                                >
                                    {compactNilai(r.nilai)}
                                </span>
                            </li>
                        ))}
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

/* ── Detail per customer ──────────────────────────────────────────────── */

interface CustomerDetailCardProps {
    items: SkrCustomerSummary[]
    /** Jumlah customer seluruhnya, untuk keterangan "5 dari N" */
    totalCount: number
    /** Baris terfilter — sumber detail dokumen saat baris dibuka */
    details: any[]
    metric: SkrMetric
    expandedKey: string | null
    onToggle: (key: string) => void
}

/**
 * Kartu "Sisa Kiriman per Toko": 5 toko dengan SKR terbanyak, satu baris
 * per toko (id + nama), kolom jumlah dokumen, qty, dan nilai. Klik baris
 * untuk membuka rincian dokumen SKR-nya.
 */
function CustomerDetailCard({
    items,
    totalCount,
    details,
    metric,
    expandedKey,
    onToggle,
}: CustomerDetailCardProps) {
    if (items.length === 0) return null

    return (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <Store className="h-3.5 w-3.5 text-primary" />
                    <h3 className="text-sm font-semibold">5 Toko dengan SKR Terbesar</h3>
                    <span className="text-xs text-muted-foreground">
                        dari {totalCount.toLocaleString("id-ID")} customer · klik baris untuk detail dokumen
                    </span>
                </div>
                <p className="hidden text-xs text-muted-foreground sm:block">
                    Diurutkan {metric === "qty" ? "qty" : "nilai"} terbesar · Qty = unit · Nilai = rupiah
                </p>
            </div>

            {/* Header kolom */}
            <div className="flex items-center gap-3 border-b px-4 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="min-w-0 flex-1">Customer</span>
                <span className="w-16 shrink-0 text-right">Dokumen</span>
                <span className="w-16 shrink-0 text-right">Qty</span>
                <span className="w-24 shrink-0 text-right">Nilai</span>
                <span className="w-5 shrink-0" />
            </div>

            <ul className="divide-y">
                {items.map((c) => {
                    const open = expandedKey === c.key
                    const docRows = open
                        ? details
                              .filter(
                                  (row) =>
                                      (row.customer_id == null ? "" : String(row.customer_id).trim()) === c.key,
                              )
                              .sort((a, b) => (b.pod_d ?? "").localeCompare(a.pod_d ?? ""))
                        : []
                    return (
                        <li key={c.key} className={cn(open && "bg-muted/30")}>
                            <button
                                type="button"
                                onClick={() => onToggle(c.key)}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                                aria-expanded={open}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium" title={c.nama}>
                                            {c.nama}
                                        </span>
                                        {c.known ? (
                                            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                                        ) : null}
                                    </span>
                                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                                        {c.known ? `ID ${c.key}` : "ID tidak terdaftar di tabel customers"}
                                    </span>
                                </span>
                                <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">
                                    {c.docs.toLocaleString("id-ID")}
                                </span>
                                <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">
                                    {formatQty(c.qty)}
                                </span>
                                <span className="w-24 shrink-0 text-right font-mono text-sm font-medium tabular-nums">
                                    {compactNilai(c.nilai)}
                                </span>
                                <ChevronDown
                                    className={cn(
                                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                        open && "rotate-180",
                                    )}
                                />
                            </button>

                            {open && (
                                <div className="border-t bg-muted/20 px-4 py-2">
                                    {docRows.length === 0 ? (
                                        <p className="py-3 text-center text-xs text-muted-foreground">
                                            Tidak ada dokumen pada filter ini.
                                        </p>
                                    ) : (
                                        <ul className="divide-y">
                                            {docRows.map((row, i) => (
                                                <li
                                                    key={`${row.pod_d ?? "x"}-${row.delivery_number ?? i}`}
                                                    className="flex items-center gap-3 py-1.5 text-xs"
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
                                                        title={row.salesman ?? ""}
                                                    >
                                                        {row.salesman || "—"}
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
    /** Pesan khusus saat daftar kosong (default: pesan umum). */
    emptyHint?: string
}

/** Setengah kartu peringkat: daftar peringkat di dalam satu kartu. */
function RankingTable({
    title,
    items,
    metric,
    rankGroup,
    equipmentByPlate,
    highlight,
    emptyHint,
}: RankingTableProps) {
    // Kartu bernama "5 Teratas*" (termasuk Redelivery) memakai ikon utama
    // supaya sejajar; hanya sisanya yang memakai ikon amber.
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

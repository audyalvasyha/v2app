import React, { memo, useMemo, Suspense } from "react"
import dynamic from "next/dynamic"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/molecules/stat-tile"
import {
    compactRupiah,
    formatDateMedium,
    formatNumber,
    formatRupiah,
    relativeDayLabel,
    startOfZonedDay,
    startOfZonedDayMonthsAgo,
    APP_TIMEZONE,
} from "@/lib/format"
import {
    evaluateServiceStatus,
    remainingDaysLabel,
    remainingKmLabel,
    type ServiceScheduleStatus,
} from "@/lib/service-status"
import { unitStatusTone, unitStatusLabel } from "@/lib/unit-status"
import { cn } from "@/lib/utils"
import type { View } from "@/components/templates/dashboard-layout"
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    CircleDollarSign,
    Clock3,
    Hash,
    ShieldCheck,
    TrendingUp,
    Truck,
    Wrench,
} from "lucide-react"

// Chart di-lazy-load sebagai komponen utuh (chunk terpisah dari bundle dashboard).
// Ketiganya keluar dari modul boundary yang sama (components/molecules/charts)
// supaya Turbopack membuat SATU chunk recharts, bukan salinan per grafik.
const LazyCostChart = dynamic(() =>
    import("@/components/molecules/charts").then((m) => m.CostChart),
)
const LazyUnitCostRankingChart = dynamic(() =>
    import("@/components/molecules/charts").then((m) => m.UnitCostRankingChart),
)

interface DashboardViewProps {
    equipments: any[]
    histories: any[]
    serviceLogs: any[]
    isLoading: boolean
    /** Dipakai tombol pintas "buka menu X" di dalam dashboard */
    onNavigate?: (view: View) => void
}

const DAY_MS = 86_400_000

function DashboardViewImpl({ equipments, histories, serviceLogs, isLoading, onNavigate }: DashboardViewProps) {
    if (isLoading) {
        return <DashboardSkeleton />
    }

    return (
        <DashboardContent
            equipments={equipments}
            histories={histories}
            serviceLogs={serviceLogs}
            onNavigate={onNavigate}
        />
    )
}

// Skeleton dengan bentuk yang sama persis seperti konten — layout tidak "lompat" saat data siap
function DashboardSkeleton() {
    return (
        <div className="flex flex-col gap-4 pb-4">
            {/* Kartu metrik */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card px-4 py-3">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="mt-3 h-5 w-24" />
                    </div>
                ))}
            </div>
            {/* Tren */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-3 w-60" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[260px] w-full rounded-md" />
                </CardContent>
            </Card>
            {/* Peringkat */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-3 w-72" />
                </CardHeader>
                <CardContent>
                    <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
                        <Skeleton className="h-[264px] w-full rounded-md" />
                        <Skeleton className="h-[264px] w-full rounded-md" />
                    </div>
                </CardContent>
            </Card>
            {/* Panel tindakan + distribusi */}
            <div className="grid gap-4 lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <Skeleton className="h-5 w-56" />
                        <Skeleton className="h-3 w-64" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <Skeleton className="h-5 w-44" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-2.5 w-full" />
                        {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <Skeleton className="h-5 w-28" />
                                <Skeleton className="h-5 w-16" />
                            </div>
                        ))}
                        <Skeleton className="h-3 w-full" />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

/** Penanda naik/turun biaya vs periode sebelumnya */
function DeltaBadge({ delta, suffix }: { delta: number | null; suffix?: string }) {
    if (delta == null) {
        return <span className="text-xs text-muted-foreground">Belum ada pembanding</span>
    }
    const up = delta > 0
    const flat = Math.abs(delta) < 0.5
    const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 font-medium",
                flat ? "text-muted-foreground" : up ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
            )}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {flat ? "Stabil" : `${Math.abs(delta).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
            {suffix && <span className="font-normal text-muted-foreground">{suffix}</span>}
        </span>
    )
}

interface UrgentUnit {
    equipment: any
    status: ServiceScheduleStatus
}

function DashboardContent({
    equipments,
    histories,
    serviceLogs,
    onNavigate,
}: {
    equipments: any[]
    histories: any[]
    serviceLogs: any[]
    onNavigate?: (view: View) => void
}) {
    const today = useMemo(() => new Date(), [])

    /**
     * Satu kali jalan untuk semua turunan data (metrik, tren 3 bulan, peringkat
     * 6 bulan, ringkasan 30 hari, status unit, dan prioritas servis) — sebelumnya
     * `histories` dipindai tiga kali terpisah.
     */
    const analytics = useMemo(() => {
        const startOfTodayMs = startOfZonedDay(today)
        const cutoff30 = startOfTodayMs - 30 * DAY_MS
        const cutoff60 = startOfTodayMs - 60 * DAY_MS
        // Rentang tren dipertahankan sama seperti sebelumnya (3 bulan kalender)
        const cutoff3m = new Date(startOfZonedDayMonthsAgo(3, today))
        const cutoff6m = new Date(startOfZonedDayMonthsAgo(6, today))

        let totalCost = 0
        let cost30 = 0
        let costPrev30 = 0
        let entries30 = 0
        let oldest: number | null = null
        let newest: number | null = null

        const byDay3m = new Map<string, number>()
        const byUnit30 = new Map<string, number>()
        const byUnit6m = new Map<string, { totalCost: number; count: number }>()

        for (const h of histories) {
            const time = new Date(h.tanggal).getTime()
            if (Number.isNaN(time)) continue
            const cost = Number(h.jumlah_harga) || 0
            const unit = String(h.equipment_id ?? "").trim()

            totalCost += cost
            if (oldest === null || time < oldest) oldest = time
            if (newest === null || time > newest) newest = time

            if (time >= cutoff30) {
                cost30 += cost
                entries30 += 1
                if (unit) byUnit30.set(unit, (byUnit30.get(unit) ?? 0) + cost)
            } else if (time >= cutoff60) {
                costPrev30 += cost
            }

            if (time >= cutoff3m.getTime()) {
                const dayKey = new Date(time).toISOString().split("T")[0]
                byDay3m.set(dayKey, (byDay3m.get(dayKey) ?? 0) + cost)
            }

            if (time >= cutoff6m.getTime() && unit) {
                const prev = byUnit6m.get(unit)
                if (prev) {
                    prev.totalCost += cost
                    prev.count += 1
                } else {
                    byUnit6m.set(unit, { totalCost: cost, count: 1 })
                }
            }
        }

        // Tren harian (urut dari terlama ke terbaru)
        const trend = Array.from(byDay3m.entries())
            .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
            .map(([date, cost]) => ({
                date,
                displayDate: new Date(date).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    timeZone: APP_TIMEZONE,
                }),
                cost,
            }))
        const trendTotal = trend.reduce((sum, point) => sum + point.cost, 0)
        const peak = trend.reduce<{ cost: number; displayDate: string } | null>(
            (best, point) => (best && best.cost >= point.cost ? best : point),
            null,
        )

        // Peta STDM → nomor polisi untuk label peringkat biaya (tampil nopol, bukan STDM)
        const plateByUnit = new Map<string, string>()
        for (const eq of equipments) {
            const id = String(eq.equipment_id ?? "").trim()
            const plate = String(eq.license_plate ?? "").trim()
            if (id && plate) plateByUnit.set(id, plate)
        }

        // Peringkat biaya per unit (6 bulan)
        const ranking = Array.from(byUnit6m.entries()).map(([equipment_id, v]) => ({
            equipment_id,
            label: plateByUnit.get(equipment_id) ?? equipment_id,
            totalCost: v.totalCost,
            count: v.count,
        }))
        ranking.sort((a, b) => b.totalCost - a.totalCost)

        // Unit paling mahal 30 hari
        const topUnit30Entry = Array.from(byUnit30.entries()).sort((a, b) => b[1] - a[1])[0] ?? null

        // Distribusi status operasional (apa adanya, bukan "total - available")
        const statusCounts = new Map<string, number>()
        let availableCount = 0
        for (const eq of equipments) {
            const raw = String(eq.status ?? "").trim() || "Tidak diketahui"
            statusCounts.set(raw, (statusCounts.get(raw) ?? 0) + 1)
            if (eq.status === "Available") availableCount += 1
        }
        const statusBreakdown = Array.from(statusCounts.entries())
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count)

        // Prioritas servis — pakai aturan bersama dari lib/service-status
        const latestLogByUnit = new Map<string, any>()
        for (const log of serviceLogs) {
            const key = String(log.equipment_id ?? "")
            if (!key) continue
            const existing = latestLogByUnit.get(key)
            if (!existing || new Date(log.service_date).getTime() > new Date(existing.service_date).getTime()) {
                latestLogByUnit.set(key, log)
            }
        }

        const urgent: UrgentUnit[] = []
        let overdueCount = 0
        let warningCount = 0
        let withoutLog = 0
        for (const eq of equipments) {
            const status = evaluateServiceStatus(eq, latestLogByUnit.get(eq.equipment_id) ?? null, today)
            if (status.id === "overdue") overdueCount += 1
            else if (status.id === "warning") warningCount += 1
            else if (status.id === "none") withoutLog += 1
            if (status.id === "overdue" || status.id === "warning") urgent.push({ equipment: eq, status })
        }
        urgent.sort((a, b) => {
            if (a.status.rank !== b.status.rank) return a.status.rank - b.status.rank
            const da = a.status.remainingDays ?? Number.MAX_SAFE_INTEGER
            const db = b.status.remainingDays ?? Number.MAX_SAFE_INTEGER
            if (da !== db) return da - db
            return (a.status.remainingKm ?? Number.MAX_SAFE_INTEGER) - (b.status.remainingKm ?? Number.MAX_SAFE_INTEGER)
        })

        const totalUnits = equipments.length
        const entryCount = histories.length

        return {
            trend,
            trendTotal,
            trendAverage: trend.length > 0 ? trendTotal / trend.length : 0,
            peak,
            top5: ranking.slice(0, 5),
            bottom5: [...ranking].sort((a, b) => a.totalCost - b.totalCost).slice(0, 5),
            totalCost,
            cost30,
            costPrev30,
            entries30,
            averageEntry30: entries30 > 0 ? cost30 / entries30 : 0,
            topUnit30: topUnit30Entry ? { equipment_id: topUnit30Entry[0], totalCost: topUnit30Entry[1] } : null,
            delta30: costPrev30 > 0 ? ((cost30 - costPrev30) / costPrev30) * 100 : null,
            averagePerUnit: totalUnits > 0 ? totalCost / totalUnits : 0,
            statusBreakdown,
            availableCount,
            capacityRate: totalUnits > 0 ? (availableCount / totalUnits) * 100 : 0,
            totalUnits,
            urgent: urgent.slice(0, 5),
            urgentTotal: urgent.length,
            overdueCount,
            warningCount,
            withoutLog,
            entryCount,
            recent: [...histories]
                .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
                .slice(0, 6),
            averageEntry: entryCount > 0 ? totalCost / entryCount : 0,
        }
    }, [equipments, histories, serviceLogs, today])

    return (
        <div className="flex flex-col gap-4 pb-4">
            {/* KARTU METRIK */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatTile
                    label="Total unit"
                    value={formatNumber(analytics.totalUnits)}
                    hint="unit terdaftar"
                    icon={<Truck className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Available"
                    value={formatNumber(analytics.availableCount)}
                    hint={`${analytics.capacityRate.toFixed(0)}% siap pakai`}
                    icon={<ShieldCheck className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Biaya 30 hari"
                    value={compactRupiah(analytics.cost30)}
                    hint={<DeltaBadge delta={analytics.delta30} />}
                    title={formatRupiah(analytics.cost30)}
                    icon={<TrendingUp className="h-3.5 w-3.5" />}
                    emphasis
                />
                <StatTile
                    label="Rata-rata / unit"
                    value={compactRupiah(analytics.averagePerUnit)}
                    hint="dari seluruh riwayat"
                    title={formatRupiah(analytics.averagePerUnit)}
                    icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                />
                <StatTile
                    label="Servis terlewat"
                    value={formatNumber(analytics.overdueCount)}
                    hint={analytics.warningCount > 0 ? `+ ${analytics.warningCount} unit segera servis` : "semua unit aman"}
                    icon={
                        <AlertTriangle
                            className={cn("h-3.5 w-3.5", analytics.overdueCount > 0 ? "text-destructive" : "text-muted-foreground")}
                        />
                    }
                />
                <StatTile
                    label="Total biaya"
                    value={compactRupiah(analytics.totalCost)}
                    hint="seluruh riwayat perbaikan"
                    title={formatRupiah(analytics.totalCost)}
                    icon={<Wrench className="h-3.5 w-3.5" />}
                />
            </div>

            {/* GRAFIK TREN — data & rentang tetap 3 bulan, tampilan dipoles */}
            <Card>
                <CardHeader>
                    <CardTitle>Tren Biaya Perbaikan</CardTitle>
                    <CardDescription>Total biaya harian dalam 3 bulan terakhir</CardDescription>
                </CardHeader>
                <CardContent>
                    {analytics.trend.length > 0 ? (
                        <>
                            <Suspense fallback={<Skeleton className="h-[260px] w-full rounded-md" />}>
                                <LazyCostChart data={analytics.trend} />
                            </Suspense>
                            <dl className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-3">
                                <div>
                                    <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                        Total 3 bulan
                                    </dt>
                                    <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                                        {formatRupiah(analytics.trendTotal)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                        Rata-rata harian
                                    </dt>
                                    <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                                        {formatRupiah(analytics.trendAverage)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                        Hari terbesar
                                    </dt>
                                    <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                                        {analytics.peak ? formatRupiah(analytics.peak.cost) : "—"}
                                        {analytics.peak && (
                                            <span className="ml-1.5 font-sans font-normal text-muted-foreground">
                                                · {analytics.peak.displayDate}
                                            </span>
                                        )}
                                    </dd>
                                </div>
                            </dl>
                        </>
                    ) : (
                        <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                            Belum ada data pengeluaran dalam 3 bulan terakhir.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* PERINGKAT BIAYA PER UNIT — 6 bulan (Top 5 / Bottom 5) */}
            <Card>
                <CardHeader>
                    <CardTitle>Peringkat Biaya Unit (6 Bulan)</CardTitle>
                    <CardDescription>
                        Perbandingan akumulasi biaya perbaikan per nomor polisi. Top 5 paling boros dan Bottom 5 paling hemat dalam 6 bulan terakhir.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<Skeleton className="h-[264px] w-full rounded-md" />}>
                        <LazyUnitCostRankingChart top5={analytics.top5} bottom5={analytics.bottom5} />
                    </Suspense>
                </CardContent>
            </Card>

            {/* PERLU TINDAKAN + DISTRIBUSI STATUS */}
            <div className="grid gap-4 lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle>Perlu Tindakan Segera</CardTitle>
                        <CardDescription>
                            Unit yang sudah terlewat jadwal servis atau mendekati batas tanggal / odometer.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                        {analytics.urgent.length > 0 ? (
                            <div className="divide-y divide-border">
                                {analytics.urgent.map(({ equipment, status }) => (
                                    <div
                                        key={String(equipment.id ?? equipment.equipment_id)}
                                        className={cn("flex items-center justify-between gap-4 border-l-2 py-2.5 pl-3", status.tone.accent)}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium leading-none">
                                                    {equipment.equipment_id}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={cn("gap-1.5 border text-[11px] font-medium", status.tone.badge)}
                                                >
                                                    <span className={cn("h-1.5 w-1.5 rounded-full", status.tone.dot)} />
                                                    {status.label}
                                                </Badge>
                                            </div>
                                            <div className="mt-1 truncate text-xs text-muted-foreground">
                                                {equipment.license_plate || "—"}
                                                {equipment.description ? ` · ${equipment.description}` : ""}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div
                                                className={cn(
                                                    "text-xs font-medium tabular-nums",
                                                    status.id === "overdue"
                                                        ? "text-destructive"
                                                        : "text-amber-700 dark:text-amber-400",
                                                )}
                                            >
                                                {remainingDaysLabel(status.remainingDays)}
                                            </div>
                                            <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                                {remainingKmLabel(status.remainingKm)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
                                <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                <p className="text-sm font-medium">Semua unit dalam jadwal aman</p>
                                <p className="text-xs text-muted-foreground">
                                    Tidak ada unit yang terlewat atau mendekati batas servis.
                                </p>
                            </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <p className="text-xs text-muted-foreground">
                                {analytics.urgentTotal > 0
                                    ? `${analytics.urgentTotal} unit perlu perhatian`
                                    : "Tidak ada tindakan mendesak"}
                                {analytics.withoutLog > 0 && ` · ${analytics.withoutLog} unit belum punya jadwal`}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => onNavigate?.("monitoring")}
                            >
                                Buka Monitoring Servis
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Distribusi Status Unit</CardTitle>
                        <CardDescription>Komposisi status operasional seluruh armada.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {analytics.statusBreakdown.length > 0 ? (
                            <>
                                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                                    {analytics.statusBreakdown.map(({ status, count }) => (
                                        <div
                                            key={status}
                                            className={unitStatusTone(status).bar}
                                            style={{ width: `${(count / analytics.totalUnits) * 100}%` }}
                                            title={`${unitStatusLabel(status)}: ${count} unit`}
                                        />
                                    ))}
                                </div>

                                <div className="space-y-2.5">
                                    {analytics.statusBreakdown.map(({ status, count }) => {
                                        const tone = unitStatusTone(status)
                                        return (
                                            <div key={status} className="flex items-center justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                                                    <span className="truncate text-sm">{unitStatusLabel(status)}</span>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <span className="text-sm font-medium tabular-nums">{count} Unit</span>
                                                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                                                        {((count / analytics.totalUnits) * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="border-t pt-4">
                                    <div className="mb-2 flex justify-between text-sm">
                                        <span className="text-muted-foreground">Kapasitas Operasional</span>
                                        <span className="font-medium tabular-nums">{analytics.capacityRate.toFixed(1)}%</span>
                                    </div>
                                    <Progress value={analytics.capacityRate} className="h-2.5" />
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">Belum ada data unit.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* RIWAYAT TERBARU + RINGKASAN 30 HARI */}
            <div className="grid gap-4 lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle>Riwayat Maintenance Terbaru</CardTitle>
                        <CardDescription>Enam pengeluaran perbaikan paling akhir.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Barang / Jasa</TableHead>
                                    <TableHead className="text-right">Biaya</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {analytics.recent.length > 0 ? (
                                    analytics.recent.map((hist) => {
                                        const cost = Number(hist.jumlah_harga) || 0
                                        const isOutlier = analytics.averageEntry > 0 && cost >= analytics.averageEntry * 2
                                        return (
                                            <TableRow key={hist.id}>
                                                <TableCell className="whitespace-nowrap py-2.5">
                                                    <div className="text-xs tabular-nums">{formatDateMedium(hist.tanggal)}</div>
                                                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                                                        {relativeDayLabel(hist.tanggal)}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2.5">
                                                    <div className="text-xs font-medium">{hist.equipment_id}</div>
                                                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                                                        {hist.license_plate || "—"}
                                                    </div>
                                                </TableCell>
                                                <TableCell
                                                    className="max-w-[200px] truncate py-2.5 text-xs"
                                                    title={hist.nama_barang_atau_jasa || ""}
                                                >
                                                    {hist.nama_barang_atau_jasa || "—"}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap py-2.5 text-right">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {isOutlier && (
                                                            <TrendingUp
                                                                className="h-3.5 w-3.5 text-primary"
                                                                aria-label="Dua kali di atas rata-rata"
                                                            />
                                                        )}
                                                        <span className="font-mono text-xs font-medium tabular-nums">
                                                            {formatRupiah(cost)}
                                                        </span>
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                                            Belum ada riwayat perbaikan.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        <div className="mt-auto flex justify-end pt-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-muted-foreground hover:text-foreground"
                                onClick={() => onNavigate?.("maintenance")}
                            >
                                Lihat semua riwayat
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Ringkasan 30 Hari</CardTitle>
                        <CardDescription>Belanja perbaikan bulan berjalan dibanding 30 hari sebelumnya.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl className="divide-y divide-border">
                            <div className="flex items-baseline justify-between gap-4 pb-3">
                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                    Biaya 30 hari
                                </dt>
                                <dd className="text-right">
                                    <div className="font-mono text-sm font-semibold tabular-nums text-primary">
                                        {formatRupiah(analytics.cost30)}
                                    </div>
                                    <div className="mt-1">
                                        <DeltaBadge delta={analytics.delta30} suffix=" vs 30 hari sebelumnya" />
                                    </div>
                                </dd>
                            </div>

                            <div className="flex items-baseline justify-between gap-4 py-3">
                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                    Periode sebelumnya
                                </dt>
                                <dd className="font-mono text-sm tabular-nums">{formatRupiah(analytics.costPrev30)}</dd>
                            </div>

                            <div className="flex items-baseline justify-between gap-4 py-3">
                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                    Entri perbaikan
                                </dt>
                                <dd className="flex items-center gap-1.5 text-sm font-medium tabular-nums">
                                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                                    {formatNumber(analytics.entries30)}
                                </dd>
                            </div>

                            <div className="flex items-baseline justify-between gap-4 py-3">
                                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                    Rata-rata / entri
                                </dt>
                                <dd className="font-mono text-sm tabular-nums">{formatRupiah(analytics.averageEntry30)}</dd>
                            </div>

                            <div className="flex items-baseline justify-between gap-4 pt-3">
                                <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    Unit termahal
                                </dt>
                                <dd className="text-right">
                                    {analytics.topUnit30 ? (
                                        <>
                                            <div className="text-sm font-medium">{analytics.topUnit30.equipment_id}</div>
                                            <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                                                {formatRupiah(analytics.topUnit30.totalCost)}
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">Belum ada</span>
                                    )}
                                </dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export const DashboardView = memo(DashboardViewImpl)

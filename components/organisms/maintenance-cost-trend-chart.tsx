"use client"

import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { compactRupiah, formatDateMedium, formatRupiah } from "@/lib/format"
import { buildMaintenanceCostTrend } from "@/lib/maintenance-cost-trend"
import { cn } from "@/lib/utils"

const MONTH_COLORS = ["#94a3b8", "#0f766e", "#b45309"] as const

/**
 * Tren biaya perbaikan tiga bulan terakhir.
 *
 * Sumbu X adalah tanggal 1–31. Tiap garis adalah satu bulan dan ketiganya
 * ditumpuk di bidang yang sama, jadi pola tanggal yang sama bisa dibandingkan
 * antarbulan tanpa saling menjumlahkan nominal.
 */
export function MaintenanceCostTrendChart({
    histories,
    error,
    className,
}: {
    histories: any[]
    /** Pesan bila query terbaru gagal; chart tetap memakai snapshot terakhir. */
    error?: string | null
    className?: string
}) {
    const trend = useMemo(() => buildMaintenanceCostTrend(histories), [histories])
    const latestDate = useMemo(() => {
        let latest = ""
        for (const row of histories) {
            const raw = String(row?.tanggal ?? "").trim()
            if (/^\d{4}-\d{2}-\d{2}/.test(raw) && raw > latest) latest = raw.slice(0, 10)
        }
        return latest
    }, [histories])

    const chartConfig = useMemo(
        () =>
            Object.fromEntries(
                trend.months.map((month, index) => [
                    month.key,
                    {
                        label: month.label,
                        color: MONTH_COLORS[index],
                    },
                ]),
            ) as ChartConfig,
        [trend.months],
    )

    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold sm:text-sm">Tren biaya perbaikan</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">
                        Tiga bulan terakhir · data s.d.{" "}
                        {latestDate ? formatDateMedium(latestDate) : "belum ada"}
                    </p>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                    <div className="text-right">
                        <p className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase sm:text-[10px]">
                            Total 3 bulan
                        </p>
                        <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums sm:text-sm">
                            {compactRupiah(trend.total)}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Muat ulang data biaya"
                        aria-label="Muat ulang data biaya"
                        onClick={() => window.dispatchEvent(new Event("fleet:refresh-data"))}
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {error && (
                <p
                    role="status"
                    className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300"
                >
                    Data biaya belum bisa diperbarui: {error}. Chart masih memakai snapshot
                    terakhir yang tersimpan.
                </p>
            )}

            {trend.hasData ? (
                <>
                    <ChartContainer
                        config={chartConfig}
                        className="aspect-auto h-[360px] min-h-[360px] w-full text-[10px] sm:h-[400px] sm:min-h-[400px] sm:text-xs"
                    >
                        <LineChart
                            data={trend.points}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                                dataKey="label"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                minTickGap={12}
                                className="text-[10px] sm:text-xs"
                            />
                            <YAxis
                                tickFormatter={(value) => compactRupiah(Number(value))}
                                tickLine={false}
                                axisLine={false}
                                width={68}
                                className="text-[10px] sm:text-xs"
                            />
                            <ChartTooltip
                                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                                content={
                                    <ChartTooltipContent
                                        indicator="line"
                                        labelFormatter={(_, payload) => {
                                            const day = (payload?.[0]?.payload as { day?: number } | undefined)?.day
                                            return day ? `Tanggal ${day}` : ""
                                        }}
                                        formatter={(value, name) => {
                                            const item = chartConfig[name]
                                            return (
                                                <div className="flex w-full items-center justify-between gap-4">
                                                    <span className="flex items-center gap-1.5">
                                                        <span
                                                            className="h-2 w-2 shrink-0 rounded-sm"
                                                            style={{ background: item?.color }}
                                                        />
                                                        <span className="text-muted-foreground">
                                                            {item?.label ?? name}
                                                        </span>
                                                    </span>
                                                    <span className="font-mono font-medium tabular-nums">
                                                        {value == null ? "—" : formatRupiah(Number(value))}
                                                    </span>
                                                </div>
                                            )
                                        }}
                                    />
                                }
                            />
                            <ChartLegend content={<ChartLegendContent className="gap-2 text-[10px] sm:gap-4 sm:text-xs" />} />

                            {trend.months.map((month, index) => (
                                <Line
                                    key={month.key}
                                    type="monotone"
                                    dataKey={month.key}
                                    stroke={MONTH_COLORS[index]}
                                    strokeWidth={index === 2 ? 2.5 : 1.5}
                                    strokeDasharray={index < 2 ? "5 4" : undefined}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    connectNulls={false}
                                />
                            ))}
                        </LineChart>
                    </ChartContainer>
                    <p className="text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
                        Dua bulan sebelumnya memakai garis putus-putus; bulan berjalan solid dan berhenti di tanggal hari ini.
                    </p>
                </>
            ) : (
                <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed bg-muted/10 px-4 text-center">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Belum ada biaya perbaikan dalam tiga bulan terakhir.
                    </p>
                </div>
            )}
        </div>
    )
}

"use client"

import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { compactRupiah, formatRupiah } from "@/lib/format"
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
    className,
}: {
    histories: any[]
    className?: string
}) {
    const trend = useMemo(() => buildMaintenanceCostTrend(histories), [histories])

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
                    <p className="text-sm font-semibold">Tren biaya perbaikan</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Tiga bulan terakhir · biaya per tanggal 1–31
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                        Total 3 bulan
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                        {compactRupiah(trend.total)}
                    </p>
                </div>
            </div>

            {trend.hasData ? (
                <>
                    <ChartContainer
                        config={chartConfig}
                        className="aspect-auto h-[360px] min-h-[360px] w-full sm:h-[400px] sm:min-h-[400px]"
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
                                className="text-xs"
                            />
                            <YAxis
                                tickFormatter={(value) => compactRupiah(Number(value))}
                                tickLine={false}
                                axisLine={false}
                                width={78}
                                className="text-xs"
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
                            <ChartLegend content={<ChartLegendContent />} />

                            {trend.months.map((month, index) => (
                                <Line
                                    key={month.key}
                                    type="monotone"
                                    dataKey={month.key}
                                    stroke={MONTH_COLORS[index]}
                                    strokeWidth={index === 2 ? 2.5 : 2}
                                    strokeDasharray={index < 2 ? "5 4" : undefined}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    connectNulls={false}
                                />
                            ))}
                        </LineChart>
                    </ChartContainer>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
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

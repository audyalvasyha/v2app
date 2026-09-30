"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { formatNumber } from "@/lib/format"
import { formatNilai } from "@/lib/skr-status"
import { daysInMonth, skrDailySeries, type SkrMetric } from "@/lib/skr-analytics"

interface SkrMonthChartProps {
    /** Baris bulan berjalan (atau seluruh data bila filter mencakup dua bulan) */
    currentRows: any[]
    /** Baris bulan sebelumnya — di mode fallback berisi seluruh baris */
    previousRows: any[]
    /** Batas ISO bulan berjalan & sebelumnya untuk pemotongan baris */
    currentIso: { from: string; to: string }
    previousIso: { from: string; to: string }
    metric: SkrMetric
    /** Nama bulan siap tampil, mis. "Sep 2026" */
    currentLabel: string
    previousLabel: string
}

/** "1234567" → "1,2 jt" untuk tick sumbu-Y (tanpa "Rp" agar ringkas) */
function tickCompact(v: number): string {
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    if (abs >= 1_000) return `${(v / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`
    return formatNumber(v)
}

/**
 * Grafik garis perbandingan harian: bulan berjalan (garis solid) vs bulan
 * sebelumnya (garis putus-putus) dalam satu sumbu-X tanggal 1..31.
 */
export function SkrMonthChart({
    currentRows,
    previousRows,
    currentIso,
    previousIso,
    metric,
    currentLabel,
    previousLabel,
}: SkrMonthChartProps) {
    const maxDay = React.useMemo(() => {
        const parts = (iso: string) => {
            const y = Number(iso.slice(0, 4))
            const m = Number(iso.slice(5, 7))
            return Number.isInteger(y) && Number.isInteger(m) ? daysInMonth(y, m) : 31
        }
        return Math.max(parts(currentIso.from), parts(previousIso.from))
    }, [currentIso.from, previousIso.from])

    const data = React.useMemo(() => {
        const cur = currentRows.filter(
            (r) => r.pod_d && r.pod_d >= currentIso.from && r.pod_d <= currentIso.to,
        )
        const prev = previousRows.filter(
            (r) => r.pod_d && r.pod_d >= previousIso.from && r.pod_d <= previousIso.to,
        )
        return skrDailySeries(cur, prev, metric, maxDay)
    }, [currentRows, previousRows, currentIso, previousIso, metric, maxDay])

    const chartConfig = {
        current: { label: currentLabel, color: "var(--chart-1)" },
        previous: { label: previousLabel, color: "var(--chart-2)" },
    } satisfies ChartConfig

    const hasAnyData = data.some((d) => d.current != null || d.previous != null)

    if (!hasAnyData) {
        return (
            <div className="flex h-[280px] items-center justify-center">
                <p className="text-xs text-muted-foreground">
                    Tidak ada data bertanggal pada kedua bulan ini.
                </p>
            </div>
        )
    }

    const ticks = [1, 5, 10, 15, 20, 25, maxDay].filter((t, i, arr) => arr.indexOf(t) === i)

    return (
        <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="day"
                    ticks={ticks}
                    domain={[1, maxDay]}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={16}
                />
                <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => tickCompact(v)}
                />
                <ChartTooltip
                    cursor={{ strokeDasharray: "4 4" }}
                    content={
                        <ChartTooltipContent
                            indicator="line"
                            labelFormatter={(_, payload) => {
                                const items = (payload ?? []) as {
                                    name?: string
                                    value?: unknown
                                    payload?: { day?: number }
                                }[]
                                //_prioritaskan seri bulan berjalan, fallback ke seri mana pun yang punya nilai
                                const hit =
                                    items.find((p) => p.name === "current" && p.value != null) ??
                                    items.find((p) => p.value != null)
                                const day = hit?.payload?.day ?? items[0]?.payload?.day
                                if (!day) return ""
                                const label = hit?.name === "previous" ? previousLabel : currentLabel
                                return `Tanggal ${label}`
                            }}
                            formatter={(value, name) => (
                                <div className="flex w-full items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5">
                                        <span
                                            className="h-2 w-1 shrink-0 rounded-sm"
                                            style={{
                                                background:
                                                    name === "current"
                                                        ? "var(--color-current)"
                                                        : "var(--color-previous)",
                                            }}
                                        />
                                        <span className="text-muted-foreground">
                                            {name === "current" ? currentLabel : previousLabel}
                                        </span>
                                    </span>
                                    <span className="font-mono font-medium tabular-nums">
                                        {value == null
                                            ? "—"
                                            : metric === "nilai"
                                              ? formatNilai(Number(value))
                                              : `${formatNumber(Number(value))} qty`}
                                    </span>
                                </div>
                            )}
                        />
                    }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                    dataKey="current"
                    type="monotone"
                    stroke="var(--color-current)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                    connectNulls
                />
                <Line
                    dataKey="previous"
                    type="monotone"
                    stroke="var(--color-previous)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 3 }}
                    connectNulls
                />
            </LineChart>
        </ChartContainer>
    )
}

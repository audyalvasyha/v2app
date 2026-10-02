"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { formatNumber, formatRupiah } from "@/lib/format"
import type { BanMonthlyPoint } from "@/lib/ban-analytics"

interface BanMonthChartProps {
    data: BanMonthlyPoint[]
}

// Warna literal (bukan rantai CSS var) supaya fill kolom SVG selalu
// ter-render di tema gelap maupun terang. Oranye = warna brand aplikasi.
const BAR_COLOR = "#FF3C00"

/** "1234567" → "1,2 jt" untuk tick sumbu-Y (tanpa "Rp" agar ringkas) */
function tickCompact(v: number): string {
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    if (abs >= 1_000) return `${(v / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`
    return formatNumber(v)
}

const chartConfig = {
    cost: { label: "Biaya ban", color: BAR_COLOR },
} satisfies ChartConfig

/**
 * Tren biaya ban per bulan. Bulan dengan biaya tertinggi diberi warna
 * aksen penuh, sisanya diredupkan supaya puncak pengeluaran langsung terlihat
 * tanpa harus membaca angka sumbu satu per satu.
 */
export function BanMonthChart({ data }: BanMonthChartProps) {
    const peak = React.useMemo(
        () => data.reduce((m, p) => Math.max(m, p.cost), 0),
        [data],
    )

    if (data.length === 0) {
        return (
            <div className="flex h-[240px] items-center justify-center">
                <p className="text-xs text-muted-foreground">Belum ada catatan ban pada periode ini.</p>
            </div>
        )
    }

    return (
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
            <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
                <YAxis
                    width={62}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => tickCompact(v)}
                />
                <ChartTooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={
                        <ChartTooltipContent
                            indicator="line"
                            formatter={(value) => formatRupiah(Number(value))}
                        />
                    }
                />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={34}>
                    {data.map((point) => (
                        <Cell
                            key={point.key}
                            fill={BAR_COLOR}
                            fillOpacity={peak > 0 && point.cost === peak ? 1 : 0.45}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ChartContainer>
    )
}
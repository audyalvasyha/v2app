"use client"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { compactRupiah, formatRupiah } from "@/lib/format"

interface ChartPoint {
    date: string
    displayDate: string
    cost: number
}

const ACCENT = "#FF3C00"

// Konfigurasi warna untuk grafik shadcn
const chartConfig = {
    cost: {
        label: "Total Biaya",
        color: ACCENT,
    },
} satisfies ChartConfig

/**
 * Tren biaya harian. Data & rentang (3 bulan) tidak berubah — yang dipoles
 * hanya tampilan: area gradien di bawah garis, format rupiah yang konsisten
 * di sumbu dan tooltip, serta grid yang lebih tenang.
 */
export default function CostChart({ data }: { data: ChartPoint[] }) {
    return (
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="costAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
                        <stop offset="70%" stopColor={ACCENT} stopOpacity={0.04} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                </defs>

                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                    dataKey="displayDate"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={24}
                    className="text-xs"
                />
                <YAxis
                    tickFormatter={(val) => compactRupiah(Number(val))}
                    tickLine={false}
                    axisLine={false}
                    width={78}
                    className="text-xs"
                />
                <ChartTooltip
                    cursor={{ stroke: ACCENT, strokeWidth: 1, strokeDasharray: "4 4" }}
                    content={
                        <ChartTooltipContent
                            indicator="line"
                            formatter={(value) => formatRupiah(Number(value))}
                        />
                    }
                />
                {/* type="monotone" membuat garis halus; area gradien di bawahnya
                    memberi bobot visual tanpa mengubah bentuk kurva */}
                <Area
                    type="monotone"
                    dataKey="cost"
                    stroke={ACCENT}
                    strokeWidth={3}
                    fill="url(#costAreaFill)"
                    dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: "#ea580c", stroke: "white", strokeWidth: 2 }}
                />
            </AreaChart>
        </ChartContainer>
    )
}

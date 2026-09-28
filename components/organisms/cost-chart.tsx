"use client"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts"

interface ChartPoint {
    date: string
    displayDate: string
    cost: number
}

// Konfigurasi warna untuk grafik shadcn
const chartConfig = {
    cost: {
        label: "Total Biaya",
        color: "hsl(var(--primary))",
    },
} satisfies ChartConfig

export default function CostChart({ data }: { data: ChartPoint[] }) {
    return (
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                    dataKey="displayDate"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-xs"
                />
                <YAxis
                    tickFormatter={(val) => `Rp ${val / 1000}k`}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                    className="text-xs"
                />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                {/* type="monotone" adalah kunci untuk membuat garis menjadi bergelombang/halus */}
                <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#FF3C00"
                    strokeWidth={3}
                    dot={{ r: 3, fill: "#FF3C00", strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: "#ea580c", stroke: "white", strokeWidth: 2 }}
                />
            </LineChart>
        </ChartContainer>
    )
}

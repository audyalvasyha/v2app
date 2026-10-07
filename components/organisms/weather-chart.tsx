"use client"

import { memo } from "react"
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import type { HourForecast } from "@/lib/weather"
import { hourLabel } from "@/lib/weather"

/**
 * Grafik peluang & intensitas hujan per jam (24 jam ke depan) untuk satu lokasi.
 *
 * Keluar dari boundary `components/molecules/charts.tsx` — konvensi repo agar
 * Turbopack membuat SATU chunk recharts, bukan salinan per grafik.
 *
 * Bar = peluang hujan (%), garis = intensitas prediksi (mm/jam).
 * Nilai null (API tidak menyediakan) ditampilkan sebagai 0 — batang kosong,
 * bukan error.
 */

interface WeatherChartProps {
    hours: HourForecast[]
}

function WeatherChartImpl({ hours }: WeatherChartProps) {
    const data = hours.map((h) => ({
        label: hourLabel(h.time).replace(".00", ""),
        prob: h.precipitationProbability ?? 0,
        mm: h.precipitation ?? 0,
    }))

    return (
        <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        interval={2}
                        tickLine={false}
                        axisLine={false}
                        className="text-muted-foreground"
                    />
                    <YAxis
                        yAxisId="prob"
                        domain={[0, 100]}
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                        className="text-muted-foreground"
                    />
                    <YAxis yAxisId="mm" orientation="right" domain={[0, "auto"]} hide />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                        labelFormatter={(label) => `Jam ${label}.00`}
                        formatter={(value, name) =>
                            name === "prob"
                                ? [`${value}%`, "Peluang hujan"]
                                : [`${value} mm`, "Intensitas"]
                        }
                    />
                    <Bar yAxisId="prob" dataKey="prob" fill="var(--primary)" fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={14} />
                    <Line yAxisId="mm" type="monotone" dataKey="mm" stroke="var(--primary)" strokeWidth={2} dot={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}

export const WeatherChart = memo(WeatherChartImpl)

"use client"

import { memo } from "react"
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"

/**
 * Grafik pola kepadatan per jam untuk satu rute — dari data historis
 * `/api/traffic/history`. Bar = rasio kecepatan aktual vs normal
 * (100% = sekencang biasa). Garis hijau = ambang "lancar" (80%),
 * di bawah garis kuning (58%) artinya padat.
 *
 * Keluar dari boundary `components/molecules/charts.tsx` — konvensi repo
 * agar satu chunk recharts dipakai bersama.
 */

interface HistoryChartProps {
    /** Pola per jam WIB 0–23; jam tanpa data boleh hilang. */
    data: Array<{ hour: number; avgRatio: number; samples: number }>
}

const RATIO_TONE = (r: number) => (r >= 0.8 ? "var(--primary)" : r >= 0.58 ? "#f59e0b" : "#ef4444")

function HistoryChartImpl({ data }: HistoryChartProps) {
    const rows = data.map((d) => ({
        label: String(d.hour).padStart(2, "0"),
        ratio: Math.round(d.avgRatio * 100),
        samples: d.samples,
    }))

    return (
        <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        interval={1}
                        tickLine={false}
                        axisLine={false}
                        className="text-muted-foreground"
                    />
                    <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                        className="text-muted-foreground"
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                        labelFormatter={(label) => `Jam ${label}.00 WIB`}
                        formatter={(value, name) =>
                            name === "ratio"
                                ? [`${value}% vs normal`, "Kepadatan"]
                                : [`${value} snapshot`, "Cakupan data"]
                        }
                    />
                    <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} />
                    <ReferenceLine y={58} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} />
                    <Bar dataKey="ratio" radius={[3, 3, 0, 0]} maxBarSize={14} fillOpacity={0.85} shape={(props: { cx?: number; payload?: { ratio: number }; height?: number; y?: number; width?: number; x?: number }) => {
                        const { x, y, width, height, payload } = props as { x?: number; y?: number; width?: number; height?: number; payload?: { ratio: number } }
                        if (x == null || y == null || width == null || height == null) return <g />
                        return <rect x={x} y={y} width={width} height={Math.max(0, height)} rx={3} fill={RATIO_TONE((payload?.ratio ?? 0) / 100)} />
                    }} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}

export const HistoryChart = memo(HistoryChartImpl)

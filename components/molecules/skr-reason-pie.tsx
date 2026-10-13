"use client"

import * as React from "react"
import { Cell, Pie, PieChart } from "recharts"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { compactNilai, formatNilai } from "@/lib/skr-status"

/**
 * Pie chart sebaran alasan SKR per kategori.
 * Ukuran irisan = total NILAI (rupiah) sisa kiriman per kategori POD,
 * supaya "alasan mana yang terbanyak" terbaca dari porsi figuranya.
 * Warna tiap kategori mengikuti warna badge kategorinya di UI.
 */
export interface SkrReasonCategoryDatum {
    category: string
    label: string
    rows: number
    nilai: number
}

//@ Kategori → warna irisan. Literal (bukan CSS var) agar kontras
// stabil di tema gelap maupun terang; paralel dengan className badge:
// rose=internal, amber=operasional, sky=pelanggan, violet=redelivery.
const CATEGORY_COLOR: Record<string, string> = {
    internal: "#F43F5E",
    operasional: "#F59E0B",
    pelanggan: "#0EA5E9",
    redelivery: "#8B5CF6",
    lainnya: "#94A3B8",
}

export function SkrReasonPie({ data }: { data: SkrReasonCategoryDatum[] }) {
    const sliced = React.useMemo(
        () => data.filter((d) => d.rows > 0 || d.nilai > 0),
        [data],
    )

    if (sliced.length === 0) {
        return (
            <div className="flex h-[300px] items-center justify-center">
                <p className="text-xs text-muted-foreground">
                    Tidak ada data alasan SKR pada filter ini.
                </p>
            </div>
        )
    }

    const totalNilai = sliced.reduce((a, d) => a + d.nilai, 0)

    const chartConfig = Object.fromEntries(
        sliced.map((d) => [d.category, { label: d.label, color: CATEGORY_COLOR[d.category] ?? "#94A3B8" }]),
    ) satisfies ChartConfig

    return (
        <div>
            <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                <PieChart>
                    <ChartTooltip
                        content={
                            <ChartTooltipContent
                                hideLabel
                                formatter={(value, name, item) => {
                                    const payload = (item?.payload ?? {}) as SkrReasonCategoryDatum
                                    const share =
                                        totalNilai > 0 && payload.nilai > 0
                                            ? ` · ${((payload.nilai / totalNilai) * 100).toFixed(1)}%`
                                            : ""
                                    return (
                                        <div className="flex w-full items-center justify-between gap-4">
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className="h-2 w-2 shrink-0 rounded-sm"
                                                    style={{
                                                        background:
                                                            CATEGORY_COLOR[payload.category] ?? "#94A3B8",
                                                    }}
                                                />
                                                <span className="text-muted-foreground">{payload.label}</span>
                                            </span>
                                            <span className="font-mono font-medium tabular-nums">
                                                {compactNilai(Number(value))}
                                                {share}
                                                {" · "}
                                                {payload.rows.toLocaleString("id-ID")} baris
                                            </span>
                                        </div>
                                    )
                                }}
                            />
                        }
                    />
                    <Pie
                        data={sliced}
                        dataKey="nilai"
                        nameKey="label"
                        innerRadius={62}
                        outerRadius={102}
                        paddingAngle={2}
                        strokeWidth={2}
                        stroke="var(--card)"
                        label={({ percent }: { percent?: number }) =>
                            percent && percent >= 0.04
                                ? `${Math.round(percent * 100)}%`
                                : ""
                        }
                        labelLine={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                    >
                        {sliced.map((d) => (
                            <Cell
                                key={d.category}
                                fill={CATEGORY_COLOR[d.category] ?? "#94A3B8"}
                            />
                        ))}
                    </Pie>
                </PieChart>
            </ChartContainer>

            {/* Legenda manual: satu baris per kategori — label + nilai + baris,
                supaya detail angka yang tadinya ada di daftar tidak hilang. */}
            <ul className="mt-1 divide-y">
                {sliced.map((d) => (
                    <li
                        key={d.category}
                        className="flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-muted/40"
                    >
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ background: CATEGORY_COLOR[d.category] ?? "#94A3B8" }}
                        />
                        <span className="min-w-0 flex-1 truncate">{d.label}</span>
                        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                            {d.rows.toLocaleString("id-ID")} baris
                        </span>
                        <span
                            className="shrink-0 text-right font-mono font-medium tabular-nums"
                            title={formatNilai(d.nilai)}
                        >
                            {compactNilai(d.nilai)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

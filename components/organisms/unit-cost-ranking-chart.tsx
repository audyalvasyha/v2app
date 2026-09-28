"use client"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts"

export interface RankedUnit {
    equipment_id: string
    totalCost: number
    count: number // berapa entri histori yang menyumbang total ini
}

const topConfig = { totalCost: { label: "Total biaya", color: "#FF3C00" } } satisfies ChartConfig
const bottomConfig = { totalCost: { label: "Total biaya", color: "hsl(var(--muted-foreground))" } } satisfies ChartConfig

function formatRp(n: number): string {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`
    if (n >= 1000) return `Rp ${(n / 1000).toFixed(0)} rb`
    return `Rp ${n.toLocaleString("id-ID")}`
}

function RankBar({
    data,
    title,
    subtitle,
    emptyText,
    config,
    topStyle,
}: {
    data: RankedUnit[]
    title: string
    subtitle: string
    emptyText: string
    config: ChartConfig
    topStyle: boolean
}) {
    if (data.length === 0) {
        return (
            <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">{emptyText}</p>
            </div>
        )
    }

    // Data grafik dibalik agar bar terpanjang ada di atas (paling mudah diseran mata)
    const chartData = [...data].reverse().map((d) => ({
        label: d.equipment_id,
        cost: d.totalCost,
    }))

    const maxLabelLen = Math.max(...chartData.map((d) => d.label.length), 6)
    const yWidth = Math.min(150, Math.max(84, maxLabelLen * 7.2))

    // Pewarnaan berjenjang: peringkat teratas lebih pekat → lebih pudar (tanpa pelangi)
    const fills = topStyle
        ? ["#FF3C00", "#ff5a28", "#ff774f", "#ff936f", "#ffb494"]
        : // bawah: palet gelap → terang (netral, tidak mencolok)
          ["hsl(0 0% 72%)", "hsl(0 0% 68%)", "hsl(0 0% 62%)", "hsl(0 0% 56%)", "hsl(0 0% 48%)"]

    // Urutan fill harus selaras dengan visual: bar teratas (peringkat 1) warna paling pekat.
    // Karena chartData dibalik, indeks 0 = peringkat terbawah dalam grafik (bawah).
    const fillForIndex = (i: number) => fills[chartData.length - 1 - i] ?? fills[fills.length - 1]

    return (
        <div className="flex flex-col">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    6 bulan terakhir
                </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>

            {/* Daftar peringkat bernomor — memberi konteks sebelum grafik */}
            <ol className="mt-4 space-y-1.5">
                {data.map((row, idx) => (
                    <li key={row.equipment_id} className="flex items-baseline gap-2.5 text-xs">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border bg-card font-mono text-[10px] tabular-nums text-muted-foreground">
                            {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{row.equipment_id}</span>
                        <span className="shrink-0 font-mono tabular-nums text-foreground">
                            {formatRp(row.totalCost)}
                        </span>
                        <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
                            · {row.count} entri
                        </span>
                    </li>
                ))}
            </ol>

            <div className="mt-4">
                <ChartContainer config={config} className="h-[264px] w-full">
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                    >
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            className="text-xs"
                            tickFormatter={(v: number) => formatRp(Number(v))}
                        />
                        <YAxis
                            type="category"
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            width={yWidth}
                            className="text-xs"
                            tick={{ fontSize: 11 }}
                        />
                        <ChartTooltip
                            cursor={{ fill: "hsl(var(--muted) / 0.28)" }}
                            content={
                                <ChartTooltipContent
                                    indicator="line"
                                    formatter={(value) =>
                                        `Rp ${Number(value).toLocaleString("id-ID")}`
                                    }
                                />
                            }
                        />
                        <Bar dataKey="cost" radius={[0, 6, 6, 0]} barSize={26}>
                            {chartData.map((_, i) => (
                                <Cell key={`cell-${i}`} fill={fillForIndex(i)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </div>
        </div>
    )
}

/**
 * Dua panel peringkat disatukan dalam satu komponen agar konsumen cukup
 * memanggil 1 lazy-import. Rendering dipisah Top / Bottom dengan visual
 * yang sengaja dibedakan (aksen oranye hanya untuk Top).
 */
export default function UnitCostRankingChart(props: {
    top5: RankedUnit[]
    bottom5: RankedUnit[]
}) {
    return (
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
            <RankBar
                data={props.top5}
                title="Biaya Tertinggi — Top 5 Unit"
                subtitle="Akumulasi biaya perbaikan per unit. Urut dari yang paling besar."
                emptyText="Belum ada data biaya perbaikan pada 6 bulan terakhir."
                config={topConfig}
                topStyle
            />
            <div className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
                <RankBar
                    data={props.bottom5}
                    title="Biaya Terendah — Bottom 5 Unit"
                    subtitle="Akumulasi biaya perbaikan per unit. Urut dari yang paling kecil."
                    emptyText="Belum ada data biaya perbaikan pada 6 bulan terakhir."
                    config={bottomConfig}
                    topStyle={false}
                />
            </div>
            {/* Pada layar sempit, Bottom 5 ditampilkan di bawah dengan pemisah */}
            <div className="border-t border-border pt-8 lg:hidden">
                <RankBar
                    data={props.bottom5}
                    title="Biaya Terendah — Bottom 5 Unit"
                    subtitle="Akumulasi biaya perbaikan per unit. Urut dari yang paling kecil."
                    emptyText="Belum ada data biaya perbaikan pada 6 bulan terakhir."
                    config={bottomConfig}
                    topStyle={false}
                />
            </div>
        </div>
    )
}

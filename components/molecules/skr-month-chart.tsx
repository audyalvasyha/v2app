"use client"

import * as React from "react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
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
import { daysInMonth, skrDailySeries } from "@/lib/skr-analytics"

interface SkrMonthChartProps {
    /** Baris bulan berjalan (atau seluruh data bila filter mencakup dua bulan) */
    currentRows: any[]
    /** Baris bulan sebelumnya — di mode fallback berisi seluruh baris */
    previousRows: any[]
    /** Batas ISO bulan berjalan & sebelumnya untuk pemotongan baris */
    currentIso: { from: string; to: string }
    previousIso: { from: string; to: string }
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

//_Warna literal (bukan rantai CSS var) supaya fill SVG selalu
//ter-render di tema gelap maupun terang.
//Kontras tinggi agar data per bulan langsung terbedah:
//  bulan berjalan = oranye (qty) / teal (nilai),
//  bulan sebelumnya = biru (qty) / ungu (nilai).
const QTY_CURRENT = "#FF3C00"
const QTY_PREVIOUS = "#2563EB"
const NILAI_CURRENT = "#2aa084"
const NILAI_PREVIOUS = "#8B5CF6"

/**
 * Grafik komposisi harian dalam SATU panel:
 *   - metrik qty → kolom (bar) pada sumbu kiri;
 *   - metrik nilai → polyline pada sumbu kanan.
 * Bulan berjalan & sebelumnya tampil bersamaan: kolom bulan lalu lebih
 * redup (fillOpacity), garis nilai bulan lalu putus-putus. Sumber data
 * satu deret yang sama (skrDailySeries), hari tanpa data tidak ditarik
 * ke nol — garisnya terputus.
 */
export function SkrMonthChart({
    currentRows,
    previousRows,
    currentIso,
    previousIso,
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
        return skrDailySeries(cur, prev, maxDay)
    }, [currentRows, previousRows, currentIso, previousIso, maxDay])

    const chartConfig = {
        currentQty: { label: `${currentLabel} · Qty`, color: QTY_CURRENT },
        previousQty: { label: `${previousLabel} · Qty`, color: QTY_PREVIOUS },
        currentNilai: { label: `${currentLabel} · Nilai`, color: NILAI_CURRENT },
        previousNilai: { label: `${previousLabel} · Nilai`, color: NILAI_PREVIOUS },
    } satisfies ChartConfig

    const hasAnyData = data.some(
        (d) =>
            d.currentQty != null ||
            d.previousQty != null ||
            d.currentNilai != null ||
            d.previousNilai != null,
    )

    if (!hasAnyData) {
        return (
            <div className="flex h-[300px] items-center justify-center">
                <p className="text-xs text-muted-foreground">
                    Tidak ada data bertanggal pada kedua bulan ini.
                </p>
            </div>
        )
    }

    return (
        <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={4}
                    tickFormatter={(v: number) => (v % 5 === 0 || v === 1 ? String(v) : "")}
                />
                {/* Sumbu kiri = qty (kolom) */}
                <YAxis yAxisId="qty" width={56} tickLine={false} axisLine={false} tickFormatter={(v: number) => tickCompact(v)} />
                {/* Sumbu kanan = nilai (garis), tanpa garis sumbu supaya bersih */}
                <YAxis
                    yAxisId="nilai"
                    orientation="right"
                    width={64}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `Rp ${tickCompact(v).replace(/^Rp /, "")}`}
                />
                <ChartTooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                    content={
                        <ChartTooltipContent
                            indicator="line"
                            labelFormatter={(_, payload) => {
                                const day = (payload?.[0]?.payload as { day?: number } | undefined)?.day
                                return day ? `Tanggal ${day}` : ""
                            }}
                            formatter={(value, name) => (
                                <div className="flex w-full items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5">
                                        <span
                                            className="h-2 w-2 shrink-0 rounded-sm"
                                            style={{
                                                background:
                                                    name === "currentQty" || name === "previousQty"
                                                        ? QTY_CURRENT                                                        : name === "currentNilai"
                                                            ? NILAI_CURRENT
                                                            : name === "previousNilai"
                                                                ? NILAI_PREVIOUS
                                                                : name === "previousQty"
                                                                    ? QTY_PREVIOUS
                                                                    : QTY_CURRENT,
                                        }}
                                        />
                                        <span className="text-muted-foreground">
                                            {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                                        </span>
                                    </span>
                                    <span className="font-mono font-medium tabular-nums">
                                        {value == null
                                            ? "—"
                                            : name === "currentQty" || name === "previousQty"
                                              ? `${formatNumber(Number(value))} qty`
                                              : formatNilai(Number(value))}
                                    </span>
                                </div>
                            )}
                        />
                    }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {/* Qty: kolom berdampingan per tanggal; bulan lalu lebih redup */}
                <Bar
                    yAxisId="qty"
                    dataKey="currentQty"
                    fill={QTY_CURRENT}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                />
                <Bar
                    yAxisId="qty"
                    dataKey="previousQty"
                    fill={QTY_PREVIOUS}
                    fillOpacity={0.55}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                />
                {/* Nilai: polyline pada sumbu kanan, TIDAK TERPUTUS meski
                    ada hari tanpa data (connectNulls) — batas antar bulan
                    tetap terbedakan lewat warna + garis putus-putus. */}
                <Line
                    yAxisId="nilai"
                    type="monotone"
                    dataKey="currentNilai"
                    stroke={NILAI_CURRENT}
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: NILAI_CURRENT, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls
                />
                <Line
                    yAxisId="nilai"
                    type="monotone"
                    dataKey="previousNilai"
                    stroke={NILAI_PREVIOUS}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 2.5, fill: NILAI_PREVIOUS, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls
                />
            </ComposedChart>
        </ChartContainer>
    )
}

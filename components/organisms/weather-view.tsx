"use client"

import React, { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { useWeather } from "@/hooks/use-weather"
import {
    assessTravelRisk,
    describeWeatherCode,
    regionWeatherSummary,
    todayOutlook,
    WEATHER_LOCATIONS,
    type HourForecast,
    type LocationWeather,
} from "@/lib/weather"
import { cn } from "@/lib/utils"
import {
    WeatherEmoji,
    RISK_TONE,
    RiskDot,
    dayLabel,
    formatTime,
    bestDepartureWindow,
} from "./weather-display"
import { useTrafficHistory } from "@/hooks/use-traffic-history"

// Grafik keluar dari boundary charts.tsx (satu chunk recharts untuk semua menu)
const WeatherChart = dynamic(
    () => import("@/components/molecules/charts").then((m) => m.WeatherChart),
    { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-md" /> },
)

/**
 * Menu Perkiraan Cuaca — seluruh kecamatan Rokan Hilir + 2 kota utama.
 *
 * Kartu grid ringkas untuk memindai 20 daerah sekaligus; klik kartu untuk
 * membuka detail (kondisi terkini, grafik 24 jam, prakiraan 7 hari).
 */

function LocationTile({ loc, selected, onSelect }: { loc: LocationWeather; selected: boolean; onSelect: () => void }) {
    const risk = useMemo(() => assessTravelRisk(loc.current, loc.hourly), [loc])
    const outlook = useMemo(() => todayOutlook(loc), [loc])
    const desc = describeWeatherCode(loc.current.code)

    return (
        <button
            type="button"
            onClick={onSelect}
            title={`${loc.def.name} — ${desc.label}`}
            aria-pressed={selected}
            className={cn(
                "flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors",
                selected
                    ? "border-primary ring-1 ring-primary"
                    : "hover:bg-muted/60",
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <WeatherEmoji code={loc.current.code} className="text-xl leading-none" />
                <span className="text-sm font-semibold tabular-nums">
                    {loc.current.temperature != null ? `${Math.round(loc.current.temperature)}°` : "—"}
                </span>
            </div>
            <div className="min-w-0">
                <div className="truncate text-xs font-medium leading-tight">{loc.def.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <RiskDot level={risk.level} />
                    <span className="tabular-nums">
                        💧 {outlook.maxProb != null ? `${Math.round(outlook.maxProb)}%` : "—"}
                    </span>
                </div>
            </div>
        </button>
    )
}

/**
 * Rekomendasi jam berangkat gabungan cuaca + traffic historis untuk satu lokasi.
 *
 * Cuaca: pilih jam dalam sisa hari ini/imungkin depan dengan peluang hujan < 30%.
 * Traffic (bila historis tersedia): hindari jam yang rata-rata rasionya < 58%
 * (istorisnya biasanya macet — dari traffic_history).
 * Keduanya kosong → null; yang dirender hanya block bila benar-benar ada rekom.
 */
function combinedDepartureSuggestion(
    hours: HourForecast[],
    trafficPattern: Array<{ hour: number; avgRatio: number; samples: number }> | undefined,
): { hour: number; reason: string } | null {
    const rainSafe = hours
        .filter((h) => (h.precipitationProbability ?? 0) < 30)
        .map((h) => Number(h.time.slice(11, 13)))
        .filter((n) => Number.isFinite(n))
    if (rainSafe.length === 0) return null

    const congested = new Set(
        (trafficPattern ?? [])
            .filter((p) => p.samples >= 3 && p.avgRatio < 0.58)
            .map((p) => p.hour),
    )
    const best = rainSafe.find((h) => !congested.has(h))
    if (best == null) {
        // Semua jam aman-cuaca adalah jam macet historis — sarankan terawal saja
        // dengan catatan eksplisit, bukan dihening tanpa saran.
        return { hour: rainSafe[0], reason: "Cuaca aman tapi jam ini biasanya padat — berangkat terawal mungkin" }
    }
    return congested.size > 0
        ? { hour: best, reason: "Cuaca aman & di luar jam padat biasa" }
        : { hour: best, reason: "Cuaca aman untuk perjalanan" }
}

function LocationDetail({ loc, trafficPattern }: { loc: LocationWeather; trafficPattern?: Array<{ hour: number; avgRatio: number; samples: number }> }) {
    const desc = describeWeatherCode(loc.current.code)
    const risk = useMemo(() => assessTravelRisk(loc.current, loc.hourly), [loc])
    const tone = RISK_TONE[risk.level]
    const depart = useMemo(() => combinedDepartureSuggestion(loc.hourly, trafficPattern), [loc.hourly, trafficPattern])

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        <CardTitle className="text-base">{loc.def.name} — 24 Jam & 7 Hari</CardTitle>
                        <CardDescription>
                            Peluang hujan (batang) dan intensitas prediksi (garis) per jam · prakiraan harian di bawahnya.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <WeatherEmoji code={loc.current.code} className="text-2xl" />
                        <Badge variant="outline" className={cn("border text-[11px] font-medium", tone.badge)}>
                            {tone.label}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Kondisi terkini dalam satu baris angka */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                    <span className="text-2xl font-semibold tabular-nums">
                        {loc.current.temperature != null ? `${Math.round(loc.current.temperature)}°C` : "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">{desc.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                        Terasa {loc.current.apparent != null ? `${Math.round(loc.current.apparent)}°` : "—"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                        Lembap {loc.current.humidity != null ? `${Math.round(loc.current.humidity)}%` : "—"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                        Angin {loc.current.wind != null ? `${Math.round(loc.current.wind)}` : "—"} km/j
                    </span>
                    {depart && (
                        <span className="text-[11px] text-muted-foreground">
                            Jam berangkat ideal: <span className="font-medium text-foreground tabular-nums">{String(depart.hour).padStart(2, "0")}.00</span>
                            {" — "}{depart.reason}
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">{risk.reason}</p>

                {loc.hourly.length > 0 ? (
                    <WeatherChart hours={loc.hourly} />
                ) : (
                    <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                        Data per jam belum tersedia.
                    </div>
                )}

                <div className="grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4 lg:grid-cols-7">
                    {loc.daily.map((d, i) => {
                        const dd = describeWeatherCode(d.code)
                        return (
                            <div key={d.date} className="flex flex-col items-center gap-1 rounded-lg border bg-muted/20 px-2 py-3 text-center">
                                <span className="text-[11px] font-medium text-muted-foreground">{dayLabel(d.date, i)}</span>
                                <WeatherEmoji code={d.code} className="text-2xl" />
                                <span className="text-[11px] leading-tight">{dd.label}</span>
                                <span className="text-xs font-medium tabular-nums">
                                    {d.tMax != null ? `${Math.round(d.tMax)}°` : "—"}/
                                    {d.tMin != null ? `${Math.round(d.tMin)}°` : "—"}
                                </span>
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                    💧 {d.rainSum != null ? `${d.rainSum.toFixed(1)} mm` : "—"}
                                </span>
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                    💨 {d.windMax != null ? `${Math.round(d.windMax)}` : "—"} km/j
                                </span>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

export function WeatherView() {
    const { locations, isLoading, error, updatedAt, refresh } = useWeather()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = locations.find((l) => l.def.id === selectedId) ?? locations[0] ?? null
    const summary = useMemo(() => regionWeatherSummary(locations), [locations])
    const hasData = locations.length > 0
    // Pola traffic historis untuk rekomendasi jam berangkat (toggle byId,
    // bukan fetch per tile — data pola jarang berubah dalam satu kunjungan).
    const destIds = useMemo(() => WEATHER_LOCATIONS.filter((l) => l.id !== "bagan-batu").map((l) => l.id), [])
    const history = useTrafficHistory(destIds)

    return (
        <div className="space-y-4">
            {/* Bar status: sumber data + waktu pembaruan + refresh manual */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                    Sumber: Open-Meteo · zona waktu WIB · diperbarui {formatTime(updatedAt)}
                    {" · "}
                    <span className="tabular-nums">{WEATHER_LOCATIONS.length} titik pantau Rokan Hilir</span>
                </span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Muat ulang
                </Button>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    Gagal memuat perkiraan cuaca: {error}
                    {hasData && " — menampilkan data cache terakhir."}
                </div>
            )}

            {isLoading && !hasData ? (
                <>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 rounded-lg" />
                        ))}
                    </div>
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-5 w-44" />
                            <Skeleton className="h-3 w-64" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-[220px] w-full rounded-md" />
                        </CardContent>
                    </Card>
                </>
            ) : !hasData ? (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    Belum ada data cuaca — tekan Muat ulang.
                </div>
            ) : (
                <>
                    {/* Ringkasan wilayah — risiko terburuk hari ini */}
                    {summary.worst && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline" className={cn("gap-1.5 border font-medium", RISK_TONE[summary.worst.level].badge)}>
                                <RiskDot level={summary.worst.level} />
                                {RISK_TONE[summary.worst.level].label}
                            </Badge>
                            <span className="text-muted-foreground">
                                {summary.alertCount > 0 ? (
                                    <>
                                        <span className="font-medium text-foreground tabular-nums">{summary.alertCount}</span>
                                        {" dari "}
                                        <span className="tabular-nums">{summary.totalLocations}</span>
                                        {" daerah perlu waspada (terburuk: "}
                                        <span className="font-medium text-foreground">{summary.worstLocation?.name}</span>
                                        {")"}
                                    </>
                                ) : (
                                    "Seluruh daerah aman untuk perjalanan"
                                )}
                            </span>
                        </div>
                    )}

                    {/* Peta grid 20 daerah — klik untuk detail */}
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {locations.map((loc) => (
                            <LocationTile
                                key={loc.def.id}
                                loc={loc}
                                selected={selected?.def.id === loc.def.id}
                                onSelect={() => setSelectedId(loc.def.id)}
                            />
                        ))}
                    </div>

                    {/* Detail lokasi terpilih */}
                    {selected && (
                        <LocationDetail loc={selected} trafficPattern={history.byId.get(selected.def.id)?.hourlyPattern} />
                    )}
                </>
            )}
        </div>
    )
}

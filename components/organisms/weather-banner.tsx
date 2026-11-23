"use client"

import React, { memo, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronRight, CloudSun, RefreshCw } from "lucide-react"
import { useWeather } from "@/hooks/use-weather"
import {
    assessTravelRisk,
    describeWeatherCode,
    regionWeatherSummary,
    todayOutlook,
    type LocationWeather,
} from "@/lib/weather"
import { cn } from "@/lib/utils"
import { WeatherEmoji, RISK_TONE, RiskDot, dayLabel, formatTime, bestDepartureWindow } from "./weather-display"

/**
 * Banner cuaka di paling atas dashboard — hal pertama yang dilihat user.
 *
 * - Fokus: pool Bagan Batu (kondisi terkini + risiko perjalanan hari ini).
 * - Strip 7 hari ke depan untuk pool (emoji + peluang hujan).
 * - Ringkasan seluruh daerah: berapa daerah perlu waspada + risiko terburuk.
 * - Tombol membuka menu Perkiraan Cuaca untuk rincian per kecamatan.
 *
 * Ringan: tanpa recharts (chart hanya di menu), data via hook yang sama
 * dengan menu cuaca (cache localStorage, auto-refresh 15 menit).
 */

const FOCUS_ID = "bagan-batu"

export interface WeatherBannerProps {
    onOpenDetail?: () => void
}

function WeatherBannerImpl({ onOpenDetail }: WeatherBannerProps) {
    const { locations, isLoading, error, updatedAt, refresh } = useWeather()
    const summary = useMemo(() => regionWeatherSummary(locations), [locations])
    const focus: LocationWeather | null =
        locations.find((l) => l.def.id === FOCUS_ID) ?? locations[0] ?? null
    const hasData = locations.length > 0

    const focusRisk = useMemo(
        () => (focus ? assessTravelRisk(focus.current, focus.hourly) : null),
        [focus],
    )
    const outlook = useMemo(() => (focus ? todayOutlook(focus) : null), [focus])
    const depart = useMemo(() => (focus ? bestDepartureWindow(focus.hourly) : null), [focus])
    const desc = focus ? describeWeatherCode(focus.current.code) : null

    return (
        <Card className="gap-0 overflow-hidden border-border/70 bg-card py-0 shadow-sm">
            <CardContent className="p-3 sm:p-4">
                {/* Kepala banner: timestamp pindah ke footer agar tidak makan satu baris. */}
                <div className="mb-2 flex items-start justify-between gap-2 sm:mb-3 sm:items-center">
                    <h2 className="flex min-w-0 flex-1 items-center gap-x-2 text-sm font-semibold">
                        <CloudSun className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                        <span>Cuaca Rokan Hilir</span>
                    </h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                        onClick={refresh}
                        title="Segarkan data cuaca"
                        aria-label="Segarkan data cuaca"
                    >
                        <RefreshCw className="h-3 w-3" />
                        <span className="hidden sm:inline">Segarkan</span>
                    </Button>
                </div>

                {isLoading && !hasData ? (
                    <div className="space-y-2.5">
                        <Skeleton className="h-9 w-full max-w-64" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : !focus || !focusRisk || !outlook ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center">
                        <CloudSun className="h-6 w-6 text-muted-foreground" />
                        <div className="min-w-0">
                            <p className="text-sm font-medium">Cuaca belum tersedia</p>
                            <p className="mt-0.5 max-w-md break-words text-xs leading-relaxed text-muted-foreground">
                                {error ?? "Belum ada data cuaca untuk ditampilkan."}
                            </p>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={refresh}>
                            <RefreshCw className="h-3 w-3" /> Coba lagi
                        </Button>
                    </div>
                ) : (
                    <>
                        {/* Kondisi pool + risiko wilayah */}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                            <div className="flex min-w-0 items-center gap-2">
                                <WeatherEmoji code={focus.current.code} className="shrink-0 text-2xl leading-none sm:text-3xl" />
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                                        <span className="text-xl font-semibold tabular-nums sm:text-2xl">
                                            {focus.current.temperature != null ? `${Math.round(focus.current.temperature)}°C` : "—"}
                                        </span>
                                        <span className="text-xs text-muted-foreground sm:text-sm">{desc?.label}</span>
                                    </div>
                                    <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{focus.def.name}</p>
                                </div>
                            </div>
                            <Badge variant="outline" className={cn("gap-1.5", RISK_TONE[focusRisk.level].badge)}>
                                <RiskDot level={focusRisk.level} />
                                {RISK_TONE[focusRisk.level].label}
                            </Badge>
                            <span className="text-xs tabular-nums text-muted-foreground">
                                Peluang hujan {outlook.maxProb != null ? `${Math.round(outlook.maxProb)}%` : "—"}
                                {outlook.rainSum != null ? ` · ${outlook.rainSum.toFixed(1)} mm` : ""}
                            </span>
                            {depart && (
                                <span className="text-xs text-muted-foreground">
                                    Jam aman berangkat: <span className="font-medium text-foreground tabular-nums">{depart}</span>
                                </span>
                            )}
                        </div>

                        {/* Strip 7 hari ke depan (pool): 4 kolom di ponsel supaya
                            tiap hari tetap terbaca, 7 kolom mulai layar sm. */}
                        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 border-t pt-2.5 sm:grid sm:max-w-xl sm:grid-cols-7 sm:gap-1.5 sm:pt-3">
                            {focus.daily.map((d, i) => (
                                <div key={d.date} className="flex w-[calc(25%-0.5rem)] min-w-0 flex-col items-center gap-0.5 rounded-md bg-muted/30 px-1 py-1 sm:w-auto sm:py-1.5">
                                    <span className="w-full truncate text-center text-[10px] font-medium text-muted-foreground">{dayLabel(d.date, i)}</span>
                                    <WeatherEmoji code={d.code} className="text-base leading-tight sm:text-lg" />
                                    <span
                                        className={cn(
                                            "text-[10px] tabular-nums",
                                            (d.precipProbMax ?? 0) >= 70
                                                ? "font-medium text-sky-600 dark:text-sky-400"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {d.precipProbMax != null ? `${Math.round(d.precipProbMax)}%` : "—"}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Ringkasan seluruh daerah */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs sm:mt-3">
                            {summary.worst && (
                                <Badge variant="outline" className={cn("gap-1.5", RISK_TONE[summary.worst.level].badge)}>
                                    <RiskDot level={summary.worst.level} />
                                    {RISK_TONE[summary.worst.level].label}
                                </Badge>
                            )}
                            <span className="min-w-0 break-words text-muted-foreground">
                                {summary.alertCount > 0 ? (
                                    <>
                                        <span className="font-medium text-foreground tabular-nums">{summary.alertCount}</span>
                                        {" dari "}
                                        <span className="tabular-nums">{summary.totalLocations}</span>
                                        {" daerah perlu waspada hari ini"}
                                        {summary.worstLocation && summary.worstLocation.id !== focus.def.id
                                            ? ` · terburuk ${summary.worstLocation.name}`
                                            : ""}
                                    </>
                                ) : (
                                    `Seluruh ${summary.totalLocations} daerah aman untuk perjalanan`
                                )}
                            </span>
                        </div>

                        {/* Error non-intrusif bila data berasal dari cache */}
                        {error && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                                Menampilkan data cache — pembaruan gagal: {error}
                            </p>
                        )}
                    </>
                )}

                {/* Timestamp + aksi detail dalam satu kaki kartu yang ringkas. */}
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5 sm:mt-3 sm:pt-3">
                    <span className="min-w-0 truncate text-[10px] text-muted-foreground sm:text-[11px]">
                        Diperbarui {formatTime(updatedAt)} WIB
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-0.5 px-2 text-[11px]"
                        onClick={onOpenDetail}
                    >
                        Detail cuaca
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export const WeatherBanner = memo(WeatherBannerImpl)

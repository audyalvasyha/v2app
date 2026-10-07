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
    const depart = useMemo(() => (focus ? bestDepartureWindow(focus.hourly) : null), [focus.hourly])
    const desc = focus ? describeWeatherCode(focus.current.code) : null

    return (
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-sky-500/15 via-sky-500/5 to-transparent">
            <CardContent className="p-4">
                {/* Kepala banner */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <CloudSun className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        Cuaca Rokan Hilir
                        <span className="text-[11px] font-normal text-muted-foreground">
                            · diperbarui {formatTime(updatedAt)} WIB
                        </span>
                    </h2>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={refresh}>
                            <RefreshCw className="h-3 w-3" />
                            Segarkan
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 gap-0.5 text-xs" onClick={onOpenDetail}>
                            Detail cuaca
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {isLoading && !hasData ? (
                    <div className="space-y-3">
                        <Skeleton className="h-9 w-64" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : !focus || !focusRisk || !outlook ? (
                    <p className="text-xs text-muted-foreground">
                        {error ? `Cuaca tidak tersedia: ${error}` : "Belum ada data cuaca."}
                    </p>
                ) : (
                    <>
                        {/* Kondisi pool + risiko wilayah */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <WeatherEmoji code={focus.current.code} className="text-3xl leading-none" />
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-semibold tabular-nums">
                                    {focus.current.temperature != null ? `${Math.round(focus.current.temperature)}°C` : "—"}
                                </span>
                                <span className="text-sm text-muted-foreground">{desc?.label}</span>
                                <span className="text-xs text-muted-foreground">· {focus.def.name}</span>
                            </div>
                            <Badge variant="outline" className={cn("gap-1.5 border text-[11px] font-medium", RISK_TONE[focusRisk.level].badge)}>
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

                        {/* Strip 7 hari ke depan (pool) */}
                        <div className="mt-3 grid grid-cols-7 gap-1.5 border-t pt-3 sm:max-w-xl">
                            {focus.daily.map((d, i) => (
                                <div key={d.date} className="flex flex-col items-center gap-0.5">
                                    <span className="truncate text-[10px] font-medium text-muted-foreground">{dayLabel(d.date, i)}</span>
                                    <WeatherEmoji code={d.code} className="text-lg leading-tight" />
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
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
                            {summary.worst && (
                                <Badge variant="outline" className={cn("gap-1.5 border text-[11px] font-medium", RISK_TONE[summary.worst.level].badge)}>
                                    <RiskDot level={summary.worst.level} />
                                    {RISK_TONE[summary.worst.level].label}
                                </Badge>
                            )}
                            <span className="text-muted-foreground">
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
                            <p className="mt-2 text-[11px] text-muted-foreground">
                                Menampilkan data cache — pembaruan gagal: {error}
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}

export const WeatherBanner = memo(WeatherBannerImpl)

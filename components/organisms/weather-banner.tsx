"use client"

import React, { memo, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CloudSun, RefreshCw } from "lucide-react"
import { useWeather } from "@/hooks/use-weather"
import {
    assessTravelRisk,
    describeWeatherCode,
    regionWeatherSummary,
    todayOutlook,
    type LocationWeather,
} from "@/lib/weather"
import { cn } from "@/lib/utils"
import { RISK_TONE, RiskDot, bestDepartureWindow } from "./weather-display"

/**
 * Cuaca ringkas untuk dashboard.
 *
 * Head of transport tidak butuh forecast 7 hari di layar pertama; yang perlu
 * langsung terbaca adalah kondisi pool, risiko perjalanan hari ini, peluang
 * hujan, dan jam berangkat yang relatif aman. Detail per daerah tetap ada di
 * menu Perkiraan Cuaca.
 */

const FOCUS_ID = "bagan-batu"

export interface WeatherBannerProps {
    onOpenDetail?: () => void
}

function WeatherBannerImpl({ onOpenDetail }: WeatherBannerProps) {
    const { locations, isLoading, error, refresh } = useWeather()
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
        <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-none">
            <CardContent className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2.5">
                    <CloudSun className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold">Cuaca pool</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {focus?.def.name ?? "Bagan Batu"}
                        </p>
                    </div>
                </div>

                {isLoading && !hasData ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:justify-center">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-6 w-24" />
                    </div>
                ) : !focus || !focusRisk || !outlook ? (
                    <p className="min-w-0 flex-1 text-xs text-muted-foreground sm:text-center">
                        {error ?? "Data cuaca belum tersedia."}
                    </p>
                ) : (
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-center">
                        <span className="text-base font-semibold tabular-nums text-foreground">
                            {focus.current.temperature != null ? `${Math.round(focus.current.temperature)}°C` : "—"}
                        </span>
                        <span>{desc?.label}</span>
                        <Badge variant="outline" className={cn("gap-1.5", RISK_TONE[focusRisk.level].badge)}>
                            <RiskDot level={focusRisk.level} />
                            {RISK_TONE[focusRisk.level].label}
                        </Badge>
                        <span>
                            Hujan{" "}
                            <span className="font-medium tabular-nums text-foreground">
                                {outlook.maxProb != null ? `${Math.round(outlook.maxProb)}%` : "—"}
                            </span>
                        </span>
                        {depart && (
                            <span>
                                Berangkat{" "}
                                <span className="font-medium tabular-nums text-foreground">{depart}</span>
                            </span>
                        )}
                        <span className="hidden xl:inline">
                            {summary.alertCount > 0
                                ? `${summary.alertCount}/${summary.totalLocations} daerah waspada`
                                : `${summary.totalLocations} daerah aman`}
                        </span>
                    </div>
                )}

                <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={refresh}
                        title="Segarkan data cuaca"
                        aria-label="Segarkan data cuaca"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={onOpenDetail}
                    >
                        Detail
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export const WeatherBanner = memo(WeatherBannerImpl)

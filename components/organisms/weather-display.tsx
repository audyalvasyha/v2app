"use client"

import React from "react"
import { describeWeatherCode, type HourForecast, type RiskLevel, type WeatherGroup } from "@/lib/weather"
import { cn } from "@/lib/utils"

/**
 * Helper tampilan bersama untuk seluruh UI cuaca (banner dashboard + menu).
 * Dipisah supaya banner dashboard tidak ikut menarik chart/bundle menu cuaca.
 */

export const GROUP_ICON: Record<WeatherGroup, string> = {
    clear: "☀️",
    cloud: "☁️",
    fog: "🌫️",
    drizzle: "🌦️",
    rain: "🌧️",
    snow: "🌨️",
    storm: "⛈️",
}

export function WeatherEmoji({ code, className }: { code: number | null; className?: string }) {
    // Kode null (data tidak tersedia) → ikon netral, bukan cerah
    const group = code == null ? "cloud" : describeWeatherCode(code).group
    return (
        <span className={className} aria-hidden>
            {GROUP_ICON[group]}
        </span>
    )
}

export const RISK_TONE: Record<RiskLevel, { badge: string; label: string; dot: string }> = {
    aman: {
        badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
        label: "Aman",
        dot: "bg-emerald-500",
    },
    waspada: {
        badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
        label: "Waspada",
        dot: "bg-amber-500",
    },
    tinggi: {
        badge: "bg-destructive/10 text-destructive border-destructive/30",
        label: "Risiko Tinggi",
        dot: "bg-destructive",
    },
}

/** Label hari Indonesia dari tanggal lokal "YYYY-MM-DD" (0 = Hari ini). */
export function dayLabel(date: string, index: number): string {
    if (index === 0) return "Hari ini"
    if (index === 1) return "Besok"
    const d = new Date(`${date}T00:00:00+07:00`)
    if (Number.isNaN(d.getTime())) return date
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" })
}

/** Jam pembaruan dalam WIB dari epoch ms. */
export function formatTime(ts: number | null): string {
    if (!ts) return "—"
    return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
}

/** Jam paling awal dalam 12 jam ke depan dengan peluang hujan < 30%. */
export function bestDepartureWindow(hours: HourForecast[]): string | null {
    for (const h of hours.slice(0, 12)) {
        if ((h.precipitationProbability ?? 0) < 30) {
            return h.time.slice(11, 16).replace(":", ".")
        }
    }
    return null
}

/** Badge risiko kecil (dot + label) untuk tile/banner. */
export function RiskDot({ level, className }: { level: RiskLevel; className?: string }) {
    const tone = RISK_TONE[level]
    return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone.dot, className)} title={tone.label} />
}

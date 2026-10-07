"use client"

import { useCallback, useEffect, useState } from "react"
import {
    parseWeatherPayload,
    weatherApiUrl,
    type LocationWeather,
} from "@/lib/weather"

/**
 * Hook data perkiraan cuaca (Open-Meteo) untuk semua lokasi operasional.
 *
 * - Satu fetch gabungan untuk ketiga lokasi (respons array multi-lokasi).
 * - Cache-first ala dashboard: data terakhir dari localStorage dirender
 *   seketika, lalu refresh di background (stale-while-revalidate).
 * - Auto-refresh tiap 15 menit selama tab terbuka — frekuensi update
 *   Open-Meteo juga 15 menit, jadi lebih sering tidak menambah informasi.
 * - Error ditampilkan apa adanya di UI, bukan menghilang.
 */

const CACHE_KEY = "weather-cache-v1"
const CACHE_TTL_MS = 15 * 60 * 1000

interface WeatherCache {
    fetchedAt: number
    locations: LocationWeather[]
}

function readCache(): WeatherCache | null {
    if (typeof window === "undefined") return null
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed?.locations) || typeof parsed?.fetchedAt !== "number") return null
        // Cache lebih tua dari sehari dianggap basi — lebih baik tampil loading
        // daripada cuaca seminggu lalu.
        if (Date.now() - parsed.fetchedAt > 24 * 60 * 60 * 1000) return null
        return parsed as WeatherCache
    } catch {
        return null
    }
}

function writeCache(locations: LocationWeather[]) {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), locations } satisfies WeatherCache))
    } catch {
        // Kuota penuh dsb — cache opsional, abaikan
    }
}

export interface UseWeatherResult {
    locations: LocationWeather[]
    isLoading: boolean
    error: string | null
    /** Waktu (epoch ms) data terakhir berhasil diambil — untuk label "diperbarui". */
    updatedAt: number | null
    refresh: () => void
}

export function useWeather(): UseWeatherResult {
    const [locations, setLocations] = useState<LocationWeather[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [updatedAt, setUpdatedAt] = useState<number | null>(null)
    const [refreshTick, setRefreshTick] = useState(0)

    const refresh = useCallback(() => setRefreshTick((t) => t + 1), [])

    useEffect(() => {
        let cancelled = false

        // 1. Cache-first: tampilkan data terakhir seketika
        const cached = readCache()
        if (cached) {
            setLocations(cached.locations)
            setUpdatedAt(cached.fetchedAt)
            setIsLoading(false)
        }

        // 2. Refresh di background; lewati bila cache masih segar (15 menit)
        //    KECUALI user menekan tombol refresh manual.
        const manual = refreshTick > 0
        if (cached && !manual && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            return () => {
                cancelled = true
            }
        }

        ;(async () => {
            try {
                const res = await fetch(weatherApiUrl())
                if (!res.ok) throw new Error(`Open-Meteo menjawab HTTP ${res.status}`)
                const json = await res.json()
                const parsed = parseWeatherPayload(json)
                if (parsed.length === 0) throw new Error("Respons Open-Meteo tidak berisi lokasi yang dikenali")
                if (cancelled) return
                setLocations(parsed)
                setUpdatedAt(Date.now())
                setError(null)
                writeCache(parsed)
            } catch (e) {
                if (cancelled) return
                setError(e instanceof Error ? e.message : "Gagal memuat perkiraan cuaca")
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [refreshTick])

    // Auto-refresh tiap 15 menit selama tab terbuka
    useEffect(() => {
        const id = setInterval(refresh, CACHE_TTL_MS)
        return () => clearInterval(id)
    }, [refresh])

    return { locations, isLoading, error, updatedAt, refresh }
}

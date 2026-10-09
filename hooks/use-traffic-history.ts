"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Pola historis traffic per rute (dari /api/traffic/history).
 *
 * Sifatnya "lazy but sticky": dimuat sekali per halaman Traffic (data pola
 * jarang berubah), hasilnya disimpan state walau user ganti-ganti rute
 * yang dituju — tidak perlu fetch ulang tiap pilih baris.
 *
 * Tabel `traffic_history` belum ada / belum ada data → available=false
 * per lokasi, UI menampilkan hintMMC ringan tanpa error.
 */

export interface HourlyPattern {
    hour: number
    avgRatio: number
    samples: number
}

export interface DailyPattern {
    date: string
    avgRatio: number
    samples: number
}

export interface LocationHistoryUi {
    locationId: string
    available: boolean
    hourlyPattern: HourlyPattern[]
    daily: DailyPattern[]
}

interface HistoryResponse {
    generatedAt: string
    locations: LocationHistoryUi[]
}

export function useTrafficHistory(locationIds: string[]): {
    byId: Map<string, LocationHistoryUi>
    loading: boolean
    error: string | null
    reload: () => void
} {
    // Kunci request: gabungan id terurut — mencegah dobel fetch saat array
    // yang dirender ber-order sama tapi dibuat ulang sebagai array baru.
    const key = [...locationIds].sort().join(",")
    const [byId, setById] = useState<Map<string, LocationHistoryUi>>(new Map())
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)

    const reload = useCallback(() => setTick((t) => t + 1), [])

    useEffect(() => {
        let cancelled = false
        if (!key) return

        setLoading(true)
        ;(async () => {
            try {
                const res = await fetch(`/api/traffic/history?locations=${encodeURIComponent(key)}`, {
                    cache: "no-store",
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const json = (await res.json()) as HistoryResponse
                if (cancelled) return
                const map = new Map<string, LocationHistoryUi>()
                for (const h of json.locations) map.set(h.locationId, h)
                setById(map)
                setError(null)
            } catch (e) {
                if (cancelled) return
                setError(e instanceof Error ? e.message : "Gagal memuat historis")
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [key, tick])

    return { byId, loading, error, reload }
}

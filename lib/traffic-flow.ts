/**
 * Traffic flow sampling per rute — dengan fallback gratis.
 *
 * Provider utama: TomTom Traffic Flow (free tier, 2.500 call/hari non-tile,
 * 5 call/detik). Bila:
 *  - TOMTOM_API_KEY tidak diset, ATAU
 *  - key ditolak (401/403), ATAU
 *  - kuota habis (429),
 * sampling otomatis beralih ke FALLBACK GRATIS: estimator berbasis jadwal
 * (time-of-day factor) × karakteristik jalan dari geometri rute OSRM.
 * Estimator ini jujur ditandai `source: "estimated"` supaya UI bisa
 * membedakannya dari data live provider.
 *
 * Tidak ada layanan traffic gratis yang mencakup jalan kabupaten Rokan Hilir
 * (HERE/Mapbox/Google semuanya berbayar untuk Indonesia di level ini), jadi
 * fallback berbasis jadwal + durasi OSRM adalah alternatif gratis yang paling
 * masuk akal dan tetap berguna untuk perencanaan pengiriman.
 */

import { fetchFlowSegmentData, TomTomApiError } from "./tomtom/fetch"
import { sampleRoutePoints, trafficFlowLevel, type TrafficLevel } from "./tomtom/route-monitoring"

export type FlowSource = "live" | "estimated"

export interface FlowSampleResult {
    level: TrafficLevel
    currentSpeed: number
    freeFlowSpeed: number
    /** Darimana hasil ini berasal. */
    source: FlowSource
}

// ---------------------------------------------------------------------------
// Circuit breaker kuota — setelah key ditolak/kuota habis, stop memanggil
// TomTom sampai jendela reset berlalu (kuota free tier reset harian).
// ---------------------------------------------------------------------------

const QUOTA_BLOCK_MS = 60 * 60 * 1000 // coba lagi tiap 1 jam
let quotaBlockedUntil = 0

/** Dipanggil route handler setelah 401/403/429 dari TomTom. */
export function markTomTomQuotaExceeded(): void {
    quotaBlockedUntil = Date.now() + QUOTA_BLOCK_MS
}

export function isTomTomQuotaBlocked(): boolean {
    return Date.now() < quotaBlockedUntil
}

// ---------------------------------------------------------------------------
// Estimator fallback — gratis, tanpa API eksternal
// ---------------------------------------------------------------------------

/**
 * Faktor kepadatan berdasarkan jam lokal (WIB, UTC+7) untuk jalan provinsi/
 * kabupaten di Riau — pola umum: pagi & sore puncak, siang moderat, malam
 * lancar. Indeks = jam 0–23, nilai = perkiraan rasio kecepatan aktual terhadap
 * free-flow.
 */
const HOUR_FACTOR: number[] = [
    0.95, 0.95, 0.96, 0.97, 0.98, 0.95, 0.85, 0.72, 0.65, 0.75, 0.82, 0.86, // 00-11
    0.88, 0.85, 0.80, 0.75, 0.68, 0.62, 0.66, 0.74, 0.82, 0.90, 0.94, 0.95, // 12-23
]

/** Jam 16-18 sore hari kerja biasanya paling padat — sedikit lebih buruk lagi. */
function hourFactor(d: Date): number {
    const h = d.getUTCHours() // WIB = UTC+7 — sudah dikonversi pemanggil
    const dow = d.getUTCDay()
    let f = HOUR_FACTOR[h % 24]
    if (dow === 0) f = Math.min(0.97, f + 0.12) // Minggu lebih lancar
    else if (dow === 6) f = Math.min(0.95, f + 0.08) // Sabtu sedikit lebih lancar
    return f
}

/**
 * Faktor jalan dari panjang rute: rute pendek didominasi jalan dalam kota
 * (lebih lambat relative), rute panjang didominasi lintas kabupaten.
 */
function routeFactor(distanceKm: number): number {
    if (distanceKm < 10) return 0.9
    if (distanceKm < 40) return 0.95
    return 1
}

/** Hujan memperlambat lalu lintas — faktor dari weather code WMO. */
function weatherFactor(wmoCode: number | null): number {
    if (wmoCode == null) return 1
    if (wmoCode >= 95) return 0.72 // badai petir
    if (wmoCode >= 63) return 0.78 // hujan lebat/sedang
    if (wmoCode >= 51) return 0.88 // gerimis
    return 1
}

/** Level dari rasio kecepatan — ambang sama dengan trafficFlowLevel TomTom. */
export function estimatedFlowLevel(ratio: number): TrafficLevel {
    if (ratio >= 0.8) return "good"
    if (ratio >= 0.58) return "warning"
    return "critical"
}

/** Kecepatan free-flow karakteristik rute berdasarkan panjang (km/j). */
function freeFlowForRoute(distanceKm: number): number {
    if (distanceKm < 10) return 35
    if (distanceKm < 40) return 45
    if (distanceKm < 90) return 55
    return 60
}

/**
 * Estimasi kondisi satu rute — murni lokal, tanpa panggilan jaringan.
 */
export function estimateRouteFlow(params: {
    distanceKm: number
    /** Waktu referensi; default sekarang (WIB). */
    at?: Date
    /** Kode cuaca WMO di tujuan (opsional). */
    weatherCode?: number | null
}): FlowSampleResult {
    const at = params.at ?? new Date(Date.now() + 7 * 3600_000) // WIB
    const freeFlow = freeFlowForRoute(params.distanceKm)
    const ratio = Math.min(1, hourFactor(at) * routeFactor(params.distanceKm) * weatherFactor(params.weatherCode ?? null))
    const current = Math.round(freeFlow * ratio)
    return {
        level: estimatedFlowLevel(ratio),
        currentSpeed: current,
        freeFlowSpeed: freeFlow,
        source: "estimated",
    }
}

// ---------------------------------------------------------------------------
// Sampling per rute: TomTom dulu, fallback estimator
// ---------------------------------------------------------------------------

/**
 * Sampling satu rute. Mengembalikan sample terburuk (worst-case) dari titik
 * sampling TomTom, atau hasil estimator bila TomTom tidak tersedia.
 */
export async function sampleRouteFlow(
    geometry: Array<{ latitude: number; longitude: number }>,
    opts: {
        distanceKm: number
        weatherCode?: number | null
        signal?: AbortSignal
    },
): Promise<FlowSampleResult> {
    const key = process.env.TOMTOM_API_KEY
    const tomTomUsable = Boolean(key) && !isTomTomQuotaBlocked()

    if (tomTomUsable && geometry.length >= 2) {
        const pts = sampleRoutePoints(geometry, 3)
        let worst: FlowSampleResult | null = null
        const order: Record<TrafficLevel, number> = { critical: 3, warning: 2, good: 1, unknown: 0 }
        for (const p of pts) {
            try {
                const seg = await fetchFlowSegmentData({ lat: p.latitude, lon: p.longitude, key, signal: opts.signal })
                const level = trafficFlowLevel(seg.currentSpeed, seg.freeFlowSpeed)
                const cand: FlowSampleResult = { level, currentSpeed: seg.currentSpeed, freeFlowSpeed: seg.freeFlowSpeed, source: "live" }
                if (!worst || order[cand.level] > order[worst.level] ||
                    (cand.level === worst.level && cand.currentSpeed / (cand.freeFlowSpeed || 1) < worst.currentSpeed / (worst.freeFlowSpeed || 1))) {
                    worst = cand
                }
            } catch (err) {
                if (err instanceof TomTomApiError && (err.status === 401 || err.status === 403 || err.status === 429)) {
                    // Key ditolak / kuota habis → circuit breaker, langsung fallback.
                    markTomTomQuotaExceeded()
                    break
                }
                // Error lain (jaringan dsb): lewati titik ini saja.
            }
        }
        if (worst) return worst
    }

    return estimateRouteFlow({ distanceKm: opts.distanceKm, weatherCode: opts.weatherCode })
}

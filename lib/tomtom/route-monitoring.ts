/**
 * Client Route Monitoring API v3 (server-side only).
 *
 * Butuh env TOMTOM_API_KEY dengan produk Route Monitoring aktif.
 * Free tier saat ini membatasi jumlah route (terlihat: max 2 route).
 *
 * API:
 *  - GET  /routemonitoring/3/routes            → daftar route terdaftar
 *  - GET  /routemonitoring/3/routes/{id}/details → kondisi live satu route
 */

import { fetchFlowSegmentData } from "./fetch"

const BASE = "https://api.tomtom.com/routemonitoring/3/routes"

export interface RegisteredRoute {
    routeId: number
    routeName: string
    routeStatus: string
    routeLength: number
}

export interface RouteDetails {
    routeId: number
    routeName: string
    routeStatus: string
    /** Rute bisa dilalui (tidak ditutup). */
    passable: boolean
    routeLength: number
    /** Waktu tempuh saat ini (detik). */
    travelTime: number
    /** Tambahan waktu vs typical (detik). */
    delayTime: number
    /** Waktu tempuh normal (detik). */
    typicalTravelTime: number
    /** Persen cakupan data traffic di rute ini (0–100). */
    completeness: number
    /** Keyakinan data 0–100 (bisa tidak ada). */
    routeConfidence?: number
    detailedSegments?: Array<{
        averageSpeed?: number
        typicalSpeed?: number
        currentSpeed?: number
        relativeSpeed?: number
        segmentLength?: number
        shape?: Array<{ latitude: number; longitude: number }>
    }>
    /** Titik input rute (selalu ada di respons details). */
    routePathPoints?: Array<{ latitude: number; longitude: number }>
}

export type TrafficLevel = "good" | "warning" | "critical" | "unknown"

export interface RouteLiveStatus {
    routeId: number
    routeName: string
    level: TrafficLevel
    /** Waktu tempuh saat ini dalam menit. */
    travelTimeMin: number
    /** Tundaan dalam menit (0 kalau lancar). */
    delayMin: number
    /** Rasio delay terhadap typical (0–1). */
    delayRatio: number
    completeness: number
    lengthKm: number
    /** Garis rute (path points) untuk digambar di peta. */
    pathPoints: Array<{ latitude: number; longitude: number }>
}

function num(v: unknown, fallback = 0): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

/** Daftar semua route terdaftar di akun. */
export async function listRegisteredRoutes(): Promise<RegisteredRoute[]> {
    const key = process.env.TOMTOM_API_KEY
    if (!key) return []
    const url = new URL(BASE)
    url.searchParams.set("key", key)
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) throw new Error(`Route Monitoring list gagal: ${res.status}`)
    return res.json()
}

/** Detail kondisi live satu route. */
export async function getRouteDetails(routeId: number): Promise<RouteDetails> {
    const key = process.env.TOMTOM_API_KEY
    if (!key) throw new Error("TOMTOM_API_KEY belum diset")
    const url = new URL(`${BASE}/${routeId}/details`)
    url.searchParams.set("key", key)
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) throw new Error(`Route Monitoring details gagal: ${res.status}`)
    return res.json()
}

/**
 * Status dari detail route — ambang delay:
 *  - data nggak lengkap (completeness rendah) / rute tertutup → unknown
 *  - delay < 15% dari typical → good (Lancar)
 *  - delay < 40% → warning (Perlu perhatian)
 *  - sisanya → critical (Macet)
 */
export function statusFromDetails(d: RouteDetails): RouteLiveStatus {
    const typical = num(d.typicalTravelTime)
    const delay = Math.max(0, num(d.delayTime))
    const ratio = typical > 0 ? delay / typical : 0

    let level: TrafficLevel
    if (!d.passable || num(d.completeness) < 30) {
        level = "unknown"
    } else if (ratio < 0.15) {
        level = "good"
    } else if (ratio < 0.4) {
        level = "warning"
    } else {
        level = "critical"
    }

    // Prioritas garis: shape ter-rute (jalan nyata) → pathPoints input.
    const shape =
        (d.detailedSegments?.flatMap((s) => s.shape ?? []) ?? []).filter(
            (p) => num(p.latitude) !== 0 || num(p.longitude) !== 0,
        )

    return {
        routeId: d.routeId,
        routeName: d.routeName,
        level,
        travelTimeMin: num(d.travelTime) / 60,
        delayMin: delay / 60,
        delayRatio: ratio,
        completeness: num(d.completeness),
        lengthKm: num(d.routeLength) / 1000,
        pathPoints: shape.length >= 2 ? shape : (d.routePathPoints ?? []).map((p) => ({ latitude: num(p.latitude), longitude: num(p.longitude) })),
    }    }

/** Semua route + status live-nya (dipakai endpoint /api/traffic). */
export async function getAllRouteStatuses(): Promise<RouteLiveStatus[]> {
    const routes = await listRegisteredRoutes()
    const out: RouteLiveStatus[] = []
    for (const r of routes) {
        try {
            out.push(statusFromDetails(await getRouteDetails(r.routeId)))
        } catch {
            out.push({
                routeId: r.routeId,
                routeName: r.routeName,
                level: "unknown",
                travelTimeMin: 0,
                delayMin: 0,
                delayRatio: 0,
                completeness: 0,
                lengthKm: num(r.routeLength) / 1000,
                pathPoints: [],
            })
        }
    }
    return out
}

/** Sampling titik representatif dari geometri rute untuk traffic flow sampling. */
export function sampleRoutePoints(
    geometry: Array<{ latitude: number; longitude: number }>,
    count = 3,
): Array<{ latitude: number; longitude: number }> {
    if (!geometry || geometry.length < 2) return []
    const total = geometry.length
    const ticks = Math.min(count, total)
    const step = (total - 1) / (ticks - 1)
    const out: Array<{ latitude: number; longitude: number }> = []
    for (let i = 0; i < ticks; i++) {
        const idx = Math.round(i * step)
        const p = geometry[idx]
        out.push({ latitude: p.latitude, longitude: p.longitude })
    }
    return out
}

/**
 * Bandingkan kecepatan aktual vs free-flow dari sampling titik geometri rute.
 * Level: good >= 0.80, warning >= 0.58, bad < 0.58, closure dianggap critical.
 * Sampling menghasilkan currentSpeed yang tertinggi (worst-case kecepatan segment)
 * dan freeFlow tertinggi (karakteristik jalan utama).
 */
export function trafficFlowLevel(currentSpeed: number, freeFlowSpeed: number): TrafficLevel {
    if (currentSpeed <= 0 || freeFlowSpeed <= 0) return "unknown"
    if (currentSpeed < 5) return "critical"
    const ratio = currentSpeed / freeFlowSpeed
    if (ratio >= 0.80) return "good"
    if (ratio >= 0.58) return "warning"
    return "critical"
}

interface TrafficFlowSample {
    latitude: number
    longitude: number
    currentSpeed: number
    freeFlowSpeed: number
    level: TrafficLevel
}

/**
 * Sampling traffic flow satu rute dari geometri OSRM.
 * Sampling titik-titik representatif sepanjang path, ambil yang paling
 * representative (median rasio). Kalau nggak ada titik yang dapat data,
 * hasilnya null.
 */
export async function sampleTrafficFlow(
    geometry: Array<{ latitude: number; longitude: number }>,
    key: string,
    signal?: AbortSignal,
): Promise<TrafficFlowSample[]> {
    const pts = sampleRoutePoints(geometry, 3)
    if (!pts.length) return []
    const results: TrafficFlowSample[] = []
    for (const p of pts) {
        try {
            const seg = await fetchFlowSegmentData({ lat: p.latitude, lon: p.longitude, key, signal })
            results.push({
                latitude: p.latitude,
                longitude: p.longitude,
                currentSpeed: seg.currentSpeed,
                freeFlowSpeed: seg.freeFlowSpeed,
                level: trafficFlowLevel(seg.currentSpeed, seg.freeFlowSpeed),
            })
        } catch {
            // Titik ini gagal sampling, skip
        }
    }
    return results
}

/**
 * Ambil level traffic flow tertinggi (worst-case) dari sampling titik-titik
 * geometri rute.
 */
export async function routeTrafficFlowLevel(
    geometry: Array<{ latitude: number; longitude: number }>,
    key: string,
    signal?: AbortSignal,
): Promise<TrafficLevel | null> {
    const samples = await sampleTrafficFlow(geometry, key, signal)
    if (!samples.length) return null
    // Urutkan: critical > warning > good > unknown
    const order: Record<TrafficLevel, number> = { critical: 3, warning: 2, good: 1, unknown: 0 }
    const worst = samples.reduce((a, b) => (order[b.level] > order[a.level] ? b : a))
    return worst.level
}

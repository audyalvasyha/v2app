/**
 * Geometri garis rute dari OSRM (https://router.project-osrm.org) — gratis,
 * tanpa API key, mengikuti jalan asli.
 *
 * Kenapa OSRM dan bukan TomTom Route Monitoring:
 *  - Akun TomTom free tier bisa saja tidak punya produk aktif (respons daftar
 *    route kosong), sehingga garis rute tidak pernah muncul di peta.
 *  - OSRM hanya dipakai untuk GEOMETRI garis (bentuk jalan), bukan kondisi
 *    lalu lintas — status tetap dari TomTom kalau tersedia.
 *
 * Cache in-memory per proses: geometry jalan tidak berubah, TTL panjang aman.
 * Semua rute berangkat dari pool Bagan Batu (satu origin, 19 tujuan).
 */

import { WEATHER_LOCATIONS } from "@/lib/weather"

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving"

/** Origin pool — Bagan Batu. */
const ORIGIN = WEATHER_LOCATIONS.find((l) => l.id === "bagan-batu") ?? WEATHER_LOCATIONS[0]

export interface RouteGeometry {
    /** Titik-titik garis rute di jalan asli (urut origin → tujuan). */
    coordinates: Array<{ latitude: number; longitude: number }>
    /** Panjang rute km menurut OSRM. */
    distanceKm: number
    /** Estimasi waktu tempuh menit (tanpa traffic). */
    durationMin: number
}

interface CacheEntry {
    value: RouteGeometry | null
    expiresAt: number
}

const TTL_MS = 24 * 60 * 60 * 1000 // 24 jam — geometri jalan jarang berubah
const cache = new Map<string, CacheEntry>()

function cacheGet(key: string): RouteGeometry | null | undefined {
    const hit = cache.get(key)
    if (!hit) return undefined
    if (hit.expiresAt < Date.now()) {
        cache.delete(key)
        return undefined
    }
    return hit.value
}

/** Garis rute satu tujuan dari pool. Null kalau OSRM gagal / tidak punya rute. */
export async function fetchRouteGeometry(destinationId: string): Promise<RouteGeometry | null> {
    const dest = WEATHER_LOCATIONS.find((l) => l.id === destinationId)
    if (!dest || dest.id === ORIGIN.id) return null

    const cached = cacheGet(dest.id)
    if (cached !== undefined) return cached

    const url = `${OSRM_BASE}/${ORIGIN.longitude},${ORIGIN.latitude};${dest.longitude},${dest.latitude}?overview=full&geometries=geojson`

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) throw new Error(`OSRM ${res.status}`)
        const body = (await res.json()) as {
            code?: string
            routes?: Array<{
                distance?: number
                duration?: number
                geometry?: { coordinates?: Array<[number, number]> }
            }>
        }
        const route = body.routes?.[0]
        const coords = route?.geometry?.coordinates ?? []
        if (body.code !== "Ok" || !route || coords.length < 2) {
            cache.set(dest.id, { value: null, expiresAt: Date.now() + TTL_MS })
            return null
        }
        const value: RouteGeometry = {
            coordinates: coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
            distanceKm: (route.distance ?? 0) / 1000,
            durationMin: (route.duration ?? 0) / 60,
        }
        cache.set(dest.id, { value, expiresAt: Date.now() + TTL_MS })
        return value
    } catch {
        // Jangan cache failure lama — biarkan dicoba lagi request berikutnya.
        cache.set(dest.id, { value: null, expiresAt: Date.now() + 5 * 60 * 1000 })
        return null
    }
}

/** Garis rute semua daerah (paralel, ringan). Origin tidak punya garis. */
export async function fetchAllRouteGeometries(): Promise<Record<string, RouteGeometry | null>> {
    const ids = WEATHER_LOCATIONS.filter((l) => l.id !== ORIGIN.id).map((l) => l.id)
    const results = await Promise.all(ids.map((id) => fetchRouteGeometry(id)))
    const out: Record<string, RouteGeometry | null> = {}
    for (let i = 0; i < ids.length; i++) out[ids[i]] = results[i]
    return out
}

export { ORIGIN }

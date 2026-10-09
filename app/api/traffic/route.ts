/**
 * GET /api/traffic — peta + status lalu lintas rute pengiriman.
 *
 * Sumber data per lokasi:
 *  - geometry   : garis jalan asli dari OSRM (gratis, tanpa key) — sumber peta.
 *  - live       : Route Monitoring TomTom (rute terdaftar, free tier max 2).
 *  - trafficFlow: kondisi lalu lintas per rute — live dari Traffic Flow TomTom
 *    selama kuota free tier tersedia, lalu otomatis FALLBACK GRATIS ke
 *    estimator jadwal (time-of-day × jarak × cuaca Open-Meteo) bila key
 *    ditolak / kuota habis. Setiap sample diberi `source: "live" | "estimated"`
 *    supaya UI jujur soal asal datanya.
 *
 * Quota: sampling di-cache in-memory 5 menit per rute, jadi refresh berkali
 * tidak membakar jatah API. Sampling berjalan paralel terbatas 4 sekaligus.
 */
import { NextResponse } from "next/server"
import { hasTomTomKey } from "@/lib/tomtom/config"
import { getAllRouteStatuses, type RouteLiveStatus } from "@/lib/tomtom/route-monitoring"
import { sampleRouteFlow, type FlowSampleResult } from "@/lib/traffic-flow"
import { fetchAllRouteGeometries, type RouteGeometry, ORIGIN } from "@/lib/osrm"
import { WEATHER_LOCATIONS } from "@/lib/weather"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Cache sampling 5 menit per lokasi — hemat kuota Traffic API. */
const FLOW_TTL_MS = 5 * 60 * 1000
const flowCache = new Map<string, { value: FlowSampleResult | null; expiresAt: number }>()

/** Sampling semua rute: baca cache dulu, yang kosong diambil paralel (4 slot). */
async function sampleAllFlows(geometries: Record<string, RouteGeometry | null>): Promise<Map<string, FlowSampleResult | null>> {
    const out = new Map<string, FlowSampleResult | null>()
    const now = Date.now()
    const pending: string[] = []

    for (const [id, geo] of Object.entries(geometries)) {
        if (!geo || id === ORIGIN.id) continue
        const hit = flowCache.get(id)
        if (hit && hit.expiresAt > now) {
            out.set(id, hit.value)
        } else {
            pending.push(id)
        }
    }

    if (pending.length > 0) {
        const weather = await fetchWeatherCodes().catch(() => new Map<string, number>())
        const worker = async () => {
            while (pending.length > 0) {
                const id = pending.shift()
                if (!id) break
                const geo = geometries[id]
                let value: FlowSampleResult | null = null
                try {
                    value = await sampleRouteFlow(geo!.coordinates, {
                        distanceKm: geo!.distanceKm,
                        weatherCode: weather.get(id) ?? null,
                        signal: AbortSignal.timeout(20_000),
                    })
                } catch {
                    value = null
                }
                flowCache.set(id, { value, expiresAt: Date.now() + FLOW_TTL_MS })
                out.set(id, value)
            }
        }
        await Promise.all([worker(), worker(), worker(), worker()])
    }

    return out
}

/** Kode cuaca WMO terkini per lokasi (Open-Meteo, gratis) — input estimator. */
async function fetchWeatherCodes(): Promise<Map<string, number>> {
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", WEATHER_LOCATIONS.map((l) => l.latitude).join(","))
    url.searchParams.set("longitude", WEATHER_LOCATIONS.map((l) => l.longitude).join(","))
    url.searchParams.set("current", "weather_code")
    url.searchParams.set("timezone", "Asia/Jakarta")

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    const body = (await res.json()) as Array<{ current?: { weather_code?: number } }>
    const out = new Map<string, number>()
    WEATHER_LOCATIONS.forEach((loc, i) => {
        const code = body[i]?.current?.weather_code
        if (typeof code === "number") out.set(loc.id, code)
    })
    return out
}

export async function GET() {
    // Live status + geometri diambil paralel — geometri jalan harus selalu ada
    // meski TomTom gagal, jadi kegagalan TomTom tidak mematikan garis rute.
    const [live, geometries] = await Promise.all([
        hasTomTomKey()
            ? getAllRouteStatuses().catch(() => [] as RouteLiveStatus[])
            : Promise.resolve([] as RouteLiveStatus[]),
        fetchAllRouteGeometries(),
    ])

    const byName = new Map(live.map((r) => [r.routeName.toLowerCase(), r]))
    const flowByLoc = await sampleAllFlows(geometries)

    const locations = WEATHER_LOCATIONS.map((loc) => {
        const liveStatus = byName.get(loc.name.toLowerCase())
        const geo = geometries[loc.id] ?? null

        return {
            id: loc.id,
            name: loc.name,
            note: loc.note,
            latitude: loc.latitude,
            longitude: loc.longitude,
            isOrigin: loc.id === ORIGIN.id,
            // Garis rute jalan asli (OSRM) — sumber utama peta.
            geometry: geo
                ? {
                      coordinates: geo.coordinates,
                      distanceKm: Math.round(geo.distanceKm * 10) / 10,
                      durationMin: Math.round(geo.durationMin),
                  }
                : null,
            // Status live Route Monitoring (maks 2 rute free tier).
            live: liveStatus
                ? {
                      level: liveStatus.level,
                      travelTimeMin: Math.round(liveStatus.travelTimeMin),
                      delayMin: Math.round(liveStatus.delayMin),
                      completeness: liveStatus.completeness,
                  }
                : null,
            // Sampling traffic flow per-rute (live TomTom atau fallback estimasi).
            trafficFlow: flowByLoc.get(loc.id) ?? null,
        }
    })

    const liveCount = locations.filter((l) => l.live && l.live.level !== "unknown").length
    const estimatedCount = locations.filter((l) => l.trafficFlow?.source === "estimated").length
    const badCount = locations.filter(
        (l) =>
            l.live?.level === "warning" ||
            l.live?.level === "critical" ||
            l.trafficFlow?.level === "warning" ||
            l.trafficFlow?.level === "critical",
    ).length
    const trafficCount = locations.filter((l) => l.trafficFlow && l.trafficFlow.level !== "unknown").length

    return NextResponse.json({
        configured: hasTomTomKey(),
        generatedAt: new Date().toISOString(),
        summary: {
            totalRoutes: locations.length,
            routedGeometries: locations.filter((l) => l.geometry).length,
            liveCount,
            trafficCount,
            estimatedCount,
            badCount,
        },
        locations,
    })
}

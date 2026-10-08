/**
 * GET /api/traffic — peta + status lalu lintas rute pengiriman.
 *
 * Sumber data per lokasi:
 *  - geometry   : garis jalan asli dari OSRM (gratis, tanpa key) — sumber peta.
 *  - live       : Route Monitoring TomTom (rute terdaftar, free tier max 2).
 *  - trafficFlow: sampling Traffic Flow TomTom di 3 titik sepanjang geometri
 *    rute — aktif untuk SEMUA rute selama key punya produk Traffic.
 *
 * Quota: sampling di-cache in-memory 5 menit per rute, jadi refresh berkali
 * tidak membakar jatah API. Sampling berjalan paralel terbatas 4 sekaligus.
 */
import { NextResponse } from "next/server"
import { hasTomTomKey } from "@/lib/tomtom/config"
import { getAllRouteStatuses, sampleTrafficFlow, type RouteLiveStatus, type TrafficLevel } from "@/lib/tomtom/route-monitoring"
import { fetchAllRouteGeometries, type RouteGeometry, ORIGIN } from "@/lib/osrm"
import { WEATHER_LOCATIONS } from "@/lib/weather"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface FlowInfo {
    level: TrafficLevel
    currentSpeed: number
    freeFlowSpeed: number
}

/** Cache sampling 5 menit per lokasi — hemat kuota Traffic API. */
const FLOW_TTL_MS = 5 * 60 * 1000
const flowCache = new Map<string, { value: FlowInfo | null; expiresAt: number }>()

function worstOfSamples(samples: Array<{ currentSpeed: number; freeFlowSpeed: number; level: TrafficLevel }>): FlowInfo | null {
    if (!samples.length) return null
    const order: Record<TrafficLevel, number> = { critical: 3, warning: 2, good: 1, unknown: 0 }
    const worst = samples.reduce((a, b) =>
        order[b.level] > order[a.level] || (order[b.level] === order[a.level] && b.currentSpeed / (b.freeFlowSpeed || 1) < a.currentSpeed / (a.freeFlowSpeed || 1))
            ? b
            : a,
    )
    return { level: worst.level, currentSpeed: worst.currentSpeed, freeFlowSpeed: worst.freeFlowSpeed }
}

/** Sampling semua rute: baca cache dulu, yang kosong diambil paralel (4 slot). */
async function sampleAllFlows(geometries: Record<string, RouteGeometry | null>): Promise<Map<string, FlowInfo | null>> {
    const out = new Map<string, FlowInfo | null>()
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
        const key = process.env.TOMTOM_API_KEY ?? ""
        const worker = async () => {
            while (pending.length > 0) {
                const id = pending.shift()
                if (!id) break
                const geo = geometries[id]
                let value: FlowInfo | null = null
                try {
                    const samples = await sampleTrafficFlow(geo!.coordinates, key, AbortSignal.timeout(20_000))
                    value = worstOfSamples(samples)
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
    const flowByLoc = hasTomTomKey() ? await sampleAllFlows(geometries) : new Map<string, FlowInfo | null>()

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
            // Sampling Traffic Flow per-rute (semua rute selama produk aktif).
            trafficFlow: flowByLoc.get(loc.id) ?? null,
        }
    })

    const liveCount = locations.filter((l) => l.live && l.live.level !== "unknown").length
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
            badCount,
            trafficCount,
        },
        locations,
    })
}

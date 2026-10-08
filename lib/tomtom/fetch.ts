/**
 * Helper fetch TomTom Traffic — flowSegmentData.
 *
 * Contoh call (server-side):
 *   const data = await fetchFlowSegmentData({ lat: 1.6, lon: 100.3 })
 *   // → currentSpeed vs freeFlowSpeed → rasio = indikator macet
 *
 * Endpoint ini menerima satu titik (lat,lon) dan mengembalikan kondisi traffic
 * segmen jalan di sekitar titik itu. Buat 20 rute, nanti tiap rute dipecah
 * jadi beberapa titik representatif (pool, simpang kunci, jalan utama).
 */
import { TOMTOM_BASE_URL } from "./config"

export interface TomTomFlowSegment {
    /** Kecepatan aktual segmen (km/h). */
    currentSpeed: number
    /** Kecepatan normal tanpa kepadatan (km/h). */
    freeFlowSpeed: number
    /** Waktu tempuh segmen saat ini (detik). */
    currentTravelTime: number
    /** Waktu tempuh segmen bebas macet (detik). */
    freeFlowTravelTime: number
    /** Segmen ditutup (garis putus / command gate). */
    roadClosure: boolean
    /** Keyakinan data (0–1). */
    confidence: number
}

interface FlowSegmentDataEnvelope {
    flowSegmentData?: Partial<TomTomFlowSegment>
}

export async function fetchFlowSegmentData(params: {
    /** Lintit tanda titik rute, format desimal (mis. 1.62634). */
    lat: number
    lon: number
    /** Zoom level digunakan untuk memilih jalan di sekitar titik (0–18). Default 10. */
    zoom?: number
    /** Override key (opsional; default dari env TOMTOM_API_KEY). */
    key?: string
    signal?: AbortSignal
}): Promise<TomTomFlowSegment> {
    const key = params.key ?? process.env.TOMTOM_API_KEY
    if (!key) throw new Error("TOMTOM_API_KEY belum diset di environment")

    const zoom = params.zoom ?? 10
    const url = new URL(TOMTOM_BASE_URL)
    url.searchParams.set("key", key)
    url.searchParams.set("point", `${params.lat.toFixed(5)},${params.lon.toFixed(5)}`)
    url.searchParams.set("zoom", String(zoom))

    const res = await fetch(url.toString(), {
        method: "GET",
        signal: params.signal,
        headers: { Accept: "application/json" },
    })

    if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`TomTom flowSegmentData gagal: ${res.status} ${text.slice(0, 200)}`)
    }

    const body = (await res.json().catch(() => null)) as FlowSegmentDataEnvelope | null
    const seg = body?.flowSegmentData
    if (!seg || seg.currentSpeed == null || seg.freeFlowSpeed == null) {
        throw new Error("TomTom flowSegmentData respons tidak lengkap")
    }

    return {
        currentSpeed: seg.currentSpeed,
        freeFlowSpeed: seg.freeFlowSpeed,
        currentTravelTime: seg.currentTravelTime ?? 0,
        freeFlowTravelTime: seg.freeFlowTravelTime ?? 0,
        roadClosure: Boolean(seg.roadClosure),
        confidence: seg.confidence ?? 0,
    }
}

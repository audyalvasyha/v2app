/**
 * GET /api/traffic/history?locations=kec-bangko,kec-kubu
 *
 * Pola historis traffic per rute dari tabel `traffic_history`
 * (lihat supabase/sql/traffic_history.sql). Dipakai UI Traffic untuk:
 *  - Grafik "jam biasanya paling padat" per rute.
 *  - Rekomendasi jam berangkat ideal.
 *
 * Tabel belum ada / database tidak terkonfigurasi → 200 dengan
 * `available: false` per lokasi, bukan error — UI menampilkan
 * "historis belum tersedia" tanpa merusak halaman. Lokasi tanpa data
 * juga ikut respons supaya UI tidak perlu hitung sisa.
 */
import { NextResponse } from "next/server"
import { loadLocationHistory, type LocationHistory } from "@/lib/traffic-history"
import { WEATHER_LOCATIONS } from "@/lib/weather"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_LOCATIONS = 20

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams
    const raw = params.get("locations") ?? ""

    const requested = raw
        .split(",")
        .map((s) => s.trim())
        .filter((id) => WEATHER_LOCATIONS.some((l) => l.id === id))
        .slice(0, MAX_LOCATIONS)

    // Tanpa parameter = seluruh destinasi (bukan origin).
    const ids = requested.length > 0
        ? requested
        : WEATHER_LOCATIONS.filter((l) => l.id !== "bagan-batu").map((l) => l.id)

    let histories: LocationHistory[] = []
    try {
        histories = await Promise.all(ids.map((id) => loadLocationHistory(id)))
    } catch (err) {
        // Kegagalan jaringan DB tidak boleh mematikan halaman traffic.
        console.error("[traffic/history] gagal membaca historis:", err instanceof Error ? err.message : err)
    }

    return NextResponse.json({
        generatedAt: new Date().toISOString(),
        locations: histories.map((h) => ({
            locationId: h.locationId,
            available: h.available,
            hourlyPattern: h.hourlyPattern,
            daily: h.daily,
        })),
    })
}

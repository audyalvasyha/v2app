/**
 * GET /api/traffic/tiles/flow/{style}/{z}/{x}/{y}.png
 *
 * Proxy Raster Flow Tiles TomTom — supaya TOMTOM_API_KEY tetap di server dan
 * tidak pernah bocor ke browser. Overlay ini yang bikin tampilan peta seperti
 * Google Maps traffic: seluruh jaringan jalan berwarna sesuai kecepatan live
 * (hijau lancar → oranye padat → merah macet → abu-abu ditutup).
 *
 * Cache 60 detik: data traffic berubah cepat, tapi cukup lama supaya
 * pan/zoom satu halaman tidak membakar kuota (tiap tile = 1 call).
 */
import { NextResponse } from "next/server"
import { hasTomTomKey } from "@/lib/tomtom/config"

export const runtime = "nodejs"

const STYLES = new Set([
    "relative0",
    "relative0-dark",
    "relative",
    "relative-delay",
    "absolute",
    "reduced-sensitivity",
])

interface TileParams {
    params: Promise<{ style: string; z: string; x: string; y: string }>
}

export async function GET(_req: Request, ctx: TileParams) {
    const { style, z, x, y } = await ctx.params

    if (!hasTomTomKey() || !STYLES.has(style)) {
        return new NextResponse("Not found", { status: 404 })
    }
    const yFile = y.replace(/\.png$/i, "")
    if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(yFile)) {
        return new NextResponse("Not found", { status: 404 })
    }

    const key = process.env.TOMTOM_API_KEY ?? ""
    const url = `https://api.tomtom.com/traffic/map/4/tile/flow/${style}/${z}/${x}/${yFile}.png?key=${encodeURIComponent(key)}`

    try {
        const upstream = await fetch(url, { signal: AbortSignal.timeout(10_000) })
        const ctype = upstream.headers.get("content-type") ?? ""
        if (!upstream.ok || !ctype.includes("image")) {
            // PENTING: 401/403/429 (key ditolak / kuota habis) TIDAK boleh
            // dikonversi jadi 502 dengan cache panjang — cukup 503 dengan
            // no-store supaya browser tidak menyimpan respons ini dan layer
            // overlay otomatis jadi kosong (transparan), bukan gambar error.
            const retryable = upstream.status === 401 || upstream.status === 403 || upstream.status === 429
            return new NextResponse(JSON.stringify({ error: "traffic_tile_unavailable", status: upstream.status }), {
                status: retryable ? 503 : 502,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                },
            })
        }
        const body = await upstream.arrayBuffer()
        return new NextResponse(body, {
            status: 200,
            headers: {
                "Content-Type": "image/png",
                // 60 detik: data live, tapi aman untuk pan/zoom dalam satu sesi.
                "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
            },
        })
    } catch {
        return new NextResponse("Upstream timeout", { status: 504 })
    }
}

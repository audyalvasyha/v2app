"use client"

/**
 * TrafficMap — peta Leaflet (tile OpenStreetMap, gratis tanpa key).
 *
 * - Garis rute SEMUA daerah digambar dari geometri jalan asli OSRM
 *   (server-side), warna mengikuti status live TomTom / default netral.
 * - Rute terpilih disorot tebal + rute lain diredupkan supaya fokus jelas.
 * - Marker pool (origin) beda bentuk dari tujuan.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import type { Map as LeafletMap, LayerGroup, TileLayer } from "leaflet"
import { Maximize2, Minimize2 } from "lucide-react"

export interface MapLocation {
    id: string
    name: string
    latitude: number
    longitude: number
    isOrigin: boolean
    level: "good" | "warning" | "critical" | "unknown"
    hasGeometry: boolean
    tooltip: string
    /** Garis rute jalan asli (OSRM). */
    geometry: { coordinates: Array<{ latitude: number; longitude: number }>; distanceKm: number } | null
    /** Status traffic flow sampling per-rute (opsional). */
    trafficFlow?: { level: "good" | "warning" | "critical" | "unknown"; currentSpeed?: number; freeFlowSpeed?: number } | null
}

export interface TrafficMapProps {
    locations: MapLocation[]
    selectedId: string | null
    onSelect: (id: string | null) => void
    /** Tampilkan garis SEMUA rute sekaligus. Default: hanya rute terpilih. */
    showLines?: boolean
    /** Overlay traffic jalan ala Google Maps (tile TomTom via proxy). Default on. */
    showTraffic?: boolean
    /** Callback dipanggil bila overlay traffic tile gagal dimuat (quota/403). */
    onTrafficTileError?: () => void
    /** Callback dipanggil bila overlay traffic tile sudah kembali normal. */
    onTrafficTileRestore?: () => void
}

const LEVEL_COLOR: Record<string, string> = {
    good: "#0842a0",
    warning: "#f59e0b",
    critical: "#ef4444",
    unknown: "#64748b",
}

const NEUTRAL_COLOR = "#3b82f6"

// Pusat kira-kira tengah Rokan Hilir (antara Bagan Batu & Bagansiapiapi)
const CENTER: [number, number] = [1.9, 100.72]
const ZOOM = 9

export function TrafficMap({
    locations,
    selectedId,
    onSelect,
    showLines = false,
    showTraffic = true,
    onTrafficTileError,
    onTrafficTileRestore,
}: TrafficMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<LeafletMap | null>(null)
    const groupRef = useRef<LayerGroup | null>(null)
    const flowLayerRef = useRef<TileLayer | null>(null)
    const fitOnceRef = useRef(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Masuk/keluar fullscreen via Fullscreen API bawaan browser (native,
    // tanpa library). Leaflet perlu invalidateSize() setelah ukuran container
    // berubah supaya tile tidak terpotong/tergeser.
    const toggleFullscreen = useCallback(() => {
        const el = containerRef.current
        if (!el) return
        if (document.fullscreenElement) {
            void document.exitFullscreen()
        } else if (typeof el.requestFullscreen === "function") {
            // Fullscreen API bisa diblokir oleh kebijakan keamanan environment
            // (mis. embedded preview/iframe) — jangan crash, cukup abaikan.
            try {
                void el.requestFullscreen()
            } catch {
                // Disallowed by permissions policy — tombol tidak berfungsi di sini.
            }
        }
    }, [])

    useEffect(() => {
        const onChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement))
            // Leaflet wajib tahu ukuran baru container. Beberapa browser menunda
            // relayout elemen top-layer fullscreen, jadi invalidateSize dipanggil
            // berkali-kali (rAF + 150ms + 400ms) supaya tile selalu mengisi layar
            // penuh — kalau hanya sekali, peta bisa tampak blank/hitam.
            const resize = () => mapRef.current?.invalidateSize({ animate: false })
            requestAnimationFrame(resize)
            setTimeout(resize, 150)
            setTimeout(resize, 400)
        }
        document.addEventListener("fullscreenchange", onChange)
        // Jaga-jaga kalau ukuran viewport berubah saat fullscreen (rotate, devtools).
        window.addEventListener("resize", onChange)
        return () => {
            document.removeEventListener("fullscreenchange", onChange)
            window.removeEventListener("resize", onChange)
        }
    }, [])

    // Simpan props terbaru agar callback map (tanpa re-init) selalu baca data baru.
    const propsRef = useRef({ locations, selectedId, onSelect, showLines, showTraffic, onTrafficTileError, onTrafficTileRestore })
    propsRef.current = { locations, selectedId, onSelect, showLines, showTraffic, onTrafficTileError, onTrafficTileRestore }

    // Bootstrap map sekali
    useEffect(() => {
        let cancelled = false

        async function bootstrap() {
            const leaflet = await import("leaflet")
            if (cancelled || !containerRef.current || mapRef.current) return
            const L = leaflet.default

            const map = L.map(containerRef.current, {
                center: CENTER,
                zoom: ZOOM,
                scrollWheelZoom: true, // scroll halaman nggak ikut zoom peta
            })
            // Basemap — Carto raster kini WAJIB API key (sejak 25 Sep 2026 tile
            // tanpa key menampilkan watermark "API KEY REQUIRED"), jadi:
            //  - Kalau NEXT_PUBLIC_CARTO_BASEMAPS_KEY diset → Carto Voyager.
            //  - Kalau tidak → OpenStreetMap standar (keyless, tetap gratis).
            // Carto key gratis: https://carto.com/basemaps/apikey/
            // PENTING: parameter resminya `key` (bukan `apikey`) — dengan
            // `apikey` Carto tetap menyajikan tile watermark (terverifikasi:
            // tile 2 KB watermark vs 9,7 KB tile asli).
            const cartoKey = process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY
            // Cek sebelum pakai: Carto mengembalikan tile WATERMARK berukuran ~2 KB
            // dengan HTTP 200 kalau key tidak valid/kuota habis (bukan error 4xx!),
            // jadi tileerror tidak pernah terpanggil dan peta tampak hitam/abu —
            // persis kasus screenshot tablet. Satu tile di-fetch langsung: kalau
            // responsnya kecil (watermark) atau gagal → pakai OSM standar (keyless).
            let useCarto = false
            if (cartoKey) {
                try {
                    const probe = await fetch(
                        "https://a.basemaps.cartocdn.com/rastertiles/voyager/9/398/255.png?key=" + encodeURIComponent(cartoKey),
                        { signal: AbortSignal.timeout(5_000) },
                    )
                    const size = (await probe.blob()).size
                    useCarto = probe.ok && size > 3000
                } catch {
                    useCarto = false
                }
            }
            if (useCarto) {
                L.tileLayer(
                    `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey!)}`,
                    {
                        maxZoom: 18,
                        subdomains: "abcd",
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
                    },
                ).addTo(map)
            } else {
                L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    maxZoom: 18,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                }).addTo(map)
            }

            // Overlay traffic jalan live (TomTom flow tiles via proxy server) —
            // warna jalan = kecepatan live, persis lapisan traffic Google Maps.
            let tileErrors = 0
            let tileOk = false
            const flow = L.tileLayer("/api/traffic/tiles/flow/relative0/{z}/{x}/{y}.png", {
                maxZoom: 19,
                opacity: 0.9,
                attribution: "Traffic &copy; TomTom",
            })
            flow.on("tileerror", () => {
                tileErrors++
                if (tileErrors >= 3 && !tileOk) propsRef.current.onTrafficTileError?.()
            })
            flow.on("tileload", () => {
                tileErrors = 0
                if (!tileOk) {
                    tileOk = true
                    propsRef.current.onTrafficTileRestore?.()
                }
            })
            flow.addTo(map)
            flowLayerRef.current = flow

            map.on("click", () => propsRef.current.onSelect(null))

            mapRef.current = map
            groupRef.current = L.layerGroup().addTo(map)
        }

        void bootstrap()

        return () => {
            cancelled = true
            mapRef.current?.remove()
            mapRef.current = null
            groupRef.current = null
            fitOnceRef.current = false
        }
    }, [])

    // Gambar ulang layer setiap data / pilihan berubah (tanpa bikin ulang map)
    useEffect(() => {
        let cancelled = false

        async function redraw() {
            const leaflet = await import("leaflet")
            if (cancelled || !mapRef.current || !groupRef.current) return
            const L = leaflet.default
            const group = groupRef.current
            group.clearLayers()

            const { locations: locs, selectedId: sel, showLines: lines } = propsRef.current
            const hasSelection = Boolean(sel)

            // Garis rute: hanya rute terpilih, atau semua kalau toggle aktif
            for (const loc of locs) {
                const isSelected = sel === loc.id
                if (!lines && !isSelected) continue

                const geo = loc.geometry
                if (!geo || geo.coordinates.length < 2) continue

                const line = geo.coordinates
                    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
                    .map((p) => [p.latitude, p.longitude] as [number, number])
                if (line.length < 2) continue

                const dimmed = lines && hasSelection && !isSelected

                L.polyline(line, {
                    color: isSelected ? "#2563eb" : loc.level !== "unknown" ? LEVEL_COLOR[loc.level] : NEUTRAL_COLOR,
                    weight: isSelected ? 6 : dimmed ? 2 : 4,
                    opacity: dimmed ? 0.25 : 0.9,
                    lineJoin: "round",
                    lineCap: "round",
                })
                    .bindTooltip(loc.tooltip, { sticky: true })
                    .on("click", (e) => {
                        L.DomEvent.stopPropagation((e as unknown as { originalEvent: Event }).originalEvent)
                        propsRef.current.onSelect(loc.id)
                    })
                    .addTo(group)
            }

            // Marker daerah (selalu tampil — garis opsional biar nggak berantakan)
            for (const loc of locs) {
                const isSelected = sel === loc.id
                const dimmed = hasSelection && !isSelected

                if (loc.isOrigin) {
                    L.circleMarker([loc.latitude, loc.longitude], {
                        radius: 8,
                        color: "#1e293b",
                        weight: 2.5,
                        fillColor: "#0ea5e9",
                        fillOpacity: dimmed ? 0.4 : 1,
                    })
                        .bindTooltip(`Pool ${loc.name}`)
                        .on("click", (e) => {
                            L.DomEvent.stopPropagation((e as unknown as { originalEvent: Event }).originalEvent)
                            propsRef.current.onSelect(loc.id)
                        })
                        .addTo(group)
                } else {
                    L.circleMarker([loc.latitude, loc.longitude], {
                        radius: isSelected ? 8 : 5,
                        color: "#1e293b",
                        weight: 1.5,
                        fillColor: isSelected ? "#2563eb" : loc.level !== "unknown" ? LEVEL_COLOR[loc.level] : "#60a5fa",
                        fillOpacity: dimmed ? 0.35 : 0.95,
                    })
                        .bindTooltip(loc.tooltip)
                        .on("click", (e) => {
                            L.DomEvent.stopPropagation((e as unknown as { originalEvent: Event }).originalEvent)
                            propsRef.current.onSelect(loc.id)
                        })
                        .addTo(group)
                }
            }

            // Fit sekali saat data pertama siap; kalau ada rute terpilih, fokus ke rute itu.
            if (!fitOnceRef.current) {
                const all: [number, number][] = locs.map((l) => [l.latitude, l.longitude] as [number, number])
                if (all.length > 0) {
                    mapRef.current.fitBounds(L.latLngBounds(all).pad(0.15))
                    fitOnceRef.current = true
                }
            } else if (sel) {
                const geo = locs.find((l) => l.id === sel)?.geometry
                const pts: [number, number][] = geo
                    ? geo.coordinates.map((p) => [p.latitude, p.longitude] as [number, number])
                    : locs.filter((l) => l.id === sel).map((l) => [l.latitude, l.longitude] as [number, number])
                if (pts.length >= 2) mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.2))
            }
        }

        // Toggle overlay traffic tanpa re-init map
        const map = mapRef.current
        if (flowLayerRef.current && map) {
            if (showTraffic) {
                if (!map.hasLayer(flowLayerRef.current)) flowLayerRef.current.addTo(map)
            } else {
                map.removeLayer(flowLayerRef.current)
            }
        }

        void redraw()
        return () => {
            cancelled = true
        }
    }, [locations, selectedId, showLines, showTraffic])

    return (
        <div
            ref={containerRef}
            // PERBAIKAN: Gunakan 1 class statis. 
            // Biarkan native API browser yang membuat elemen ini memenuhi layar.
            // Gunakan modifier [&:fullscreen]: untuk styling spesifik saat layar penuh
            // tanpa merusak kalkulasi posisi Leaflet.
            className="relative isolate z-0 h-[420px] w-full overflow-hidden rounded-xl border bg-muted/30 lg:h-[560px] [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-background [&:-webkit-full-screen]:rounded-none [&:-webkit-full-screen]:border-0 [&:-webkit-full-screen]:bg-background"
            data-testid="traffic-map"
            role="application"
            aria-label="Peta rute pengiriman Rokan Hilir"
        >
            {/* Tombol fullscreen — tumpuk di kanan atas peta */}
            <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Keluar dari layar penuh (Esc)" : "Tampilkan layar penuh"}
                aria-label={isFullscreen ? "Keluar dari layar penuh" : "Tampilkan layar penuh"}
                className="absolute right-2.5 top-2.5 z-[500] inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white/95 shadow-sm transition-colors hover:bg-white dark:bg-slate-800/95 dark:hover:bg-slate-800"
            >
                {isFullscreen ? (
                    <Minimize2 className="h-4 w-4 text-foreground" />
                ) : (
                    <Maximize2 className="h-4 w-4 text-foreground" />
                )}
            </button>
        </div>
    )
}

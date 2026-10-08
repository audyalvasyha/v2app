"use client"

/**
 * TrafficMap — peta Leaflet (tile OpenStreetMap, gratis tanpa key).
 *
 * - Garis rute SEMUA daerah digambar dari geometri jalan asli OSRM
 *   (server-side), warna mengikuti status live TomTom / default netral.
 * - Rute terpilih disorot tebal + rute lain diredupkan supaya fokus jelas.
 * - Marker pool (origin) beda bentuk dari tujuan.
 */

import { useEffect, useRef } from "react"
import "leaflet/dist/leaflet.css"
import type { Map as LeafletMap, LayerGroup, TileLayer } from "leaflet"

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
}

const LEVEL_COLOR: Record<string, string> = {
    good: "#10b981",
    warning: "#f59e0b",
    critical: "#ef4444",
    unknown: "#64748b",
}

const NEUTRAL_COLOR = "#3b82f6"

// Pusat kira-kira tengah Rokan Hilir (antara Bagan Batu & Bagansiapiapi)
const CENTER: [number, number] = [1.9, 100.72]
const ZOOM = 9

export function TrafficMap({ locations, selectedId, onSelect, showLines = false, showTraffic = true }: TrafficMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<LeafletMap | null>(null)
    const groupRef = useRef<LayerGroup | null>(null)
    const flowLayerRef = useRef<TileLayer | null>(null)
    const fitOnceRef = useRef(false)

    // Simpan props terbaru agar callback map (tanpa re-init) selalu baca data baru.
    const propsRef = useRef({ locations, selectedId, onSelect, showLines, showTraffic })
    propsRef.current = { locations, selectedId, onSelect, showLines, showTraffic }

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
                scrollWheelZoom: false, // scroll halaman nggak ikut zoom peta
            })
            // Basemap ala Google Maps (Carto Voyager — gratis, tanpa key)
            L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
                maxZoom: 19,
                subdomains: "abcd",
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
            }).addTo(map)

            // Overlay traffic jalan live (TomTom flow tiles via proxy server) —
            // warna jalan = kecepatan live, persis lapisan traffic Google Maps.
            const flow = L.tileLayer("/api/traffic/tiles/flow/relative0/{z}/{x}/{y}.png", {
                maxZoom: 19,
                opacity: 0.9,
                attribution: "Traffic &copy; TomTom",
            }).addTo(map)
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
            // isolate + z-0: bikin stacking context sendiri supaya z-index internal
            // Leaflet (pane 200-1000) tidak menembus header sticky aplikasi.
            className="relative isolate z-0 h-[420px] w-full overflow-hidden rounded-xl border bg-muted/30 lg:h-[560px]"
            data-testid="traffic-map"
            role="application"
            aria-label="Peta rute pengiriman Rokan Hilir"
        />
    )
}

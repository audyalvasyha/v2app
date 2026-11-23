"use client"

/**
 * TrafficView — Monitoring Lalu Lintas Rute Pengiriman (redesign 2026).
 *
 * Sumber data: GET /api/traffic.
 *  - Garis rute: geometri jalan asli dari OSRM (gratis, tanpa key) untuk
 *    SEMUA daerah.
 *  - Status kondisi: live dari TomTom selama kuota free tier tersedia,
 *    otomatis fallback ke ESTIMASI (jadwal × jarak × cuaca) bila key ditolak /
 *    kuota habis — setiap rute punya flag `source` supaya UI jujur.
 *  - Overlay traffic jalan (tile TomTom via proxy): otomatis disembunyikan
 *    bila tile gagal dimuat (kuota habis), dengan notifikasi di UI.
 *
 * Layout: peta di kiri, panel kanan berisi daftar rute compact (scrollable)
 * + detail rute terpilih. Klik baris / garis / pin → peta zoom ke rute itu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
    Activity,
    AlertTriangle,
    CloudRain,
    Gauge,
    History,
    Info,
    Layers,
    MapPin,
    Navigation,
    RefreshCw,
    Route,
    Satellite,
    Truck,
    Clock,
    Wifi,
    WifiOff,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import type { MapLocation } from "@/components/organisms/traffic-map"
import { useTrafficHistory, type LocationHistoryUi } from "@/hooks/use-traffic-history"

// Peta Leaflet — ssr:false karena Leaflet menyentuh window saat init.
const TrafficMap = dynamic(() => import("@/components/organisms/traffic-map").then((m) => m.TrafficMap), {
    ssr: false,
    loading: () => <Skeleton className="h-[420px] w-full rounded-xl lg:h-[560px]" />,
})

// Grafik historis keluar dari boundary charts.tsx (satu chunk recharts).
const HistoryChart = dynamic(
    () => import("@/components/molecules/charts").then((m) => m.HistoryChart),
    { ssr: false, loading: () => <Skeleton className="h-[180px] w-full rounded-md" /> },
)

type TrafficLevel = "good" | "warning" | "critical" | "unknown"
type FlowSource = "live" | "estimated"

interface ApiLocation {
    id: string
    name: string
    note: string
    latitude: number
    longitude: number
    isOrigin: boolean
    geometry: {
        coordinates: Array<{ latitude: number; longitude: number }>
        distanceKm: number
        durationMin: number
    } | null
    live: {
        level: TrafficLevel
        travelTimeMin: number
        delayMin: number
        completeness: number
    } | null
    /** Kondisi traffic per-rute — live TomTom atau fallback estimasi. */
    trafficFlow: {
        level: TrafficLevel
        currentSpeed: number
        freeFlowSpeed: number
        source: FlowSource
    } | null
    /** ETA dinamis — durasi yang sudah memperhitungkan kepadatan. */
    eta: {
        durationMin: number
        source: FlowSource
    } | null
}

interface TrafficApiResponse {
    configured: boolean
    generatedAt: string
    summary: {
        totalRoutes: number
        routedGeometries: number
        liveCount: number
        badCount: number
        trafficCount: number
        estimatedCount: number
    }
    locations: ApiLocation[]
}

const STATUS_META: Record<TrafficLevel, { label: string; text: string; badge: string; icon: React.ReactNode | null }> = {
    good: {
        label: "Lancar",
        text: "text-emerald-700 dark:text-emerald-400",
        badge: "border-emerald-500/35 bg-emerald-500/10",
        icon: <Activity className="h-3.5 w-3.5" />,
    },
    warning: {
        label: "Perlu perhatian",
        text: "text-amber-700 dark:text-amber-400",
        badge: "border-amber-500/35 bg-amber-500/10",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    critical: {
        label: "Macet",
        text: "text-red-700 dark:text-red-400",
        badge: "border-red-500/35 bg-red-500/10",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    unknown: {
        label: "Tanpa data",
        text: "text-slate-600 dark:text-slate-400",
        badge: "border-slate-500/35 bg-slate-500/10",
        icon: <Navigation className="h-3.5 w-3.5" />,
    },
}

const LEVEL_DOT: Record<TrafficLevel, string> = {
    good: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-slate-400",
}

/** Level efektif: Route Monitoring (jika ada) → Traffic Flow sampling → unknown. */
function effLevel(l: ApiLocation): TrafficLevel {
    if (l.live && l.live.level !== "unknown") return l.live.level
    if (l.trafficFlow && l.trafficFlow.level !== "unknown") return l.trafficFlow.level
    return "unknown"
}

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60_000)
    if (min < 1) return "baru saja"
    if (min < 60) return `${min} menit lalu`
    return `${Math.floor(min / 60)} jam lalu`
}

/**
 * Grafik pola historis rute terpilih — jam berapa biasanya padat.
 * Muncul hanya bila tabel `traffic_history` sudah terisi (SQL script
 * dijalankan + snapshot terkumpul); kalau belum, block ini hilang senyap.
 */
function SelectedRouteHistory({ history }: { history: LocationHistoryUi | null }) {
    if (!history || !history.available || history.hourlyPattern.length < 4) return null
    const worst = [...history.hourlyPattern].sort((a, b) => a.avgRatio - b.avgRatio)[0]
    return (
        <div className="rounded-lg border bg-muted/20 p-2">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <History className="h-3 w-3 shrink-0" /> Pola kepadatan (30 hari · WIB)
            </p>
            <HistoryChart data={history.hourlyPattern} />
            {worst && worst.avgRatio < 0.8 && (
                <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                    Biasanya paling padat jam {String(worst.hour).padStart(2, "0")}.00 ({Math.round(worst.avgRatio * 100)}% dari kecepatan normal)
                </p>
            )}
        </div>
    )
}

export function TrafficView() {
    const [data, setData] = useState<TrafficApiResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const detailRef = useRef<HTMLDivElement>(null)
    const [showLines, setShowLines] = useState(false)
    const [showTraffic, setShowTraffic] = useState(true)
    const [tileUnavailable, setTileUnavailable] = useState(false)

    const load = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/traffic", { cache: "no-store" })
            const json = (await res.json()) as TrafficApiResponse
            setData(json)
            if (!res.ok) setError("Gagal mengambil status lalu lintas")
        } catch {
            setError("Gagal mengambil status lalu lintas")
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    // Auto-refresh tiap 5 menit — data live berubah, UI tetap segar.
    useEffect(() => {
        const t = setInterval(() => load(true), 5 * 60_000)
        return () => clearInterval(t)
    }, [load])

    const locations = data?.locations ?? []
    const destinationIds = useMemo(
        () => locations.filter((l) => !l.isOrigin).map((l) => l.id),
        [locations],
    )
    const history = useTrafficHistory(destinationIds)
    const hasLive = (data?.summary.liveCount ?? 0) > 0
    const liveFlowCount = locations.filter((l) => l.trafficFlow?.source === "live").length

    const selected = locations.find((l) => l.id === selectedId) ?? null

    const counts = useMemo(
        () => ({
            good: locations.filter((l) => !l.isOrigin && effLevel(l) === "good").length,
            warning: locations.filter((l) => effLevel(l) === "warning").length,
            critical: locations.filter((l) => effLevel(l) === "critical").length,
            unknown: locations.filter((l) => !l.isOrigin && effLevel(l) === "unknown").length,
        }),
        [locations],
    )

    const longest = useMemo(
        () =>
            locations
                .filter((l) => !l.isOrigin && l.geometry)
                .sort((a, b) => (b.geometry?.distanceKm ?? 0) - (a.geometry?.distanceKm ?? 0))[0] ?? null,
        [locations],
    )

    const mapLocations: MapLocation[] = useMemo(
        () =>
            locations.map((l) => {
                const level = effLevel(l)
                const km = l.geometry ? `${l.geometry.distanceKm.toFixed(1)} km` : "—"
                const livePart =
                    l.live && l.live.level !== "unknown"
                        ? ` · ${l.live.travelTimeMin} mnt${l.live.delayMin >= 1 ? ` (+${l.live.delayMin} mnt)` : ""}`
                        : l.trafficFlow && l.trafficFlow.level !== "unknown"
                            ? ` · ${l.trafficFlow.currentSpeed}/${l.trafficFlow.freeFlowSpeed} km/j${l.trafficFlow.source === "estimated" ? " (est)" : ""}`
                            : ""
                return {
                    id: l.id,
                    name: l.name,
                    latitude: l.latitude,
                    longitude: l.longitude,
                    isOrigin: l.isOrigin,
                    level,
                    hasGeometry: Boolean(l.geometry),
                    geometry: l.geometry,
                    trafficFlow: l.trafficFlow,
                    tooltip: `${l.name} — ${km}${livePart} · ${STATUS_META[level].label}`,
                }
            }),
        [locations],
    )

    const onSelect = useCallback((id: string | null) => {
        setSelectedId((prev) => (prev && id === prev ? null : id))
        if (id && window.matchMedia("(max-width: 1023px)").matches) {
            window.setTimeout(() => {
                detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }, 0)
        }
    }, [])

    const onTileError = useCallback(() => {
        setTileUnavailable(true)
        setShowTraffic(false)
    }, [])
    const onTileRestore = useCallback(() => setTileUnavailable(false), [])

    const summary = data?.summary

    return (
        <div className="space-y-4">
            {/* Toolbar ringkas — judul halaman sudah tampil di header konten. */}
            <Card className="gap-0 py-0 shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        {data && (
                            liveFlowCount > 0 ? (
                                <Badge variant="outline" className="gap-1.5 border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                    <Wifi className="h-3 w-3" /> Data live TomTom
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="gap-1.5 border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                                    <Satellite className="h-3 w-3" /> Mode estimasi
                                </Badge>
                            )
                        )}
                        <p className="text-sm text-muted-foreground">
                            {summary ? `${summary.routedGeometries}/${summary.totalRoutes} rute` : "Memuat rute…"}
                            {data ? ` · diperbarui ${relativeTime(data.generatedAt)}` : ""}
                        </p>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => load(true)}
                        disabled={refreshing || loading}
                        className="gap-1.5"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Memuat…" : "Segarkan"}
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <Alert variant="destructive" className="flex items-start gap-2 p-3 text-sm">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {data && !data.configured && (
                <Alert className="flex items-start gap-2 border-amber-300/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <AlertDescription className="text-amber-700 dark:text-amber-400">
                        Data live belum tersedia — status memakai <strong>estimasi</strong> dari jadwal, jarak,
                        dan cuaca.
                    </AlertDescription>
                </Alert>
            )}

            {data && data.configured && !hasLive && liveFlowCount === 0 && (
                <Alert className="flex items-start gap-2 border-blue-300/50 bg-blue-500/10 p-3 text-sm text-blue-800 dark:text-blue-300">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <AlertDescription className="text-blue-800 dark:text-blue-300">
                        Data live sedang tidak tersedia — status memakai <strong>estimasi</strong> dari pola jam,
                        karakter jalan, dan cuaca.
                    </AlertDescription>
                </Alert>
            )}

            {tileUnavailable && showTraffic && (
                <Alert className="flex items-start gap-2 border-slate-300/50 bg-slate-500/10 p-3 text-sm text-slate-700 dark:text-slate-300">
                    <Layers className="mt-0.5 h-4 w-4 shrink-0" />
                    <AlertDescription className="text-slate-700 dark:text-slate-300">
                        Lapisan warna peta sementara tidak tersedia. Garis rute dan status per daerah tetap aktif.
                    </AlertDescription>
                </Alert>
            )}

            {/* ── Peta (kiri) + daftar rute & detail (kanan) ──────────────── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                <div className="lg:col-span-3">
                    <TrafficMap
                        locations={mapLocations}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        showLines={showLines}
                        showTraffic={showTraffic && !tileUnavailable}
                        onTrafficTileError={onTileError}
                        onTrafficTileRestore={onTileRestore}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT.good}`} /> Lancar
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT.warning}`} /> Perhatian
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT.critical}`} /> Macet
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Pool
                        </span>
                        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowTraffic((s) => !s)}
                            disabled={tileUnavailable}
                            className={`h-7 gap-1.5 px-2.5 text-[11px] ${showTraffic && !tileUnavailable ? "border-primary/50 bg-primary/5 text-foreground" : ""}`}
                            title={tileUnavailable ? "Tile traffic tidak tersedia saat ini" : undefined}
                        >
                            <Layers className="h-3 w-3" /> Overlay traffic: {showTraffic && !tileUnavailable ? "AKTIF" : "MATI"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowLines((s) => !s)}
                            className="h-7 gap-1.5 px-2.5 text-[11px]"
                        >
                            <Route className="h-3 w-3" /> {showLines ? "Sembunyikan semua garis" : "Tampilkan semua garis"}
                        </Button>
                    </div>
                </div>

                {/* Panel kanan: daftar rute compact + detail rute terpilih */}
                <div className="lg:col-span-1">
                    <Card className="flex h-full flex-col gap-0 py-0 shadow-sm">
                        <CardContent className="flex h-full flex-col p-3">
                        <h2 className="mb-2 flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <Navigation className="h-3.5 w-3.5" /> Rute dari Pool Bagan Batu
                        </h2>

                        {/* Daftar rute — compact, satu kolom, scrollable */}
                        <div className="max-h-[240px] shrink-0 space-y-1 overflow-y-auto pr-1 lg:max-h-[280px]">
                            {loading ? (
                                <div className="space-y-1">
                                    {locations.slice(0, 8).map((l) => (
                                        <Skeleton key={l.id} className="h-7 w-full rounded-md" />
                                    ))}
                                </div>
                            ) : (
                                locations
                                    .filter((l) => !l.isOrigin)
                                    .map((l) => {
                                        const level = effLevel(l)
                                        const isSelected = selectedId === l.id
                                        const flow = l.trafficFlow
                                        return (
                                            <button
                                                key={l.id}
                                                onClick={() => onSelect(l.id)}
                                                title={
                                                    l.geometry
                                                        ? `${l.name} — ${l.geometry.distanceKm.toFixed(1)} km · ${l.geometry.durationMin} mnt${flow && flow.level !== "unknown" ? ` · ${STATUS_META[level].label}` : ""}`
                                                        : l.name
                                                }
                                                className={[
                                                    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                                                    isSelected
                                                        ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                                                        : "hover:bg-muted/40",
                                                ].join(" ")}
                                            >
                                                <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[level]}`} />
                                                <span className="min-w-0 flex-1 truncate text-xs font-medium">{l.name}</span>
                                                {l.live && l.live.delayMin >= 1 && (
                                                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
                                                        +{l.live.delayMin}m
                                                    </span>
                                                )}
                                                {flow?.source === "estimated" && (
                                                    <Satellite
                                                        className="h-3 w-3 shrink-0 text-blue-700 dark:text-blue-400"
                                                        aria-label="estimasi"
                                                    />
                                                )}
                                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                    {l.geometry ? `${l.geometry.distanceKm.toFixed(1)} km` : "—"}
                                                </span>
                                            </button>
                                        )
                                    })
                            )}
                        </div>

                        <p className="mt-2 flex shrink-0 items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
                            <CloudRain className="mt-0.5 h-3 w-3 shrink-0" />
                            Estimasi memakai cuaca &amp; pola jam. Titik = kondisi rute, angka = jarak dari pool.
                        </p>

                        {/* Detail rute terpilih */}
                        <div ref={detailRef} className="mt-3 scroll-mt-20 border-t pt-3 sm:scroll-mt-24">
                            {!selected ? (
                                <div className="flex flex-1 flex-col gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        Klik pin atau baris untuk detail rute.
                                    </p>
                                    {counts.unknown > 0 && (
                                        <p className="text-[11px] text-muted-foreground">
                                            {counts.unknown} rute belum punya data kondisi.
                                        </p>
                                    )}
                                    {longest && (
                                        <button
                                            onClick={() => onSelect(longest.id)}
                                            className="flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40"
                                        >
                                            <div>
                                                <p className="text-xs font-medium">Rute terjauh</p>
                                                <p className="text-[11px] text-muted-foreground tabular-nums">
                                                    {longest.name} · {longest.geometry?.distanceKm.toFixed(1)} km ·{" "}
                                                    {longest.geometry?.durationMin} mnt
                                                </p>
                                            </div>
                                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-2 text-sm font-semibold">
                                                <Truck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                                <span className="truncate">{selected.name}</span>
                                            </p>
                                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{selected.note}</p>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={`gap-1.5 ${STATUS_META[effLevel(selected)].badge} ${STATUS_META[effLevel(selected)].text}`}
                                        >
                                            {STATUS_META[effLevel(selected)].icon}
                                            {STATUS_META[effLevel(selected)].label}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="rounded-lg bg-muted/40 p-1.5">
                                            <p className="text-[10px] text-muted-foreground">Jarak</p>
                                            <p className="text-xs font-semibold tabular-nums">
                                                {selected.geometry ? `${selected.geometry.distanceKm.toFixed(1)} km` : "—"}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-muted/40 p-1.5">
                                            <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                                                <Clock className="h-2.5 w-2.5" /> ETA kini
                                            </p>
                                            <p className="text-xs font-semibold tabular-nums">
                                                {selected.eta ? `${selected.eta.durationMin} mnt` : selected.geometry ? `${selected.geometry.durationMin} mnt` : "—"}
                                            </p>
                                            {selected.eta && selected.geometry && selected.eta.durationMin > selected.geometry.durationMin && (
                                                <p className="text-[10px] tabular-nums text-amber-700 dark:text-amber-400">
                                                    +{selected.eta.durationMin - selected.geometry.durationMin} mnt vs normal
                                                </p>
                                            )}
                                        </div>
                                        <div className="rounded-lg bg-muted/40 p-1.5">
                                            <p className="text-[10px] text-muted-foreground">Kondisi</p>
                                            <p className="text-xs font-semibold tabular-nums">
                                                {selected.trafficFlow && selected.trafficFlow.level !== "unknown"
                                                    ? `${selected.trafficFlow.currentSpeed} km/j`
                                                    : "—"}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Bar rasio kecepatan aktual vs free-flow */}
                                    {selected.trafficFlow && selected.trafficFlow.level !== "unknown" && (
                                        <div>
                                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                                <span className="inline-flex items-center gap-1">
                                                    <Gauge className="h-3 w-3" /> Kecepatan vs normal
                                                </span>
                                                <span className="tabular-nums">
                                                    {selected.trafficFlow.currentSpeed}/{selected.trafficFlow.freeFlowSpeed} km/j
                                                </span>
                                            </div>
                                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className={`h-full rounded-full transition-all ${effLevel(selected) === "good"
                                                            ? "bg-emerald-500"
                                                            : effLevel(selected) === "warning"
                                                                ? "bg-amber-500"
                                                                : "bg-red-500"
                                                        }`}
                                                    style={{
                                                        width: `${Math.min(100, Math.round((selected.trafficFlow.currentSpeed / (selected.trafficFlow.freeFlowSpeed || 1)) * 100))}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {selected.live && selected.live.delayMin >= 1 && (
                                        <p className="flex items-center gap-1.5 rounded-lg border border-amber-300/50 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            Tundaan +{selected.live.delayMin} menit dibanding kondisi normal.
                                        </p>
                                    )}
                                    {/* Flag sumber data — jujur live vs estimasi */}
                                    {selected.trafficFlow && (
                                        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                            {selected.trafficFlow.source === "live" ? (
                                                <>
                                                    <Wifi className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Data live TomTom.
                                                </>
                                            ) : (
                                                <>
                                                    <Satellite className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" /> Kondisi ini berupa estimasi,
                                                    bukan pengukuran live.
                                                </>
                                            )}
                                        </p>
                                    )}
                                    {/* ── Grafik pola historis (jika data sudah terkumpul) ── */}
                                    <SelectedRouteHistory history={history.byId.get(selected.id) ?? null} />
                                </div>
                            )}
                        </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

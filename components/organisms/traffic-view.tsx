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

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
    Activity,
    AlertTriangle,
    CloudRain,
    Gauge,
    Info,
    Layers,
    MapPin,
    Navigation,
    RefreshCw,
    Route,
    Satellite,
    Truck,
    Wifi,
    WifiOff,
} from "lucide-react"
import type { MapLocation } from "@/components/organisms/traffic-map"

// Peta Leaflet — ssr:false karena Leaflet menyentuh window saat init.
const TrafficMap = dynamic(() => import("@/components/organisms/traffic-map").then((m) => m.TrafficMap), {
    ssr: false,
    loading: () => <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted/40 lg:h-[560px]" />,
})

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
        badge: "border-emerald-300/60 bg-emerald-500/10",
        icon: <Activity className="h-3.5 w-3.5" />,
    },
    warning: {
        label: "Perlu perhatian",
        text: "text-amber-700 dark:text-amber-400",
        badge: "border-amber-300/60 bg-amber-500/10",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    critical: {
        label: "Macet",
        text: "text-red-700 dark:text-red-400",
        badge: "border-red-300/60 bg-red-500/10",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    unknown: {
        label: "Tanpa data",
        text: "text-slate-600 dark:text-slate-400",
        badge: "border-slate-300/60 bg-slate-500/10",
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

export function TrafficView() {
    const [data, setData] = useState<TrafficApiResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
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
    }, [])

    const onTileError = useCallback(() => {
        setTileUnavailable(true)
        setShowTraffic(false)
    }, [])
    const onTileRestore = useCallback(() => setTileUnavailable(false), [])

    const summary = data?.summary

    return (
        <div className="space-y-4">
            {/* ── Hero header ─────────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-600/10 via-card to-card">
                <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="flex items-center gap-2 text-lg font-semibold">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15">
                                    <Route className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
                                </span>
                                Monitoring Lalu Lintas
                            </h1>
                            {/* Sumber data — jujur live vs estimasi */}
                            {data && (
                                liveFlowCount > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <Wifi className="h-3 w-3" /> Data live TomTom
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300/60 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                                        <Satellite className="h-3 w-3" /> Mode estimasi (fallback gratis)
                                    </span>
                                )
                            )}
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {summary ? `${summary.routedGeometries} dari ${summary.totalRoutes} rute digambar di jalan asli` : "Memuat rute…"}
                            {data ? ` · diperbarui ${relativeTime(data.generatedAt)}` : ""}
                        </p>
                    </div>
                    <button
                        onClick={() => load(true)}
                        disabled={refreshing || loading}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Memuat…" : "Segarkan"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <WifiOff className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {data && !data.configured && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        TOMTOM_API_KEY belum diset — seluruh status memakai <strong>estimasi fallback gratis</strong> (jadwal
                        kepadatan × jarak × cuaca). Garis rute tetap akurat dari OSRM. Isi key di Settings → Environment untuk
                        data live.
                    </span>
                </div>
            )}

            {data && data.configured && !hasLive && liveFlowCount === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-300/50 bg-blue-500/10 p-3 text-sm text-blue-800 dark:text-blue-300">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Kuota free tier TomTom terbatas — status live tidak tersedia saat ini, jadi aplikasi otomatis beralih
                        ke <strong>estimasi fallback gratis</strong>. Estimasi dihitung dari pola kepadatan jam rush,
                        karakteristik jalan, dan cuaca terkini (Open-Meteo), dan tetap berguna untuk perencanaan pengiriman.
                    </span>
                </div>
            )}

            {tileUnavailable && showTraffic && (
                <div className="flex items-start gap-2 rounded-lg border border-slate-300/50 bg-slate-500/10 p-3 text-sm text-slate-700 dark:text-slate-300">
                    <Layers className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Lapisan warna traffic di peta tidak tersedia (kuota tile habis) — lapisan dimatikan sementara. Garis
                        rute &amp; status per daerah tetap berfungsi.
                    </span>
                </div>
            )}

            {/* ── KPI ─────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/5 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Activity className="h-3.5 w-3.5 text-emerald-600" /> Lancar
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {loading ? "—" : counts.good}
                    </p>
                </div>
                <div className="rounded-xl border border-amber-300/40 bg-amber-500/5 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Perlu perhatian
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                        {loading ? "—" : counts.warning}
                    </p>
                </div>
                <div className="rounded-xl border border-red-300/40 bg-red-500/5 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Macet
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-red-700 dark:text-red-400">
                        {loading ? "—" : counts.critical}
                    </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Truck className="h-3.5 w-3.5" /> Pool utama
                    </p>
                    <p className="mt-1 text-2xl font-semibold">Bagan Batu</p>
                </div>
            </div>

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
                        <button
                            onClick={() => setShowTraffic((s) => !s)}
                            disabled={tileUnavailable}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${showTraffic && !tileUnavailable ? "border-primary/50 bg-primary/5 text-foreground" : "hover:bg-muted"
                                }`}
                            title={tileUnavailable ? "Tile traffic tidak tersedia saat ini" : undefined}
                        >
                            <Layers className="h-3 w-3" /> Overlay traffic: {showTraffic && !tileUnavailable ? "AKTIF" : "MATI"}
                        </button>
                        <button
                            onClick={() => setShowLines((s) => !s)}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
                        >
                            <Route className="h-3 w-3" /> {showLines ? "Sembunyikan semua garis" : "Tampilkan semua garis"}
                        </button>
                    </div>
                </div>

                {/* Panel kanan: daftar rute compact + detail rute terpilih */}
                <div className="lg:col-span-1">
                    <div className="flex h-full flex-col rounded-xl border bg-card p-3">
                        <h2 className="mb-2 flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Navigation className="h-3.5 w-3.5" /> Rute dari Pool Bagan Batu
                        </h2>

                        {/* Daftar rute — compact, satu kolom, scrollable */}
                        <div className="max-h-[240px] shrink-0 space-y-1 overflow-y-auto pr-1 lg:max-h-[280px]">
                            {loading ? (
                                <div className="space-y-1">
                                    {locations.slice(0, 8).map((l) => (
                                        <div key={l.id} className="h-7 animate-pulse rounded-md bg-muted/40" />
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
                            Estimasi memperhitungkan cuaca (Open-Meteo) &amp; pola jam kepadatan. Warna titik = kondisi
                            rute; angka = jarak dari pool.
                        </p>

                        {/* Detail rute terpilih */}
                        <div className="mt-3 border-t pt-3">
                            {!selected ? (
                                <div className="flex flex-1 flex-col gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        Klik pin, garis, atau baris di atas untuk membuka detail rute.
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
                                        <span
                                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_META[effLevel(selected)].badge
                                                } ${STATUS_META[effLevel(selected)].text}`}
                                        >
                                            {STATUS_META[effLevel(selected)].icon}
                                            {STATUS_META[effLevel(selected)].label}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="rounded-lg bg-muted/40 p-1.5">
                                            <p className="text-[10px] text-muted-foreground">Jarak</p>
                                            <p className="text-xs font-semibold tabular-nums">
                                                {selected.geometry ? `${selected.geometry.distanceKm.toFixed(1)} km` : "—"}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-muted/40 p-1.5">
                                            <p className="text-[10px] text-muted-foreground">Estimasi</p>
                                            <p className="text-xs font-semibold tabular-nums">
                                                {selected.geometry ? `${selected.geometry.durationMin} mnt` : "—"}
                                            </p>
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
                                                    <Satellite className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" /> Estimasi fallback
                                                    gratis (pola jam × jarak × cuaca) — bukan pengukuran live.
                                                </>
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

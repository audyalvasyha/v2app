"use client"

/**
 * TrafficView — Monitoring Lalu Lintas Rute Pengiriman (redesign).
 *
 * Sumber data: GET /api/traffic.
 *  - Garis rute: geometri jalan asli dari OSRM untuk SEMUA 20 daerah —
 *    tidak lagi bergantung produk Route Monitoring TomTom (akun free tier
 *    bisa tanpa produk aktif, itulah sebabnya dulu garis tidak muncul).
 *  - Status live (Lancar / Perlu perhatian / Macet): dari TomTom bila
 *    TOMTOM_API_KEY tersedia; tanpa key rute tetap tergambar biru netral.
 *
 * Interaksi: klik kartu / garis rute → peta zoom ke rute itu + kartu lain
 * diredupkan. Klik area kosong peta atau kartu lagi → reset.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Clock,
    MapPin,
    Navigation,
    RefreshCw,
    Route,
    Truck,
} from "lucide-react"
import type { MapLocation } from "@/components/organisms/traffic-map"

// Peta Leaflet — ssr:false karena Leaflet menyentuh window saat init.
const TrafficMap = dynamic(() => import("@/components/organisms/traffic-map").then((m) => m.TrafficMap), {
    ssr: false,
    loading: () => <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted/40 lg:h-[560px]" />,
})

type TrafficLevel = "good" | "warning" | "critical" | "unknown"

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
    /** Status traffic flow sampling per-rute dari geometri OSRM. */
    trafficFlow: {
        level: TrafficLevel
        currentSpeed: number
        freeFlowSpeed: number
    } | null
}

interface TrafficApiResponse {
    configured: boolean
    generatedAt: string
    summary: { totalRoutes: number; routedGeometries: number; liveCount: number; badCount: number; trafficCount: number }
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
        label: "Estimasi",
        text: "text-blue-700 dark:text-blue-400",
        badge: "border-blue-300/60 bg-blue-500/10",
        icon: <Navigation className="h-3.5 w-3.5" />,
    },
}

const LEVEL_DOT: Record<TrafficLevel, string> = {
    good: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-blue-500",
}

/**
 * Penjelasan cakupan data live — supaya user ngerti kenapa kebanyakan rute
 * cuma punya estimasi:
 *  - Free tier Route Monitoring membatasi 2 rute terdaftar.
 *  - Traffic Flow API (tanpa registrasi rute) perlu produk terpisah yang
 *    belum aktif di key (403).
 */
function coverageNote(data: TrafficApiResponse | null): string | null {
    if (!data) return null
    if (!data.configured) return null // banner key belum diset sudah ada
    if (data.summary.liveCount >= data.summary.totalRoutes) return null
    return (
        `Status live baru tersedia untuk ${data.summary.liveCount} dari ${data.summary.totalRoutes} rute. ` +
        `Traffic Flow sampling aktif untuk ${data.summary.trafficCount} rute. ` +
        `Free tier Route Monitoring membatasi 2 rute terdaftar. Rute lain memakai estimasi jarak & ` +
        `waktu dari OSRM — bukan kondisi live.`
    )
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
    const [filter, setFilter] = useState<"all" | "live">("all")
    const [showLines, setShowLines] = useState(false)
    const [showTraffic, setShowTraffic] = useState(true)

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

    const locations = data?.locations ?? []

    const visible = useMemo(
        () => (filter === "live" ? locations.filter((l) => effLevel(l) !== "unknown") : locations),
        [locations, filter],
    )

    const selected = locations.find((l) => l.id === selectedId) ?? null

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
                const meta = STATUS_META[level]
                const km = l.geometry ? `${l.geometry.distanceKm.toFixed(1)} km` : "—"
                const livePart =
                    l.live && l.live.level !== "unknown"
                        ? ` · ${l.live.travelTimeMin} mnt${l.live.delayMin >= 1 ? ` (+${l.live.delayMin} mnt)` : ""}`
                        : l.trafficFlow && l.trafficFlow.level !== "unknown"
                          ? ` · ${l.trafficFlow.currentSpeed}/${l.trafficFlow.freeFlowSpeed} km/j`
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
                    tooltip: `${l.name} — ${km}${livePart} · ${meta.label}`,
                }
            }),
        [locations],
    )

    const onSelect = useCallback((id: string | null) => {
        setSelectedId((prev) => (prev && id === prev ? null : id))
    }, [])

    const toggleFilter = () => setFilter((f) => (f === "all" ? "live" : "all"))

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-lg font-semibold">
                        <Route className="h-5 w-5 text-primary" />
                        Monitoring Lalu Lintas
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {locations.filter((l) => l.geometry).length} rute pengiriman digambar di jalan asli ·
                        {data ? ` diperbarui ${relativeTime(data.generatedAt)}` : " memuat…"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Traffic live: {data?.summary.liveCount ?? "—"} · Sampling traffic: {data?.summary.trafficCount ?? "—"} dari {data?.summary.totalRoutes ?? "—"} rute
                    </p>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing || loading}
                    className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {data && !data.configured && (
                <div className="rounded-lg border border-amber-300/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    TOMTOM_API_KEY belum diset — garis rute tetap tampil (OSRM), tapi status kemacetan live tidak
                    tersedia. Isi key di Settings → Environment, lalu refresh.
                </div>
            )}

            {coverageNote(data) && (
                <div className="rounded-lg border border-blue-300/50 bg-blue-500/10 p-3 text-sm text-blue-800 dark:text-blue-300">
                    {coverageNote(data)}
                </div>
            )}

            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Route className="h-3.5 w-3.5" /> Rute digambar
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {data ? data.summary.routedGeometries : "—"}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                            / {data?.summary.totalRoutes ?? "—"}
                        </span>
                    </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Activity className="h-3.5 w-3.5" /> Status live
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{data?.summary.liveCount ?? "—"}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" /> Perlu perhatian
                    </p>
                    <p
                        className={`mt-1 text-2xl font-semibold tabular-nums ${
                            (data?.summary.badCount ?? 0) > 0 ? "text-amber-700 dark:text-amber-400" : ""
                        }`}
                    >
                        {data?.summary.badCount ?? "—"}
                    </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Truck className="h-3.5 w-3.5" /> Pool utama
                    </p>
                    <p className="mt-1 text-2xl font-semibold">Bagan Batu</p>
                </div>
            </div>

            {/* Peta besar + panel rute terpilih */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <TrafficMap
                        locations={mapLocations}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        showLines={showLines}
                        showTraffic={showTraffic}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT.good}`} /> Lancar
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT.warning}`} /> Perlu perhatian
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT.critical}`} /> Macet
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT.unknown}`} /> Estimasi (bukan live)
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Pool Bagan Batu
                        </span>
                        <button
                            onClick={() => setShowTraffic((s) => !s)}
                            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                showTraffic ? "border-primary/50 bg-primary/5 text-foreground" : "hover:bg-muted"
                            }`}
                        >
                            Lapisan traffic jalan: {showTraffic ? "AKTIF" : "MATI"}
                        </button>
                        <button
                            onClick={() => setShowLines((s) => !s)}
                            className="rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
                        >
                            {showLines ? "Sembunyikan semua garis" : "Tampilkan semua garis"}
                        </button>
                        <span className="ml-auto hidden sm:inline">Warna jalan = kemacetan live · klik pin untuk detail rute</span>
                    </div>
                </div>

                {/* Panel detail rute terpilih */}
                <div className="lg:col-span-2">
                    <div className="flex h-full min-h-[220px] flex-col rounded-xl border bg-card p-4">
                        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            <Navigation className="h-4 w-4" /> Detail Rute
                        </h2>
                        {!selected ? (
                            <div className="flex flex-1 flex-col gap-3">
                                <p className="text-sm text-muted-foreground">
                                    Klik pin atau kartu rute untuk membuka detailnya. Ringkasan kondisi sekarang:
                                </p>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/5 p-2">
                                        <p className="text-[11px] text-muted-foreground">Lancar</p>
                                        <p className="text-lg font-semibold tabular-nums">
                                            {locations.filter((l) => !l.isOrigin && effLevel(l) === "good").length}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-amber-300/40 bg-amber-500/5 p-2">
                                        <p className="text-[11px] text-muted-foreground">Perhatian</p>
                                        <p className="text-lg font-semibold tabular-nums">
                                            {locations.filter((l) => effLevel(l) === "warning").length}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-red-300/40 bg-red-500/5 p-2">
                                        <p className="text-[11px] text-muted-foreground">Macet</p>
                                        <p className="text-lg font-semibold tabular-nums">
                                            {locations.filter((l) => effLevel(l) === "critical").length}
                                        </p>
                                    </div>
                                </div>
                                {longest && (
                                    <button
                                        onClick={() => onSelect(longest.id)}
                                        className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                                    >
                                        <div>
                                            <p className="text-sm font-medium">Rute terjauh</p>
                                            <p className="text-xs text-muted-foreground tabular-nums">
                                                {longest.name} · {longest.geometry?.distanceKm.toFixed(1)} km ·{" "}
                                                {longest.geometry?.durationMin} mnt
                                            </p>
                                        </div>
                                        <MapPin className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="flex items-center gap-2 font-semibold">
                                            <Truck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                            {selected.name}
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{selected.note}</p>
                                    </div>
                                    <span
                                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                            STATUS_META[effLevel(selected)].badge
                                        } ${STATUS_META[effLevel(selected)].text}`}
                                    >
                                        {STATUS_META[effLevel(selected)].icon}
                                        {STATUS_META[effLevel(selected)].label}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-lg bg-muted/40 p-2">
                                        <p className="text-[11px] text-muted-foreground">Jarak</p>
                                        <p className="text-sm font-semibold tabular-nums">
                                            {selected.geometry ? `${selected.geometry.distanceKm.toFixed(1)} km` : "—"}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-muted/40 p-2">
                                        <p className="text-[11px] text-muted-foreground">Estimasi</p>
                                        <p className="text-sm font-semibold tabular-nums">
                                            {selected.geometry ? `${selected.geometry.durationMin} mnt` : "—"}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-muted/40 p-2">
                                        <p className="text-[11px] text-muted-foreground">Live</p>
                                        <p className="text-sm font-semibold tabular-nums">
                                            {selected.live && selected.live.level !== "unknown"
                                                ? `${selected.live.travelTimeMin} mnt`
                                                : selected.trafficFlow && selected.trafficFlow.level !== "unknown"
                                                  ? `${selected.trafficFlow.currentSpeed} km/j`
                                                  : "—"}
                                        </p>
                                    </div>
                                </div>
                                {selected.live && selected.live.delayMin >= 1 && (
                                    <p className="flex items-center gap-1.5 rounded-lg border border-amber-300/50 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                        Tundaan +{selected.live.delayMin} menit dibanding kondisi normal.
                                    </p>
                                )}
                                {!selected.live && (
                                    <p className="text-xs text-muted-foreground">
                                        Badge di atas adalah <strong>estimasi</strong> dari OSRM (jarak & waktu normal),
                                        bukan kondisi live. Status live butuh Traffic API aktif di key TomTom atau rute
                                        terdaftar di Route Monitoring.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Daftar rute */}
            <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {visible.length} Rute dari Pool Bagan Batu
                    </h2>
                    <button
                        onClick={toggleFilter}
                        className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                    >
                        {filter === "all" ? "Tampilkan hanya yang live" : "Tampilkan semua"}
                    </button>
                </div>
                {loading ? (
                    <div className="space-y-2">
                        {locations.slice(0, 6).map((l) => (
                            <div key={l.id} className="h-14 animate-pulse rounded-lg bg-muted/40" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {visible.map((l) => {
                            const meta = STATUS_META[effLevel(l)]
                            const isSelected = selectedId === l.id
                            return (
                                <button
                                    key={l.id}
                                    onClick={() => onSelect(l.id)}
                                    className={[
                                        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                                        isSelected
                                            ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                                            : "hover:bg-muted/40",
                                        l.isOrigin ? "border-sky-300/60 bg-sky-500/5" : "",
                                    ].join(" ")}
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 text-sm font-medium">
                                            {l.isOrigin ? (
                                                <span className="h-2 w-2 rounded-full bg-sky-500" />
                                            ) : (
                                                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className="truncate">{l.name}</span>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            <span className="tabular-nums">
                                                {l.geometry
                                                    ? `${l.geometry.distanceKm.toFixed(1)} km · ${l.geometry.durationMin} mnt`
                                                    : "—"}
                                            </span>
                                            {l.live && l.live.delayMin >= 1 && (
                                                <span className="text-amber-700 dark:text-amber-400">
                                                    +{l.live.delayMin} mnt
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {l.isOrigin ? (
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-300/60 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                                            <ArrowRight className="h-3 w-3" /> Pool
                                        </span>
                                    ) : (
                                        <span
                                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badge} ${meta.text}`}
                                        >
                                            <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[effLevel(l)]}`} />
                                            {meta.label}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

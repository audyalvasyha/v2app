/**
 * Historis kondisi traffic per rute — ditulis saat request /api/traffic masuk,
 * dibaca untuk grafik pola ("rute ini biasanya macet jam berapa") dan
 * rekomendasi jam berangkat.
 *
 * Penyimpanan: tabel Supabase `traffic_history` (lihat supabase/sql/
 * traffic_history.sql). Tulisan memakai klien service-role dari server —
 * tidak ada jalur tulis dari browser. Tabel belum ada / key belum di-set →
 * semua fungsi di sini degrade diam-diam (fitur historis hilang, sisanya
 * berjalan normal) — pola yang sama dengan ai_memory.
 */

import { WIB_OFFSET_MS } from "@/lib/format"
import { getSupabaseAdmin } from "@/utils/supabase-admin"
import type { FlowSource } from "@/lib/traffic-flow"
import type { TrafficLevel } from "@/lib/tomtom/route-monitoring"

const TABLE = "traffic_history"

/** Klien tulis server-side (service role) — null bila env belum lengkap. */
function adminClient() {
    return getSupabaseAdmin()
}

/** Jam observed dalam WIB: "2026-10-09T14" — dipakai sebagai bucket per jam. */
export function currentWibHourBucket(at: Date = new Date()): string {
    const shifted = new Date(at.getTime() + WIB_OFFSET_MS)
    const y = shifted.getUTCFullYear()
    const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
    const d = String(shifted.getUTCDate()).padStart(2, "0")
    const h = String(shifted.getUTCHours()).padStart(2, "0")
    return `${y}-${m}-${d}T${h}`
}

export interface HistorySnapshot {
    locationId: string
    level: TrafficLevel
    source: FlowSource
    currentSpeed: number
    freeFlowSpeed: number
}

/**
 * Simpan snapshot terkini untuk beberapa lokasi (satu baris per lokasi per
 * jam PK gabungan). Sedianya dipanggil dari /api/traffic setelah sampling.
 * Best-effort: gagal jaringan / tabel belum ada tidak boleh menggagalkan
 * respons traffic yang sudah berhasil dihitung.
 */
export async function saveHistorySnapshots(
    snapshots: HistorySnapshot[],
    at: Date = new Date(),
): Promise<void> {
    const client = adminClient()
    if (!client || snapshots.length === 0) return

    const hour = currentWibHourBucket(at)
    const rows = snapshots
        .filter((s) => s.freeFlowSpeed > 0)
        .map((s) => ({
            location_id: s.locationId,
            observed_hour: hour,
            level: s.level,
            source: s.source,
            current_speed: s.currentSpeed,
            free_flow_speed: s.freeFlowSpeed,
            ratio: Math.min(1, Math.max(0, s.currentSpeed / s.freeFlowSpeed)),
        }))
    if (rows.length === 0) return

    const { error } = await client
        .from(TABLE)
        .upsert(rows, { onConflict: "location_id,observed_hour", ignoreDuplicates: false })

    if (error && !/does not exist|schema cache/i.test(error.message)) {
        console.error("[traffic-history] gagal menyimpan snapshot:", error.message)
    }
}

export interface HourlyPattern {
    /** Jam WIB 0–23. */
    hour: number
    /** Rata-rata rasio current/free-flow dari semua snapshot pada jam itu. */
    avgRatio: number
    /** Jumlah snapshot yang masuk hitungan. */
    samples: number
}

export interface LocationHistory {
    locationId: string
    available: boolean
    /** Pola 24 jam (rata-rata 7–30 hari terakhir). Urutan naik per jam. */
    hourlyPattern: HourlyPattern[]
    /** Snapshot harian terakhir (maks 14 hari) untuk grafik trend. */
    daily: Array<{ date: string; avgRatio: number; samples: number }>
}

/**
 * Pola per jam satu lokasi: agregasi SQL di server supaya tidak perlu
 * menarik ratusan baris mentah ke browser. 30 hari terakhir.
 */
export async function loadLocationHistory(locationId: string): Promise<LocationHistory> {
    const empty: LocationHistory = { locationId, available: false, hourlyPattern: [], daily: [] }
    const client = adminClient()
    if (!client) return empty

    // Seluruh agregasi dilakukan Postgres, bukan JS: satu request, hasil ringkas.
    const [hourlyRes, dailyRes] = await Promise.all([
        client.rpc("traffic_hourly_pattern", { p_location: locationId }),
        client.rpc("traffic_daily_pattern", { p_location: locationId }),
    ])

    if (hourlyRes.error || dailyRes.error) {
        // RPC belum dijalankan / tabel baru dibuat — degradasi diam-diam.
        if (!/function .* does not exist|does not exist|schema cache/i.test(
            (hourlyRes.error?.message ?? "") + (dailyRes.error?.message ?? ""),
        )) {
            console.error("[traffic-history] gagal membaca pola:", hourlyRes.error?.message ?? dailyRes.error?.message)
        }
        return empty
    }

    const hourly = (hourlyRes.data ?? []) as Array<{ hour: number; avg_ratio: number; samples: number }>
    const daily = (dailyRes.data ?? []) as Array<{ date: string; avg_ratio: number; samples: number }>

    return {
        locationId,
        available: hourly.length > 0,
        hourlyPattern: hourly.map((r) => ({ hour: Number(r.hour), avgRatio: Number(r.avg_ratio), samples: Number(r.samples) })),
        daily: daily.map((r) => ({ date: r.date, avgRatio: Number(r.avg_ratio), samples: Number(r.samples) })),
    }
}

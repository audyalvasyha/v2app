/**
 * Agregasi tren biaya perbaikan untuk chart stacked per bulan.
 *
 * Tiga bulan terakhir dipetakan ke tanggal yang sama (1–31) supaya pola
 * harian tiap bulan bisa dibandingkan langsung. Tanggal tetap dibaca dalam
 * WIB, bukan zona waktu browser.
 */

import { zonedParts } from "./format"

const DAYS_IN_CHART = 31

export type MaintenanceCostMonthKey = "month0" | "month1" | "month2"

export interface MaintenanceCostMonth {
    key: MaintenanceCostMonthKey
    /** Kunci bulan WIB, mis. "2026-01". */
    month: string
    /** Label siap tampil, mis. "Jan 2026". */
    label: string
    /** Jumlah hari dalam bulan tersebut. */
    days: number
    /** Total biaya bulan tersebut. */
    total: number
}

export interface MaintenanceCostTrendPoint {
    /** Tanggal 1–31. */
    day: number
    /** Label tanggal dua digit untuk sumbu X. */
    label: string
    /** Biaya pada bulan tertua. */
    month0: number | null
    /** Biaya pada bulan sebelumnya. */
    month1: number | null
    /** Biaya pada bulan berjalan; tanggal setelah hari ini bernilai null. */
    month2: number | null
}

export interface MaintenanceCostTrend {
    points: MaintenanceCostTrendPoint[]
    /** Tiga bulan, dari yang paling lama ke bulan berjalan. */
    months: MaintenanceCostMonth[]
    /** Total biaya ketiga bulan. */
    total: number
    /** False bila tidak ada biaya dalam jendela tiga bulan. */
    hasData: boolean
}

function pad(value: number): string {
    return String(value).padStart(2, "0")
}

function monthKey(year: number, month: number): string {
    return `${year}-${pad(month)}`
}

function monthLabel(year: number, month: number): string {
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("id-ID", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    })
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Bangun tiga seri bulanan dengan sumbu tanggal 1–31.
 *
 * Hari tanpa transaksi bernilai 0 agar area tidak melompat. Tanggal yang tidak
 * ada di suatu bulan (mis. 30 Februari) atau tanggal masa depan di bulan
 * berjalan bernilai null supaya garis berhenti di titik terakhir yang valid.
 */
export function buildMaintenanceCostTrend(
    histories: any[],
    today: Date | string | number = new Date(),
): MaintenanceCostTrend {
    const now = zonedParts(today)
    if (!now) {
        return { points: [], months: [], total: 0, hasData: false }
    }

    const months: MaintenanceCostMonth[] = []
    const indexByMonth = new Map<string, number>()

    // month0 = dua bulan lalu, month1 = bulan lalu, month2 = bulan berjalan.
    for (let offset = 2; offset >= 0; offset -= 1) {
        const date = new Date(Date.UTC(now.year, now.month - 1 - offset, 1))
        const year = date.getUTCFullYear()
        const month = date.getUTCMonth() + 1
        const key = monthKey(year, month)
        const index = months.length
        months.push({
            key: (`month${index}` as MaintenanceCostMonthKey),
            month: key,
            label: monthLabel(year, month),
            days: daysInMonth(year, month),
            total: 0,
        })
        indexByMonth.set(key, index)
    }

    const buckets = months.map(() => new Map<number, number>())

    for (const row of histories) {
        const parsed = String(row?.tanggal ?? "").trim()
        if (!parsed) continue
        const parts = zonedParts(parsed)
        if (!parts) continue

        const index = indexByMonth.get(monthKey(parts.year, parts.month))
        if (index == null) continue
        if (parts.day < 1 || parts.day > months[index].days) continue

        // Bulan berjalan hanya sampai hari ini; jangan menggambar masa depan.
        if (index === 2 && parts.day > now.day) continue

        const cost = Number(row?.jumlah_harga) || 0
        if (!cost) continue
        const bucket = buckets[index]
        bucket.set(parts.day, (bucket.get(parts.day) ?? 0) + cost)
        months[index].total += cost
    }

    const points: MaintenanceCostTrendPoint[] = Array.from(
        { length: DAYS_IN_CHART },
        (_, i) => {
            const day = i + 1
            const values: [number | null, number | null, number | null] = [
                day <= months[0].days ? (buckets[0].get(day) ?? 0) : null,
                day <= months[1].days ? (buckets[1].get(day) ?? 0) : null,
                day <= months[2].days && day <= now.day
                    ? (buckets[2].get(day) ?? 0)
                    : null,
            ]
            return {
                day,
                label: pad(day),
                month0: values[0],
                month1: values[1],
                month2: values[2],
            }
        },
    )

    const total = months.reduce((sum, month) => sum + month.total, 0)
    return {
        points,
        months,
        total,
        hasData: total > 0,
    }
}

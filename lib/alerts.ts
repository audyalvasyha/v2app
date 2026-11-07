/**
 * Sumber tunggal peringatan operasional untuk lonceng notifikasi di header.
 *
 * Dua kelompok yang benar-benar butuh tindakan hari ini:
 *  1. Jadwal servis  — unit terlewat atau mendekati batas tanggal/odometer.
 *  2. Pengiriman     — unit sudah keluar melewati ambang tapi belum kembali.
 *
 * Aturan statusnya sama persis dengan tabel & dashboard karena memakai
 * `evaluateServiceStatus` dan `isOutboundLate` yang sama — tidak ada logika
 * kedua yang bisa meleset dari tampilan menu.
 */

import { evaluateServiceStatus } from "./service-status"
import { elapsedHoursSince, isOutboundLate, OUTBOUND_LATE_HOURS } from "./outbound-status"

export type AlertTone = "danger" | "warning"

/** Menu tujuan saat notifikasi diklik. */
export type AlertView = "monitoring" | "pengiriman"

export interface AppAlert {
    id: string
    tone: AlertTone
    title: string
    description: string
    view: AlertView
}

interface BuildAlertsInput {
    equipments: any[]
    serviceLogs: any[]
    outbounds: any[]
    now?: number
}

/** Batas jumlah kartu per kategori supaya panel tidak memanjang tanpa ujung. */
const MAX_SERVICE_ALERTS = 4
const MAX_OUTBOUND_ALERTS = 3

function latestLogByUnit(serviceLogs: any[]): Map<string, any> {
    const latest = new Map<string, any>()
    for (const log of serviceLogs) {
        const key = String(log.equipment_id ?? "").trim()
        if (!key) continue
        const prev = latest.get(key)
        if (!prev || new Date(log.service_date ?? 0) > new Date(prev.service_date ?? 0)) {
            latest.set(key, log)
        }
    }
    return latest
}

export function buildAlerts({
    equipments,
    serviceLogs,
    outbounds,
    now = Date.now(),
}: BuildAlertsInput): AppAlert[] {
    const alerts: AppAlert[] = []
    const today = new Date(now)
    const latestLogs = latestLogByUnit(serviceLogs)

    // ── 1. Servis terlewat / mendekat ──────────────────────────────────
    const overdue: { equipment: any; days: number | null; km: number | null }[] = []
    const warning: { equipment: any; days: number | null; km: number | null }[] = []

    for (const eq of equipments) {
        const status = evaluateServiceStatus(
            eq,
            latestLogs.get(String(eq.equipment_id ?? "").trim()) ?? null,
            today,
        )
        if (status.id === "overdue") {
            overdue.push({ equipment: eq, days: status.remainingDays, km: status.remainingKm })
        } else if (status.id === "warning") {
            warning.push({ equipment: eq, days: status.remainingDays, km: status.remainingKm })
        }
    }

    overdue.sort((a, b) => (a.days ?? -999) - (b.days ?? -999))
    warning.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))

    for (const item of overdue.slice(0, MAX_SERVICE_ALERTS)) {
        const plate = String(item.equipment.license_plate ?? "").trim()
        const late = item.days != null && item.days < 0 ? `${Math.abs(item.days)} hari lewat jadwal` : "lewat jadwal servis"
        alerts.push({
            id: `service-overdue-${item.equipment.equipment_id}`,
            tone: "danger",
            title: `Servis terlewat · ${item.equipment.equipment_id}`,
            description: [plate, late].filter(Boolean).join(" · "),
            view: "monitoring",
        })
    }

    const remainingOverdue = overdue.length - Math.min(overdue.length, MAX_SERVICE_ALERTS)
    if (remainingOverdue > 0) {
        alerts.push({
            id: "service-overdue-rest",
            tone: "danger",
            title: `+${remainingOverdue} unit servis terlewat`,
            description: "Buka Monitoring Servis untuk melihat semuanya",
            view: "monitoring",
        })
    }

    for (const item of warning.slice(0, 2)) {
        const plate = String(item.equipment.license_plate ?? "").trim()
        const soon = item.days != null ? `servis dalam ${Math.max(0, item.days)} hari` : "mendekati batas servis"
        alerts.push({
            id: `service-warning-${item.equipment.equipment_id}`,
            tone: "warning",
            title: `Servis mendekat · ${item.equipment.equipment_id}`,
            description: [plate, soon].filter(Boolean).join(" · "),
            view: "monitoring",
        })
    }

    // ── 2. Pengiriman yang belum kembali melewati ambang ──────────────
    const lateTrips = outbounds
        .filter((row) => isOutboundLate(row.jam_out, row.jam_in, now))
        .map((row) => ({ row, hours: elapsedHoursSince(row.jam_out, now) ?? 0 }))
        .sort((a, b) => b.hours - a.hours)

    for (const trip of lateTrips.slice(0, MAX_OUTBOUND_ALERTS)) {
        const plate = String(trip.row.no_polisi ?? "").trim()
        const fo = trip.row.freight_order != null ? `FO ${trip.row.freight_order}` : "Tanpa nomor FO"
        alerts.push({
            id: `outbound-late-${trip.row.freight_order ?? trip.row.created_at ?? plate}`,
            tone: "danger",
            title: `Belum kembali · ${plate || "unit tanpa nopol"}`,
            description: `${fo} · keluar ${Math.floor(trip.hours)} jam lalu (batas ${OUTBOUND_LATE_HOURS} jam)`,
            view: "pengiriman",
        })
    }

    const remainingLate = lateTrips.length - Math.min(lateTrips.length, MAX_OUTBOUND_ALERTS)
    if (remainingLate > 0) {
        alerts.push({
            id: "outbound-late-rest",
            tone: "danger",
            title: `+${remainingLate} pengiriman belum kembali`,
            description: `Sudah melewati ${OUTBOUND_LATE_HOURS} jam tanpa jam masuk`,
            view: "pengiriman",
        })
    }

    return alerts
}

/**
 * Sumber tunggal peringatan operasional untuk lonceng notifikasi di header.
 *
 * Tiga kelompok yang benar-benar butuh tindakan hari ini:
 *  1. Jadwal servis  — unit terlewat atau mendekati batas tanggal/odometer.
 *  2. Pengiriman     — unit sudah keluar melewati ambang tapi belum kembali.
 *  3. Komplain       — tiket belum selesai yang sudah berumur 3 hari atau 7 hari.
 *
 * Aturan statusnya sama persis dengan tabel, papan, dan digest email karena
 * memakai helper bersama — tidak ada logika kedua yang bisa meleset dari
 * tampilan menu.
 */

import { evaluateServiceStatus } from "./service-status"
import { elapsedHoursSince, isOutboundLate, OUTBOUND_LATE_HOURS } from "./outbound-status"
import { ticketAgeDays, ticketAgeLevel, type Task } from "./tasks"

export type AlertTone = "danger" | "warning"

/** Kelompok notifikasi untuk tab panel header. */
export type AlertCategory = "service" | "outbound" | "complaint"

/** Menu tujuan saat notifikasi diklik. */
export type AlertView = "monitoring" | "pengiriman" | "tugas"

export interface AppAlert {
    id: string
    category: AlertCategory
    tone: AlertTone
    title: string
    description: string
    view: AlertView
}

type ComplaintAlertTask = Pick<
    Task,
    "id" | "title" | "status" | "created_at" | "license_plate" | "delivery_no"
>

interface BuildAlertsInput {
    equipments: any[]
    serviceLogs: any[]
    outbounds: any[]
    tasks?: ComplaintAlertTask[]
    now?: number
}

/** Batas jumlah kartu per kategori supaya panel tidak memanjang tanpa ujung. */
const MAX_SERVICE_ALERTS = 4
const MAX_OUTBOUND_ALERTS = 3
const MAX_COMPLAINT_ALERTS = 4

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
    tasks = [],
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
            category: "service",
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
            category: "service",
            tone: "danger",
            title: `+${remainingOverdue} unit servis terlewat`,
            description: "Buka Servis Rutin untuk melihat semuanya",
            view: "monitoring",
        })
    }

    for (const item of warning.slice(0, 2)) {
        const plate = String(item.equipment.license_plate ?? "").trim()
        const soon = item.days != null ? `servis dalam ${Math.max(0, item.days)} hari` : "mendekati batas servis"
        alerts.push({
            id: `service-warning-${item.equipment.equipment_id}`,
            category: "service",
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
            category: "outbound",
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
            category: "outbound",
            tone: "danger",
            title: `+${remainingLate} pengiriman belum kembali`,
            description: `Sudah melewati ${OUTBOUND_LATE_HOURS} jam tanpa jam masuk`,
            view: "pengiriman",
        })
    }

    // ── 3. Komplain yang mandek ───────────────────────────────────────
    // Hanya tiket yang sudah melewati ambang 3 hari (perlu FU) atau 7 hari
    // (terlambat). Tiket baru tidak dimasukkan supaya lonceng tidak berisik.
    const staleComplaints = tasks
        .filter((task) => task.status !== "done")
        .map((task) => ({
            task,
            days: Math.floor(ticketAgeDays(task, now)),
            level: ticketAgeLevel(task, now),
        }))
        .filter((row) => row.level !== "fresh")
        .sort((a, b) => b.days - a.days)

    for (const row of staleComplaints.slice(0, MAX_COMPLAINT_ALERTS)) {
        const identity = [
            row.task.license_plate?.trim() || null,
            row.task.delivery_no ? `DO ${row.task.delivery_no}` : null,
        ]
            .filter(Boolean)
            .join(" · ")
        const ageLabel =
            row.level === "overdue"
                ? `Terlambat ${row.days} hari`
                : `Belum selesai ${row.days} hari`
        alerts.push({
            id: `complaint-${row.task.id}`,
            category: "complaint",
            tone: row.level === "overdue" ? "danger" : "warning",
            title: `${ageLabel} · ${identity || "tanpa nopol"}`,
            description: row.task.title,
            view: "tugas",
        })
    }

    const remainingComplaints =
        staleComplaints.length - Math.min(staleComplaints.length, MAX_COMPLAINT_ALERTS)
    if (remainingComplaints > 0) {
        alerts.push({
            id: "complaint-stale-rest",
            category: "complaint",
            tone: "warning",
            title: `+${remainingComplaints} komplain perlu follow-up`,
            description: "Buka Complaint Board untuk melihat semuanya",
            view: "tugas",
        })
    }

    return alerts
}

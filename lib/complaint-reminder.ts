/**
 * Aturan digest email komplain harian untuk admin.
 *
 * Ambangnya sengaja memakai helper yang sama dengan papan & lonceng:
 *  - 3 hari sejak dibuat  → perlu follow-up
 *  - 7 hari sejak dibuat  → terlambat, masuk eskalasi
 *
 * Tiket yang sudah selesai tidak pernah masuk digest. Tiket baru juga tidak,
 * supaya email tidak berubah menjadi notifikasi untuk setiap komplain masuk.
 */

import {
    ESCALATION_DAYS,
    OVERDUE_DAYS,
    ticketAgeDays,
    ticketAgeLevel,
    type Task,
} from "./tasks"

export type ComplaintReminderTask = Pick<
    Task,
    | "id"
    | "title"
    | "status"
    | "created_at"
    | "license_plate"
    | "delivery_no"
    | "freight_order"
    | "sales_name"
>

export interface ComplaintReminderRow {
    task: ComplaintReminderTask
    days: number
    level: "attention" | "overdue"
}

/**
 * Tiket yang sudah melewati ambang, terlama di atas. Dipakai endpoint cron
 * dan unit test, tanpa menyentuh Supabase atau Resend.
 */
export function buildComplaintReminderRows(
    tasks: ComplaintReminderTask[],
    now: number = Date.now(),
): ComplaintReminderRow[] {
    return tasks
        .filter((task) => task.status !== "done")
        .map((task) => {
            const level = ticketAgeLevel(task, now)
            return {
                task,
                days: Math.floor(ticketAgeDays(task, now)),
                level,
            }
        })
        .filter(
            (row): row is ComplaintReminderRow =>
                row.level === "attention" || row.level === "overdue",
        )
        .sort((a, b) => b.days - a.days)
}

/** Ringkasan singkat untuk subjek email. */
export function complaintReminderSubject(rows: ComplaintReminderRow[]): string {
    const overdue = rows.filter((row) => row.level === "overdue").length
    const attention = rows.length - overdue

    if (overdue > 0 && attention > 0) {
        return `[Midaa] ${overdue} komplain terlambat · ${attention} perlu follow-up`
    }
    if (overdue > 0) {
        return `[Midaa] ${overdue} komplain terlambat ${OVERDUE_DAYS} hari+`
    }
    return `[Midaa] ${attention} komplain perlu follow-up`
}

/** Kalimat ambang untuk footer email, satu sumber dengan UI. */
export const COMPLAINT_REMINDER_POLICY =
    `Perlu follow-up setelah ${ESCALATION_DAYS} hari; terlambat setelah ${OVERDUE_DAYS} hari.`

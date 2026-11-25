import { describe, expect, it } from "vitest"

import {
    buildComplaintReminderRows,
    complaintReminderSubject,
    COMPLAINT_REMINDER_POLICY,
} from "@/lib/complaint-reminder"
import type { ComplaintReminderTask } from "@/lib/complaint-reminder"

const DAY_MS = 86_400_000
const NOW = new Date("2026-01-10T00:00:00.000Z").getTime()

function task(partial: Partial<ComplaintReminderTask>): ComplaintReminderTask {
    return {
        id: partial.id ?? crypto.randomUUID(),
        title: partial.title ?? "Komplain",
        status: partial.status ?? "todo",
        created_at:
            partial.created_at ?? new Date(NOW - 4 * DAY_MS).toISOString(),
        license_plate: null,
        delivery_no: null,
        freight_order: null,
        sales_name: null,
        ...partial,
    }
}

function daysAgo(days: number): string {
    return new Date(NOW - days * DAY_MS).toISOString()
}

describe("buildComplaintReminderRows", () => {
    it("hanya mengirim tiket 3 hari+ yang belum selesai, terlama di atas", () => {
        const rows = buildComplaintReminderRows(
            [
                task({ title: "Baru", created_at: daysAgo(2) }),
                task({ title: "Perlu FU", created_at: daysAgo(4) }),
                task({ title: "Terlambat", created_at: daysAgo(9) }),
                task({ title: "Selesai", status: "done", created_at: daysAgo(20) }),
            ],
            NOW,
        )

        expect(rows.map((row) => row.task.title)).toEqual(["Terlambat", "Perlu FU"])
        expect(rows.map((row) => row.level)).toEqual(["overdue", "attention"])
        expect(rows.map((row) => row.days)).toEqual([9, 4])
    })

    it("tidak menghasilkan baris saat semua tiket masih baru atau selesai", () => {
        expect(
            buildComplaintReminderRows(
                [
                    task({ created_at: daysAgo(1) }),
                    task({ status: "done", created_at: daysAgo(10) }),
                ],
                NOW,
            ),
        ).toEqual([])
    })
})

describe("complaintReminderSubject", () => {
    it("menyebut jumlah terlambat dan perlu follow-up", () => {
        const rows = buildComplaintReminderRows(
            [
                task({ created_at: daysAgo(9) }),
                task({ created_at: daysAgo(8) }),
                task({ created_at: daysAgo(4) }),
            ],
            NOW,
        )

        expect(complaintReminderSubject(rows)).toBe(
            "[Midaa] 2 komplain terlambat · 1 perlu follow-up",
        )
    })

    it("memakai satu ambang yang sama untuk email dan UI", () => {
        expect(COMPLAINT_REMINDER_POLICY).toContain("3 hari")
        expect(COMPLAINT_REMINDER_POLICY).toContain("7 hari")
    })
})

import { describe, expect, it } from "vitest"

import {
    ESCALATION_DAYS,
    OVERDUE_DAYS,
    parseTaskAttachmentPaths,
    serializeTaskAttachmentPaths,
    sortTasks,
    ticketAgeDays,
    ticketAgeLabel,
    ticketAgeLevel,
    type Task,
} from "./tasks"

describe("lampiran komplain", () => {
    it("membaca satu path lama tanpa mengubahnya", () => {
        expect(parseTaskAttachmentPaths("complaints/u1/a.jpg")).toEqual([
            "complaints/u1/a.jpg",
        ])
    })

    it("membaca beberapa path yang dipisah baris baru", () => {
        expect(
            parseTaskAttachmentPaths(
                "complaints/u1/a.jpg\ncomplaints/u1/b.png\n",
            ),
        ).toEqual(["complaints/u1/a.jpg", "complaints/u1/b.png"])
    })

    it("membuang path kosong dan duplikat", () => {
        expect(
            parseTaskAttachmentPaths(
                " complaints/u1/a.jpg \n\ncomplaints/u1/a.jpg\n complaints/u1/b.png ",
            ),
        ).toEqual(["complaints/u1/a.jpg", "complaints/u1/b.png"])
    })

    it("menyimpan daftar sebagai baris baru dan null saat kosong", () => {
        expect(
            serializeTaskAttachmentPaths([
                "complaints/u1/a.jpg",
                "complaints/u1/b.png",
                "complaints/u1/a.jpg",
            ]),
        ).toBe("complaints/u1/a.jpg\ncomplaints/u1/b.png")
        expect(serializeTaskAttachmentPaths([])).toBeNull()
    })
})

const DAY_MS = 86_400_000
const NOW = new Date("2026-01-10T00:00:00.000Z").getTime()

function task(partial: Partial<Task>): Task {
    return {
        id: partial.id ?? crypto.randomUUID(),
        title: partial.title ?? "Komplain",
        description: null,
        status: partial.status ?? "todo",
        priority: partial.priority ?? "normal",
        sales_name: null,
        license_plate: null,
        delivery_no: null,
        freight_order: null,
        customer_no: null,
        attachment_path: null,
        resolution_attachment_path: null,
        created_by: null,
        followed_up_by: null,
        followed_up_at: null,
        resolved_by: null,
        resolved_at: null,
        created_at: partial.created_at ?? new Date(NOW - DAY_MS).toISOString(),
        ...partial,
    }
}

function daysAgo(days: number): string {
    return new Date(NOW - days * DAY_MS).toISOString()
}

describe("level umur tiket", () => {
    it("memakai ambang 3 hari dan 7 hari tanpa prioritas manual", () => {
        expect(ticketAgeLevel(task({ created_at: daysAgo(2) }), NOW)).toBe("fresh")
        expect(ticketAgeLevel(task({ created_at: daysAgo(ESCALATION_DAYS) }), NOW)).toBe(
            "attention",
        )
        expect(ticketAgeLevel(task({ created_at: daysAgo(OVERDUE_DAYS) }), NOW)).toBe("overdue")
    })

    it("tiket selesai tidak ikut dieskalasi", () => {
        expect(
            ticketAgeLevel(task({ status: "done", created_at: daysAgo(30) }), NOW),
        ).toBe("fresh")
    })

    it("label membedakan perlu FU dan terlambat", () => {
        expect(ticketAgeLabel(task({ created_at: daysAgo(4) }), NOW)).toBe("Perlu FU 4 hari")
        expect(ticketAgeLabel(task({ created_at: daysAgo(9) }), NOW)).toBe("Terlambat 9 hari")
        expect(ticketAgeLabel(task({ created_at: daysAgo(0) }), NOW)).toBe("Hari ini")
    })

    it("mengurutkan tiket terlambat lebih dulu, lalu yang paling lama", () => {
        const fresh = task({ id: "fresh", created_at: daysAgo(1) })
        const attention = task({ id: "attention", created_at: daysAgo(4) })
        const overdue = task({ id: "overdue", created_at: daysAgo(8) })

        expect([fresh, attention, overdue].sort((a, b) => sortTasks(a, b, NOW)).map((t) => t.id)).toEqual([
            "overdue",
            "attention",
            "fresh",
        ])
        expect(ticketAgeDays(overdue, NOW)).toBe(8)
    })
})

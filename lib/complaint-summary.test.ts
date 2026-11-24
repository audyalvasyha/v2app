import { describe, expect, it } from "vitest"

import {
    complaintPlateKey,
    complaintPlateLabel,
    summarizeComplaintsByPlate,
} from "@/lib/complaint-summary"
import type { Task } from "@/lib/tasks"

function task(partial: Partial<Task>): Task {
    return {
        id: partial.id ?? crypto.randomUUID(),
        title: partial.title ?? "Komplain",
        description: null,
        status: partial.status ?? "todo",
        priority: partial.priority ?? "normal",
        sales_name: partial.sales_name ?? null,
        license_plate: partial.license_plate ?? null,
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
        created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
        ...partial,
    }
}

describe("complaintPlateKey / complaintPlateLabel", () => {
    it("menggabungkan nopol yang beda spasi dan kapital", () => {
        expect(complaintPlateKey(" b 1234 xy ")).toBe("B1234XY")
        expect(complaintPlateKey("B1234XY")).toBe("B1234XY")
        expect(complaintPlateLabel(" b   1234   xy ")).toBe("B 1234 XY")
    })
})

describe("summarizeComplaintsByPlate", () => {
    it("menghitung status, komplain terbuka, dan penanda berulang", () => {
        const summary = summarizeComplaintsByPlate([
            task({ license_plate: "B 1234 XY", status: "todo", created_at: "2026-01-01T00:00:00.000Z" }),
            task({ license_plate: "b1234xy", status: "blocked", created_at: "2026-01-02T00:00:00.000Z" }),
            task({ license_plate: "B1234XY", status: "done", created_at: "2026-01-03T00:00:00.000Z" }),
            task({ license_plate: "D 9 AA", status: "done", created_at: "2026-01-04T00:00:00.000Z" }),
        ])

        expect(summary.plateCount).toBe(2)
        expect(summary.complaintCount).toBe(4)
        expect(summary.openCount).toBe(2)

        const group = summary.groups[0]
        expect(group.plate).toBe("B 1234 XY")
        expect(group.key).toBe("B1234XY")
        expect(group.total).toBe(3)
        expect(group.open).toBe(2)
        expect(group.statuses).toEqual({ todo: 1, progress: 1, done: 1 })
        expect(group.repeated).toBe(true)
        expect(group.tasks.map((t) => t.created_at)).toEqual([
            "2026-01-03T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
        ])
    })

    it("menggabungkan nama sales tanpa membedakan kapital dan mengurutkan terbanyak", () => {
        const summary = summarizeComplaintsByPlate([
            task({ license_plate: "B 1 X", sales_name: "Budi" }),
            task({ license_plate: "B 1 X", sales_name: "BUDI" }),
            task({ license_plate: "B 1 X", sales_name: "Andi" }),
        ])

        expect(summary.groups[0].sales).toEqual([
            { name: "Budi", count: 2 },
            { name: "Andi", count: 1 },
        ])
    })

    it("tidak memasukkan komplain tanpa nopol ke daftar tapi tetap mencatatnya", () => {
        const summary = summarizeComplaintsByPlate([
            task({ license_plate: null }),
            task({ license_plate: "   " }),
            task({ license_plate: "B 2 X" }),
        ])

        expect(summary.plateCount).toBe(1)
        expect(summary.complaintCount).toBe(1)
        expect(summary.withoutPlateCount).toBe(2)
    })

    it("mengutamakan nopol yang masih punya komplain terbuka", () => {
        const summary = summarizeComplaintsByPlate([
            task({ license_plate: "B 3 X", status: "done" }),
            task({ license_plate: "B 3 X", status: "done" }),
            task({ license_plate: "B 4 X", status: "todo" }),
        ])

        expect(summary.groups.map((group) => group.plate)).toEqual(["B 4 X", "B 3 X"])
    })
})

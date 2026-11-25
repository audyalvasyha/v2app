import { describe, expect, it } from "vitest"

import { buildAlerts } from "@/lib/alerts"
import type { Task } from "@/lib/tasks"

const DAY_MS = 86_400_000
const NOW = new Date("2026-01-10T00:00:00.000Z").getTime()

function complaint(partial: Partial<Task>): Pick<
    Task,
    "id" | "title" | "status" | "created_at" | "license_plate" | "delivery_no"
> {
    return {
        id: partial.id ?? crypto.randomUUID(),
        title: partial.title ?? "Komplain",
        status: partial.status ?? "todo",
        created_at:
            partial.created_at ?? new Date(NOW - 4 * DAY_MS).toISOString(),
        license_plate: partial.license_plate ?? "B 1234 XY",
        delivery_no: partial.delivery_no ?? null,
    }
}

describe("buildAlerts — komplain", () => {
    it("memasukkan tiket 3 hari+ dengan tone sesuai umur", () => {
        const alerts = buildAlerts({
            equipments: [],
            serviceLogs: [],
            outbounds: [],
            tasks: [
                complaint({ id: "terlambat", created_at: new Date(NOW - 9 * DAY_MS).toISOString() }),
                complaint({ id: "perlu-fu", created_at: new Date(NOW - 4 * DAY_MS).toISOString() }),
                complaint({ id: "baru", created_at: new Date(NOW - 1 * DAY_MS).toISOString() }),
            ],
            now: NOW,
        })

        expect(alerts.map((alert) => alert.id)).toEqual([
            "complaint-terlambat",
            "complaint-perlu-fu",
        ])
        expect(alerts.map((alert) => alert.tone)).toEqual(["danger", "warning"])
        expect(alerts.every((alert) => alert.category === "complaint")).toBe(true)
        expect(alerts.every((alert) => alert.view === "tugas")).toBe(true)
    })

    it("meringkas sisa tiket setelah batas kartu per kategori", () => {
        const tasks = Array.from({ length: 6 }, (_, index) =>
            complaint({
                id: `tiket-${index}`,
                created_at: new Date(NOW - (4 + index) * DAY_MS).toISOString(),
            }),
        )

        const alerts = buildAlerts({
            equipments: [],
            serviceLogs: [],
            outbounds: [],
            tasks,
            now: NOW,
        })

        expect(alerts).toHaveLength(5)
        expect(alerts.at(-1)?.title).toBe("+2 komplain perlu follow-up")
    })
})

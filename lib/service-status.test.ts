import { describe, it, expect } from "vitest"
import { scheduleDetailLabel } from "@/lib/service-status"

describe("scheduleDetailLabel - satu baris jadwal yang koheren", () => {
    it("tanpa data sama sekali", () => {
        expect(
            scheduleDetailLabel({ id: "none", remainingDays: null, remainingKm: null }),
        ).toBe("—")
    })

    it("hanya odometer yang diketahui", () => {
        expect(
            scheduleDetailLabel({ id: "safe", remainingDays: null, remainingKm: 500 }),
        ).toBe("Sisa 500 km")
        expect(
            scheduleDetailLabel({ id: "overdue", remainingDays: null, remainingKm: -200 }),
        ).toBe("Kelebihan 200 km")
    })

    it("hanya tanggal yang diketahui", () => {
        expect(
            scheduleDetailLabel({ id: "warning", remainingDays: 10, remainingKm: null }),
        ).toBe("10 hari lagi")
        expect(
            scheduleDetailLabel({ id: "overdue", remainingDays: -3, remainingKm: null }),
        ).toBe("Terlambat 3 hari")
    })

    it("kasus kontradiktif: terlewat karena odometer, tanggal masih jauh", () => {
        expect(
            scheduleDetailLabel({ id: "overdue", remainingDays: 122, remainingKm: -202 }),
        ).toBe("Odometer terlewati 202 km · servis terjadwal 122 hari lagi")
    })

    it("dua-duanya lewat", () => {
        expect(
            scheduleDetailLabel({ id: "overdue", remainingDays: -5, remainingKm: -300 }),
        ).toBe("Terlambat 5 hari · Kelebihan 300 km")
    })

    it("hanya tanggal yang lewat, odometer masih sisa", () => {
        expect(
            scheduleDetailLabel({ id: "overdue", remainingDays: -12, remainingKm: 1000 }),
        ).toBe("Terlambat 12 hari · Sisa 1.000 km")
    })

    it("status aman/segera: pasangan biasa", () => {
        expect(
            scheduleDetailLabel({ id: "warning", remainingDays: 5, remainingKm: 800 }),
        ).toBe("5 hari lagi · Sisa 800 km")
        expect(
            scheduleDetailLabel({ id: "safe", remainingDays: 60, remainingKm: 5000 }),
        ).toBe("60 hari lagi · Sisa 5.000 km")
    })
})

import { describe, it, expect } from "vitest"
import { buildMaintenanceCostTrend } from "@/lib/maintenance-cost-trend"

const TODAY = new Date("2026-03-15T12:00:00+07:00")

describe("buildMaintenanceCostTrend — tiga seri bulanan per tanggal", () => {
    it("memetakan tiga bulan terakhir ke tanggal 1–31", () => {
        const trend = buildMaintenanceCostTrend(
            [
                {
                    tanggal: "2026-01-10",
                    nama_barang_atau_jasa: "GANTI BAN",
                    jumlah_harga: 100_000,
                },
                {
                    tanggal: "2026-01-10",
                    nama_barang_atau_jasa: "SERVIS OLI",
                    jumlah_harga: 50_000,
                },
                {
                    tanggal: "2026-02-05",
                    nama_barang_atau_jasa: "GANTI BAN",
                    jumlah_harga: 200_000,
                },
                {
                    tanggal: "2026-03-15",
                    nama_barang_atau_jasa: "SERVIS REM",
                    jumlah_harga: 300_000,
                },
                {
                    tanggal: "2026-03-16",
                    nama_barang_atau_jasa: "GANTI BAN",
                    jumlah_harga: 999_000,
                },
                {
                    tanggal: "2025-12-31",
                    nama_barang_atau_jasa: "GANTI BAN",
                    jumlah_harga: 999_000,
                },
            ],
            TODAY,
        )

        expect(trend.months.map((month) => month.month)).toEqual([
            "2026-01",
            "2026-02",
            "2026-03",
        ])
        expect(trend.months.map((month) => month.days)).toEqual([31, 28, 31])
        expect(trend.months.map((month) => month.total)).toEqual([
            150_000,
            200_000,
            300_000,
        ])
        expect(trend.points).toHaveLength(31)

        const day10 = trend.points.find((point) => point.day === 10)
        expect(day10).toMatchObject({
            label: "10",
            month0: 150_000,
            month1: 0,
            month2: 0,
        })

        expect(trend.points.find((point) => point.day === 5)?.month1).toBe(200_000)
        const day15 = trend.points.find((point) => point.day === 15)
        expect(day15?.month2).toBe(300_000)
        expect(trend.points.find((point) => point.day === 16)?.month2).toBeNull()
        expect(trend.points.find((point) => point.day === 29)?.month1).toBeNull()
        expect(trend.total).toBe(650_000)
        expect(trend.hasData).toBe(true)
    })

    it("tetap menyediakan 31 titik bulanan saat belum ada biaya", () => {
        const trend = buildMaintenanceCostTrend([], TODAY)
        expect(trend.hasData).toBe(false)
        expect(trend.total).toBe(0)
        expect(trend.points).toHaveLength(31)
        expect(trend.months).toHaveLength(3)
    })
})

import { describe, it, expect } from "vitest"
import {
    banBySlot,
    banByUnit,
    banCategory,
    banMonthly,
    banPosition,
    banQty,
    banSide,
    banTotals,
    banWheelSides,
    banWheelSlots,
    banWithoutSlot,
    toBanRow,
    toBanRows,
} from "@/lib/ban-analytics"

describe("banCategory - jenis pekerjaan dari teks bebas", () => {
    it("mengenali penggantian dalam berbagai ejaan", () => {
        expect(banCategory("2 PCS GANTI BAN")).toBe("ganti")
        expect(banCategory("2PCS GANTI BAN BELAKANG L/R")).toBe("ganti")
        expect(banCategory("Ganti ban belakang kanan GT")).toBe("ganti")
        expect(banCategory("TUKAR BAN")).toBe("ganti")
        expect(banCategory("ONGKOS PASANG BAN 175-65-14")).toBe("ganti")
        expect(banCategory("BAN DALAM BARU MERK GT POSISI KIRI BELAKANG")).toBe("ganti")
    })

    it("membedakan perbaikan/roker dari penggantian", () => {
        expect(banCategory("PERBAIKAN GANTUNGAN BAN SERAP")).toBe("perbaikan")
        expect(banCategory("1 PCS ROKER BAN")).toBe("perbaikan")
        expect(banCategory("TAMBAL BAN BELAKANG KANAN")).toBe("perbaikan")
    })

    it("membedakan aksesori dari ban itu sendiri", () => {
        expect(banCategory("GANTI GANTUNGAN BAN SERAP")).toBe("aksesori")
        expect(banCategory("BUAT SAYAP BAN BELAKANG")).toBe("aksesori")
        expect(banCategory("1 SELENDANG BAN")).toBe("aksesori")
    })

    it("menandai lainnya untuk kasus yang hanya menyebut ban", () => {
        expect(banCategory("1 BAN DALAM SWALOW")).toBe("lainnya")
        expect(banCategory("2BH BAN + BLD + SELENDANG")).toBe("lainnya")
    })
})

describe("banPosition - posisi roda", () => {
    it("mengenali depan dan belakang, termasuk singkatan", () => {
        expect(banPosition("GANTI BAN DEPAN KANAN")).toBe("depan")
        expect(banPosition("GANTI BAN DPN KANAN")).toBe("depan")
        expect(banPosition("GANTI BAN BELAKANG KIRI")).toBe("belakang")
        expect(banPosition("GANTI BAN 2 RODA BELAKANG")).toBe("belakang")
    })

    it("ban serap lebih dulu, walau ikut menyebut posisi lain", () => {
        expect(banPosition("GANTI BAN UNTUK SERAP")).toBe("serap")
        expect(banPosition("PERBAIKAN GANTUNGAN BAN SERAP")).toBe("serap")
        // Serap + posisi lain tetap campuran: satu baris bisa mencakup
        // ban belakang sekaligus ban cadangan.
        expect(banPosition("GANTI BAN BELAKANG KIRI 2PCS BAN SERAP 1PCS")).toBe("campuran")
    })

    it("menandai campuran saat menyebut depan dan belakang sekaligus", () => {
        expect(banPosition("GANTI BAN DEPAN BELAKANG")).toBe("campuran")
    })

    it("null bila posisi tidak disebut", () => {
        expect(banPosition("2 PCS GANTI BAN")).toBeNull()
    })
})

describe("banQty - jumlah ban dari teks", () => {
    it("membaca angka yang menempel pada satuan", () => {
        expect(banQty("2 PCS GANTI BAN")).toBe(2)
        expect(banQty("3PCS GANTI BAN")).toBe(3)
        expect(banQty("2BH BAN + BLD + SELENDANG")).toBe(2)
        expect(banQty("GANTI BAN 2 RODA")).toBe(2)
        expect(banQty("GANTI BAN 3 BH")).toBe(3)
    })

    it("membaca angka di sebelah kata ban", () => {
        expect(banQty("BAN 2 BH")).toBe(2)
    })

    it("menganggap satu ban bila angka tidak disebut", () => {
        expect(banQty("GANTI BAN")).toBe(1)
        expect(banQty("GANTI BAN DEPAN KIRI")).toBe(1)
    })

    it("mengabaikan ukuran ban yang ikut tertulis pada catatan", () => {
        expect(banQty("ONGKOS PASANG BAN 175-65-14")).toBe(1)
        expect(banQty("GANTI BAN 215/75R17.5")).toBe(1)
    })

    it("nol untuk teks yang bukan soal ban", () => {
        expect(banQty("GANTI OLI")).toBe(0)
    })
})

describe("banSide - dalam atau luar", () => {
    it("mengenali inner dan outer", () => {
        expect(banSide("1 BAN DALAM SWALOW")).toBe("dalam")
        expect(banSide("2PCS GANTI BAN BELAKANG KIRI LUAR DALAM")).toBe("dalam")
        expect(banSide("2 SEAL RODA BELAKANG LUAR")).toBe("luar")
    })

    it("null bila tidak disebut", () => {
        expect(banSide("2 PCS GANTI BAN")).toBeNull()
    })
})

describe("toBanRows - menyaring riwayat menjadi baris ban", () => {
    const rows = [
        { nama_barang_atau_jasa: "2 PCS GANTI BAN", jumlah_harga: 200000, tanggal: "2026-02-09", license_plate: "B9413SXV", equipment_id: "E-01" },
        { nama_barang_atau_jasa: "GANTI OLI + FILTER", jumlah_harga: 350000, tanggal: "2026-02-10", license_plate: "B9050SXV", equipment_id: "E-02" },
        { nama_barang_atau_jasa: "TUKAR BAN", jumlah_harga: 30000, tanggal: "2026-01-31", license_plate: "B9603SXV", equipment_id: "E-01" },
        { nama_barang_atau_jasa: "1 VELG", jumlah_harga: 700000, tanggal: "2026-02-07", license_plate: "B9928SXT", equipment_id: "E-03" },
    ]

    it("hanya mengambil baris yang benar-benar soal ban", () => {
        const parsed = toBanRows(rows)
        expect(parsed).toHaveLength(2)
        expect(parsed[0].item).toBe("2 PCS GANTI BAN")
        expect(parsed[0].iso).toBe("2026-02-09")
        expect(parsed[0].cost).toBe(200000)
        expect(parsed[0].qty).toBe(2)
        expect(parsed[0].position).toBeNull()
        expect(parsed[1].category).toBe("ganti")
    })

    it("toBanRow mengembalikan null untuk baris non-ban", () => {
        expect(toBanRow(rows[1])).toBeNull()
    })

    it("toleransi input rusak tanpa melempar error", () => {
        expect(toBanRow(null)).toBeNull()
        expect(toBanRow({})).toBeNull()
        expect(toBanRows([])).toEqual([])
    })
})

describe("banTotals - ringkasan biaya ban", () => {
    const rows = toBanRows([
        { nama_barang_atau_jasa: "2 PCS GANTI BAN", jumlah_harga: 200000, tanggal: "2026-02-09", license_plate: "B1", equipment_id: "E-01" },
        { nama_barang_atau_jasa: "TUKAR BAN", jumlah_harga: 30000, tanggal: "2026-01-31", license_plate: "B1", equipment_id: "E-01" },
        { nama_barang_atau_jasa: "1 BAN DALAM", jumlah_harga: 70000, tanggal: "2026-02-07", license_plate: "B2", equipment_id: "E-02" },
    ])

    it("menjumlahkan entri, biaya, dan jumlah ban", () => {
        const t = banTotals(rows)
        expect(t.entries).toBe(3)
        expect(t.cost).toBe(300000)
        expect(t.qty).toBe(4)
        expect(t.units).toBe(2)
        expect(t.first).toBe("2026-01-31")
        expect(t.last).toBe("2026-02-09")
    })

    it("menghitung rata-rata per entri dan per ban", () => {
        const t = banTotals(rows)
        expect(t.avgPerEntry).toBe(100000)
        expect(t.avgPerBan).toBe(75000)
    })

    it("pecah biaya per kategori", () => {
        const t = banTotals(rows)
        expect(t.byCategory.ganti).toBe(230000)
        expect(t.byCategory.lainnya).toBe(70000)
    })

    it("aman pada data kosong (tanpa bagi nol)", () => {
        const t = banTotals([])
        expect(t.entries).toBe(0)
        expect(t.avgPerEntry).toBe(0)
        expect(t.avgPerBan).toBe(0)
        expect(t.first).toBeNull()
    })
})

describe("banMonthly - tren bulanan", () => {
    it("mengelompokkan per bulan dan mengurutkan menaik", () => {
        const rows = toBanRows([
            { nama_barang_atau_jasa: "2 PCS GANTI BAN", jumlah_harga: 200000, tanggal: "2026-02-09", license_plate: "B1" },
            { nama_barang_atau_jasa: "TUKAR BAN", jumlah_harga: 30000, tanggal: "2026-01-31", license_plate: "B1" },
            { nama_barang_atau_jasa: "GANTI BAN", jumlah_harga: 50000, tanggal: "2026-02-20", license_plate: "B2" },
        ])
        const series = banMonthly(rows)
        expect(series.map((p) => p.key)).toEqual(["2026-01", "2026-02"])
        expect(series[0].cost).toBe(30000)
        expect(series[1].cost).toBe(250000)
        expect(series[1].entries).toBe(2)
        expect(series[1].qty).toBe(3)
        expect(series[1].label).toContain("2026")
    })

    it("mengabaikan baris tanpa tanggal", () => {
        const rows = toBanRows([{ nama_barang_atau_jasa: "GANTI BAN", jumlah_harga: 10000 }])
        expect(banMonthly(rows)).toEqual([])
    })
})

describe("banWheelSides - sisi roda dari teks", () => {
    it("mengenali kiri dan kanan, termasuk singkatan", () => {
        expect(banWheelSides("GANTI BAN BELAKANG KIRI")).toEqual(["kiri"])
        expect(banWheelSides("GANTI BAN DEPN KANAN")).toEqual(["kanan"])
        expect(banWheelSides("BAN BELAKANG LEFT")).toEqual(["kiri"])
        expect(banWheelSides("BAN DEPAN RIGHT")).toEqual(["kanan"])
    })

    it("mengenali L/R sebagai dua-duanya", () => {
        expect(banWheelSides("2PCS GANTI BAN BELAKANG L/R")).toEqual(["kiri", "kanan"])
    })

    it("kosong bila sisi tidak disebut", () => {
        expect(banWheelSides("2 PCS GANTI BAN")).toEqual([])
        expect(banWheelSides("GANTI BAN DEPAN")).toEqual([])
    })
})

describe("banWheelSlots - roda yang tersentuh satu catatan", () => {
    it("memetakan posisi dan sisi ke satu roda", () => {
        expect(banWheelSlots("GANTI BAN DEPAN KIRI")).toEqual(["depan-kiri"])
        expect(banWheelSlots("GANTI BAN BELAKANG KANAN")).toEqual([
            "belakang-kanan-luar",
            "belakang-kanan-dalam",
        ])
        expect(banWheelSlots("ROKER BAN DEPAN KANAN")).toEqual(["depan-kanan"])
    })

    it("ban dobel: dalam/luar eksplisit menempel ke satu roda saja", () => {
        expect(banWheelSlots("GANTI BAN BELAKANG KIRI DALAM")).toEqual(["belakang-kiri-dalam"])
        expect(banWheelSlots("GANTI BAN BELAKANG KANAN LUAR")).toEqual(["belakang-kanan-luar"])
    })

    it("L/R menyentuh kedua ban dobel axle tersebut", () => {
        expect(banWheelSlots("2PCS GANTI BAN BELAKANG L/R")).toEqual([
            "belakang-kiri-luar",
            "belakang-kiri-dalam",
            "belakang-kanan-luar",
            "belakang-kanan-dalam",
        ])
    })

    it("tanpa keterangan sisi tetap dihitung untuk kedua roda axle", () => {
        expect(banWheelSlots("GANTI BAN DEPAN")).toEqual(["depan-kiri", "depan-kanan"])
        expect(banWheelSlots("2 PCS GANTI BAN BELAKANG")).toEqual([
            "belakang-kiri-luar",
            "belakang-kiri-dalam",
            "belakang-kanan-luar",
            "belakang-kanan-dalam",
        ])
    })

    it("mencakup keempat roda saat menyebut depan sekaligus belakang", () => {
        expect(banWheelSlots("GANTI BAN DEPAN BELAKANG KIRI")).toEqual([
            "depan-kiri",
            "belakang-kiri-luar",
            "belakang-kiri-dalam",
        ])
    })

    it("ban serap berdiri sendiri, dan boleh berdampingan dengan posisi lain", () => {
        expect(banWheelSlots("PERBAIKAN GANTUNGAN BAN SERAP")).toEqual(["serap"])
        expect(banWheelSlots("GANTI BAN BELAKANG KIRI 2PCS BAN SERAP 1PCS")).toEqual([
            "belakang-kiri-luar",
            "belakang-kiri-dalam",
            "serap",
        ])
    })

    it("tidak menempel ke roda mana pun bila posisi tidak disebut", () => {
        expect(banWheelSlots("2 PCS GANTI BAN")).toEqual([])
        expect(banWheelSlots("TUKAR BAN")).toEqual([])
        expect(banWheelSlots(null)).toEqual([])
    })
})

describe("banBySlot - rincian ban per roda", () => {
    const rows = toBanRows([
        {
            nama_barang_atau_jasa: "2 PCS GANTI BAN DEPAN KIRI",
            jumlah_harga: 1500000,
            tanggal: "2026-02-09",
            license_plate: "B1",
        },
        {
            nama_barang_atau_jasa: "1 PCS GANTI BAN BELAKANG KANAN",
            jumlah_harga: 900000,
            tanggal: "2026-03-01",
            license_plate: "B1",
        },
        {
            nama_barang_atau_jasa: "PERBAIKAN GANTUNGAN BAN SERAP",
            jumlah_harga: 50000,
            tanggal: "2026-01-20",
            license_plate: "B1",
        },
        {
            nama_barang_atau_jasa: "GANTI BAN",
            jumlah_harga: 250000,
            tanggal: "2026-02-01",
            license_plate: "B1",
        },
    ])

    it("memisahkan biaya per roda sesuai catatan", () => {
        const bySlot = banBySlot(rows)
        expect(bySlot["depan-kiri"].entries).toBe(1)
        expect(bySlot["depan-kiri"].cost).toBe(1500000)
        expect(bySlot["depan-kiri"].qty).toBe(2)
        expect(bySlot["depan-kanan"].entries).toBe(0)
        expect(bySlot["belakang-kanan-luar"].cost).toBe(900000)
        expect(bySlot["belakang-kanan-dalam"].cost).toBe(900000)
        expect(bySlot.serap.cost).toBe(50000)
    })

    it("mencatat tanggal pertama dan terakhir per roda", () => {
        const bySlot = banBySlot(rows)
        expect(bySlot["depan-kiri"].first).toBe("2026-02-09")
        expect(bySlot["depan-kiri"].last).toBe("2026-02-09")
        expect(bySlot.serap.last).toBe("2026-01-20")
    })

    it("tidak menagih catatan tanpa posisi ke roda mana pun", () => {
        const bySlot = banBySlot(rows)
        const totalEntries = Object.values(bySlot).reduce((m, p) => m + p.entries, 0)
        // 3 catatan berposisi; "GANTI BAN" tidak punya, jadi tidak dihitung.
        // Catatan belakang-kanan adalah ban dobel — mengenai luar + dalam,
        // jadi 3 catatan tersebut menulis 4 slot-entri.
        expect(totalEntries).toBe(4)
        expect(banWithoutSlot(rows).map((r) => r.item)).toEqual(["GANTI BAN"])
    })

    it("menandai entri yang tidak menyebut sisi agar angka ganda terlihat jujur", () => {
        const bySlot = banBySlot([
            ...toBanRows([
                {
                    nama_barang_atau_jasa: "GANTI BAN DEPAN",
                    jumlah_harga: 300000,
                    tanggal: "2026-02-01",
                    license_plate: "B1",
                },
            ]),
        ])
        expect(bySlot["depan-kiri"].unspecifiedEntries).toBe(1)
        expect(bySlot["depan-kanan"].unspecifiedEntries).toBe(1)
        expect(bySlot["belakang-kiri-luar"].unspecifiedEntries).toBe(0)
        expect(bySlot["belakang-kiri-dalam"].unspecifiedEntries).toBe(0)
    })

    it("aman pada data kosong", () => {
        const bySlot = banBySlot([])
        for (const point of Object.values(bySlot)) {
            expect(point.entries).toBe(0)
            expect(point.cost).toBe(0)
            expect(point.first).toBeNull()
        }
    })
})

describe("banByUnit - peringkat unit", () => {
    it("mengurutkan menurut biaya ban dan membatasi jumlah", () => {
        const rows = toBanRows([
            { nama_barang_atau_jasa: "GANTI BAN", jumlah_harga: 100000, tanggal: "2026-01-05", license_plate: "B1" },
            { nama_barang_atau_jasa: "GANTI BAN", jumlah_harga: 900000, tanggal: "2026-02-05", license_plate: "B2" },
            { nama_barang_atau_jasa: "GANTI BAN", jumlah_harga: 400000, tanggal: "2026-03-05", license_plate: "B3" },
        ])
        const top = banByUnit(rows, 2)
        expect(top).toHaveLength(2)
        expect(top[0].key).toBe("B2")
        expect(top[0].cost).toBe(900000)
        expect(top[1].key).toBe("B3")
    })

    it("mencatat tanggal ganti terakhir per unit", () => {
        const rows = toBanRows([
            { nama_barang_atau_jasa: "GANTI BAN", jumlah_harga: 100000, tanggal: "2026-01-05", license_plate: "B1" },
            { nama_barang_atau_jasa: "GANTI BAN", jumlah_harga: 100000, tanggal: "2026-04-05", license_plate: "B1" },
        ])
        expect(banByUnit(rows, 1)[0].last).toBe("2026-04-05")
    })
})
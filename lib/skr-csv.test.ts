import { describe, it, expect } from "vitest"
import { parseSkrCsv, SKR_CSV_TEMPLATE } from "@/lib/skr-csv"

describe("parseSkrCsv — pemetaan header longgar", () => {
    it("mengenali header berkapital dan berpasi dari sistem asli", () => {
        const csv = [
            "Delivery Number,POD Date,License No,Salesman,Customer ID,SKR Base Unit,SKR Sales Unit,SKR Value,POD Reason,Sales Office,Distribution Channel",
            'JBP0005388,02 April 2026,B9296SXW,S090091380,110056017,48,2,"169,300",Barang Hilang,PKD Bagan Batu,Modern Trade',
        ].join("\n")

        const r = parseSkrCsv(csv)
        expect(r.errors).toHaveLength(0)
        expect(r.unknownHeaders).toHaveLength(0)
        expect(r.rows).toHaveLength(1)
        expect(r.rows[0]).toMatchObject({
            delivery_number: "JBP0005388",
            pod_date: "02 April 2026",
            license_no: "B9296SXW",
            salesman: "S090091380",
            customer_id: "110056017",
            skr_base_unit: "48",
            skr_sales_unit: 2,
            skr_value: "169,300",
            pod_reason: "Barang Hilang",
            sales_office: "PKD Bagan Batu",
            distribution_channel: "Modern Trade",
        })
    })

    it("header tanpa spasi/berhuruf kecil tetap dikenali (alias)", () => {
        const csv = "deliverynumber,poddate,licenseno\nX,1 Jan 2026,AA1111AA"
        const r = parseSkrCsv(csv)
        expect(r.rows).toHaveLength(1)
        expect(r.rows[0].delivery_number).toBe("X")
        expect(r.rows[0].pod_date).toBe("1 Jan 2026")
        expect(r.rows[0].license_no).toBe("AA1111AA")
    })

    it("header duplikat: nilai kolom terakhir yang menang (perilaku konsisten)", () => {
        const csv = "License No,POD Date,POD Date\nB1,1 Jan 2026,2 Feb 2026"
        const r = parseSkrCsv(csv)
        expect(r.rows[0].pod_date).toBe("2 Feb 2026")
    })

    it("BOM dari Excel di awal file tidak merusak header pertama", () => {
        const csv = "﻿Delivery Number,POD Date,License No\nJBP1,1 Jan 2026,B1"
        const r = parseSkrCsv(csv)
        expect(r.unknownHeaders).toHaveLength(0)
        expect(r.headerMap[0].csvHeader).toBe("Delivery Number")
        expect(r.rows[0].delivery_number).toBe("JBP1")
    })
})

describe("parseSkrCsv — nilai dalam tanda kutip", () => {
    it("koma di dalam kutip tidak memecah kolom", () => {
        const csv = 'License No,POD Date,SKR Value\nB1,1 Jan 2026,"1,062,725"'
        const r = parseSkrCsv(csv)
        expect(r.rows[0].skr_value).toBe("1,062,725")
    })

    it('kutip ganda ter-escape ("") jadi satu karakter', () => {
        const csv = 'License No,POD Date,POD Reason\nB1,1 Jan 2026,"Keterangan ""khusus"""'
        const r = parseSkrCsv(csv)
        expect(r.rows[0].pod_reason).toBe('Keterangan "khusus"')
    })

    it("CRLF, LF, dan CR semua didukung sebagai akhir baris", () => {
        const base = "License No,POD Date"
        const mk = (row: string) => `License No,POD Date\r\n${row.replace("\n", "\r\n")}`
        for (const eol of ["\r\n", "\n", "\r"]) {
            const csv = `License No,POD Date${eol}B1,1 Jan 2026${eol}B2,2 Feb 2026`
            const r = parseSkrCsv(csv)
            expect(r.rows).toHaveLength(2)
            expect(r.rows[0].license_no).toBe("B1")
        }
        void base
        void mk
    })
})

describe("parseSkrCsv — validasi baris", () => {
    it("baris tanpa No. Polisi masuk errors, bukan rows", () => {
        const csv = "Delivery Number,POD Date,License No\nJBP1,1 Jan 2026,\n"
        const r = parseSkrCsv(csv)
        expect(r.rows).toHaveLength(0)
        expect(r.errors).toHaveLength(1)
        expect(r.errors[0].message).toContain("No. Polisi")
    })

    it("baris tanpa Tanggal POD masuk errors", () => {
        const csv = "License No,POD Date\nB1,\n"
        const r = parseSkrCsv(csv)
        expect(r.rows).toHaveLength(0)
        expect(r.errors[0].message).toContain("Tanggal POD")
    })

    it("baris kosong total dilewati tanpa error", () => {
        const csv = "License No,POD Date\nB1,1 Jan 2026\n\n\n"
        const r = parseSkrCsv(csv)
        expect(r.rows).toHaveLength(1)
        expect(r.errors).toHaveLength(0)
    })

    it("qty non-numerik jatuh ke 0, bukan NaN", () => {
        const csv = 'License No,POD Date,SKR Sales Unit\nB1,1 Jan 2026,"abc"'
        const r = parseSkrCsv(csv)
        expect(r.rows[0].skr_sales_unit).toBe(0)
    })

    it("qty diparse dari teks berformat", () => {
        const csv = 'License No,POD Date,SKR Sales Unit\nB1,1 Jan 2026,"1,250"'
        const r = parseSkrCsv(csv)
        expect(r.rows[0].skr_sales_unit).toBe(1250)
    })

    it("file kosong mengembalikan error", () => {
        const r = parseSkrCsv("")
        expect(r.rows).toHaveLength(0)
        expect(r.errors[0].message).toBe("File kosong")
    })

    it("header tidak dikenal tetap ditandai, tidak crash", () => {
        const csv = "License No,POD Date,Kolom Misterius\nB1,1 Jan 2026,x"
        const r = parseSkrCsv(csv)
        expect(r.unknownHeaders).toEqual(["Kolom Misterius"])
        expect(r.rows).toHaveLength(1)
    })
})

describe("template", () => {
    it("template bisa diparse ulang tanpa error", () => {
        const r = parseSkrCsv(SKR_CSV_TEMPLATE)
        expect(r.errors).toHaveLength(0)
        expect(r.unknownHeaders).toHaveLength(0)
        expect(r.rows).toHaveLength(2)
        expect(r.rows[1].distribution_channel).toBe("General Trade")
    })
})

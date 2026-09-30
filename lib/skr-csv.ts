"use client"

/**
 * Parser CSV + fuzzy header mapping untuk import SKR.
 *
 * Header CSV asli memakai spasi dan huruf kapital ("Delivery Number",
 * "SKR Value", dst.) — dinormalkan lalu dicocokkan ke kolom database
 * (delivery_number, skr_value, ...) lewat tabel alias di bawah.
 */

export interface SkrCsvRow {
    license_no: string
    salesman: string
    pod_reason: string
    skr_base_unit: string
    pod_date: string
    skr_sales_unit: number
    skr_value: string
    customer_id: string
    delivery_number: string
}

export interface CsvParseResult {
    rows: SkrCsvRow[]
    /** Peta header CSV asli → kolom DB yang terpakai (untuk UI preview) */
    headerMap: { csvHeader: string; dbColumn: string }[]
    /** Header yang tidak dikenali — tetap diabaikan, tapi ditampilkan */
    unknownHeaders: string[]
    /** Baris yang gagal divalidasi beserta alasannya */
    errors: { rowNumber: number; message: string }[]
}

/** Kolom DB target — semua opsional kecuali license_no & pod_date. */
const COLUMN_ALIASES: Record<string, string> = {
    license_no: "license_no",
    licenseno: "license_no",
    license: "license_no",
    nopol: "license_no",
    "no.polisi": "license_no",
    nomorpolisi: "license_no",
    plat: "license_no",
    platnomor: "license_no",

    salesman: "salesman",
    namasales: "salesman",
    kodesales: "salesman",

    pod_reason: "pod_reason",
    podreason: "pod_reason",
    alasan: "pod_reason",
    alasanpod: "pod_reason",

    skr_base_unit: "skr_base_unit",
    skrbaseunit: "skr_base_unit",
    baseunit: "skr_base_unit",
    sku: "skr_base_unit",

    pod_date: "pod_date",
    poddate: "pod_date",
    tanggal: "pod_date",
    tanggalpod: "pod_date",

    skr_sales_unit: "skr_sales_unit",
    skrsalesunit: "skr_sales_unit",
    salesunit: "skr_sales_unit",
    qty: "skr_sales_unit",
    unit: "skr_sales_unit",

    skr_value: "skr_value",
    skrvalue: "skr_value",
    value: "skr_value",
    nilai: "skr_value",

    customer_id: "customer_id",
    customerid: "customer_id",
    idcustomer: "customer_id",

    delivery_number: "delivery_number",
    deliverynumber: "delivery_number",
    donumber: "delivery_number",
    nomordo: "delivery_number",

    // Kolom yang ada di CSV tapi tidak dipakai — dipetakan ke "" agar tidak
    // muncul sebagai "unknown".
    distribution_channel: "",
    sales_office: "",
}

/** "Delivery Number" / " delivery number " → "deliverynumber" */
function normalizeHeader(raw: string): string {
    return raw.trim().toLowerCase().replace(/[\s_-]+/g, "")
}

/**
 * Parser CSV ringkas yang sadar-kutip: koma di dalam tanda kutip tidak
 * dianggap pemisah, kutip ganda di-escape (""). CRLF/CR/LF semua didukung.
 */
function splitCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ""
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"'
                    i++
                } else {
                    inQuotes = false
                }
            } else {
                cell += ch
            }
            continue
        }
        if (ch === '"') {
            inQuotes = true
        } else if (ch === ",") {
            row.push(cell)
            cell = ""
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++
            row.push(cell)
            cell = ""
            if (row.some((c) => c.trim() !== "")) rows.push(row)
            row = []
        } else {
            cell += ch
        }
    }
    if (cell !== "" || row.some((c) => c.trim() !== "")) {
        row.push(cell)
        rows.push(row)
    }
    return rows
}

export function parseSkrCsv(text: string): CsvParseResult {
    const table = splitCsv(text)
    if (table.length === 0) {
        return { rows: [], headerMap: [], unknownHeaders: [], errors: [{ rowNumber: 0, message: "File kosong" }] }
    }

    const rawHeaders = table[0].map((h) => h.trim())
    const headers = rawHeaders.map((h) => COLUMN_ALIASES[normalizeHeader(h)] ?? "")

    const headerMap: { csvHeader: string; dbColumn: string }[] = []
    const unknownHeaders: string[] = []
    rawHeaders.forEach((csv, i) => {
        const db = headers[i]
        if (db) headerMap.push({ csvHeader: csv, dbColumn: db })
        else if (csv) unknownHeaders.push(csv)
    })

    const errors: { rowNumber: number; message: string }[] = []
    const rows: SkrCsvRow[] = []

    for (let i = 1; i < table.length; i++) {
        const cells = table[i]
        const rowNumber = i + 1
        const record: Record<string, string> = {}
        for (let c = 0; c < headers.length; c++) {
            if (headers[c]) record[headers[c]] = (cells[c] ?? "").trim()
        }

        const licenseNo = record.license_no ?? ""
        const podDate = record.pod_date ?? ""
        if (!licenseNo && !podDate) continue // baris benar-benar kosong

        if (!licenseNo) {
            errors.push({ rowNumber, message: "Kolom No. Polisi kosong" })
            continue
        }
        if (!podDate) {
            errors.push({ rowNumber, message: "Kolom Tanggal POD kosong" })
            continue
        }

        const qtyRaw = (record.skr_sales_unit ?? "0").replace(/[^0-9-]/g, "")
        const qty = Number.parseInt(qtyRaw || "0", 10)

        rows.push({
            license_no: licenseNo,
            salesman: record.salesman ?? "",
            pod_reason: record.pod_reason ?? "",
            skr_base_unit: record.skr_base_unit ?? "",
            pod_date: podDate,
            skr_sales_unit: Number.isFinite(qty) ? qty : 0,
            // skr_value dipertahankan apa adanya ("169,300") — diparsing
            // di view skr_ringkasan, konsisten dengan data lama.
            skr_value: record.skr_value ?? "",
            customer_id: record.customer_id ?? "",
            delivery_number: record.delivery_number ?? "",
        })
    }

    return { rows, headerMap, unknownHeaders, errors }
}

/** Template CSV standar — unduh dari halaman import. */
export const SKR_CSV_TEMPLATE = [
    "License No,Salesman,POD Reason,SKR Base Unit,POD Date,SKR Sales Unit,SKR Value,Customer ID,Delivery Number",
    'B9296SXW,S090091380,Barang Hilang,48,02 April 2026,2,"169,300",110056017,JBP0005388',
    'B1234ABC,S000000001,Terkirim Lengkap,24,03 April 2026,5,"1,062,725",110056018,JBP0005389',
].join("\r\n")

/**
 * Agregasi untuk dashboard SKR (Sisa Kiriman).
 *
 * Semua perhitungan dihitung ulang dari baris yang sudah difilter di sisi
 * komponen — memoize di dalam `useMemo` pemanggil. Nilai & tanggal dinormalkan
 * lewat `lib/skr-status` karena kolomnya bertipe TEXT di database.
 */

import { parseNilai, skrCategory, type SkrCategory } from "./skr-status"

export type SkrMetric = "qty" | "nilai"

export interface SkrAggregate {
    /** Kunci kelompok (mis. plat nomor atau nama salesman) */
    key: string
    /** Label siap tampil — sudah joined dengan equipment/customer bila ada */
    label: string
    /** Keterangan tambahan di bawah label */
    sublabel?: string
    qty: number
    nilai: number
    rows: number
    /** Jumlah unit didorong ke kombinasi (bisa > 1 bila ada baris berbeda) */
    unit?: string
}

export interface SkrTotals {
    qty: number
    nilai: number
    rows: number
    armada: number
    sales: number
    customer: number
    categories: Record<SkrCategory, number>
}

/** Konversi satu baris SKR menjadi nilai yang bisa dijumlahkan. */
export function skrRowMetrics(row: any): { qty: number; nilai: number; category: SkrCategory } {
    return {
        // Data datang dari view `skr_ringkasan` (qty & nilai sudah numerik),
        // dengan fallback ke kolom mentah bila view belum dipakai.
        qty: Number(row.qty ?? row.skr_sales_unit ?? 0) || 0,
        nilai: row.nilai != null ? Number(row.nilai) || 0 : parseNilai(row.skr_value),
        category: skrCategory(row.pod_reason).category,
    }
}

/** Total keseluruhan + sebaran kategori POD. */
export function skrTotals(rows: any[]): SkrTotals {
    let qty = 0
    let nilai = 0
    const armadas = new Set<string>()
    const sales = new Set<string>()
    const customers = new Set<string>()
    const categories: Record<SkrCategory, number> = {
        internal: 0,
        operasional: 0,
        pelanggan: 0,
        redelivery: 0,
        lainnya: 0,
    }

    for (const row of rows) {
        const m = skrRowMetrics(row)
        qty += m.qty
        nilai += m.nilai
        categories[m.category] += 1

        if (row.license_no) armadas.add(String(row.license_no))
        // Hitung per salesman berdasarkan NAMA kalau tersedia. Kalau
        // master sales-nya belum punya entri, NIK tetap dipakai supaya
        // jumlahnya tidak undercount — hanya tampilannya yang berbeda.
        if (row.salesman) sales.add(salesmanLabel(row))
        if (row.customer_id != null) customers.add(String(row.customer_id))
    }

    return {
        qty,
        nilai,
        rows: rows.length,
        armada: armadas.size,
        sales: sales.size,
        customer: customers.size,
        categories,
    }
}

/**
 * Label salesman untuk ditampilkan: nama kalau ada, NIK sebagai cadangan.
 *
 * Dipisah dari skrGroupKey supaya "berapa banyak salesman" dan "kelompok
 * mana" memakai nilai yang sama — kalau tidak, dashboard bisa
 * menampilkan jumlah yang tidak cocok dengan penjumlahan di tabelnya.
 */
export function salesmanLabel(row: any): string {
    const nama = row?.salesman_nama == null ? "" : String(row.salesman_nama).trim()
    return nama || (row?.salesman == null ? "" : String(row.salesman).trim())
}

/** Kunci kelompok + label yang enak dibaca. */
export function skrGroupKey(row: any, by: "armada" | "sales" | "customer"): string {
    const raw =
        by === "armada"
            ? row.license_no
            : by === "sales"
              ? salesmanLabel(row)
              : row.customer_id
    const text = raw == null ? "" : String(raw).trim()
    return text || "(tidak diisi)"
}

function accumulate(map: Map<string, SkrAggregate>, row: any, by: "armada" | "sales" | "customer") {
    const key = skrGroupKey(row, by)
    const m = skrRowMetrics(row)
    const existing = map.get(key)
    if (existing) {
        existing.qty += m.qty
        existing.nilai += m.nilai
        existing.rows += 1
    } else {
        map.set(key, { key, label: key, qty: m.qty, nilai: m.nilai, rows: 1 })
    }
}

export interface SkrRankingOptions {
    /** Peta plat nomor → deskripsi armada (dari tabel equipment) */
    equipmentByPlate?: Map<string, { equipment_id?: string; description?: string }>
    /** Peta customer_id → nama toko (dari tabel customers) */
    customerById?: Map<string, string>
}

/**
 * Menghasilkan 5 teratas & 5 terbawah untuk satu metrik.
 * `terbawah` selalu diurutkan dari yang paling kecil ke besar agar urutannya
 * konsisten di UI.
 */
export function skrRanking(
    rows: any[],
    by: "armada" | "sales" | "customer",
    metric: SkrMetric,
    topCount = 5,
    options: SkrRankingOptions = {},
): { top: SkrAggregate[]; bottom: SkrAggregate[] } {
    const map = new Map<string, SkrAggregate>()
    for (const row of rows) accumulate(map, row, by)

    const list = [...map.values()]

    // Perjelas label: untuk armada, sisipkan equipment_id + deskripsi;
    // untuk customer, sisipkan nama toko dari tabel customers.
    if (by === "armada" && options.equipmentByPlate) {
        for (const item of list) {
            const eq = options.equipmentByPlate.get(item.key)
            if (eq) {
                item.sublabel = [eq.equipment_id, eq.description].filter(Boolean).join(" · ") || undefined
            }
        }
    } else if (by === "customer" && options.customerById) {
        for (const item of list) {
            const nama = options.customerById.get(item.key)
            if (nama) item.label = nama
        }
    }

    const value = (a: SkrAggregate) => (metric === "qty" ? a.qty : a.nilai)

    const desc = [...list].sort((a, b) => value(b) - value(a))
    const asc = [...list].sort((a, b) => value(a) - value(b))

    return {
        top: desc.slice(0, topCount),
        bottom: asc.slice(0, topCount),
    }
}

/**
 * Ringkasan per alasan POD — dipakai untuk melihat alasan mana yang paling
 * sering muncul beserta bobot nilai/qty-nya.
 */
export function skrReasonBreakdown(
    rows: any[],
    limit = 8,
): { reason: string; label: string; className: string; qty: number; nilai: number; rows: number }[] {
    const map = new Map<string, { qty: number; nilai: number; rows: number; label: string; className: string }>()

    for (const row of rows) {
        const raw = row.pod_reason == null ? "" : String(row.pod_reason).trim()
        const info = skrCategory(raw)
        const key = raw || "(tanpa alasan)"
        const m = skrRowMetrics(row)
        const existing = map.get(key)
        if (existing) {
            existing.qty += m.qty
            existing.nilai += m.nilai
            existing.rows += 1
        } else {
            map.set(key, { qty: m.qty, nilai: m.nilai, rows: 1, label: info.label, className: info.className })
        }
    }

    return [...map.entries()]
        .map(([reason, v]) => ({ reason, ...v }))
        .sort((a, b) => b.nilai - a.nilai)
        .slice(0, limit)
}

/* ── Grafik harian: bulan ini vs bulan lalu ───────────────────────────── */

/**
 * Deret harian sisa kiriman untuk grafik perbandingan dua bulan.
 * X-axis digabung (1..maxDay) supaya dua bulan bisa ditumpuk dalam satu
 * grafik: satu garis bulan ini, satu garis bulan lalu. Hari yang tidak ada
 * datanya bernilai null sehingga garisnya terputus — bukan ditarik ke nol.
 */
export function skrDailySeries(
    currentRows: any[],
    previousRows: any[],
    metric: SkrMetric = "qty",
    maxDay = 31,
): { day: number; current: number | null; previous: number | null }[] {
    const currentBuckets = new Map<number, { qty: number; nilai: number }>()
    const previousBuckets = new Map<number, { qty: number; nilai: number }>()

    const addTo = (map: Map<number, { qty: number; nilai: number }>, day: number, qty: number, nilai: number) => {
        const bucket = map.get(day)
        if (bucket) {
            bucket.qty += qty
            bucket.nilai += nilai
        } else {
            map.set(day, { qty, nilai })
        }
    }

    for (const row of currentRows) {
        const iso = row.pod_d
        if (!iso) continue
        const day = Number(iso.slice(8, 10))
        if (!Number.isInteger(day) || day < 1) continue
        const m = skrRowMetrics(row)
        addTo(currentBuckets, day, m.qty, m.nilai)
    }

    for (const row of previousRows) {
        const iso = row.pod_d
        if (!iso) continue
        const day = Number(iso.slice(8, 10))
        if (!Number.isInteger(day) || day < 1) continue
        const m = skrRowMetrics(row)
        addTo(previousBuckets, day, m.qty, m.nilai)
    }

    const out: { day: number; current: number | null; previous: number | null }[] = []
    for (let day = 1; day <= maxDay; day++) {
        const cur = currentBuckets.get(day)
        const prev = previousBuckets.get(day)
        out.push({
            day,
            current: cur ? Math.round(metric === "qty" ? cur.qty : cur.nilai) : null,
            previous: prev ? Math.round(metric === "qty" ? prev.qty : prev.nilai) : null,
        })
    }
    return out
}

/**
 * Jumlah hari dalam satu bulan kalender (1-12) — dipakai agar X-axis grafik
 * tidak menampilkan hari 29-31 untuk bulan yang lebih pendek.
 */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export interface SkrCustomerSummary {
    /** customer_id mentah (string) — "(tidak diisi)" bila kosong */
    key: string
    /** Nama toko dari tabel customers, fallback ke id mentah */
    nama: string
    /** Nama diisi dari tabel customers (bukan fallback id)? */
    known: boolean
    qty: number
    nilai: number
    /** Jumlah dokumen (baris) SKR */
    docs: number
    /** Jumlah armada unik yang mengantar ke customer ini */
    armada: number
}

/**
 * Ringkasan per customer — dokumen, qty, dan nilai sisa kiriman, diurutkan
 * dari nilai terbesar. Label toko diambil dari peta customerById (join
 * di sisi aplikasi karena tipe id berbeda: bigint vs TEXT).
 */
export function skrCustomerSummary(
    rows: any[],
    customerById: Map<string, string> = new Map(),
): SkrCustomerSummary[] {
    const map = new Map<
        string,
        { qty: number; nilai: number; docs: number; armadas: Set<string> }
    >()

    for (const row of rows) {
        const key = skrGroupKey(row, "customer")
        const m = skrRowMetrics(row)
        const existing = map.get(key)
        if (existing) {
            existing.qty += m.qty
            existing.nilai += m.nilai
            existing.docs += 1
            if (row.license_no) existing.armadas.add(String(row.license_no))
        } else {
            map.set(key, {
                qty: m.qty,
                nilai: m.nilai,
                docs: 1,
                armadas: new Set(row.license_no ? [String(row.license_no)] : []),
            })
        }
    }

    return [...map.entries()]
        .map(([key, v]) => {
            const nama = customerById.get(key)
            return {
                key,
                nama: nama || key,
                known: Boolean(nama),
                qty: v.qty,
                nilai: v.nilai,
                docs: v.docs,
                armada: v.armadas.size,
            }
        })
        .sort((a, b) => b.nilai - a.nilai)
}

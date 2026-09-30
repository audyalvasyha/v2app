/**
 * Helper untuk tabel `skr_detail` (Sisa Kiriman).
 *
 * Catatan penting soal skema:
 * - `pod_date` bertipe TEXT dengan format "DD-MM-YYYY" — BUKAN timestamp, jadi
 *   tidak bisa difilter langsung lewat `.gte()`/`.lt()` di PostgREST (banding
 *   teks bersifat leksikografis: "05-01-2026" > "30-12-2025" secara abjad,
 *   padahal secara tanggal lebih lama). Karena itu konversi ke tanggal
 *   dilakukan di sisi aplikasi.
 * - `skr_value` juga TEXT format Indonesia ("1.500.000"), sehingga `sum()`
 *   di SQL tidak bisa dipakai — penjumlahan dilakukan di sini.
 * - `customer_id` di sini bigint, sedangkan di tabel `customers` berupa TEXT,
 *   sehingga join harus lewat normalisasi string.
 */

/* ── POD date (DD-MM-YYYY) ─────────────────────────────────────────────── */

/** Nama bulan bahasa Inggris → angka, untuk format "23 May 2026". */
const MONTH_NAMES: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
}

/**
 * Ubah pod_date menjadi "YYYY-MM-DD" agar bisa dibandingkan leksikografis.
 * Format yang didukung (sesuai data aktual):
 *   "23 May 2026", "04 April 2026"  → nama bulan bahasa Inggris
 *   "30092026", "30-09-2026"        → DD-MM-YYYY
 *   "20260930", "2026-09-30"        → YYYY-MM-DD
 * Mengembalikan null bila tidak bisa dibaca.
 */
export function podDateToIso(value: string | null | undefined): string | null {
    if (!value) return null
    const raw = String(value).trim().replace(/\s+/g, " ")
    if (!raw) return null

    // 1. Nama bulan: "23 May 2026"
    const named = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
    if (named) {
        const month = MONTH_NAMES[named[2].toLowerCase()]
        const day = Number(named[1])
        if (month == null || day < 1 || day > 31) return null
        return `${named[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }

    // 2. Hanya digit — tentukan urutan dengan memeriksa validitas tanggal,
    //    bukan menebak dari besarannya angka (mis. "30092026" hari 30 bulan 09).
    const digits = raw.replace(/\D/g, "")
    if (!/^\d{8}$/.test(digits)) return null

    const isPlausibleYear = (s: string) => {
        const y = Number(s)
        return y >= 1900 && y <= 2100
    }
    const format = (year: string, month: number, day: number): string | null => {
        if (!Number.isInteger(month) || !Number.isInteger(day)) return null
        if (month < 1 || month > 12) return null
        if (day < 1 || day > 31) return null
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }

    // YYYYMMDD
    if (isPlausibleYear(digits.slice(0, 4))) {
        return format(digits.slice(0, 4), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)))
    }
    if (!isPlausibleYear(digits.slice(4, 8))) return null

    // DDMMYYYY — konvensi Indonesia, dicoba lebih dulu
    const asDdMm = format(digits.slice(4, 8), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)))
    if (asDdMm) return asDdMm

    // MMDDYYYY — gaya Amerika, hanya bila versi di atas tidak valid
    return format(digits.slice(4, 8), Number(digits.slice(0, 2)), Number(digits.slice(2, 4)))
}

/** "30-09-2026" → "30 Sep 2026" */
export function formatPodDate(value: string | null | undefined): string {
    const iso = podDateToIso(value)
    if (!iso) return value?.trim() || "—"
    const d = new Date(`${iso}T00:00:00+07:00`)
    if (Number.isNaN(d.getTime())) return value?.trim() || "—"
    return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
    })
}

export interface SkrDateBounds {
    /** "YYYY-MM-DD" tertua & termuda yang ada di data */
    minIso: string | null
    maxIso: string | null
}

/** "2026-09-30" → "30 Sep 2026" (input ISO dari form date) */
export function isoToTanggal(value: string | null | undefined): string {
    if (!value) return "—"
    const d = new Date(`${value}T00:00:00+07:00`)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
    })
}

/* ── Nilai (format Indonesia) ──────────────────────────────────────────── */

/**
 * "1,062,725" → 1062725. Data di database memakai pemisah ribuan koma
 * (format Inggris). Koma/setiap titik yang diikuti tepat 3 digit di akhir
 * dianggap pemisah ribuan, sedangkan 1-2 digit dianggap desimal.
 *
 * Logika ini sengaja dibuat identik dengan view `skr_ringkasan` di database
 * supaya angka yang tampil di dashboard sama dengan hasil agregasi server.
 */
export function parseNilai(value: string | number | null | undefined): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (!value) return 0
    const raw = String(value).trim()
    if (!raw) return 0
    // Buang semua karakter selain digit (termasuk "Rp", spasi, koma, titik)
    const digits = raw.replace(/\D/g, "")
    if (!digits) return 0
    // Koma/titik + 1-2 digit di akhir = desimal (tidak ikut dihapus sebagai ribuan)
    if (/[.,]\d{1,2}$/.test(raw) && !/[.,]\d{3}$/.test(raw)) {
        return Number(digits) / 100
    }
    const parsed = Number(digits)
    return Number.isFinite(parsed) ? parsed : 0
}

/** 1500000 → "Rp 1.500.000" */
export function formatNilai(n: number | null | undefined): string {
    const v = Number(n ?? 0)
    if (!Number.isFinite(v)) return "Rp 0"
    return `Rp ${Math.round(v).toLocaleString("id-ID")}`
}

/** Versi ringkas untuk kartu ringkasan: "Rp 1,5 jt" */
export function compactNilai(n: number | null | undefined): string {
    const v = Number(n ?? 0)
    if (!Number.isFinite(v)) return "Rp 0"
    const abs = Math.abs(v)
    if (abs >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`
    if (abs >= 1_000_000) return `Rp ${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    if (abs >= 1_000) return `Rp ${(v / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`
    return `Rp ${Math.round(v).toLocaleString("id-ID")}`
}

/** "1.500.000" → "1.500.000 PCS" memakai skr_base_unit sebagai satuan. */
export function formatQty(n: number | null | undefined, unit?: string | null): string {
    const v = Math.round(Number(n ?? 0))
    const num = v.toLocaleString("id-ID")
    return unit ? `${num} ${unit}` : num
}

/* ── Kategori POD ──────────────────────────────────────────────────────── */

export type SkrCategory = "internal" | "operasional" | "pelanggan" | "redelivery" | "lainnya"

export interface SkrCategoryInfo {
    category: SkrCategory
    label: string
    className: string
}

/**
 * Daftar alasan POD yang dikelompokkan. Pencocokan dilakukan dengan
 * normalisasi (huruf kecil, spasi ganda dirapatkan, tanda baca dibuang)
 * sehingga variations penulisan tetap dikenali.
 */
const CATEGORY_RULES: { category: SkrCategory; label: string; keywords: string[] }[] = [
    {
        category: "internal",
        label: "Kesalahan Internal",
        keywords: [
            "double order",
            "double kiriman",
            "salah harga",
            "selisih harga",
            "salah input sales order",
            "salah input so",
            "salah input po",
            "salah input p o",
            "salah kode langganan",
            "salah kode pelanggan",
            "salah input mid",
            "salah mid",
            "salah wo",
        ],
    },
    {
        category: "operasional",
        label: "Kendala Operasional",
        keywords: [
            // akses jalan & kendala lapangan
            "akses jalan",
            "tidak bisa dilewat",
            "tidak ada tempat bongkar",
            "tempat bongkar",
            "tidak ada tempat",
            "penuh toko",
            "alamat toko tidak ketemu",
            "terlambat kirim",
            "sopir tidak kirim",
            // barang bermasalah
            "barang hadiah kurang",
            "barang hadiah rusak",
            "barang hilang",
            "barang rusak",
            // gudang
            "salah muat dari gudang",
            "salah turun barang di customer",
            "isi dalam kemasan kurang",
            "quantity tidak sesuai po",
            "salah barcode",
        ],
    },
    {
        category: "redelivery",
        label: "Redelivery",
        keywords: ["redelivery", "re delivery", "delivery ulang"],
    },
    {
        category: "pelanggan",
        label: "Dari Pelanggan",
        keywords: [
            "toko tidak pesan",
            "toko tutup",
            "tidak punya uang",
            "kekurangan uang",
            "uang cash",
            "full skr",
            "partial skr",
        ],
    },
]

export const SKR_CATEGORIES: { id: SkrCategory | "all"; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "internal", label: "Kesalahan Internal" },
    { id: "operasional", label: "Kendala Operasional" },
    { id: "pelanggan", label: "Dari Pelanggan" },
    { id: "redelivery", label: "Redelivery" },
    { id: "lainnya", label: "Lainnya" },
]

/** Normalisasi teks alasan POD agar perbandingan konsisten. */
function normalizeReason(value: string | null | undefined): string {
    if (!value) return ""
    return value
        .toLowerCase()
        .replace(/[.,()/\\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Kategorikan alasan POD. Alasan yang tidak dikenali (atau kosong) tetap
 * punya label agar tidak hilang, ditandai "Lainnya".
 */
export function skrCategory(reason: string | null | undefined): SkrCategoryInfo {
    const text = normalizeReason(reason)

    if (text) {
        for (const rule of CATEGORY_RULES) {
            for (const keyword of rule.keywords) {
                if (text.includes(normalizeReason(keyword))) {
                    return {
                        category: rule.category,
                        label: rule.label,
                        className:
                            rule.category === "internal"
                                ? "border-transparent bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : rule.category === "operasional"
                                  ? "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : rule.category === "pelanggan"
                                    ? "border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-400"
                                    : "border-transparent bg-violet-500/15 text-violet-600 dark:text-violet-400",
                    }
                }
            }
        }
    }

    return {
        category: "lainnya",
        label: "Lainnya",
        className: "border-transparent bg-muted text-muted-foreground",
    }
}

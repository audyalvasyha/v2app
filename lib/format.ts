/**
 * Helper format angka, mata uang, dan tanggal yang dipakai bersama oleh
 * dashboard, tabel equipment, riwayat, dan grafik — supaya tampilan nominal
 * konsisten di seluruh aplikasi (sebelumnya setiap file punya salinannya).
 */

/**
 * Seluruh aplikasi menghitung tanggal dalam zona waktu Indonesia (WIB, UTC+7),
 * bukan mengikuti zona waktu browser. Tanpa ini, data yang sama bisa tampil
 * berbeda tergantung perangkat — terutama untuk waktu dekat tengah malam.
 */
export const APP_TIMEZONE = "Asia/Jakarta"

/** Offset WIB dalam milidetik (tetap, tanpa DST) */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

export function toDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Komponen kalender dari sebuah timestamp dalam WIB — tahun, bulan (1-12), dan
 * tanggal. Memakai `getFullYear()` langsung akan mengikuti zona waktu browser,
 * sehingga timestamp dekat tengah malam bisa jatuh di hari yang salah.
 */
export function zonedParts(value: string | number | Date | null | undefined) {
    const d = value instanceof Date ? value : new Date(value ?? NaN)
    if (Number.isNaN(d.getTime())) return null
    const shifted = new Date(d.getTime() + WIB_OFFSET_MS)
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    }
}

/** Epoch ms of 00:00 WIB for the day containing `value` */
export function startOfZonedDay(value: string | number | Date = new Date()): number {
    const parts = zonedParts(value)
    if (!parts) return 0
    return Date.UTC(parts.year, parts.month - 1, parts.day) - WIB_OFFSET_MS
}

/**
 * Epoch ms of 00:00 WIB, mundur sejumlah bulan kalender dari `value`.
 * Dihitung lewat Date.UTC agar `getMonth()` tidak ikut zona waktu browser.
 */
export function startOfZonedDayMonthsAgo(months: number, value: string | number | Date = new Date()): number {
    const parts = zonedParts(value)
    if (!parts) return 0
    return Date.UTC(parts.year, parts.month - 1 - months, parts.day) - WIB_OFFSET_MS
}

export function formatNumber(
    n: number | null | undefined,
    options?: Intl.NumberFormatOptions,
): string {
    const v = Number(n ?? 0)
    return (Number.isFinite(v) ? v : 0).toLocaleString("id-ID", options)
}

/** Nominal penuh: Rp 12.450.000 */
export function formatRupiah(n: number | null | undefined): string {
    const v = Number(n ?? 0)
    return `Rp ${formatNumber(Math.round(Number.isFinite(v) ? v : 0))}`
}

/** Nominal ringkas untuk kartu/ringkasan: Rp 12,4 jt */
export function compactRupiah(n: number | null | undefined): string {
    const v = Number(n ?? 0)
    if (!Number.isFinite(v)) return formatRupiah(0)
    const abs = Math.abs(v)
    if (abs >= 1_000_000_000) {
        return `Rp ${(v / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`
    }
    if (abs >= 1_000_000) {
        return `Rp ${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    }
    if (abs >= 1_000) {
        return `Rp ${(v / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`
    }
    return formatRupiah(v)
}

export function formatKm(n: number | null | undefined): string {
    return `${formatNumber(n)} km`
}

/** 12 Agu 2026 */
export function formatDateMedium(value: string | null | undefined): string {
    const d = toDate(value)
    if (!d) return "—"
    return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: APP_TIMEZONE,
    })
}

/** 12 Agu */
export function formatDateShort(value: string | null | undefined): string {
    const d = toDate(value)
    if (!d) return "—"
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: APP_TIMEZONE })
}

/** 12 Agu 2026, 14:30 WIB */
export function formatDateTimeWIB(value: string | null | undefined): string {
    const d = toDate(value)
    if (!d) return "—"
    return `${d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: APP_TIMEZONE,
    })}, ${d.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: APP_TIMEZONE,
    })} WIB`
}

/**
 * Jarak dari hari ini dalam bahasa manusia — jauh lebih cepat dibaca
 * daripada tanggal mentah. Mengembalikan "" jika tanggal tidak valid.
 */
export function relativeDayLabel(value: string | null | undefined): string {
    const d = toDate(value)
    if (!d) return ""
    const diff = Math.round((startOfZonedDay() - startOfZonedDay(d)) / 86_400_000)

    if (diff === 0) return "Hari ini"
    if (diff === 1) return "Kemarin"
    if (diff > 1 && diff < 30) return `${diff} hari lalu`
    if (diff >= 30 && diff < 365) return `${Math.floor(diff / 30)} bln lalu`
    if (diff >= 365) return `${Math.floor(diff / 365)} thn lalu`
    return `${Math.abs(diff)} hari lagi`
}

/** Rentang periode ringkas: "Mar – Sep 2026" */
export function periodLabel(from: string | null, to: string | null): string {
    const a = toDate(from)
    const b = toDate(to)
    if (!a || !b) return "—"
    const pa = zonedParts(a)
    const pb = zonedParts(b)
    if (!pa || !pb) return "—"
    const shortMonth = (d: Date) => d.toLocaleDateString("id-ID", { month: "short", timeZone: APP_TIMEZONE })
    if (pa.year === pb.year && pa.month === pb.month) {
        return `${shortMonth(a)} ${pa.year}`
    }
    if (pa.year === pb.year) {
        return `${shortMonth(a)} – ${shortMonth(b)} ${pb.year}`
    }
    return `${shortMonth(a)} ${pa.year} – ${shortMonth(b)} ${pb.year}`
}

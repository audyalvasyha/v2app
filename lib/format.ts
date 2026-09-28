/**
 * Helper format angka, mata uang, dan tanggal yang dipakai bersama oleh
 * dashboard, tabel equipment, riwayat, dan grafik — supaya tampilan nominal
 * konsisten di seluruh aplikasi (sebelumnya setiap file punya salinannya).
 */

export function toDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
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
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

/** 12 Agu */
export function formatDateShort(value: string | null | undefined): string {
    const d = toDate(value)
    if (!d) return "—"
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

/**
 * Jarak dari hari ini dalam bahasa manusia — jauh lebih cepat dibaca
 * daripada tanggal mentah. Mengembalikan "" jika tanggal tidak valid.
 */
export function relativeDayLabel(value: string | null | undefined): string {
    const d = toDate(value)
    if (!d) return ""
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(d)
    target.setHours(0, 0, 0, 0)
    const diff = Math.round((today.getTime() - target.getTime()) / 86_400_000)

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
    const shortMonth = (d: Date) => d.toLocaleDateString("id-ID", { month: "short" })
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
        return `${shortMonth(a)} ${a.getFullYear()}`
    }
    if (a.getFullYear() === b.getFullYear()) {
        return `${shortMonth(a)} – ${shortMonth(b)} ${b.getFullYear()}`
    }
    return `${shortMonth(a)} ${a.getFullYear()} – ${shortMonth(b)} ${b.getFullYear()}`
}

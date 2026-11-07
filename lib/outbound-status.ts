/**
 * Status turunan untuk tabel `armada_outbound`.
 *
 * Tabel ini tidak punya kolom status — hanya `jam_out` dan `jam_in` (keduanya
 * teks). Status dihitung dari pasangan jam tersebut agar tabel tetap punya
 * arti operasional (menunggu / berjalan / selesai) tanpa kolom tambahan.
 */

export type OutboundStatus = "menunggu" | "berjalan" | "selesai" | "tidak-terisi"

export interface OutboundStatusInfo {
    status: OutboundStatus
    label: string
    /** Kelas utilitas untuk badge — satu sumber gaya agar konsisten antar tabel */
    className: string
}

/** Nilai jam dianggap terisi bila ada karakter non-spasi. */
export function hasJam(value: string | null | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0
}

export function outboundStatus(
    jamOut: string | null | undefined,
    jamIn: string | null | undefined,
): OutboundStatusInfo {
    if (hasJam(jamIn)) {
        return {
            status: "selesai",
            label: "Selesai",
            className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        }
    }
    if (hasJam(jamOut)) {
        return {
            status: "berjalan",
            label: "Berjalan",
            className: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        }
    }
    return {
        status: "menunggu",
        label: "Menunggu",
        className: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    }
}

/**
 * Durasi tempuh dalam menit dari pasangan timestamp ISO (`jam_out`, `jam_in`).
 * Kolom di tabel berisi timestamp lengkap (mis. "2026-09-30T07:11:00+07:00"),
 * jadi selisih dihitung langsung dari epoch — akurat lintas hari.
 * Mengembalikan null bila salah satu kosong/tidak valid.
 */
export function durationMinutesFromTimestamps(
    jamOut: string | null | undefined,
    jamIn: string | null | undefined,
): number | null {
    if (!hasJam(jamOut) || !hasJam(jamIn)) return null
    const out = new Date(jamOut as string).getTime()
    const inn = new Date(jamIn as string).getTime()
    if (Number.isNaN(out) || Number.isNaN(inn)) return null
    const diff = inn - out
    return diff >= 0 ? Math.round(diff / 60_000) : null
}

/**
 * @deprecated Versi untuk kolom "HH:MM" polos — tak lagi dipakai karena data
 * aktual berisi timestamp lengkap. Gunakan `durationMinutesFromTimestamps`.
 */
export function durationMinutes(
    jamOut: string | null | undefined,
    jamIn: string | null | undefined,
): number | null {
    if (!hasJam(jamOut) || !hasJam(jamIn)) return null
    const toMinutes = (raw: string): number | null => {
        const match = raw.trim().match(/^(\d{1,2}):(\d{2})/)
        if (!match) return null
        const h = Number(match[1])
        const m = Number(match[2])
        if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59) return null
        return h * 60 + m
    }
    const out = toMinutes(jamOut as string)
    const inn = toMinutes(jamIn as string)
    if (out == null || inn == null) return null
    // Jam keluar yang lebih besar dari jam kembali berarti keluar hari berikutnya
    const diff = inn - out
    return diff >= 0 ? diff : diff + 24 * 60
}

/**
 * Ambang keterlambatan pengiriman: unit yang sudah keluar lebih dari 24 jam
 * tapi belum punya jam masuk dianggap terlambat. Truk antar-toko biasanya
 * pulang hari yang sama atau paling lambat besok pagi, jadi 24 jam aman
 * sebagai peringatan tanpa terlalu banyak alarm palsu.
 */
export const OUTBOUND_LATE_HOURS = 24

/** Jam sejak `jam_out` sampai sekarang. Null bila jam kosong/tidak valid. */
export function elapsedHoursSince(
    jamOut: string | null | undefined,
    now: number = Date.now(),
): number | null {
    if (!hasJam(jamOut)) return null
    const start = new Date(jamOut as string).getTime()
    if (Number.isNaN(start)) return null
    const diff = now - start
    return diff >= 0 ? diff / 3_600_000 : null
}

/**
 * Trip "menginap": unit keluar sampai 24 jam atau lebih.
 *
 * Berlaku untuk trip yang masih berjalan (sekarang − jam_out) DAN trip yang
 * sudah selesai (jam_in − jam_out). Versi selesai dipakai untuk riwayat: satu
 * trip lama yang butuh dua hari tetap tercatat sebagai satu kali menginap.
 */
export function isOutboundOvernight(
    jamOut: string | null | undefined,
    jamIn: string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (!hasJam(jamOut)) return false
    if (hasJam(jamIn)) {
        const minutes = durationMinutesFromTimestamps(jamOut, jamIn)
        return minutes != null && minutes >= OUTBOUND_LATE_HOURS * 60
    }
    const hours = elapsedHoursSince(jamOut, now)
    return hours != null && hours >= OUTBOUND_LATE_HOURS
}

/** Sudah keluar melewati ambang tapi belum kembali (jam_in masih kosong). */
export function isOutboundLate(
    jamOut: string | null | undefined,
    jamIn: string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (hasJam(jamIn)) return false
    const hours = elapsedHoursSince(jamOut, now)
    return hours != null && hours >= OUTBOUND_LATE_HOURS
}

/** "2j 15m" */
export function formatDuration(minutes: number | null): string {
    if (minutes == null) return "—"
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m === 0 ? `${h}j` : `${h}j ${m}m`
}

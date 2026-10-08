/**
 * Satu-satunya sumber kebenaran untuk status jadwal servis sebuah unit.
 *
 * Sebelumnya aturan aman / segera / terlewat ditulis ulang di beberapa tempat
 * (tabel monitoring dan dashboard), sehingga berisiko berbeda hasil. Sekarang
 * keduanya memanggil fungsi ini.
 */

import { startOfZonedDay } from "@/lib/format"

export type ServiceStatusId = "safe" | "warning" | "overdue" | "none"

export interface ServiceStatusTone {
    /** kelas untuk <Badge variant="outline"> */
    badge: string
    /** kelas titik indikator */
    dot: string
    /** kelas bar progres */
    bar: string
    /** kelas aksen border kiri baris tabel */
    accent: string
}

export interface ServiceScheduleStatus {
    id: ServiceStatusId
    label: string
    tone: ServiceStatusTone
    progress: number
    /** null jika unit tidak punya jadwal tanggal; negatif = sudah lewat */
    remainingDays: number | null
    /** null jika unit tidak punya target odometer; negatif = sudah kelebihan */
    remainingKm: number | null
    /** 0 paling gawat — dipakai untuk mengurutkan prioritas */
    rank: number
}

const TONES: Record<ServiceStatusId, ServiceStatusTone> = {
    overdue: {
        badge: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
        dot: "bg-destructive",
        bar: "bg-destructive",
        accent: "border-l-destructive",
    },
    warning: {
        badge: "border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15",
        dot: "bg-amber-500",
        bar: "bg-amber-500",
        accent: "border-l-amber-500",
    },
    safe: {
        badge: "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
        dot: "bg-emerald-500",
        bar: "bg-emerald-500",
        accent: "border-l-emerald-500",
    },
    none: {
        badge: "border-border bg-muted/20 text-muted-foreground hover:bg-muted/30",
        dot: "bg-muted-foreground",
        bar: "bg-muted-foreground/30",
        accent: "border-l-muted-foreground/40",
    },
}

export const SERVICE_STATUS_META: Record<ServiceStatusId, { label: string; rank: number }> = {
    overdue: { label: "Terlewat", rank: 0 },
    warning: { label: "Segera servis", rank: 1 },
    safe: { label: "Aman", rank: 2 },
    none: { label: "Tanpa jadwal", rank: 3 },
}

/** Ambang batas peringatan (dipakai juga sebagai teks bantuan di UI) */
export const SERVICE_WARNING_DAYS = 14
export const SERVICE_WARNING_KM = 1000

const MS_PER_DAY = 86_400_000

/**
 * Hitung status jadwal servis dari log servis terbaru sebuah unit.
 * `today` sengaja tidak diubah (tidak di-mutate) agar aman dipakai bersama.
 */
export function evaluateServiceStatus(
    equipment: any,
    latestLog: any | null | undefined,
    today: Date = new Date(),
): ServiceScheduleStatus {
    if (!latestLog) {
        return {
            id: "none",
            label: SERVICE_STATUS_META.none.label,
            tone: TONES.none,
            progress: 0,
            remainingDays: null,
            remainingKm: null,
            rank: SERVICE_STATUS_META.none.rank,
        }
    }

    // Normalisasi ke tengah hari WIB supaya selisih hari tidak terpengaruh zona waktu
    const base = new Date(startOfZonedDay(today) + 12 * 60 * 60 * 1000)

    const nextDate = latestLog.next_service_date
        ? new Date(startOfZonedDay(latestLog.next_service_date) + 12 * 60 * 60 * 1000)
        : null

    const nextOdo: number | null =
        latestLog.next_service_odometer != null ? Number(latestLog.next_service_odometer) : null
    const prevOdo = Number(latestLog.odometer_at_service ?? 0)
    const currentOdo = Number(equipment?.last_odometer ?? 0)

    let progress = 0
    let remainingKm: number | null = null
    if (nextOdo != null && Number.isFinite(nextOdo) && nextOdo > prevOdo) {
        remainingKm = nextOdo - currentOdo
        if (currentOdo >= nextOdo) progress = 100
        else if (currentOdo > prevOdo) progress = ((currentOdo - prevOdo) / (nextOdo - prevOdo)) * 100
    }

    let remainingDays: number | null = null
    if (nextDate && !Number.isNaN(nextDate.getTime())) {
        remainingDays = Math.ceil((nextDate.getTime() - base.getTime()) / MS_PER_DAY)
    }

    const odoOverdue = remainingKm != null && remainingKm < 0
    const dateOverdue = remainingDays != null && remainingDays < 0
    const odoWarning = remainingKm != null && remainingKm >= 0 && remainingKm <= SERVICE_WARNING_KM
    const dateWarning =
        remainingDays != null && remainingDays >= 0 && remainingDays <= SERVICE_WARNING_DAYS

    const isOverdue = odoOverdue || dateOverdue
    const isWarning = !isOverdue && (odoWarning || dateWarning)

    const id: ServiceStatusId = isOverdue ? "overdue" : isWarning ? "warning" : "safe"

    return {
        id,
        label: SERVICE_STATUS_META[id].label,
        tone: TONES[id],
        progress,
        remainingDays,
        remainingKm,
        rank: SERVICE_STATUS_META[id].rank,
    }
}

/** "Terlambat 12 hari" / "5 hari lagi" / "Hari ini" */
export function remainingDaysLabel(n: number | null): string {
    if (n == null) return "Tanpa jadwal"
    if (n === 0) return "Hari ini"
    if (n === 1) return "Besok"
    if (n > 1) return `${n} hari lagi`
    return `Terlambat ${Math.abs(n)} hari`
}

/** "Sisa 1.200 km" / "Kelebihan 300 km" */
export function remainingKmLabel(n: number | null): string {
    if (n == null) return "—"
    if (n > 0) return `Sisa ${n.toLocaleString("id-ID")} km`
    if (n === 0) return "Tepat jadwal"
    return `Kelebihan ${Math.abs(n).toLocaleString("id-ID")} km`
}

/**
 * Satu baris ringkasan jadwal yang koheren — dipakai di tempat yang hanya
 * punya satu sel untuk keduanya (mis. kolom "Jadwal" di email reminder).
 *
 * Kasus yang diperbaiki: unit bisa berstatus "Terlewat" karena **odometer**
 * saja padahal tanggal servisnya masih jauh. Menempelkan "122 hari lagi"
 * apa adanya di bawah badge Terlewat terbaca kontradiktif, jadi diberi
 * konteks eksplisit bahwa yang terlewat adalah odometer, bukan tanggal.
 */
export function scheduleDetailLabel(
    status: Pick<ServiceScheduleStatus, "id" | "remainingDays" | "remainingKm">,
): string {
    const days = remainingDaysLabel(status.remainingDays)
    const km = remainingKmLabel(status.remainingKm)

    if (status.remainingDays == null) return km === "—" ? "—" : km
    if (status.remainingKm == null) return days

    const kmOver = status.remainingKm < 0
    const daysOver = status.remainingDays < 0

    // Dua-duanya lewat / dua-duanya dalam ambang: pasangan labelnya sudah
    // saling melengkapi, tidak perlu konteks tambahan.
    if (kmOver === daysOver) return `${days} · ${km}`

    // Hanya odometer yang lewat: jelaskan bahwa tanggalnya memang masih jauh.
    if (kmOver) {
        return `Odometer terlewati ${Math.abs(status.remainingKm).toLocaleString("id-ID")} km · servis terjadwal ${days.toLowerCase()}`
    }

    // Hanya tanggal yang lewat: "Terlambat 12 hari · Sisa 1.000 km" sudah jelas.
    return `${days} · ${km}`
}

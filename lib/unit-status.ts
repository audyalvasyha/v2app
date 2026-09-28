/**
 * Warna & label untuk status operasional equipment (Available / In Use /
 * Maintenance / lainnya) supaya badge, aksen baris, dan segmen grafik
 * konsisten antara menu Equipment dan Dashboard.
 */

export interface UnitStatusTone {
    /** label tampilan (fallback bila status kosong) */
    label: string
    /** kelas untuk <Badge variant="outline"> */
    badge: string
    /** kelas titik indikator */
    dot: string
    /** kelas aksen border kiri baris tabel */
    accent: string
    /** kelas latar untuk segmen bar / legenda */
    bar: string
}

const TONES: Record<"available" | "inuse" | "maintenance" | "other", UnitStatusTone> = {
    available: {
        label: "Available",
        badge: "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
        dot: "bg-emerald-500",
        accent: "border-l-emerald-500",
        bar: "bg-emerald-500",
    },
    inuse: {
        label: "In Use",
        badge: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        dot: "bg-primary",
        accent: "border-l-primary",
        bar: "bg-primary",
    },
    maintenance: {
        label: "Maintenance",
        badge: "border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15",
        dot: "bg-amber-500",
        accent: "border-l-amber-500",
        bar: "bg-amber-500",
    },
    other: {
        label: "Lainnya",
        badge: "border-border bg-muted/20 text-muted-foreground hover:bg-muted/30",
        dot: "bg-muted-foreground",
        accent: "border-l-muted-foreground/40",
        bar: "bg-muted-foreground/50",
    },
}

export function unitStatusTone(status: string | null | undefined): UnitStatusTone {
    const s = String(status ?? "").toLowerCase().trim()
    if (s === "available") return TONES.available
    if (s === "in use" || s === "inuse" || s === "in_use") return TONES.inuse
    if (s.includes("maintenance") || s.includes("repair")) return TONES.maintenance
    return TONES.other
}

/** Label tampilan untuk status unit mentah */
export function unitStatusLabel(status: string | null | undefined): string {
    const raw = String(status ?? "").trim()
    if (!raw) return "Tidak diketahui"
    return raw
}

/**
 * Kesehatan ban harian — satu tempat menilai tiap posisi ban dari
 * `tire_check_details`, supaya panel "Ban perlu tindakan", warna status di
 * peta, dan export CSV tidak bisa berbeda angkanya satu sama lain.
 *
 * Aturan penilaian (disepakati, dokumentasi di sini adalah sumber kebenaran):
 *  1. Kondisi verbal dari driver/AI hanya boleh MENAIKKAN level — "Gundul"
 *     langsung ACTION walau ketebalan tercatat 4 mm. Sebaliknya "Bagus" TIDAK
 *     menutupi angka terukur bermasalah: psi 60 tetap kempes walau driver
 *     menyebut bagus — temuan terukur tidak boleh dihapus oleh verbal.
 *  2. Ketebalan tapak (mm): ≤ 2.0 ACTION (mendekati batas legal 1.6 mm),
 *     ≤ 4.0 WARNING.
 *  3. Tekanan (psi): rentang normal 77–110 psi (≈ 5.3–7.6 bar, mengikuti
 *     kontoh panel peta Hino 136MD). < 68 ACTION (kempes), < 77 WARNING,
 *     ≥ 120 ACTION (overinflasi berbahaya), ≥ 110 WARNING.
 *  4. Nilai yang tidak tercatat (null) tidak menaikkan level, hanya
 *     tidak menurunkannya — penilaian jujur terhadap data yang ada.
 *
 * Level = level TINGGI dari semua sinyal (kondisi > ketebalan > tekanan).
 */

/** Waspada menengah: masih boleh jalan, jadwal tindakan. */
export type TireHealth = "ok" | "warning";
/** Semua level termasuk tanpa data ("none") dan butuh tindakan ("action"). */
export type TireHealthLevel = TireHealth | "action" | "none";

export interface TireVitals {
    /** Kondisi ban versi driver/AI ("Gundul", "Bagus", ...). */
    condition: string | null
    /** Tekanan angin terukur (psi). */
    pressurePsi: number | null
    /** Kedalaman tapak (mm). */
    treadDepthMm: number | null
}

/** Batu loncatan ketebalan (mm) — batas legal ban di jalan raya 1.6 mm. */
const ACTION_TREAD_MM = 2.0
const WARNING_TREAD_MM = 4.0
const ACTION_PSI_LOW = 68
const WARNING_PSI_LOW = 77
const WARNING_PSI_HIGH = 110
const ACTION_PSI_HIGH = 120

function isBadCondition(c: string | null | undefined): boolean {
    return /(gundul|aus|habis|rusak|bocor|kempes|ganti|crit)/i.test(String(c ?? ""))
}

function isWarningCondition(c: string | null | undefined): boolean {
    return /(cukup|waspad|perhatian|tipis)/i.test(String(c ?? ""))
}

/**
 * Level kesehatan satu posisi ban. `null`/kolom kosong → "none"
 * (tidak menaikkan level apa pun; UI memakai warna netral).
 */
export function tireHealthLevel(
    vitals: TireVitals | null | undefined,
): TireHealthLevel {
    if (!vitals) return "none"
    if (isBadCondition(vitals.condition)) return "action"
    if (isWarningCondition(vitals.condition)) return "warning"

    let level: TireHealth = "ok"
    if (vitals.treadDepthMm != null) {
        if (vitals.treadDepthMm <= ACTION_TREAD_MM) return "action"
        if (vitals.treadDepthMm <= WARNING_TREAD_MM) level = "warning"
    }
    if (vitals.pressurePsi != null) {
        if (vitals.pressurePsi < ACTION_PSI_LOW) return "action"
        if (vitals.pressurePsi < WARNING_PSI_LOW) level = "warning"
        if (vitals.pressurePsi >= ACTION_PSI_HIGH) return "action"
        if (vitals.pressurePsi >= WARNING_PSI_HIGH) level = "warning"
    }
    return level
}

/** Prioritas urut panel: action(2) > warning(1) > ok/none(0). */
export function tireHealthPriority(level: TireHealthLevel): number {
    if (level === "action") return 2
    if (level === "warning") return 1
    return 0
}

/**
 * Tone UI bersama untuk ketiga tampilan (badge, titik roda, aksen panel).
 * "none" tidak pernah menaikkan kalangan — warna netral.
 */
export interface TireHealthTone {
    /** Label singkat tampilan. */
    label: string
    /** Kelas <Badge variant="outline"> / chip kondisi. */
    badge: string
    /** Kelas titik indikator (dot). */
    dot: string
    /** Kelas border aksen pada panel/box. */
    edge: string
    /** Kelas warna teks delta positif. */
    deltaUp: string
    /** Kelas warna teks delta negatif (biasanya lebih buruk untuk ban). */
    deltaDown: string
}

export const TIRE_HEALTH_TONE: Record<TireHealthLevel, TireHealthTone> = {
    action: {
        label: "Perlu tindakan",
        badge: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
        dot: "bg-red-500",
        edge: "border-red-500/60",
        deltaUp: "text-red-600 dark:text-red-400",
        deltaDown: "text-red-600 dark:text-red-400",
    },
    warning: {
        label: "Waspada",
        badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        dot: "bg-amber-500",
        edge: "border-amber-500/50",
        deltaUp: "text-emerald-600 dark:text-emerald-400",
        deltaDown: "text-amber-600 dark:text-amber-400",
    },
    ok: {
        label: "Aman",
        badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        dot: "bg-emerald-500",
        edge: "border-emerald-500/40",
        deltaUp: "text-emerald-600 dark:text-emerald-400",
        deltaDown: "text-red-600 dark:text-red-400",
    },
    none: {
        label: "Tanpa data",
        badge: "border-border bg-muted/20 text-muted-foreground",
        dot: "bg-muted-foreground",
        edge: "border-border",
        deltaUp: "text-muted-foreground",
        deltaDown: "text-muted-foreground",
    },
}

/* ------------------------------------------------------------------ */
/* Export CSV — data pemeriksaan ban harian                            */
/* ------------------------------------------------------------------ */

/** Escape sel CSV: bungkus saat berisi koma, petik, newline, atau kosong tanda minus. */
export function csvEscape(value: unknown): string {
    const s = value == null ? "" : String(value)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
}

export interface TireCheckCsvRow {
    /** Nomor polisi unit (dari tabel equipment). */
    plate: string
    /** Tanggal pemeriksaan (YYYY-MM-DD). */
    inspectionDate: string
    /** Posisi ban apa adanya dari database (mis. "FR - (Depan Kanan)"). */
    position: string
    /** Kode slot peta ("FR") — kosong bila posisi tidak dikenali peta. */
    slot: string
    pressurePsi: number | null
    treadDepthMm: number | null
    condition: string    /** Catatan driver (apa adanya). */
    notes: string
    /** Timestamp recreation baris dari database. */
    recordedAt: string
}

const CSV_HEADER = [
    "Unit",
    "Tanggal Pemeriksaan",
    "Posisi",
    "Slot Peta",
    "Tekanan (psi)",
    "Ketebalan (mm)",
    "Kondisi",
    "Status Kesehatan",
    "Catatan Driver",
    "Dicatat Pada",
] as const

/** Bangun isi file CSV (ringkasan header + baris) dari hasil pemeriksaan. */
export function tireChecksCsv(rows: TireCheckCsvRow[]): string {
    const lines = [CSV_HEADER.join(",")]
    for (const r of rows) {
        const level = tireHealthLevel(r)
        lines.push(
            [
                r.plate,
                r.inspectionDate,
                r.position,
                r.slot,
                r.pressurePsi == null ? "" : r.pressurePsi,
                r.treadDepthMm == null ? "" : r.treadDepthMm,
                r.condition,
                TIRE_HEALTH_TONE[level].label,
                r.notes,
                r.recordedAt,
            ]
                .map(csvEscape)
                .join(","),
        )
    }
    return lines.join("\n")
}

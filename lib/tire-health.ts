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

/**
 * Alasan utama satu posisi masuk panel "Ban perlu tindakan" — satu kalimat
 * singkat dengan angka terukurnya. Urutan sama dengan tingkat keparahan
 * penilaian level: temuan terukur paling buruk dulu (psi < mm), lalu kondisi
 * verbal driver. "Ok/none" → null (bukan alasan apa pun).
 */
export function tireIssueReason(
    v: TireVitals | null | undefined,
): string | null {
    if (!v) return null
    if (v.pressurePsi != null) {
        if (v.pressurePsi < ACTION_PSI_LOW) return `Kempes — ${v.pressurePsi} psi`
        if (v.pressurePsi >= ACTION_PSI_HIGH) return `Angin berlebih — ${v.pressurePsi} psi`
    }
    if (v.treadDepthMm != null && v.treadDepthMm <= ACTION_TREAD_MM) {
        return `Tapak gundul — ${v.treadDepthMm} mm`
    }
    if (v.pressurePsi != null) {
        if (v.pressurePsi < WARNING_PSI_LOW) return `Kurang angin — ${v.pressurePsi} psi`
        if (v.pressurePsi >= WARNING_PSI_HIGH) return `Angin tinggi — ${v.pressurePsi} psi`
    }
    if (v.treadDepthMm != null && v.treadDepthMm <= WARNING_TREAD_MM) {
        return `Tapak tipis — ${v.treadDepthMm} mm`
    }
    if (isBadCondition(v.condition)) return v.condition
    if (isWarningCondition(v.condition)) return v.condition
    return null
}

/** Prioritas urut panel: action(2) > warning(1) > ok/none(0). */
export function tireHealthPriority(level: TireHealthLevel): number {
    if (level === "action") return 2
    if (level === "warning") return 1
    return 0
}

/** Kode slot peta yang dikenali dashboard ringkas — sama dengan menu Ban. */
const DASHBOARD_TIRE_SLOTS = new Set([
    "FL",
    "FR",
    "RL",
    "RR",
    "SP",
    "RLI",
    "RLO",
    "RRI",
    "RRO",
])

/** "FR - (Depan Kanan)" → "FR"; null bila kode tidak dikenali peta. */
export function normalizeTireSlot(value: string | null | undefined): string | null {
    const match = String(value ?? "").toUpperCase().trim().match(/^([A-Z]{1,3}(?:-[IO])?)\b/)
    if (!match) return null
    return DASHBOARD_TIRE_SLOTS.has(match[1]) ? match[1] : null
}

function toFiniteTireNumber(value: unknown): number | null {
    if (value == null || value === "") return null
    const parsed = typeof value === "number" ? value : Number(String(value))
    return Number.isFinite(parsed) ? parsed : null
}

function tireKey(plateKey: string, slot: string): string {
    return `${plateKey}||${slot}`
}

function recordTimeMs(recordedAt: string, inspectionDate: string | null): number {
    const recordedMs = Date.parse(recordedAt)
    if (Number.isFinite(recordedMs)) return recordedMs
    if (inspectionDate) {
        const inspectedMs = Date.parse(inspectionDate)
        if (Number.isFinite(inspectedMs)) return inspectedMs
    }
    return Number.NEGATIVE_INFINITY
}

export interface TireDashboardDetail {
    tire_position: string | null | undefined
    tread_depth_mm: number | string | null | undefined
    pressure_psi: number | string | null | undefined
    condition: string | null | undefined
    created_at: string | null | undefined
}

export interface TireDashboardInspection {
    equipment_id: string | null | undefined
    inspection_date: string | null | undefined
    tire_check_details?: readonly TireDashboardDetail[] | null
}

export interface TireDashboardIssue {
    slot: string
    level: Extract<TireHealthLevel, "action" | "warning">
    reason: string
    recordedAt: string
    inspectionDate: string | null
}

export interface TireDashboardUnit {
    plateKey: string
    plate: string
    worstLevel: Extract<TireHealthLevel, "action" | "warning">
    issues: TireDashboardIssue[]
    lastInspected: string | null
}

export interface TireDashboardSummary {
    inspectedUnits: number
    actionUnits: number
    warningUnits: number
    units: TireDashboardUnit[]
}

/**
 * Ringkasan dashboard dari pemeriksaan ban harian.
 *
 * Hanya memakai pemeriksaan terbaru per unit per slot — sama seperti peta di
 * menu Ban — supaya satu ban yang sudah diperbaiki tidak terus dihitung dari
 * riwayat lamanya. Slot yang tidak dikenali peta diabaikan.
 */
export function summarizeTireDashboard(
    inspections: readonly TireDashboardInspection[],
    plateByEquipmentKey: ReadonlyMap<string, string>,
): TireDashboardSummary {
    const inspectedKeys = new Set<string>()
    const latestBySlot = new Map<string, { record: TireDashboardDetail; recordedAt: string; inspectionDate: string | null }>()

    for (const inspection of inspections) {
        const plate = plateByEquipmentKey.get(String(inspection?.equipment_id ?? ""))
        if (!plate) continue
        const plateKey = String(plate).replace(/\s+/g, "").toUpperCase()
        if (!plateKey) continue
        inspectedKeys.add(plateKey)

        const inspectionDate = String(inspection?.inspection_date ?? "").trim() || null
        for (const detail of inspection?.tire_check_details ?? []) {
            const slot = normalizeTireSlot(detail?.tire_position)
            if (!slot) continue
            const recordedAt = String(detail?.created_at ?? "")
            const key = tireKey(plateKey, slot)
            const existing = latestBySlot.get(key)
            if (!existing || recordTimeMs(recordedAt, inspectionDate) >= recordTimeMs(existing.recordedAt, existing.inspectionDate)) {
                latestBySlot.set(key, { record: detail, recordedAt, inspectionDate })
            }
        }
    }

    const unitsByPlate = new Map<string, TireDashboardUnit>()
    for (const [key, entry] of latestBySlot) {
        const separator = key.indexOf("||")
        const plateKey = key.slice(0, separator)
        const slot = key.slice(separator + 2)
        const vitals = {
            condition: entry.record.condition?.trim() || null,
            pressurePsi: toFiniteTireNumber(entry.record.pressure_psi),
            treadDepthMm: toFiniteTireNumber(entry.record.tread_depth_mm),
        }
        const level = tireHealthLevel(vitals)
        if (level !== "action" && level !== "warning") continue
        const reason = tireIssueReason(vitals) ?? (level === "action" ? "Perlu tindakan" : "Waspada")
        let unit = unitsByPlate.get(plateKey)
        if (!unit) {
            const display = [...plateByEquipmentKey.values()].find(
                (plate) => String(plate).replace(/\s+/g, "").toUpperCase() === plateKey,
            ) ?? plateKey
            unit = {
                plateKey,
                plate: String(display).trim().replace(/\s+/g, " ").toUpperCase(),
                worstLevel: level,
                issues: [],
                lastInspected: entry.inspectionDate,
            }
            unitsByPlate.set(plateKey, unit)
        }
        unit.issues.push({
            slot,
            level,
            reason,
            recordedAt: entry.recordedAt,
            inspectionDate: entry.inspectionDate,
        })
        if (entry.inspectionDate && (!unit.lastInspected || entry.inspectionDate > unit.lastInspected)) {
            unit.lastInspected = entry.inspectionDate
        }
    }

    const units = [...unitsByPlate.values()].map((unit) => {
        const issues = unit.issues
            .slice()
            .sort(
                (a, b) =>
                    tireHealthPriority(b.level) - tireHealthPriority(a.level) ||
                    recordTimeMs(b.recordedAt, b.inspectionDate) - recordTimeMs(a.recordedAt, a.inspectionDate) ||
                    a.slot.localeCompare(b.slot),
            )
        return { ...unit, worstLevel: issues[0].level, issues }
    })
    units.sort(
        (a, b) =>
            tireHealthPriority(b.worstLevel) - tireHealthPriority(a.worstLevel) ||
            b.issues.length - a.issues.length ||
            String(b.lastInspected ?? "").localeCompare(String(a.lastInspected ?? "")) ||
            a.plate.localeCompare(b.plate, "id-ID"),
    )

    return {
        inspectedUnits: inspectedKeys.size,
        actionUnits: units.filter((unit) => unit.worstLevel === "action").length,
        warningUnits: units.filter((unit) => unit.worstLevel === "warning").length,
        units,
    }
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

/**
 * Agregasi Complaint Board per nopol.
 *
 * Dipakai mode "Ringkasan nopol" untuk menjawab satu pertanyaan: nopol mana
 * yang paling sering dikomplain, dan komplain apa saja yang masih terbuka?
 * Nopol dinormalisasi tanpa spasi + huruf besar supaya "B 1234 XY",
 * "b1234xy", dan "B1234XY" masuk ke kelompok yang sama.
 */

import { normalizeTaskStatus, type Task } from "@/lib/tasks"

export type ComplaintDisplayStatus = "todo" | "progress" | "done"

export type ComplaintStatusCounts = Record<ComplaintDisplayStatus, number>

export interface ComplaintSalesCount {
    /** Nama seperti yang pertama tercatat di komplain. */
    name: string
    count: number
}

export interface ComplaintPlateGroup {
    /** Kunci normalisasi: tanpa spasi, huruf besar. */
    key: string
    /** Label yang enak dibaca, mis. "B 1234 XY". */
    plate: string
    total: number
    open: number
    done: number
    statuses: ComplaintStatusCounts
    /** Total komplain >= 2 — kandidat teguran / evaluasi. */
    repeated: boolean
    /** Nama sales beserta jumlah komplainnya, terbanyak lebih dulu. */
    sales: ComplaintSalesCount[]
    /** Komplain terbaru lebih dulu. */
    tasks: Task[]
    /** Waktu komplain terakhir, atau null bila tanggalnya tidak valid. */
    lastAt: string | null
}

export interface ComplaintPlateSummary {
    groups: ComplaintPlateGroup[]
    plateCount: number
    complaintCount: number
    openCount: number
    repeatedPlateCount: number
    /** Komplain tanpa nopol — tidak masuk daftar nopol, tapi tetap dihitung. */
    withoutPlateCount: number
}

/** Kunci pengelompokan nopol: buang semua spasi dan samakan huruf. */
export function complaintPlateKey(value: string | null | undefined): string {
    return String(value ?? "").replace(/\s+/g, "").toUpperCase()
}

/** Label nopol yang tetap terbaca: rapikan spasi, lalu huruf besar. */
export function complaintPlateLabel(value: string | null | undefined): string {
    return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase()
}

function createdAtMs(task: Task): number {
    const ms = Date.parse(task.created_at ?? "")
    return Number.isFinite(ms) ? ms : 0
}

/**
 * Kelompokkan komplain per nopol, hitung status & sales, lalu urutkan dari
 * yang paling perlu ditindak: masih ada komplain terbuka, total terbanyak,
 * terakhir dikomplain.
 */
export function summarizeComplaintsByPlate(tasks: readonly Task[]): ComplaintPlateSummary {
    interface Accumulator {
        key: string
        plate: string
        tasks: Task[]
        statuses: ComplaintStatusCounts
        sales: Map<string, ComplaintSalesCount>
        lastAt: string | null
        lastMs: number
    }

    const groups = new Map<string, Accumulator>()
    let withoutPlateCount = 0

    for (const task of tasks) {
        const key = complaintPlateKey(task.license_plate)
        if (!key) {
            withoutPlateCount += 1
            continue
        }

        let group = groups.get(key)
        if (!group) {
            group = {
                key,
                plate: complaintPlateLabel(task.license_plate),
                tasks: [],
                statuses: { todo: 0, progress: 0, done: 0 },
                sales: new Map(),
                lastAt: null,
                lastMs: 0,
            }
            groups.set(key, group)
        }

        group.tasks.push(task)

        const status = normalizeTaskStatus(task.status)
        if (status === "todo" || status === "progress" || status === "done") {
            group.statuses[status] += 1
        }

        const salesName = String(task.sales_name ?? "").trim()
        if (salesName) {
            const salesKey = salesName.toLowerCase()
            const existing = group.sales.get(salesKey)
            if (existing) existing.count += 1
            else group.sales.set(salesKey, { name: salesName, count: 1 })
        }

        const ms = createdAtMs(task)
        if (ms > 0 && ms >= group.lastMs) {
            group.lastMs = ms
            group.lastAt = task.created_at
        }
    }

    const result: ComplaintPlateGroup[] = Array.from(groups.values()).map((group) => {
        const tasksNewestFirst = group.tasks
            .slice()
            .sort((a, b) => createdAtMs(b) - createdAtMs(a))
        const done = group.statuses.done
        const total = tasksNewestFirst.length
        return {
            key: group.key,
            plate: group.plate,
            total,
            open: total - done,
            done,
            statuses: group.statuses,
            repeated: total >= 2,
            sales: Array.from(group.sales.values()).sort(
                (a, b) => b.count - a.count || a.name.localeCompare(b.name, "id-ID"),
            ),
            tasks: tasksNewestFirst,
            lastAt: group.lastAt,
        }
    })

    result.sort((a, b) => {
        if (b.open !== a.open) return b.open - a.open
        if (b.total !== a.total) return b.total - a.total
        const at = a.lastAt ? Date.parse(a.lastAt) : 0
        const bt = b.lastAt ? Date.parse(b.lastAt) : 0
        if (bt !== at) return bt - at
        return a.plate.localeCompare(b.plate, "id-ID")
    })

    return {
        groups: result,
        plateCount: result.length,
        complaintCount: result.reduce((sum, group) => sum + group.total, 0),
        openCount: result.reduce((sum, group) => sum + group.open, 0),
        repeatedPlateCount: result.filter((group) => group.repeated).length,
        withoutPlateCount,
    }
}

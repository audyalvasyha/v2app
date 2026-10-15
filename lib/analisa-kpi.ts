/**
 * Logika Analisa — hitung KPI, status, dan narasi template.
 *
 * ── Kenapa dipisah dari analisa-view.tsx ──
 *
 * Satu file itu sebelumnya mencampur empat hal yang siklusnya berbeda:
 * matematika KPI (murni, mudah diuji), ambang status (data bisnis yang
 * berubah seiring target resmi), narasi verbatim, dan UI. UI-nya jadi
 * 700+ baris dan matematikanya tidak bisa diuji tanpa komponen.
 *
 * File ini MURNI — tanpa React, tanpa import komponen — sehingga boleh
 * diimpor dari dua sisi sekaligus:
 *   - client (analisa-view.tsx): hitung snapshot dari baris database.
 *   - server (app/api/analisa/summary): validasi + evaluasi status KPI
 *     tabelnya, dengan AMBANG YANG SAMA — tidak ada lagi dua salinan
 *     KPI_THRESHOLDS yang bisa berbeda someday.
 */

import { compactNilai, formatNilai, formatQty, skrCategory, type SkrCategory } from "@/lib/skr-status"

export type KpiStatus = "aman" | "pantau" | "perhatian"

/** Ambang status — belum ada target resmi; nilai provisional, satu tempat. */
export const KPI_THRESHOLDS = {
    /** Kenaikan biaya 30 hari di atas ini → perhatian */
    biayaNaikPerhatian: 15,
    /** Porsi redelivery (persen) */
    redeliveryPerhatian: 15,
    redeliveryPantau: 8,
    /** Kenaikan qty SKR di atas ini (persen) → perhatian */
    skrNaikPerhatian: 25,
    skrNaikPantau: 10,
} as const

/* ── Util tanggal ────────────────────────────────────────────────────────── */

/** Nilai tanggal baris → timestamp (null bila tak bisa dibaca). */
export function toTime(v: unknown): number | null {
    if (v == null || v === "") return null
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const t = Date.parse(`${v.slice(0, 10)}T00:00:00+07:00`)
        return Number.isNaN(t) ? null : t
    }
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        const t = Date.parse(v)
        return Number.isNaN(t) ? null : t
    }
    const t = new Date(String(v)).getTime()
    return Number.isNaN(t) ? null : t
}

/** Pusat waktu "hari ini" zona WIB untuk jendela 30 hari. */
export function wibNow(): number {
    const iso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
    return Date.parse(`${iso}T12:00:00+07:00`)
}

function inWindow(t: number, from: number, to: number) {
    return t >= from && t <= to
}

/** Format perubahan persen: "+12%", "−5%". */
export function formatPct(n: number): string {
    return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}%`
}

/* ── Snapshot KPI ─────────────────────────────────────────────────────────── */

export interface AnalisaSnapshot {
    biaya: { cur: number; prev: number; delta: number | null; top: [string, number][] }
    redelivery: { share: number | null; sharePrev: number | null; qty: number; totalQty: number }
    skr: { qty: number; nilai: number; qtyPrev: number; delta: number | null; topReason: [string, number] | null }
    ritase: { trips: number; perHari: number; cakupanHari: number }
}

/**
 * Kumpulan nilai KPI dari baris mentah — satu pintu keluar yang jelas.
 *
 * KPI yang dihitung (semuanya otomatis):
 *   1. DC Cost Transport  → SUM biaya perbaikan 30 hari vs 30 hari sebelumnya
 *   2. %Redelivery Qty    → qty alasan redelivery ÷ total qty SKR
 *   3. SKR Qty            → qty sisa kiriman 30 hari vs 30 hari sebelumnya
 *                           (%SKR Qty menunggu total kirim dari BI)
 *   4. Ritase             → jumlah trip outbound ÷ hari, + cakupan hari aktif
 */
export function buildKpiSnapshot(
    histories: any[],
    skrRows: any[],
    skrPrevRows: any[],
    outbounds: any[],
): AnalisaSnapshot {
    const now = wibNow()
    const DAY = 86_400_000
    const cur = { from: now - 29 * DAY, to: now + DAY / 2 }
    const prev = { from: now - 59 * DAY, to: now - 29 * DAY + DAY / 2 } // tidak tumpang tindih

    // 1. DC Cost Transport — biaya perbaikan sebagai proxy (belum BBM/mitra).
    let biayaCur = 0
    let biayaPrev = 0
    const biayaUnit = new Map<string, number>()
    for (const h of histories) {
        const t = toTime(h.tanggal)
        if (t == null) continue
        const price = Number(h.jumlah_harga ?? 0) || 0
        if (inWindow(t, cur.from, cur.to)) {
            biayaCur += price
            const plate = String(h.license_plate ?? "").trim()
            if (plate) biayaUnit.set(plate, (biayaUnit.get(plate) ?? 0) + price)
        } else if (inWindow(t, prev.from, prev.to)) {
            biayaPrev += price
        }
    }
    const biayaDelta = biayaPrev > 0 ? ((biayaCur - biayaPrev) / biayaPrev) * 100 : null
    const biayaTop = [...biayaUnit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

    // 2 & 3. SKR — qty membagi jendela sama; redelivery share dari kategori POD.
    const skrWindow = (rows: any[], from: number, to: number) => {
        let qty = 0
        let nilai = 0
        let redeliveryQty = 0
        const reasonQty = new Map<string, number>()
        for (const r of rows) {
            const t = toTime(r.pod_d)
            if (t == null || !inWindow(t, from, to)) continue
            const q = Number(r.qty ?? 0) || 0
            qty += q
            nilai += Number(r.nilai ?? 0) || 0
            const cat: SkrCategory | null = skrCategory(r.pod_reason).category as SkrCategory
            if (cat === "redelivery") redeliveryQty += q
            const reason = String(r.pod_reason ?? "").trim()
            if (reason) reasonQty.set(reason, (reasonQty.get(reason) ?? 0) + q)
        }
        return { qty, nilai, redeliveryQty, reasonQty }
    }
    const skrCur = skrWindow(skrRows, cur.from, cur.to)
    const skrPrev = skrWindow(skrPrevRows, prev.from, prev.to)
    const redeliveryShare = skrCur.qty > 0 ? (skrCur.redeliveryQty / skrCur.qty) * 100 : null
    const redeliverySharePrev = skrPrev.qty > 0 ? (skrPrev.redeliveryQty / skrPrev.qty) * 100 : null
    const skrDelta = skrPrev.qty > 0 ? ((skrCur.qty - skrPrev.qty) / skrPrev.qty) * 100 : null
    const skrTopReason = [...skrCur.reasonQty.entries()].sort((a, b) => b[1] - a[1])[0]

    // 4. Ritase — trip per hari pada jendela 30 hari + cakupan hari aktif.
    let trips = 0
    const activeDays = new Set<string>()
    for (const o of outbounds) {
        const t = toTime(String(o.jam_out ?? "").slice(0, 19).replace(" ", "T"))
        if (t == null || !inWindow(t, cur.from, cur.to)) continue
        trips += 1
        const d = new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
        activeDays.add(d)
    }
    const ritasePerHari = trips / 30
    const cakupanHari = (activeDays.size / 30) * 100

    return {
        biaya: { cur: biayaCur, prev: biayaPrev, delta: biayaDelta, top: biayaTop },
        redelivery: {
            share: redeliveryShare,
            sharePrev: redeliverySharePrev,
            qty: skrCur.redeliveryQty,
            totalQty: skrCur.qty,
        },
        skr: {
            qty: skrCur.qty,
            nilai: skrCur.nilai,
            qtyPrev: skrPrev.qty,
            delta: skrDelta,
            topReason: skrTopReason,
        },
        ritase: { trips, perHari: ritasePerHari, cakupanHari },
    }
}

/** Status tiap KPI dengan ambang KPI_THRESHOLDS — DIPAKAI BERSAMA client & server. */
export function evalStatus(s: AnalisaSnapshot): Record<"biaya" | "redelivery" | "skr" | "ritase", KpiStatus> {
    const biaya: KpiStatus =
        s.biaya.delta == null
            ? "pantau"
            : s.biaya.delta > KPI_THRESHOLDS.biayaNaikPerhatian
                ? "perhatian"
                : s.biaya.delta > 0
                    ? "pantau"
                    : "aman"
    const redelivery: KpiStatus =
        s.redelivery.share == null
            ? "pantau"
            : s.redelivery.share > KPI_THRESHOLDS.redeliveryPerhatian
                ? "perhatian"
                : s.redelivery.share > KPI_THRESHOLDS.redeliveryPantau
                    ? "pantau"
                    : "aman"
    const skr: KpiStatus =
        s.skr.delta == null
            ? "pantau"
            : s.skr.delta > KPI_THRESHOLDS.skrNaikPerhatian
                ? "perhatian"
                : s.skr.delta > KPI_THRESHOLDS.skrNaikPantau
                    ? "pantau"
                    : "aman"
    const ritase: KpiStatus =
        s.ritase.trips === 0
            ? "perhatian"
            : s.ritase.cakupanHari < 50
                ? "pantau"
                : "aman"
    return { biaya, redelivery, skr, ritase }
}

/** Status terburuk dari semua KPI — penentu headline. */
export function worstKpiStatus(status: Record<string, KpiStatus>): KpiStatus {
    const values = Object.values(status)
    if (values.includes("perhatian")) return "perhatian"
    if (values.includes("pantau")) return "pantau"
    return "aman"
}

/* ── Narasi template lokal — dipakai saat AI tidak tersedia ──────────────── */

/** Kalimat naratif per KPI — angka selalu disebut, gaya atasan: tegas, singkat. */
export function verdicts(s: AnalisaSnapshot, status: ReturnType<typeof evalStatus>) {
    const biaya =
        s.biaya.delta == null
            ? `Biaya perbaikan 30 hari terakhir Rp ${formatNilai(s.biaya.cur)} — tidak ada pembanding periode sebelumnya, maknanya belum bisa dibaca.`
            : s.biaya.delta >= 0
                ? `Biaya perbaikan 30 hari terakhir Rp ${formatNilai(s.biaya.cur)}, naik ${formatPct(s.biaya.delta)} dibanding 30 hari sebelumnya (Rp ${formatNilai(s.biaya.prev)}). ${s.biaya.top.length ? `Penyumbang terbesar: ${s.biaya.top.map(([p, v]) => `${p} (${compactNilai(v)})`).join(", ")}.` : ""}`
                : `Biaya perbaikan 30 hari terakhir Rp ${formatNilai(s.biaya.cur)}, turun ${formatPct(s.biaya.delta)} dibanding periode sebelumnya. Pertahankan.`

    const redelivery =
        s.redelivery.share == null
            ? "Tidak ada qty yang bisa dibaca pada rentang ini — cek data SKR."
            : `Redelivery mengambil ${s.redelivery.share.toFixed(1)}% dari total qty SKR (${formatQty(s.redelivery.qty)} dari ${formatQty(s.redelivery.totalQty)})${s.redelivery.sharePrev != null ? `, sebelumnya ${s.redelivery.sharePrev.toFixed(1)}%` : ""}. ${status.redelivery === "aman" ? "Masih dalam batas zona aman internal." : "Sebisa mungkin ini ditekan: redelivery berarti pengiriman gagal sekali."} ${s.skr.topReason ? `\n→ alasan POD terbanyak: "${s.skr.topReason[0]}".` : ""}`

    const skr =
        s.skr.delta == null
            ? `Sisa kiriman (SKR) 30 hari terakhir ${formatQty(s.skr.qty)} unit (Rp ${formatNilai(s.skr.nilai)}) — belum ada pembanding, trennya belum bisa dinilai.`
            : s.skr.delta >= 0
                ? `Sisa kiriman 30 hari terakhir ${formatQty(s.skr.qty)} unit (Rp ${formatNilai(s.skr.nilai)}), naik ${formatPct(s.skr.delta)} dari periode sebelumnya (${formatQty(s.skr.qtyPrev)}). Semakin tinggi sisa kiriman, semakin lama uang kerja macet di toko.\nCatatan: %SKR Qty belum dihitung — total qty kirim belum ada di app (menunggu data dari BI), jadi yang tampil qty absolutnya.`
                : `Sisa kiriman 30 hari terakhir ${formatQty(s.skr.qty)} unit (Rp ${formatNilai(s.skr.nilai)}), turun ${formatPct(s.skr.delta)} dari periode sebelumnya (${formatQty(s.skr.qtyPrev)}). Arahnya ke bawah — bagus.`

    const ritase =
        s.ritase.trips === 0
            ? "Tidak ada trip outbound terekam pada 30 hari terakhir."
            : `Ritase 30 hari terakhir: ${s.ritase.trips} trip penuh (±${s.ritase.perHari.toFixed(1)}/hari). Armada aktif hanya ${s.ritase.cakupanHari.toFixed(0)}% dari hari — sisanya kosong tanpa keberangkatan.`

    return { biaya, redelivery, skr, ritase }
}

/** Prioritas kerja: status terburuk dulu, maksimal 3 butir. */
export function priorities(status: ReturnType<typeof evalStatus>, s: AnalisaSnapshot) {
    const order: (keyof typeof status)[] = ["biaya", "redelivery", "skr", "ritase"]
    const weight: Record<KpiStatus, number> = { perhatian: 3, pantau: 2, aman: 1 }
    const sorted = [...order].sort((a, b) => weight[status[b]] - weight[status[a]])
    const out: string[] = []
    for (const k of sorted) {
        if (out.length >= 3) break
        if (status[k] === "aman") continue
        if (k === "biaya" && s.biaya.top.length)
            out.push(`Cek biaya perbaikan ke-3 unit teratas (${s.biaya.top[0][0]} dkk) — total ${compactNilai(s.biaya.cur)} dalam 30 hari, tren ${formatPct(s.biaya.delta ?? 0)}.`)
        else if (k === "redelivery")
            out.push(`Turunkan redelivery (${s.redelivery.share?.toFixed(1) ?? "?"}% qty SKR): susun daftar toko dengan pengulangan terbanyak, lalu kerjakan pengecekan alamat & jadwal.`)
        else if (k === "skr" && s.skr.delta != null)
            out.push(`Kejar settle kiriman lama: qty SKR naik ${formatPct(s.skr.delta)} menjadi ${formatQty(s.skr.qty)} unit (nilai Rp ${formatNilai(s.skr.nilai)}) dalam 30 hari.`)
        else if (k === "ritase" && s.ritase.trips === 0)
            out.push("Periksa pencatatan outbound: tidak ada trip terekam 30 hari, indikator laporan mungkin tidak jalan.")
        else if (k === "ritase")
            out.push(`Cakupan hari aktif baru ${s.ritase.cakupanHari.toFixed(0)}% (${s.ritase.trips} trip / 30 hari) — cari penyebab hari tanpa keberangkatan.`)
    }
    return out.length ? out : ["Semua KPI bertanda aman — tidak ada yang perlu dieskalasi hari ini."]
}

/** Headline berdasar status terburuk — tanpa provider apa pun. */
export function localHeadline(worst: KpiStatus): string {
    if (worst === "perhatian") {
        return "Ada sekurang-kurangnya satu KPI yang keluar dari zona aman pada 30 hari terakhir. Baca bagian prioritas dulu — sisanya hanya konteks."
    }
    if (worst === "pantau") {
        return "Tidak ada yang krisis, tapi ada dua-dua angka yang arahnya patut dipantau minggu ini. Angka-angka di bawah disusun dari data sebenarnya, bukan perkiraan."
    }
    return "Seluruh KPI yang bisa dihitung otomatis berada dalam zona aman dibanding periode sebelumnya. Fokus minggu ini tetap mempertahankan arah ini."
}

/* ── Bentuk briefing dari server ─────────────────────────────────────────── */

/** Satu baris tabel KPI yang dibangun SERVER (angka = fakta); telaah dari model. */
export interface KpiTabelRow {
    kpi: string
    nilai: string
    pembanding: string
    perubahan: string
    status: KpiStatus
    telaah: string
}

/**
 * Briefing terstruktur dari /api/analisa/summary.
 * `tabel` selalu diisi server dari snapshot — angkanya tidak bisa
 * dihalusinasi model. Provider "fallback" = kedua model gagal; payload
 * tetap lengkap (tabel + ringkasan faktual server).
 */
export interface AiBrief {
    provider?: "openkey" | "gemini" | "fallback"
    ringkasan?: string
    prioritas?: string[]
    catatan?: string
    tabel?: KpiTabelRow[]
    answer?: string
}

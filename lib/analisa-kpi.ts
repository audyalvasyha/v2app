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
    /** Kenaikan qty SKR di atas ini (persen) → perhatian */
    skrNaikPerhatian: 25,
    skrNaikPantau: 10,
} as const

/**
 * Matriks KPI RESMI Head of Transport — bobot & target dari atasan.
 *
 * Ini sumber kebenaran untuk scorecard: setiap angka target di UI dan di
 * prompt AI diambil dari sini, tidak diketik dua kali. `terekam` = KPI yang
 * bisa dihitung dari data yang sudah dimuat dashboard; yang tidak, tampil
 * jujur dengan keterangan sumber data yang dibutuhkan (BUKAN dikarang
 * angkanya supaya tabel terlihat penuh).
 */
export const KPI_MATRIKS = [
    { id: "ofr", nama: "%OFR", bobot: "5%", target: "≥ 85%", arah: "naik" as const, terealisasi: false, sumber: "butuh data order fulfilment (tidak ada di app)" },
    { id: "loss", nama: "Loss DC Outbound Operation", bobot: "10%", target: "≤ 0,90%", arah: "turun" as const, terealisasi: false, sumber: "butuh modul loss/stock opname (tidak ada di app)" },
    { id: "skr", nama: "%SKR Qty", bobot: "5%", target: "≤ 0,13%", arah: "turun" as const, terealisasi: false, sumber: "qty tercatat; %nya perlu total qty kirim dari BI" },
    { id: "redelivery", nama: "%Redelivery Qty", bobot: "5%", target: "≤ 0,25%", arah: "turun" as const, terealisasi: true, sumber: "share dari qty SKR tercatat (pembagi kirim penuh belum ada)" },
    { id: "ofr_tkg", nama: "% OFR TKG Loss Limited", bobot: "", target: "≥ 97%", arah: "naik" as const, terealisasi: false, sumber: "butuh data order fulfilment TKG (tidak ada di app)" },
    { id: "dt_scan", nama: "DT Scan In Toko", bobot: "20%", target: "≤ 1,1 hari", arah: "turun" as const, terealisasi: false, sumber: "butuh data scan kedatangan toko (tidak ada di app)" },
    { id: "ritase", nama: "Ritase", bobot: "10%", target: "≥ 1,1", arah: "naik" as const, terealisasi: true, sumber: "trip/unit/hari dari data outbound per unit per hari aktif yang di-fetch" },
    { id: "m3", nama: "M3/Shipment", bobot: "20%", target: "≥ 9,90", arah: "naik" as const, terealisasi: false, sumber: "butuh data volume (m³) per kiriman (tidak ada di app)" },
    { id: "vso", nama: "%VSO", bobot: "", target: "≥ 85%", arah: "naik" as const, terealisasi: false, sumber: "butuh data vehicle standing order (tidak ada di app)" },
    { id: "dc_cost", nama: "DC Cost Transport", bobot: "", target: "≤ 4%", arah: "turun" as const, terealisasi: false, sumber: "butuh biaya transport resmi & penjualan DC % (tidak ada di app)" },
    { id: "turnover", nama: "% Turnover Mitra Kerja - Delman", bobot: "10%", target: "≤ 25%", arah: "turun" as const, terealisasi: false, sumber: "butuh master & mutasi mitra kerja delman (tidak ada di app)" },
] as const

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
    ritase: {
        trips: number
        perHari: number
        cakupanHari: number
        spanHari: number
        /** Unit berbeda yang beroperasi dalam jendela — pembagi ritase resmi */
        units: number
        /** RITASE RESMI: trip ÷ unit ÷ hari (target resmi ≥ 1,1) */
        perUnitHari: number
    }
}

/**
 * Kumpulan nilai KPI dari baris mentah — satu pintu keluar yang jelas.
 *
 * KPI yang dihitung (semuanya otomatis):
 *   1. Biaya Perbaikan Armada → SUM catatan perbaikan/servis 30 hari vs 30 hari
 *                              sebelumnya. INI BUKAN biaya pengiriman: BBM, tol,
 *                              dan jasa mitra tidak ada di app — jadi namanya
 *                              diucapkan apa adanya, tidak dihias "transport".
 *   2. %Redelivery Qty       → qty alasan redelivery ÷ total qty SKR
 *   3. SKR Qty               → qty sisa kiriman 30 hari vs 30 hari sebelumnya
 *                              (%SKR Qty menunggu total kirim dari BI)
 *   4. Ritase                → jumlah trip outbound ÷ lebar jendela data yang
 *                              BENAR-BENAR di-fetch, plus cakupan hari berkeberangkatan
 */
export function buildKpiSnapshot(
    histories: any[],
    skrRows: any[],
    skrPrevRows: any[],
    outbounds: any[],
    /**
     * Rentang tanggal armada_outbound yang benar-benar di-fetch (menu Pengiriman).
     * WAJIB dijauhkan dari 30 hari keras: kalau user menyempitkan rentang,
     * pembagi ritase harus ikut menyempit — kalau tidak, ritase/hari
     * melenceng jauh ke bawah tanpa ada yang menyadari.
     */
    window?: { from: string; to: string },
): AnalisaSnapshot {
    const now = wibNow()
    const DAY = 86_400_000
    const cur = { from: now - 29 * DAY, to: now + DAY / 2 }
    const prev = { from: now - 59 * DAY, to: now - 29 * DAY + DAY / 2 } // tidak tumpang tindih

    // 1. Biaya perbaikan armada — dari maintenance_histories, apa adanya.
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

    // 4. Ritase — pembagi = lebar JENDELA DATA yang di-fetch, bukan 30 hari
    //    keras. Rentang eksplisit dari menu Pengiriman lebih dipercaya; kalau
    //    tidak ada, lebar diukur dari data itu sendiri (fallback terbatas).
    let spanHari = 30
    let windowFrom = cur.from
    let windowTo = cur.to
    const isoDate = /^\d{4}-\d{2}-\d{2}$/
    if (window && isoDate.test(window.from) && isoDate.test(window.to)) {
        const from = Date.parse(`${window.from}T00:00:00+07:00`)
        const to = Date.parse(`${window.to}T00:00:00+07:00`)
        if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
            windowFrom = from
            windowTo = to + DAY / 2
            spanHari = Math.round((to - from) / DAY) + 1
        }
    } else {
        let minT: number | null = null
        let maxT: number | null = null
        for (const o of outbounds) {
            const t = toTime(String(o.jam_out ?? "").slice(0, 19).replace(" ", "T"))
            if (t == null) continue
            if (minT == null || t < minT) minT = t
            if (maxT == null || t > maxT) maxT = t
        }
        if (minT != null && maxT != null) {
            windowFrom = Math.floor(minT / DAY) * DAY
            spanHari = Math.max(1, Math.round((maxT - minT) / DAY) + 1)
        }
    }
    let trips = 0
    const activeDays = new Set<string>()
    const activeUnits = new Set<string>()
    for (const o of outbounds) {
        const t = toTime(String(o.jam_out ?? "").slice(0, 19).replace(" ", "T"))
        if (t == null || t < windowFrom || t > windowTo) continue
        trips += 1
        const plate = String(o.no_polisi ?? "").trim()
        if (plate) activeUnits.add(plate)
        const d = new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
        activeDays.add(d)
    }
    const ritasePerHari = trips / Math.max(1, spanHari)
    const cakupanHari = (activeDays.size / Math.max(1, spanHari)) * 100
    // Ritase resmi Head of Transport: trip per unit per hari. Target ≥ 1,1
    // tidak punya arti kalau pembaginya seluruh trip per hari — unitnya
    // harus ikut masuk, karena target ini mengukur UTILISASI armada.
    const perUnitHari =
        activeUnits.size > 0 ? trips / (activeUnits.size * Math.max(1, spanHari)) : 0

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
        ritase: {
            trips,
            perHari: ritasePerHari,
            cakupanHari,
            spanHari,
            units: activeUnits.size,
            perUnitHari,
        },
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
    // Redelivery: target resmi ≤ 0,25% qty. Band statusnya dari target itu:
    // aman penuh, pantau ≤ 2× target (0,50%), perhatian di atasnya.
    const redelivery: KpiStatus =
        s.redelivery.share == null
            ? "pantau"
            : s.redelivery.share > 0.5
                ? "perhatian"
                : s.redelivery.share > 0.25
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
    // Ritase: target resmi ≥ 1,1 trip/unit/hari. Aman saat memenuhi, pantau
    // saat mencapai setengah target, perhatian di bawah itu (trips 0 =
    // perhatian juga — datanya belum terbaca).
    const ritase: KpiStatus =
        s.ritase.trips === 0 || s.ritase.units === 0
            ? "perhatian"
            : s.ritase.perUnitHari >= 1.1
                ? "aman"
                : s.ritase.perUnitHari >= 0.55
                    ? "pantau"
                    : "perhatian"
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
            ? `Biaya perbaikan armada 30 hari terakhir Rp ${formatNilai(s.biaya.cur)} — belum ada pembanding periode sebelumnya, maknanya belum bisa dibaca.`
            : s.biaya.delta >= 0
                ? `Biaya perbaikan armada 30 hari terakhir Rp ${formatNilai(s.biaya.cur)}, naik ${formatPct(s.biaya.delta)} dibanding 30 hari sebelumnya (Rp ${formatNilai(s.biaya.prev)}). ${s.biaya.top.length ? `Unit penyumbang terbesar: ${s.biaya.top.map(([p, v]) => `${p} (${compactNilai(v)})`).join(", ")} — telaah polanya: unit boros, pemakaian berlebih, atau kerusakan berulang.` : ""}`
                : `Biaya perbaikan armada 30 hari terakhir Rp ${formatNilai(s.biaya.cur)}, turun ${formatPct(s.biaya.delta)} dibanding periode sebelumnya. Cek juga arahnya bukan karena servis yang harus jadi tertunda.`

    const redelivery =
        s.redelivery.share == null
            ? "Tidak ada qty yang bisa dibaca pada rentang ini — cek data SKR."
            : `Redelivery mengambil ${s.redelivery.share.toFixed(2)}% dari qty tercatat (${formatQty(s.redelivery.qty)} dari ${formatQty(s.redelivery.totalQty)})${s.redelivery.sharePrev != null ? `, sebelumnya ${s.redelivery.sharePrev.toFixed(1)}%` : ""}. Target resmi ≤ 0,25% — ${status.redelivery === "aman" ? "tercapai." : status.redelivery === "pantau" ? "belum tercapai tapi masih di bawah 2× target." : "melewati 2× target."} Catatan: pembaginya masih qty SKR tercatat, bukan total kirim — persennya akan lebih akurat lagi saat denominator BI tersedia. ${s.skr.topReason ? `\n→ alasan POD terbanyak: "${s.skr.topReason[0]}".` : ""}`

    const skr =
        s.skr.delta == null
            ? `Sisa kiriman (SKR) 30 hari terakhir ${formatQty(s.skr.qty)} unit (Rp ${formatNilai(s.skr.nilai)}) — belum ada pembanding, trennya belum bisa dinilai.`
            : s.skr.delta >= 0
                ? `Sisa kiriman 30 hari terakhir ${formatQty(s.skr.qty)} unit (Rp ${formatNilai(s.skr.nilai)}), naik ${formatPct(s.skr.delta)} dari periode sebelumnya (${formatQty(s.skr.qtyPrev)}). Semakin tinggi sisa kiriman, semakin lama uang kerja macet di toko.\nCatatan: %SKR Qty belum dihitung — total qty kirim belum ada di app (menunggu data dari BI), jadi yang tampil qty absolutnya.`
                : `Sisa kiriman 30 hari terakhir ${formatQty(s.skr.qty)} unit (Rp ${formatNilai(s.skr.nilai)}), turun ${formatPct(s.skr.delta)} dari periode sebelumnya (${formatQty(s.skr.qtyPrev)}). Arahnya ke bawah — bagus.`

    const ritase =
        s.ritase.trips === 0
            ? "Tidak ada trip outbound terekam pada jendela data yang dimuat — bukan bukti armada idle: bisa operasi berhenti, bisa pencatatan yang tidak jalan."
            : `Ritase resmi jendela ${s.ritase.spanHari} hari: ${s.ritase.perUnitHari.toFixed(2)} trip/unit/hari (${s.ritase.trips} trip, ${s.ritase.units} unit aktif). Target ≥ 1,1. Hanya ${s.ritase.cakupanHari.toFixed(0)}% hari yang punya keberangkatan terekam — bedakan itu hari kosong operasi atau laporan yang bolong.`

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
            out.push(`Telaah pola biaya perbaikan unit teratas (${s.biaya.top[0][0]} dkk) — total ${compactNilai(s.biaya.cur)} dalam 30 hari, tren ${formatPct(s.biaya.delta ?? 0)}.`)
        else if (k === "redelivery")
            out.push(`Turunkan redelivery (${s.redelivery.share?.toFixed(1) ?? "?"}% qty SKR): susun daftar toko dengan pengulangan terbanyak, lalu kerjakan pengecekan alamat & jadwal.`)
        else if (k === "skr" && s.skr.delta != null)
            out.push(`Kejar settle kiriman lama: qty SKR naik ${formatPct(s.skr.delta)} menjadi ${formatQty(s.skr.qty)} unit (nilai Rp ${formatNilai(s.skr.nilai)}) dalam 30 hari.`)
        else if (k === "ritase" && s.ritase.trips === 0)
            out.push("Periksa pencatatan outbound: tidak ada trip terekam 30 hari, indikator laporan mungkin tidak jalan.")
        else if (k === "ritase")
            out.push(`Ritase ${s.ritase.perUnitHari.toFixed(2)}/unit/hari vs target 1,1 (${s.ritase.trips} trip, ${s.ritase.units} unit, cakupan hari ${s.ritase.cakupanHari.toFixed(0)}%) — pisahkan hari kosong operasi dari laporan yang bolong.`)
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

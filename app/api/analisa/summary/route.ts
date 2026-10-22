import { NextResponse } from "next/server"
import { chatCompletion, OpenKeyError } from "@/lib/ai/openkey"
import { callGemini, AiError } from "@/lib/ai/gemini"
import { requireUserClient } from "@/lib/ai/user-client"
import { compactNilai, formatNilai, formatQty } from "@/lib/skr-status"
import { evalStatus, formatPct, type KpiStatus } from "@/lib/analisa-kpi"

/**
 * Endpoint analisa "Head of Transport — Wings".
 *
 * ── Prinsip yang sama dengan /api/ai/ask ──
 *
 * Model TIDAK PERNAH melihat baris mentah dan TIDAK pernah menghitung
 * sendiri. Browser menghitung snapshot KPI dari data asli (lihat
 * buildKpiSnapshot di analisa-view.tsx), lalu mengirim angkanya ke sini.
 *
 * ── Anti-halusinasi pada output ──
 *
 * Tabel KPI di response dibangun SERVER dari snapshot — angkanya fakta,
 * tidak melewati model. Model hanya mengisi interpretasi: ringkasan,
 * telaah per KPI, dan prioritas. Jadi bahkan kalau model mengarang,
 * angka di tabel tetap benar — karangannya paling parah cuma di kolom
 * narasi, yang memang harus membaca data yang diberikan.
 *
 * ── Fallback provider ──
 *
 * OpenKey utama; kalau kredit habis / rate limit / key ditolak /
 * key belum diisi → otomatis switch ke Gemini (Google AI Studio) dengan
 * prompt identik. `no_answer` sengaja tidak di-switch: menyuruh model
 * lain menulis ulang jawaban kosong cuma membuang kredit.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ── Cache briefing per snapshot ────────────────────────────────────
//
// Briefing sepenuhnya ditentukan oleh angka snapshot: snapshot sama →
// briefing sama. Jadi hasilnya bisa di-cache dengan KUNCI ISI SNAPSHOT
// (content-addressed) — tidak ada risiko data basi, karena kuncinya
// berubah otomatis begitu data berubah. Manfaatnya: buka ulang menu
// Analisa langsung muncul (tanpa 30-60 detik lagi), dan kredit provider
// tidak dibakar untuk snapshot yang sama berulang-ulang.
const BRIEF_CACHE_TTL_MS = 15 * 60_000
const briefCache = new Map<string, { value: unknown; expiresAt: number }>()

// ── Rate limit per user ─────────────────────────────────────────
//
// Endpoint ini memanggil model BERBAYAR (OpenKey flagship / Gemini) di
// setiap hit, dan satu-satunya syaratnya hanyalah sesi login. Tanpa
// batas, satu script yang memegang sesi bisa membakar seluruh kredit
// OpenKey dalam hitungan detik. Polanya identik dengan /api/ai/ask
// (8/menit); di sini lebih ketat (4/menit) karena briefing hanya perlu
// disusun sekali per snapshot data, bukan sekali per pertanyaan.
const RATE_LIMIT_PER_MINUTE = 4
const RATE_WINDOW_MS = 60_000
const recentHits = new Map<string, number[]>()

function withinRateLimit(userId: string): boolean {
  const now = Date.now()
  const list = (recentHits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (list.length >= RATE_LIMIT_PER_MINUTE) {
    recentHits.set(userId, list)
    return false
  }
  list.push(now)
  recentHits.set(userId, list)
  // Jaga peta tetap kecil — entri user yang lalu tidak bertanya lagi
  // tidak boleh menumpuk selamanya (kebocoran memori per instance).
  if (recentHits.size > 2000) recentHits.clear()
  return true
}

/** Batas halus: angka di luar ini dianggap payload tidak wajar. */
const MAX_NUMBER = 1e12

interface SnapshotInput {
    biaya: {
        cur: number
        prev: number
        delta: number | null
        top: [string, number][]
    }
    redelivery: {
        share: number | null
        sharePrev: number | null
        qty: number
        totalQty: number
    }
    skr: {
        qty: number
        nilai: number
        qtyPrev: number
        delta: number | null
        topReason: [string, number] | null
    }
    ritase: {
        trips: number
        perHari: number
        cakupanHari: number
        spanHari: number
        units: number
        perUnitHari: number
    }
}

/**
 * Tipe status KPI diimpor dari lib/analisa-kpi — ambang evaluasinya
 * DIPAKAI BERSAMA dengan sisi client, jadi tidak ada lagi dua salinan
 * KPI_THRESHOLDS yang bisa kandas someday.
 */

/**
 * Bentuk final snapshot setelah sanitasi — semua field WAJIB ada.
 * Angka yang tidak terbaca dari payload jadi null (bukan undefined),
 * supaya tidak ada cabang "mungkin undefined" yang tersebar di bawah.
 */
function sanitize(snapshot: unknown): SnapshotInput | null {
    if (typeof snapshot !== "object" || snapshot === null) return null
    const s = snapshot as Record<string, any>

    const num = (v: unknown): number | null => {
        const n = Number(v)
        return Number.isFinite(n) && Math.abs(n) <= MAX_NUMBER ? n : null
    }
    const top =
        Array.isArray(s?.biaya?.top)
            ? s.biaya.top
                  .filter(
                      (t: unknown): t is [string, number] =>
                          Array.isArray(t) &&
                          typeof t[0] === "string" &&
                          t[0].length <= 40,
                  )
                  .slice(0, 3)
                  .map(([p, v]: [string, number]) => [p, num(v) ?? 0] as [string, number])
            : []

    return {
        biaya: {
            cur: num(s?.biaya?.cur) ?? 0,
            prev: num(s?.biaya?.prev) ?? 0,
            delta: num(s?.biaya?.delta),
            top,
        },
        redelivery: {
            share: num(s?.redelivery?.share),
            sharePrev: num(s?.redelivery?.sharePrev),
            qty: num(s?.redelivery?.qty) ?? 0,
            totalQty: num(s?.redelivery?.totalQty) ?? 0,
        },
        skr: {
            qty: num(s?.skr?.qty) ?? 0,
            nilai: num(s?.skr?.nilai) ?? 0,
            qtyPrev: num(s?.skr?.qtyPrev) ?? 0,
            delta: num(s?.skr?.delta),
            topReason:
                Array.isArray(s?.skr?.topReason) && typeof s.skr.topReason[0] === "string"
                    ? ([String(s.skr.topReason[0]).slice(0, 80), num(s.skr.topReason[1]) ?? 0] as [string, number])
                    : null,
        },
        ritase: {
            trips: num(s?.ritase?.trips) ?? 0,
            perHari: num(s?.ritase?.perHari) ?? 0,
            cakupanHari: num(s?.ritase?.cakupanHari) ?? 0,
            spanHari: num(s?.ritase?.spanHari) ?? 0,
            units: num(s?.ritase?.units) ?? 0,
            perUnitHari: num(s?.ritase?.perUnitHari) ?? 0,
        },
    }
}

function pct(n: number) {
    return formatPct(n)
}

/**
 * Ringkasan FAKTUAL dari angka snapshot — tanpa analisis, tanpa karangan.
 * Dipakai ketika KEDUA provider gagal: briefing tetap tampil (angka dari
 * data), bukan kartu error. Analisis tajamnya menyusul saat AI kembali normal.
 */
function composeSummary(s: SnapshotInput): string {
    const parts: string[] = []
    parts.push(
        s.biaya.delta == null
            ? `Biaya perbaikan 30 hari terakhir Rp ${compactNilai(s.biaya.cur)} (belum ada pembanding periode sebelumnya).`
            : `Biaya perbaikan 30 hari terakhir Rp ${compactNilai(s.biaya.cur)} — ${pct(s.biaya.delta)} vs periode sebelumnya.`,
    )
    if (s.redelivery.share != null) {
        parts.push(`Redelivery mengambil ${s.redelivery.share.toFixed(1)}% dari qty SKR.`)
    }
    parts.push(
        s.skr.delta == null
            ? `Sisa kiriman ${formatQty(s.skr.qty)} unit (Rp ${compactNilai(s.skr.nilai)}).`
            : `Sisa kiriman ${formatQty(s.skr.qty)} unit (Rp ${compactNilai(s.skr.nilai)}) — ${pct(s.skr.delta)} vs sebelumnya.`,
    )
    if (s.ritase.trips > 0) {
        parts.push(`Ritase ${s.ritase.trips} trip dalam jendela ${s.ritase.spanHari} hari (±${s.ritase.perHari.toFixed(1)}/hari, hari berkeberangkatan ${s.ritase.cakupanHari.toFixed(0)}%).`)
    } else {
        parts.push("Tidak ada trip outbound terekam pada jendela data yang dimuat.")
    }
    return parts.join(" ")
}

/** Payload lapisan- terakhir: tabel angka server + ringkasan faktual, status 200. */
function gracefulPayload(s: SnapshotInput, penyebab: string) {
    return {
        provider: "fallback",
        ringkasan: composeSummary(s),
        tabel: buildTabel(s, {}),
        answer: undefined,
        catatan: `Layanan AI tidak dapat dihubungi (${penyebab}). Ini ringkasan otomatis dari angka data; telaah analitis menyusul saat AI kembali normal.`,
    }
}

interface KpiRow {
    kpi: string
    nilai: string
    pembanding: string
    perubahan: string
    status: KpiStatus
    telaah: string
}

/** Tabel KPI — DIBANGUN SERVER dari snapshot. Angka = fakta. */
function buildTabel(s: SnapshotInput, telaah: Partial<Record<string, string>>): KpiRow[] {
    const status = evalStatus(s)
    const rows: KpiRow[] = []

    rows.push({
        kpi: "Biaya Perbaikan Armada (servis)",
        nilai: `Rp ${compactNilai(s.biaya.cur)}`,
        pembanding: s.biaya.delta == null ? "—" : `Rp ${compactNilai(s.biaya.prev)}`,
        perubahan: s.biaya.delta == null ? "—" : pct(s.biaya.delta),
        status: status.biaya,            telaah: telaah.biaya?.trim() || "—",
    })
    rows.push({
        kpi: "% Redelivery Qty",
        nilai: s.redelivery.share == null ? "—" : `${s.redelivery.share.toFixed(2)}%`,
        pembanding:
            s.redelivery.sharePrev == null ? "—" : `${s.redelivery.sharePrev.toFixed(1)}%`,
        perubahan:
            s.redelivery.share != null && s.redelivery.sharePrev != null
                ? `${(s.redelivery.share - s.redelivery.sharePrev).toFixed(1)} pt`
                : "—",
        status: status.redelivery,            telaah: telaah.redelivery?.trim() || "—",
    })
    rows.push({
        kpi: "Sisa Kiriman (SKR Qty)",
        nilai: `${formatQty(s.skr.qty)} unit · Rp ${compactNilai(s.skr.nilai)}`,
        pembanding: s.skr.delta == null ? "—" : `${formatQty(s.skr.qtyPrev)} unit`,
        perubahan: s.skr.delta == null ? "—" : pct(s.skr.delta),
        status: status.skr,            telaah: telaah.skr?.trim() || "—",
    })
    rows.push({
        kpi: "Ritase",
        nilai: `${s.ritase.perUnitHari.toFixed(2)} trip/unit/hari · ${s.ritase.trips} trip, ${s.ritase.units} unit`,
        pembanding: `target ≥ 1,1 · hari berkeberangkatan ${s.ritase.cakupanHari.toFixed(0)}% dari ${s.ritase.spanHari} hari`,
        perubahan: "—",
        status: status.ritase,            telaah: telaah.ritase?.trim() || "—",
    })
    return rows
}

const SYSTEM_PROMPT = [
    "Kamu adalah Head of Transport di Wings, perusahaan FMCG besar Indonesia.",
    "Kamu bertanggung jawab atas kesiapan armada, keandalan pengiriman outbound",
    "(SLA/redelivery), biaya pemeliharaan armada, ritase, dan sisa kiriman (SKR).",
    "Kamu menulis briefing pagi ke tim transport & distribution — bukan laporan",
    "untuk bank dan bukan pidato resmi.",
    "",
    "Matriks KPI RESMI yang kamu ukur (bobot · target · arah baik):",
    "- %OFR 5% · ≥85% · makin tinggi makin baik (data order fulfilment belum tersedia)",
    "- Loss DC Outbound Operation 10% · ≤0,90% (belum tersedia)",
    "- %SKR Qty 5% · ≤0,13% (qty tercatat ada; % perlu total kirim BI)",
    "- %Redelivery Qty 5% · ≤0,25% (share dari qty SKR tercatat)",
    "- % OFR TKG Loss Limited · ≥97% (belum tersedia)",
    "- DT Scan In Toko 20% · ≤1,1 hari (belum tersedia)",
    "- Ritase 10% · ≥1,1 trip/unit/hari — dihitung dari snapshot",
    "- M3/Shipment 20% · ≥9,90 (belum tersedia)",
    "- %VSO · ≥85% (belum tersedia)",
    "- DC Cost Transport · ≤4% (belum tersedia)",
    "- % Turnover Mitra Kerja - Delman 10% · ≤25% (belum tersedia)",
    "",
    "Cara bicara:",
    "- Bahasa Indonesia profesional-operasional: tajam, langsung, tegas.",
    "- Tidak memuji pembaca dan tidak memuji dirimu sendiri.",
    "- Setiap klaim WAJIB berangkal dari angka di data yang diberikan.",
    "- JANGAN mengarang angka. Jika data bertanda belum ada pembanding atau '—',",
    "  sebut jujur datanya belum memadai — jangan isi dengan perkiraan.",
    "- KPI resmi yang datanya belum tersedia (%OFR, Loss DC, %SKR persen,",
    "  DT Scan, M3/Shipment, %VSO, DC Cost %, Turnover) JANGAN dibandingkan",
    "  dengan targetnya — tinggal diteleah dari sisi yang bisa tanpa angka.",
    "- JANGAN pakai kata 'Berikut', 'Kesimpulan', 'Analisis saya', atau sejenisnya.",
    "",
    "Cara menganalisis (yang membuatmu tajam):",
    "- Bukan mengulang angka, tapi menjelaskan MENGAPA angkanya begitu",
    "  (penyebab operasional yang masuk akal untuk FMCG: redelivery karena alamat/",
    "  jadwal toko, SKR macet karena settle lambat, biaya perbaikan naik karena",
    "  unit boros atau kerusakan berulang) dan DAMPAKNYA ke bisnis (kesiapan",
    "  armada, uang kerja macet, SLA toko).",
    "- LARANGAN istilah: data yang tersedia BIAYA PERBAIKAN/servis armada,",
    "  BUKAN biaya pengiriman. Jangan menyebutnya 'biaya transport' atau",
    "  'cost per kiriman' — analisisnya ke arah kesehatan armada.",
    "- Hari tanpa keberangkatan BUKAN bukti armada idle: bisa operasi berhenti,",
    "  bisa pencatatan yang bolong. Sebutkan kedua kemungkinan itu, jangan pilih satu.",
    "- Kalau penyebab tidak bisa dipastikan dari data, tulis sebagai dugaan",
    "  yang eksplisit ('indikasinya…', 'kemungkinan karena…') — bukan sebagai fakta.",
    "",
    "Format jawaban — balas HANYA JSON valid, tanpa markdown, tanpa penjelasan lain:",
    "{",
    '  "ringkasan": "<2-3 kalimat pembuka: kondisi umum + arah tren, sebut angka kunci>",',
    '  "telaah": {',
    '    "biaya": "<1-2 kalimat analisis tajam biaya perbaikan armada>",',
    '    "redelivery": "<1-2 kalimat analisis tajam %Redelivery Qty>",',
    '    "skr": "<1-2 kalimat analisis tajam sisa kiriman>",',
    '    "ritase": "<1-2 kalimat analisis tajam ritase/hari>"',
    "  },",
    '  "prioritas": ["<aksi konkret yang bisa dieksekusi minggu ini>", "…maksimal 3"],',
    '  "catatan": "<opsional, 1 kalimat kaveat/data yang belum tersedia>"',
    "}",
].join("\n")

/**
 * Ambil objek JSON pertama dari balasan model — model kadang membalas
 * dengan teks pembuka/penutup atau menaruh JSON dalam code fence.
 */
function extractModelJson(text: string): Record<string, unknown> | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidate = (fenced?.[1] ?? text).trim()
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start === -1 || end <= start) return null
    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1))
        return typeof parsed === "object" && parsed !== null ? parsed : null
    } catch {
        return null
    }
}

/**
 * Validasi & rapikan output model — hasil JSON yang gagal validasi
 * TIDAK melempar error: teks mentahnya dipakai sebagai jawaban biasa,
 * supaya satu kalimat model yang agak salah format tidak mematikan
 * seluruh briefing.
 */
function parseModelBrief(text: string): {
    ringkasan?: string
    telaah: Partial<Record<string, string>>
    prioritas: string[]
    catatan?: string
} {
    const parsed = extractModelJson(text)
    if (!parsed) return { telaah: {}, prioritas: [] }

    const clean = (v: unknown, max: number): string | undefined =>
        typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined

    const telaahRaw = (typeof parsed.telaah === "object" && parsed.telaah !== null ? parsed.telaah : {}) as Record<string, unknown>
    const telaah = {
        biaya: clean(telaahRaw.biaya, 300),
        redelivery: clean(telaahRaw.redelivery, 300),
        skr: clean(telaahRaw.skr, 300),
        ritase: clean(telaahRaw.ritase, 300),
    }
    const prioritas = Array.isArray(parsed.prioritas)
        ? parsed.prioritas
              .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
              .map((p) => p.trim().slice(0, 200))
              .slice(0, 3)
        : []

    return {
        ringkasan: clean(parsed.ringkasan, 600),
        telaah,
        prioritas,
        catatan: clean(parsed.catatan, 300),
    }
}

export async function POST(request: Request) {
    // Auth dulu — endpoint berbayar tidak untuk pengunjung anonim.
    const auth = await requireUserClient(request)
    if (!auth.ok) return auth.response

    // Kuota dihitung per user SETELAH identitas terverifikasi, sebelum
    // satu rupiah kredit model disentuh. 429 (bukan 400) supaya jelas
    // ini bukan kesalahan isi payload.
    if (!withinRateLimit(auth.value.userId)) {
      return NextResponse.json(
        {
          error: `Terlalu banyak permintaan analisa dalam waktu singkat. Tunggu satu menit (maksimal ${RATE_LIMIT_PER_MINUTE} per menit).`,
        },
        { status: 429 },
      )
    }

    let snapshot: unknown
    let force = false
    try {
        const body = await request.json()
        snapshot = body?.snapshot
        // `force: true` dari tombol "Insight baru" — user eksplisit minta
        // telaah ulang; cache 15 menit dilewati (rate limit tetap berlaku
        // supaya klik-klik cepat tidak membakar kredit provider).
        force = body?.force === true
    } catch {
        return NextResponse.json({ error: "Body harus berupa JSON." }, { status: 400 })
    }

    const safe = sanitize(snapshot)
    if (!safe) {
        return NextResponse.json({ error: "Snapshot KPI tidak valid." }, { status: 400 })
    }

    // ── Cache hit → langsung balas, TIDAK menghitung rate limit ──
    // Angka yang di-cache itu identik dengan yang akan dihitung ulang,
    // jadi membalas dari cache bukan penipuan — hanya menghemat 30-60
    // detik tunggu dan satu panggilan provider berbayar. Tombol paksa
    // (`force`) melewati cache ini — itulah tujuannya.
    const cacheKey = JSON.stringify(safe)
    if (!force) {
        const hit = briefCache.get(cacheKey)
        if (hit && hit.expiresAt > Date.now()) {
            return NextResponse.json(hit.value)
        }
    }
    // Bersihkan entri basi sekali-sekali supaya map tidak tumbuh tanpa batas.
    if (briefCache.size > 200) {
        const now = Date.now()
        for (const [k, v] of briefCache) if (v.expiresAt <= now) briefCache.delete(k)
    }

    const dataLines: string[] = [
        "Data KPI snapshot (sudah dihitung dari database — angka ini FAKTA, jangan ubah):",
        "",
        "| KPI | Jendela data | Periode sebelumnya | Perubahan |",
        "|---|---|---|---|",
        safe.biaya.delta == null
            ? `| Biaya perbaikan armada (servis) | Rp ${safe.biaya.cur} | belum ada pembanding | — |`
            : `| Biaya perbaikan armada (servis) | Rp ${safe.biaya.cur} | Rp ${safe.biaya.prev} | ${safe.biaya.delta >= 0 ? "+" : ""}${safe.biaya.delta.toFixed(1)}% |`,
        safe.redelivery.share == null
            ? `| %Redelivery Qty | tidak ada data | — | — |`
            : `| %Redelivery Qty | ${safe.redelivery.share.toFixed(2)}% (${safe.redelivery.qty} dari ${safe.redelivery.totalQty} qty) | ${safe.redelivery.sharePrev != null ? safe.redelivery.sharePrev.toFixed(2) + "%" : "—"} | target ≤ 0,25% |`,
        safe.skr.delta == null
            ? `| Sisa kiriman (SKR Qty) | ${safe.skr.qty} unit, nilai Rp ${safe.skr.nilai} | belum ada pembanding | % resmi perlu total kirim BI |`
            : `| Sisa kiriman (SKR Qty) | ${safe.skr.qty} unit, nilai Rp ${safe.skr.nilai} | ${safe.skr.qtyPrev} unit | ${safe.skr.delta >= 0 ? "+" : ""}${safe.skr.delta.toFixed(1)}% · % resmi perlu total kirim BI |`,
        `| Ritase (trip/unit/hari) | ${safe.ritase.perUnitHari.toFixed(2)} · ${safe.ritase.trips} trip, ${safe.ritase.units} unit, hari berkeberangkatan ${safe.ritase.cakupanHari.toFixed(0)}% dari ${safe.ritase.spanHari} hari | target ≥ 1,1 | — |`,
    ]
    if (safe.skr.topReason) {
        dataLines.push(`Catatan: alasan POD qty terbanyak adalah "${safe.skr.topReason[0]}".`)
    }
    if (safe.biaya.top.length > 0) {
        dataLines.push(
            `Biaya perbaikan terbesar per unit: ${safe.biaya.top.map(([p, v]) => `${p} (Rp ${v})`).join(", ")}.`,
        )
    }
    dataLines.push("Catatan: yang tersedia adalah biaya perbaikan/servis armada — BUKAN biaya pengiriman (BBM/tol/jasa mitra tidak ada di app).")
    dataLines.push("Catatan: %SKR Qty belum dihitung — total qty kirim belum tersedia di app (menunggu data dari BI), jadi yang tersedia SKR Qty absolut.")

    const userPrompt = dataLines.join("\n")

    try {
        const raw = await chatCompletion({
            system: SYSTEM_PROMPT,
            user: userPrompt,
            maxTokens: 900,
            temperature: 0.4,
        })
        const brief = parseModelBrief(raw)
        const payload = {
            provider: "openkey",
            ...brief,
            tabel: buildTabel(safe, brief.telaah),
            answer: brief.ringkasan ? undefined : raw.trim().slice(0, 2000),
        }
        briefCache.set(cacheKey, { value: payload, expiresAt: Date.now() + BRIEF_CACHE_TTL_MS })
        return NextResponse.json(payload)
    } catch (openKeyError) {
        // ── Fallback otomatis ke Gemini (Google AI Studio) ──
        // Kredit habis / rate limit / key ditolak / key belum diisi →
        // switch provider dengan prompt identik. Analisa jangan mati
        // hanya karena satu provider kena limit.
        const switchable =
            openKeyError instanceof OpenKeyError && openKeyError.kind !== "no_answer"
        if (switchable && process.env.GOOGLE_API_KEY) {
            try {
                const raw = await callGemini(
                    [SYSTEM_PROMPT, "", userPrompt].join("\n"),
                    900,
                    0.4,
                    // Batas waktu fallback: total worst-case request ini
                    // = 90s OpenKey + 20s Gemini, bukan "tanpa akhir".
                    // Fallback sendiri tetap pendek (20s) supaya user
                    // tidak ditahan ekstra saat OpenKey sudah gagal 90s.
                    AbortSignal.timeout(20_000),
                )
                const brief = parseModelBrief(raw)
                const payload = {
                    provider: "gemini",
                    ...brief,
                    tabel: buildTabel(safe, brief.telaah),
                    answer: brief.ringkasan ? undefined : raw.trim().slice(0, 2000),
                }
                briefCache.set(cacheKey, { value: payload, expiresAt: Date.now() + BRIEF_CACHE_TTL_MS })
                return NextResponse.json(payload)
            } catch (geminiError) {
                // KEDUA provider gagal → jangan lempar error ke UI (yang
                // membuat kartu berisikan "Narasi AI gagal" setelah menunggu
                // puluhan detik). Kirim payload server: tabel angka terkunci
                // dari snapshot + ringkasan faktual. Analisa tidak pernah kosong.
                const detail =
                    geminiError instanceof AiError
                        ? `${geminiError.kind}: ${geminiError.message}`
                        : String(geminiError)
                console.error("[api/analisa/summary] fallback Gemini gagal:", detail)
                return NextResponse.json(gracefulPayload(safe, "OpenKey & Gemini keduanya gagal"))
            }
        }

        // Shibar lain (OpenKey gagal & tidak layak di-switch, mis. menolak menulis
        // jawaban) → payload server yang sama. Selalu 200 dengan tabel angka.
        const penyebab =
            openKeyError instanceof OpenKeyError
                ? `OpenKey (${openKeyError.kind}: ${openKeyError.message})`
                : "kesalahan tidak terduga"
        console.error("[api/analisa/summary] provider utama gagal:", penyebab)
        return NextResponse.json(gracefulPayload(safe, penyebab))
    }
}

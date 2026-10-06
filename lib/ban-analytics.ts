/**
 * Analisa Ban - logika untuk membaca catatan ban dari riwayat perbaikan.
 *
 * Data ban di Midaa tidak punya tabel sendiri: pengeluaran ban dicatat di
 * `maintenance_histories.nama_barang_atau_jasa` sebagai teks bebas
 * ("2PCS GANTI BAN BELAKANG KIRI", "1 BAN DALAM SWALOW", "ONGKOS PASANG BAN
 * 175-65-14"). Semua arti — apakah itu penggantian, perbaikan, atau
 * aksesori; ban depan atau belakang; berapa pcs; inner atau outer — harus
 * diturunkan dari teks itu.
 *
 * Modul ini adalah satu-satunya tempat pembacaan itu terjadi, supaya angka
 * pada kartu ringkasan, grafik, tabel, dan Tanya Midaa tidak bisa berbeda
 * satu sama lain.
 */

/** Jenis pekerjaan ban yang bisa dibaca dari teks. */
export type BanCategory = "ganti" | "perbaikan" | "aksesori" | "lainnya"

/** Posisi roda yang disebut dalam teks. */
export type BanPosition = "depan" | "belakang" | "serap" | "campuran"

export interface BanRow {
    /** Baris mentah dari `maintenance_histories` */
    row: any
    /** Tanggal ISO (YYYY-MM-DD) bila ada, untuk pengelompokan bulan */
    iso: string | null
    plat: string
    unit: string
    item: string
    cost: number
    category: BanCategory
    position: BanPosition | null
    /** Jumlah ban yang disebut di teks; 0 bila teks tidak menyebut angka */
    qty: number
    /** Inner/outer — hanya untuk ban dalam yang punya pasangan luar/dalam */
    side: "dalam" | "luar" | null
}

const BAN_PATTERN = /\b(bans?|tires?|tyres?|telem|telm)\b/i

/**
 * Kata yang menandai pekerjaan ban. "Roda" sengaja tidak dipakai sebagai
 * pemicu: dari data, "roda" hampir selalu menyangkut seal roda, baut roda,
 * atau lahar roda — komponen yang bukan ban dan akan mengotori angka.
 */
function isBanText(text: string): boolean {
    return BAN_PATTERN.test(text)
}

/** Normalisasi: huruf besar ke kecil + spasi rapat. */
function normalize(text: string): string {
    return text.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Klasifikasi jenis pekerjaan.
 * - ganti: ada kata ganti/tukar/pasang untuk ban
 * - perbaikan: ada roker/reparasi/lurus/patch/tambal
 * - aksesori: gantungan/selendang/sayap ban (bukan ban itu sendiri)
 * - lainnya: sisa kasus yang tetap menyebut ban
 */
export function banCategory(text: string | null | undefined): BanCategory {
    const t = normalize(text ?? "")
    if (/\b(ganti|tukar|pasang)\b[^a-z]*\bban\b/.test(t)) return "ganti"
    if (/\ban\b[^a-z]*\b(ganti|tukar|pasang)\b/.test(t)) return "ganti"
    // "BAN DALAM BARU MERK GT" - kata "baru" boleh diberi satu kata di
// antaranya ("dalam", "luar"), asal tidak jauh dari kata ban.
if (/\bban\b(\s+\w+){0,2}\s+(baru|kompon)\b/.test(t)) return "ganti"
    if (/\b(roker|roper|repair|perbaikan|perbaiki|lurus|patch|tambal|sapro|servis)\b/.test(t)) return "perbaikan"
    if (/\b(gantungan|selendang|sayap)\b[^a-z]*\bban\b/.test(t)) return "aksesori"
    if (/\bban\b[^a-z]*\b(gantungan|selendang|sayap)\b/.test(t)) return "aksesori"
    return "lainnya"
}

/**
 * Posisi roda. "serap" (ban cadangan) diperiksa lebih dulu karena beberapa
 * catatan menyebut dua-duanya, mis. "GANTI BAN BELAKANG KIRI 2PCS BAN SERAP
 * 1PCS" — tanpa urutan ini baris itu akan terhitung sebagai ban belakang.
 */
export function banPosition(text: string | null | undefined): BanPosition | null {
    const t = normalize(text ?? "")
    const isSerap = /\bserap\b/.test(t)
    const isDepan = /\b(depan|dpn)\b/.test(t)
    const isBelakang = /\b(belakang|blk|blkg|bklg)\b/.test(t)
    const other = isDepan || isBelakang
    // Serap + posisi lain ("GANTI BAN BELAKANG KIRI 2PCS BAN SERAP 1PCS")
    // tidak boleh dipaksa jadi salah satu: satu baris bisa mencakup ban
    // belakang sekaligus ban cadangan.
    if (isSerap && other) return "campuran"
    if (isSerap) return "serap"
    if (isDepan && isBelakang) return "campuran"
    if (isDepan) return "depan"
    if (isBelakang) return "belakang"
    return null
}

/**
 * Jumlah ban dari teks. Pola yang dipakai di lapangan sangat beragam
 * ("2 PCS GANTI BAN", "2PCS", "3 BH", "GANTI BAN 2 RODA"), jadi yang dicari
 * adalah angka yang menempel pada satuan ban/roda. Bila tidak ada angka,
 * teks dianggap satu pekerjaan tanpa jumlah eksplisit (qty 1) — bukan 0,
 * karena "GANTI BAN" jelas berarti ada ban yang diganti.
 */
export function banQty(text: string | null | undefined): number {
    const t = normalize(text ?? "")
    // Jumlah eksplisit: "2 pcs", "3bh", "4 bh", "2 buah"
    const explicit = /(\d+)\s*(pcs|pc|bh|buah|unit|roda)\b/.exec(t)
    if (explicit && isPlausibleQty(parseInt(explicit[1], 10))) return parseInt(explicit[1], 10)
    // "GANTI BAN 2" - angka di sebelah kata ban
    const afterBan = /\bban\b[^a-z0-9]{0,4}(\d+)\b/.exec(t)
    if (afterBan && isPlausibleQty(parseInt(afterBan[1], 10))) return parseInt(afterBan[1], 10)
    return isBanText(t) ? 1 : 0
}

/**
 * Batas wajar jumlah ban per satu entri. Tanpa batas ini, ukuran ban yang
 * ikut tertulis pada catatan ("ONGKOS PASANG BAN 175-65-14") akan dibaca
 * seolah 175 ban terpasang.
 */
function isPlausibleQty(n: number): boolean {
    return Number.isFinite(n) && n > 0 && n <= 10
}

/* ============================================================================
 * PEMETAAN KE RODA FISIK (dipakai peta ban interaktif)
 * ---------------------------------------------------------------------------
 * `banPosition` di atas menjawab "depan atau belakang", tapi peta ban harus
 * tahu persis roda mana: kiri atau kanan. Semua pembacaan ini tetap dari
 * teks uraian yang sama, jadi tidak ada angka yang dikarang.
 * ========================================================================== */

/** Sisi roda yang disebut pada teks. */
export type BanWheelSide = "kiri" | "kanan"

/** Roda/ban fisik pada satu unit — satu titik klik di peta ban. */
export type BanWheelSlot = 
  | "depan-kiri"
  | "depan-kanan"
  | "belakang-kiri-dalam"
  | "belakang-kiri-luar"
  | "belakang-kanan-dalam"
  | "belakang-kanan-luar"
  | "serap";

/** Urutan tetap slot — dipakai gambar ban dan peta hotspot. */
export const BAN_WHEEL_SLOT_ORDER: BanWheelSlot[] = [
    "depan-kiri",
    "depan-kanan",
    "belakang-kiri-luar",
    "belakang-kiri-dalam",
    "belakang-kanan-dalam",
    "belakang-kanan-luar",
    "serap",
];

export const BAN_WHEEL_SLOT_LABELS: Record<BanWheelSlot, string> = {
    "depan-kiri": "Depan kiri",
    "depan-kanan": "Depan kanan",
    "belakang-kiri-luar": "Belakang kiri luar",
    "belakang-kiri-dalam": "Belakang kiri dalam",
    "belakang-kanan-dalam": "Belakang kanan dalam",
    "belakang-kanan-luar": "Belakang kanan luar",
    serap: "Ban serap",
};
/**
 * Sisi roda yang disebut: "kiri"/"left"/"lhs", "kanan"/"right"/"rhs", atau
 * sekaligus dua-duanya ("L/R" — lazim dipakai di bengkel). Mengembalikan
 * array kosong bila tidak disebut sama sekali, dan itu berarti penting:
 * catatan tanpa sisi tidak boleh dipaksa ke satu roda.
 */
export function banWheelSides(text: string | null | undefined): BanWheelSide[] {
    const t = normalize(text ?? "")
    const both = /\bl\s*\/\s*r\b/.test(t) || /\blr\b/.test(t)
    const sides = new Set<BanWheelSide>()
    if (both || /\b(kiri|left|lhs|lf)\b/.test(t)) sides.add("kiri")
    if (both || /\b(kanan|right|rhs|rf)\b/.test(t)) sides.add("kanan")
    // Urutan kiri lalu kanan supaya urutannya stabil untuk seluruh aplikasi.
    return (["kiri", "kanan"] as BanWheelSide[]).filter((s) => sides.has(s))
}

/**
 * Slot roda yang tersentuh satu catatan. Mengembalikan array kosong bila teks
 * tidak menyebut posisi/sisi sama sekali (mis. "GANTI BAN") — catatan seperti
 * itu tidak boleh menempel ke roda tertentu hanya supaya peta terlihat penuh.
 *
 * Catatan tanpa sisi ("GANTI BAN DEPAN") tetap masuk ke kedua roda depan,
 * dan jumlah/qty-nya ikut terhitung di keduanya. Itu memang menggandakan
 * angka, jadi `BanSlotPoint.unspecifiedEntries` menandainya supaya UI bisa
 * mengatakannya terus terang, bukan diamkan saja.
 */
export function banWheelSlots(text: string | null | undefined): BanWheelSlot[] {
    const t = normalize(text ?? "")
    const isSerap = /\b(serap|cadangan|spare)\b/.test(t)
    const isDepan = /\b(depan|dpn|front)\b/.test(t)
    const isBelakang = /\b(belakang|blk|blkg|bklg|rear)\b/.test(t)
    const sides = banWheelSides(t)
    // Tanpa keterangan sisi, satu catatan dianggap untuk kedua roda axle itu.
    const axleSides: BanWheelSide[] = sides.length > 0 ? sides : ["kiri", "kanan"]
    const slots: BanWheelSlot[] = []
    if (isDepan) for (const s of axleSides) slots.push(`depan-${s}` as BanWheelSlot)
    if (isBelakang) for (const s of axleSides) slots.push(`belakang-${s}` as BanWheelSlot)
    // Ban serap bisa disebut berdampingan dengan posisi lain
    // ("GANTI BAN BELAKANG KIRI 2PCS BAN SERAP 1PCS"), jadi selalu ikut.
    if (isSerap) slots.push("serap")
    return slots
}

export interface BanSlotPoint {
    slot: BanWheelSlot
    /** Jumlah entri yang menyebut roda ini */
    entries: number
    /** Total biaya entri-entri tersebut */
    cost: number
    /** Jumlah ban yang disebut pada entri-entri tersebut */
    qty: number
    first: string | null
    last: string | null
    /**
     * Entri yang tidak menyebut sisi ("GANTI BAN DEPAN") sehingga dihitung
     * untuk kedua roda axle. UI wajib menyebut ini supaya angka yang
     * terduplikasi terlihat apa adanya.
     */
    unspecifiedEntries: number
    /** Pecahan biaya per jenis pekerjaan */
    byCategory: Record<BanCategory, number>
    /** Catatan sumbernya, urut terbaru lebih dulu saat dirender */
    rows: BanRow[]
}

function emptySlotPoint(slot: BanWheelSlot): BanSlotPoint {
    return {
        slot,
        entries: 0,
        cost: 0,
        qty: 0,
        first: null,
        last: null,
        unspecifiedEntries: 0,
        byCategory: { ganti: 0, perbaikan: 0, aksesori: 0, lainnya: 0 },
        rows: [],
    }
}

/**
 * Pecah catatan ban ke roda fisiknya. Satu catatan bisa masuk ke beberapa
 * roda sekaligus (mis. "BELAKANG L/R"), jadi `rows` pada tiap slot boleh
 * saling berbagi baris yang sama.
 */
export function banBySlot(rows: BanRow[]): Record<BanWheelSlot, BanSlotPoint> {
    const out = {} as Record<BanWheelSlot, BanSlotPoint>
    for (const slot of BAN_WHEEL_SLOT_ORDER) out[slot] = emptySlotPoint(slot)
    for (const r of rows ?? []) {
        const slots = banWheelSlots(r.item)
        if (slots.length === 0) continue
        const sides = banWheelSides(r.item)
        for (const slot of slots) {
            const p = out[slot]
            p.entries += 1
            p.cost += r.cost
            p.qty += r.qty
            p.rows.push(r)
            p.byCategory[r.category] += r.cost
            if (sides.length === 0) p.unspecifiedEntries += 1
            if (r.iso) {
                if (p.first == null || r.iso < p.first) p.first = r.iso
                if (p.last == null || r.iso > p.last) p.last = r.iso
            }
        }
    }
    return out
}

/** Catatan ban yang tidak bisa dikaitkan ke roda tertentu. */
export function banWithoutSlot(rows: BanRow[]): BanRow[] {
    return (rows ?? []).filter((r) => banWheelSlots(r.item).length === 0)
}

/** Inner/outer — hanya bermakna untuk ban dalam yang berpasangan. */
export function banSide(text: string | null | undefined): "dalam" | "luar" | null {
    const t = normalize(text ?? "")
    if (/\b(dlm|dalam|inner|in)\b/.test(t)) return "dalam"
    if (/\b(luar|outer|out)\b/.test(t)) return "luar"
    return null
}

/** Ubah timestamp/date dari database ke ISO hari (WIB). */
function toIsoDay(value: string | null | undefined): string | null {
    if (!value) return null
    const raw = String(value).trim()
    if (!raw) return null
    // Sudah YYYY-MM-DD (kolom tanggal bertipe date) - langsung pakai.
    const direct = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
    if (direct) return direct[1]
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return null
    // Geser ke WIB supaya tanggal tidak bergeser sehari di perangkat
    // pengguna yang berada di zona waktu lain.
    const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000)
    return shifted.toISOString().slice(0, 10)
}

/** Ubah satu baris riwayat menjadi baris ban — atau null bila bukan soal ban. */
export function toBanRow(row: any): BanRow | null {
    const item = String(row?.nama_barang_atau_jasa ?? "")
    if (!isBanText(item)) return null
    const iso = toIsoDay(row?.tanggal)
    return {
        row,
        iso,
        plat: String(row?.license_plate ?? "").trim(),
        unit: String(row?.equipment_id ?? "").trim(),
        item: item.trim(),
        cost: Number(row?.jumlah_harga) || 0,
        category: banCategory(item),
        position: banPosition(item),
        qty: banQty(item),
        side: banSide(item),
    }
}

/** Saring sekumpulan baris riwayat menjadi baris ban saja. */
export function toBanRows(rows: any[]): BanRow[] {
    const out: BanRow[] = []
    for (const row of rows ?? []) {
        const parsed = toBanRow(row)
        if (parsed) out.push(parsed)
    }
    return out
}

export interface BanTotals {
    /** Jumlah entri ban */
    entries: number
    /** Total biaya ban */
    cost: number
    /** Total ban terpasang (dari teks) */
    qty: number
    /** Rata-rata biaya per entri */
    avgPerEntry: number
    /** Rata-rata biaya per ban */
    avgPerBan: number
    /** Jumlah unit (plat/equipment) yang tersentuh */
    units: number
    /** Tanggal paling awal & terbaru (ISO) */
    first: string | null
    last: string | null
    /** Pecahan per kategori */
    byCategory: Record<BanCategory, number>
}

export function banTotals(rows: BanRow[]): BanTotals {
    let cost = 0
    let qty = 0
    let first: string | null = null
    let last: string | null = null
    const units = new Set<string>()
    const byCategory: Record<BanCategory, number> = {
        ganti: 0,
        perbaikan: 0,
        aksesori: 0,
        lainnya: 0,
    }
    for (const r of rows) {
        cost += r.cost
        qty += r.qty
        byCategory[r.category] += r.cost
        const key = r.plat || r.unit
        if (key) units.add(key)
        if (r.iso) {
            if (first == null || r.iso < first) first = r.iso
            if (last == null || r.iso > last) last = r.iso
        }
    }
    return {
        entries: rows.length,
        cost,
        qty,
        avgPerEntry: rows.length > 0 ? cost / rows.length : 0,
        avgPerBan: qty > 0 ? cost / qty : 0,
        units: units.size,
        first,
        last,
        byCategory,
    }
}

export interface BanMonthlyPoint {
    /** Kunci bulan YYYY-MM */
    key: string
    /** Label siap tampil, mis. "Sep 2026" */
    label: string
    entries: number
    cost: number
    qty: number
}

function monthLabel(key: string): string {
    const [y, m] = key.split("-").map(Number)
    const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
    if (Number.isNaN(d.getTime())) return key
    return d.toLocaleDateString("id-ID", { month: "short", year: "numeric", timeZone: "UTC" })
}

/** Deret bulanan untuk tren biaya ban (naik kronologis). */
export function banMonthly(rows: BanRow[]): BanMonthlyPoint[] {
    const m = new Map<string, { entries: number; cost: number; qty: number }>()
    for (const r of rows) {
        if (!r.iso) continue
        const key = r.iso.slice(0, 7)
        const prev = m.get(key)
        if (prev) {
            prev.entries += 1
            prev.cost += r.cost
            prev.qty += r.qty
        } else {
            m.set(key, { entries: 1, cost: r.cost, qty: r.qty })
        }
    }
    return [...m.entries()]
        .map(([key, v]) => ({ key, label: monthLabel(key), ...v }))
        .sort((a, b) => (a.key < b.key ? -1 : 1))
}

export interface BanUnitPoint {
    key: string
    plat: string
    unit: string
    entries: number
    cost: number
    qty: number
    /** Tanggal ganti ban terakhir yang tercatat */
    last: string | null
}

/** Rangking unit berdasarkan biaya ban. */
export function banByUnit(rows: BanRow[], limit = 5): BanUnitPoint[] {
    const m = new Map<string, BanUnitPoint>()
    for (const r of rows) {
        const key = r.plat || r.unit || "(tanpa plat)"
        const prev = m.get(key)
        if (prev) {
            prev.entries += 1
            prev.cost += r.cost
            prev.qty += r.qty
            if (r.iso && (prev.last == null || r.iso > prev.last)) prev.last = r.iso
        } else {
            m.set(key, {
                key,
                plat: r.plat,
                unit: r.unit,
                entries: 1,
                cost: r.cost,
                qty: r.qty,
                last: r.iso,
            })
        }
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost).slice(0, limit)
}

export const BAN_CATEGORY_LABELS: Record<BanCategory, string> = {
    ganti: "Ganti ban",
    perbaikan: "Perbaikan / roker",
    aksesori: "Aksesori",
    lainnya: "Lainnya",
}

export const BAN_POSITION_LABELS: Record<BanPosition, string> = {
    depan: "Depan",
    belakang: "Belakang",
    serap: "Serap",
    campuran: "Depan + belakang",
}
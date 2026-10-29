"use client"

import React, { useMemo } from "react"
import {
  ArrowUpRight,
  BarChart3,
  CircleDot,
  CloudRain,
  FileText,
  Gauge,
  History,
  Map as MapIcon,
  PackageCheck,
  Truck,
  type LucideIcon,
} from "lucide-react"
import { compactRupiah } from "@/lib/format"
import { outboundStatus } from "@/lib/outbound-status"
import { evaluateServiceStatus } from "@/lib/service-status"
import type { View } from "@/components/templates/dashboard-layout"

/**
 * Kartu ringkasan menü di dashboard — satu kartu mewakili satu menu.
 *
 * ── Kenapa komponen ini ada ──
 *
 * Dashboard berbasis angka agregat sendiri, tapi semakin banyak menu dibuat,
 * semakin sulit pengguna menemukan "apa kondisi data di menu yang jarang
 * dibuka". Baris kartu ini menjawab kebutuhan itu: tiap menu punya satu
 * kartu dengan metrik inti menu tersebut, dan klik kartu langsung membuka
 * menunya (kehilangan waktu berpindah sama sekali).
 *
 * ── Sumber data ──
 *
 * Kartu Equipment/Monitoring/Histories/Ban dihitung dari dataset yang memang
 * sudah termuat saat dashboard dibuka (equipments, histories, serviceLogs)
 * — tanpa query tambahan. Kartu SKR & Pengiriman memakai dataset yang
 * di-hydratasi terpisah oleh halaman induk (defer, sekali per sesi), jadi
 * kartu tetap solid saat datanya belum turun.
 */

interface DashboardMenuCardsProps {
  equipments: any[]
  histories: any[]
  serviceLogs: any[]
  outbounds: any[]
  skrDetails: any[]
  /** gagalnya hydrate fetch — kartu jujur bilang, bukan diam angka nol */
  skrError?: string | null
  outboundError?: string | null
  onNavigate?: (view: View) => void
}

interface MenuCardStat {
  view: View
  title: string
  icon: LucideIcon
  /** Metrik utama kartu (nilai besar) */
  primary: string
  /** Konteks di bawah metrik utama */
  hint: string
  /** Baris metrik tambahan (label : nilai) */
  rows: { label: string; value: string }[]
  /** true bila kartu memakai data yang belum dijamin termuat saat dashboard */
  deferred?: boolean
}

function MenuCardStatCard({
  stat,
  onNavigate,
}: {
  stat: MenuCardStat
  onNavigate?: (view: View) => void
}) {
  const Icon = stat.icon
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(stat.view)}
      className="group flex flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:translate-y-0"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium">{stat.title}</span>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <p className="mt-3 text-xl font-semibold tabular-nums leading-none">{stat.primary}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{stat.hint}</p>

      {stat.rows.length > 0 && (
        <dl className="mt-3 space-y-1 border-t pt-2 text-xs">
          {stat.rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <dt className="truncate text-muted-foreground">{row.label}</dt>
              <dd className="shrink-0 font-mono tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </button>
  )
}

/** Unit yang masuk ke kartu Monitoring: penuh log servis masih dinilai. */
function monitoringCounts(equipments: any[], serviceLogs: any[]) {
  // Log terbaru per unit — evaluasi butuh SATU log terbaru saja
  const latestByUnit = new Map<string, any>()
  for (const log of serviceLogs) {
    const key = String(log.equipment_id ?? "")
    if (!key) continue
    const prev = latestByUnit.get(key)
    if (!prev || new Date(log.service_date ?? 0) > new Date(prev.service_date ?? 0)) {
      latestByUnit.set(key, log)
    }
  }
  let safe = 0
  let warning = 0
  let overdue = 0
  let none = 0
  for (const eq of equipments) {
    const status = evaluateServiceStatus(eq, latestByUnit.get(String(eq.equipment_id ?? ""))).id
    if (status === "safe") safe += 1
    else if (status === "warning") warning += 1
    else if (status === "overdue") overdue += 1
    else none += 1
  }
  return { safe, warning, overdue, none }
}

export function DashboardMenuCards({
  equipments,
  histories,
  serviceLogs,
  outbounds,
  skrDetails,
  skrError,
  outboundError,
  onNavigate,
}: DashboardMenuCardsProps) {
  const now = Date.now()
  const monthMs = 30 * 86_400_000

  const stats = useMemo<MenuCardStat[]>(() => {
    // ── Equipment ──
    const totalUnit = equipments.length
    const availableCount = equipments.filter((e) => e.status === "Available").length

    // Data tambahan yang TIDAK ada di baris KPI dashboard (guo nggak mau
    // ada angka yang muncul dua kali bersebelahan: baris KPI = wajah
    // armada, kartu menu = detail spesifik menunya).
    const unitsWithHistory = new Set<string>()
    let totalEntries = 0
    let entries30 = 0
    let totalCost = 0
    let newestDate: number | null = null
    let newestYear: number | null = null
    for (const h of histories) {
      const time = new Date(h.tanggal).getTime()
      const unit = String(h.equipment_id ?? "").trim()
      if (unit) unitsWithHistory.add(unit)
      if (Number.isNaN(time)) continue
      totalEntries += 1
      totalCost += Number(h.jumlah_harga) || 0
      if (now - time <= monthMs) entries30 += 1
      if (newestDate === null || time > newestDate) newestDate = time
    }
    for (const eq of equipments) {
      const year = Number(eq.construction_year)
      if (Number.isFinite(year) && year > 1900 && (newestYear === null || year > newestYear)) {
        newestYear = year
      }
    }
    const withoutHistory = totalUnit - unitsWithHistory.size

    // ── Monitoring: angka overdue TIDAK diulang di sini — sudah ada sebagai
    //    tile KPI "Servis terlewat". Kartu ini fokus ke antrean ke depan.
    const mon = monitoringCounts(equipments, serviceLogs)

    // ── SKR (data deferred — bisa kosong sebelum hydrate) ──
    let skrDocs = skrDetails.length
    let skrQty = 0
    let skrNilai = 0
    const skrStores = new Set<string>()
    for (const r of skrDetails) {
      skrQty += Number(r.qty) || 0
      skrNilai += Number(r.nilai) || 0
      if (r.customer_id != null) skrStores.add(String(r.customer_id).trim())
    }

    // ── Pengiriman (data deferred — bisa kosong sebelum hydrate) ──
    let foCount = outbounds.length
    let selesai = 0
    let berjalan = 0
    let menunggu = 0
    for (const o of outbounds) {
      const info = outboundStatus(o.jam_out, o.jam_in)
      if (info.status === "selesai") selesai += 1
      else if (info.status === "berjalan") berjalan += 1
      else menunggu += 1
    }

    // ── Analisa Ban: entri yang urainya menyebut ban (6 bulan) ──
    let banEntries = 0
    let banCost6m = 0
    const cutoff6m = now - 182 * 86_400_000
    for (const h of histories) {
      const time = new Date(h.tanggal).getTime()
      if (Number.isNaN(time) || time < cutoff6m) continue
      if (String(h.nama_barang_atau_jasa ?? "").toLowerCase().includes("ban")) {
        banEntries += 1
        banCost6m += Number(h.jumlah_harga) || 0
      }
    }

    return [
      // Equipment: BUKAN total unit / % available (itu tile KPI). Kartu ini
      // menyajikan sisi operasional: unit yang sedang tidak siap + data unit
      // yang tidak terlihat di KPI mana pun.
      {
        view: "equipment",
        title: "Equipment",
        icon: Truck,
        primary: `${(totalUnit - availableCount).toLocaleString("id-ID")} unit`,
        hint: "sedang tidak siap (in use / maintenance)",
        rows: [
          { label: "Tanpa riwayat", value: withoutHistory.toLocaleString("id-ID") },
          { label: "Tahun terbaru", value: newestYear !== null ? String(newestYear) : "—" },
        ],
      },
      {
        view: "monitoring",
        title: "Monitoring",
        icon: Gauge,
        primary: `${mon.warning.toLocaleString("id-ID")} segera`,
        hint: "servis dalam 14 hari ke depan",
        rows: [
          { label: "Aman", value: mon.safe.toLocaleString("id-ID") },
          { label: "Tanpa jadwal", value: mon.none.toLocaleString("id-ID") },
        ],
      },
      {
        view: "maintenance",
        title: "Histories",
        icon: History,
        primary: `${totalEntries.toLocaleString("id-ID")} entri`,
        hint: "seluruh riwayat perbaikan",
        rows: [
          { label: "Entri 30 hari", value: entries30.toLocaleString("id-ID") },
          // Dua nilai ini pindah dari baris KPI yang dihapus — biar tetap
          // ada tempatnya tanpa jadi kartu terpisah.
          { label: "Total biaya", value: compactRupiah(totalCost) },
          {
            label: "Rata-rata / unit",
            value: totalUnit > 0 ? compactRupiah(totalCost / totalUnit) : "—",
          },
          {
            label: "Servis terakhir",
            value: newestDate
              ? new Date(newestDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
              : "—",
          },
        ],
      },
      {
        view: "skr",
        title: "SKR",
        icon: FileText,
        primary: `${skrDocs.toLocaleString("id-ID")} dok`,
        hint: skrError
          ? "gagal memuat — buka menu untuk coba lagi"
          : skrDocs > 0
            ? "sisa kiriman 30 hari"
            : "memuat otomatis…",
        deferred: true,
        rows: [
          { label: "Qty baris", value: skrQty.toLocaleString("id-ID") },
          { label: "Nilai", value: compactRupiah(skrNilai) },
          { label: "Toko", value: skrStores.size.toLocaleString("id-ID") },
        ],
      },
      {
        view: "pengiriman",
        title: "Pengiriman",
        icon: PackageCheck,
        primary: `${foCount.toLocaleString("id-ID")} FO`,
        hint: outboundError
          ? "gagal memuat — buka menu untuk coba lagi"
          : foCount > 0
            ? "freight order 30 hari"
            : "memuat otomatis…",
        deferred: true,
        rows: [
          { label: "Selesai", value: selesai.toLocaleString("id-ID") },
          { label: "Berjalan", value: berjalan.toLocaleString("id-ID") },
          { label: "Menunggu", value: menunggu.toLocaleString("id-ID") },
        ],
      },
      {
        view: "ban",
        title: "Analisa Ban",
        icon: CircleDot,
        primary: compactRupiah(banCost6m),
        hint: "biaya ban 6 bulan terakhir",
        rows: [{ label: "Entri ban", value: banEntries.toLocaleString("id-ID") }],
      },
      {
        view: "analisa",
        title: "Analisa",
        icon: BarChart3,
        primary: skrDocs > 0 || foCount > 0 ? `${skrDocs.toLocaleString("id-ID")} + ${foCount.toLocaleString("id-ID")}` : "—",
        hint: "dokumen SKR + FO 30 hari (bahan KPI)",
        deferred: true,
        rows: [],
      },
      {
        view: "weather",
        title: "Perkiraan Cuaca",
        icon: CloudRain,
        primary: "7 hari",
        hint: "prakiraan pool & kecamatan Rokan Hilir",
        rows: [{ label: "Cakupan", value: "3 pool utama" }],
      },
      {
        view: "traffic",
        title: "Lalu Lintas",
        icon: MapIcon,
        primary: "Rute aktif",
        hint: "pantau kemacetan rute pengiriman",
        rows: [],
      },
    ]
  }, [equipments, histories, serviceLogs, outbounds, skrDetails, now, monthMs])

  return (
    <section aria-label="Ringkasan setiap menu">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Ringkasan menu
        </h3>
        <span className="text-xs text-muted-foreground">klik kartu untuk membuka menunya</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <MenuCardStatCard key={stat.view} stat={stat} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  )
}

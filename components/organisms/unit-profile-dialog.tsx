"use client"

import React, { useMemo } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    CircleDot,
    FileText,
    Moon,
    PackageCheck,
    ReceiptText,
    Timer,
    Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
    compactRupiah,
    formatDateMedium,
    formatNumber,
    formatRupiah,
    startOfZonedDay,
} from "@/lib/format"
import {
    evaluateServiceStatus,
    remainingDaysLabel,
    remainingKmLabel,
} from "@/lib/service-status"
import {
    durationMinutesFromTimestamps,
    formatDuration,
    isOutboundLate,
    isOutboundOvernight,
    outboundStatus,
    OUTBOUND_LATE_HOURS,
} from "@/lib/outbound-status"
import { unitStatusTone, unitStatusLabel } from "@/lib/unit-status"

/**
 * Profil unit 360° — satu tempat untuk semua yang diketahui sistem tentang
 * satu unit: jadwal servis, riwayat perbaikan, biaya, ban, dan pengiriman.
 *
 * Dipakai bersama oleh menu Equipment, Monitoring Servis, dan Pengiriman
 * supaya user tidak perlu berpindah menu untuk menjawab "unit ini kenapa?".
 * Komponen ini murni membaca data yang sudah dimuat halaman induk — tanpa
 * query tambahan.
 */

interface UnitProfileDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    equipment: any | null
    histories: any[]
    serviceLogs: any[]
    outbounds: any[]
}

const DAY_MS = 86_400_000

/** Nopol bisa beda spasi/huruf besar-kecil antar tabel — samakan dulu. */
function normalizePlate(value: any): string {
    return String(value ?? "").replace(/\s+/g, "").toUpperCase()
}

function costOf(row: any): number {
    return Number(row?.jumlah_harga) || 0
}

function timeOf(row: any, key = "tanggal"): number {
    const t = new Date(row?.[key] ?? 0).getTime()
    return Number.isNaN(t) ? 0 : t
}

function MiniStat({
    label,
    value,
    hint,
    tone,
}: {
    label: string
    value: string
    hint?: string
    tone?: "danger" | "warning" | "safe"
}) {
    return (
        <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {label}
            </p>
            <p
                className={cn(
                    "mt-1.5 truncate text-lg font-semibold leading-none tabular-nums",
                    tone === "danger"
                        ? "text-destructive"
                        : tone === "warning"
                          ? "text-amber-600 dark:text-amber-400"
                          : tone === "safe"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-foreground",
                )}
            >
                {value}
            </p>
            {hint && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
            )}
        </div>
    )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
    return (
        <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            {children}
        </p>
    )
}

export function UnitProfileDialog({
    open,
    onOpenChange,
    equipment,
    histories,
    serviceLogs,
    outbounds,
}: UnitProfileDialogProps) {
    const data = useMemo(() => {
        if (!equipment) return null

        const equipmentId = String(equipment.equipment_id ?? "").trim()
        const plate = normalizePlate(equipment.license_plate)
        const now = Date.now()
        const cutoff30 = startOfZonedDay(new Date(now)) - 30 * DAY_MS
        const cutoff90 = startOfZonedDay(new Date(now)) - 90 * DAY_MS
        const cutoff6m = startOfZonedDay(new Date(now)) - 182 * DAY_MS

        const unitHistory = histories
            .filter((h) => String(h.equipment_id ?? "").trim() === equipmentId)
            .sort((a, b) => timeOf(b) - timeOf(a))

        const unitService = serviceLogs
            .filter((s) => String(s.equipment_id ?? "").trim() === equipmentId)
            .sort((a, b) => timeOf(b, "service_date") - timeOf(a, "service_date"))

        const latestService = unitService[0] ?? null
        const status = evaluateServiceStatus(equipment, latestService)

        const unitOutbound = plate
            ? outbounds
                  .filter((o) => normalizePlate(o.no_polisi) === plate)
                  .sort(
                      (a, b) =>
                          Math.max(timeOf(b, "jam_out"), timeOf(b, "created_at")) -
                          Math.max(timeOf(a, "jam_out"), timeOf(a, "created_at")),
                  )
            : []

        let totalCost = 0
        let cost30 = 0
        let cost90 = 0
        const byItem = new Map<string, { total: number; count: number }>()
        for (const h of unitHistory) {
            const cost = costOf(h)
            const time = timeOf(h)
            totalCost += cost
            if (time >= cutoff30) cost30 += cost
            if (time >= cutoff90) cost90 += cost
            const name = String(h.nama_barang_atau_jasa ?? "").trim()
            if (!name) continue
            const prev = byItem.get(name)
            if (prev) {
                prev.total += cost
                prev.count += 1
            } else {
                byItem.set(name, { total: cost, count: 1 })
            }
        }

        const topItems = Array.from(byItem.entries())
            .map(([name, v]) => ({ name, total: v.total, count: v.count }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)

        const banEntries = unitHistory.filter((h) =>
            /ban/i.test(String(h.nama_barang_atau_jasa ?? "")),
        )
        let banCost6m = 0
        for (const b of banEntries) {
            if (timeOf(b) >= cutoff6m) banCost6m += costOf(b)
        }

        let selesai = 0
        let berjalan = 0
        let terlambat = 0
        // Menginap = trip keluar >= 24 jam, baik yang sudah selesai (histori)
        // maupun yang masih berjalan. Inilah angka yang dipakai user untuk
        // menghitung berapa kali satu unit bermalam di jalan.
        let menginap = 0
        const durations: number[] = []
        for (const o of unitOutbound) {
            const info = outboundStatus(o.jam_out, o.jam_in)
            if (info.status === "selesai") selesai += 1
            else if (info.status === "berjalan") {
                berjalan += 1
                if (isOutboundLate(o.jam_out, o.jam_in, now)) terlambat += 1
            }
            if (isOutboundOvernight(o.jam_out, o.jam_in, now)) menginap += 1
            const dur = durationMinutesFromTimestamps(o.jam_out, o.jam_in)
            if (dur != null) durations.push(dur)
        }

        return {
            equipmentId,
            status,
            unitHistory,
            unitService,
            latestService,
            unitOutbound,
            totalCost,
            cost30,
            cost90,
            topItems,
            banEntries,
            banCost6m,
            selesai,
            berjalan,
            terlambat,
            menginap,
            avgDuration:
                durations.length > 0
                    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
                    : null,
        }
    }, [equipment, histories, serviceLogs, outbounds])

    if (!equipment || !data) return null

    const tone = unitStatusTone(equipment.status)
    const status = data.status

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
                <DialogHeader className="shrink-0 border-b bg-gradient-to-br from-primary/[0.06] via-card to-card py-4 pl-5 pr-12 text-left">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs font-semibold">
                                    {equipment.license_plate || "—"}
                                </span>
                                <DialogTitle className="text-base font-semibold tracking-tight">
                                    {data.equipmentId}
                                </DialogTitle>
                                <Badge variant="outline" className={cn("gap-1.5", tone.badge)}>
                                    <span className={cn("h-1.5 w-1.5 rounded-[1px]", tone.dot)} />
                                    {unitStatusLabel(equipment.status)}
                                </Badge>
                            </div>
                            <DialogDescription className="mt-1.5 line-clamp-2 text-xs">
                                {equipment.description || "Tanpa deskripsi"}
                            </DialogDescription>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                            {equipment.company_code && (
                                <Badge variant="outline" className="bg-background">
                                    {equipment.company_code}
                                </Badge>
                            )}
                            {equipment.type_vehicle && (
                                <Badge variant="outline" className="bg-background">
                                    {equipment.type_vehicle}
                                </Badge>
                            )}
                            {equipment.construction_year && (
                                <Badge variant="outline" className="bg-background">
                                    {equipment.construction_year}
                                </Badge>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <Tabs defaultValue="ringkasan" className="flex min-h-0 flex-1 flex-col gap-0">
                    <div className="border-b px-3 py-2">
                        <TabsList className="h-9 w-full justify-start overflow-x-auto bg-muted/50 p-[3px]">
                            <TabsTrigger value="ringkasan" className="flex-none px-3">
                                Ringkasan
                            </TabsTrigger>
                            <TabsTrigger value="servis" className="flex-none px-3">
                                Servis ({data.unitService.length})
                            </TabsTrigger>
                            <TabsTrigger value="biaya" className="flex-none px-3">
                                Biaya ({data.unitHistory.length})
                            </TabsTrigger>
                            <TabsTrigger value="ban" className="flex-none px-3">
                                Ban ({data.banEntries.length})
                            </TabsTrigger>
                            <TabsTrigger value="pengiriman" className="flex-none px-3">
                                Pengiriman ({data.unitOutbound.length})
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {/* ── RINGKASAN ─────────────────────────────── */}
                        <TabsContent value="ringkasan" className="mt-0 space-y-4">
                            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                                <MiniStat
                                    label="Odometer"
                                    value={`${formatNumber(Number(equipment.last_odometer ?? 0))} km`}
                                    hint={data.latestService?.service_date ? `Servis terakhir ${formatDateMedium(data.latestService.service_date)}` : "Belum ada log servis"}
                                />
                                <MiniStat
                                    label="Total biaya"
                                    value={compactRupiah(data.totalCost)}
                                    hint={`${formatNumber(data.unitHistory.length)} entri perbaikan`}
                                />
                                <MiniStat
                                    label="Biaya 30 hari"
                                    value={compactRupiah(data.cost30)}
                                    hint={`90 hari ${compactRupiah(data.cost90)}`}
                                />
                                <MiniStat
                                    label="Biaya ban 6 bln"
                                    value={compactRupiah(data.banCost6m)}
                                    hint={`${formatNumber(data.banEntries.length)} penggantian`}
                                />
                            </div>

                            <div className="grid gap-3 lg:grid-cols-2">
                                <div className="rounded-xl border border-border/70 bg-card p-4">
                                    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                        <Wrench className="h-3.5 w-3.5" /> Jadwal servis
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className={cn("gap-1.5", status.tone.badge)}>
                                            <span className={cn("h-1.5 w-1.5 rounded-[1px]", status.tone.dot)} />
                                            {status.label}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {remainingDaysLabel(status.remainingDays)} · {remainingKmLabel(status.remainingKm)}
                                        </span>
                                    </div>
                                    {data.latestService ? (
                                        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <dt className="text-muted-foreground">Servis berikutnya</dt>
                                                <dd className="mt-0.5 font-medium tabular-nums">
                                                    {data.latestService.next_service_date
                                                        ? formatDateMedium(data.latestService.next_service_date)
                                                        : "—"}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-muted-foreground">Target odometer</dt>
                                                <dd className="mt-0.5 font-medium tabular-nums">
                                                    {data.latestService.next_service_odometer != null
                                                        ? `${formatNumber(Number(data.latestService.next_service_odometer))} km`
                                                        : "—"}
                                                </dd>
                                            </div>
                                        </dl>
                                    ) : (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            Unit ini belum punya log servis, jadi jadwal berikutnya belum bisa dihitung.
                                        </p>
                                    )}
                                </div>

                                <div className="rounded-xl border border-border/70 bg-card p-4">
                                    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                        <PackageCheck className="h-3.5 w-3.5" /> Pengiriman
                                    </p>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                                        {[
                                            { label: "Selesai", value: data.selesai, tone: "text-emerald-600 dark:text-emerald-400" },
                                            { label: "Berjalan", value: data.berjalan, tone: "text-amber-600 dark:text-amber-400" },
                                            { label: "Menginap", value: data.menginap, tone: "text-amber-600 dark:text-amber-400" },
                                            { label: "Belum kembali", value: data.terlambat, tone: "text-destructive" },
                                        ].map((item) => (
                                            <div key={item.label} className="rounded-lg border bg-muted/20 py-2">
                                                <p className={cn("text-lg font-semibold leading-none tabular-nums", item.tone)}>
                                                    {formatNumber(item.value)}
                                                </p>
                                                <p className="mt-1 text-[10px] text-muted-foreground">{item.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Timer className="h-3.5 w-3.5" />
                                        Rata-rata durasi {formatDuration(data.avgDuration)}
                                    </p>
                                </div>
                            </div>
                        </TabsContent>

                        {/* ── SERVIS ────────────────────────────────── */}
                        <TabsContent value="servis" className="mt-0 space-y-3">
                            {data.unitService.length > 0 ? (
                                <div className="overflow-hidden rounded-lg border border-border/70">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium">Tgl servis</th>
                                                <th className="px-3 py-2 text-right font-medium">Odo saat servis</th>
                                                <th className="px-3 py-2 text-left font-medium">Jadwal berikut</th>
                                                <th className="px-3 py-2 text-right font-medium">Odo berikut</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {data.unitService.slice(0, 12).map((log, idx) => (
                                                <tr key={`${log.service_date}-${idx}`} className="hover:bg-muted/30">
                                                    <td className="px-3 py-2 tabular-nums">
                                                        {formatDateMedium(log.service_date)}
                                                        {idx === 0 && (
                                                            <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
                                                                terbaru
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {log.odometer_at_service != null
                                                            ? `${formatNumber(Number(log.odometer_at_service))} km`
                                                            : "—"}
                                                    </td>
                                                    <td className="px-3 py-2 tabular-nums">
                                                        {log.next_service_date ? formatDateMedium(log.next_service_date) : "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {log.next_service_odometer != null
                                                            ? `${formatNumber(Number(log.next_service_odometer))} km`
                                                            : "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyNote>Belum ada riwayat servis untuk unit ini.</EmptyNote>
                            )}
                        </TabsContent>

                        {/* ── BIAYA ─────────────────────────────────── */}
                        <TabsContent value="biaya" className="mt-0 space-y-3">
                            <div className="grid grid-cols-3 gap-2.5">
                                <MiniStat label="30 hari" value={compactRupiah(data.cost30)} />
                                <MiniStat label="90 hari" value={compactRupiah(data.cost90)} />
                                <MiniStat label="Sepanjang data" value={compactRupiah(data.totalCost)} />
                            </div>

                            {data.topItems.length > 0 ? (
                                <div className="rounded-lg border border-border/70">
                                    <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                                        <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                            Pengeluaran terbesar
                                        </p>
                                    </div>
                                    <ul className="divide-y">
                                        {data.topItems.map((item) => (
                                            <li key={item.name} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                                <span className="min-w-0 truncate">{item.name}</span>
                                                <span className="shrink-0 text-right">
                                                    <span className="font-mono tabular-nums">{formatRupiah(item.total)}</span>
                                                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                                                        {item.count}×
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <EmptyNote>Belum ada riwayat perbaikan.</EmptyNote>
                            )}

                            {data.unitHistory.length > 0 && (
                                <div className="rounded-lg border border-border/70">
                                    <div className="border-b bg-muted/30 px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                            Entri terakhir
                                        </p>
                                    </div>
                                    <ul className="divide-y">
                                        {data.unitHistory.slice(0, 5).map((h, idx) => (
                                            <li
                                                key={String(h.id ?? `${h.tanggal}-${idx}`)}
                                                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate">{h.nama_barang_atau_jasa || "—"}</span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {formatDateMedium(h.tanggal)}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 font-mono tabular-nums">
                                                    {formatRupiah(costOf(h))}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </TabsContent>

                        {/* ── BAN ───────────────────────────────────── */}
                        <TabsContent value="ban" className="mt-0 space-y-3">
                            <div className="grid grid-cols-2 gap-2.5">
                                <MiniStat
                                    label="Biaya ban 6 bulan"
                                    value={compactRupiah(data.banCost6m)}
                                    hint={`${formatNumber(data.banEntries.length)} entri`}
                                />
                                <MiniStat
                                    label="Penggantian terakhir"
                                    value={data.banEntries[0] ? formatDateMedium(data.banEntries[0].tanggal) : "—"}
                                    hint={data.banEntries[0] ? compactRupiah(costOf(data.banEntries[0])) : "Belum ada"}
                                />
                            </div>

                            {data.banEntries.length > 0 ? (
                                <div className="overflow-hidden rounded-lg border border-border/70">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium">Tanggal</th>
                                                <th className="px-3 py-2 text-left font-medium">Barang / jasa</th>
                                                <th className="px-3 py-2 text-right font-medium">Biaya</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {data.banEntries.slice(0, 8).map((b, idx) => (
                                                <tr key={String(b.id ?? `${b.tanggal}-${idx}`)} className="hover:bg-muted/30">
                                                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                                        {formatDateMedium(b.tanggal)}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className="line-clamp-2">{b.nama_barang_atau_jasa || "—"}</span>
                                                    </td>
                                                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                                                        {formatRupiah(costOf(b))}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyNote>Tidak ada catatan ban untuk unit ini.</EmptyNote>
                            )}
                        </TabsContent>

                        {/* ── PENGIRIMAN ────────────────────────────── */}
                        <TabsContent value="pengiriman" className="mt-0 space-y-3">
                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                <MiniStat label="Total trip" value={formatNumber(data.unitOutbound.length)} />
                                <MiniStat label="Selesai" value={formatNumber(data.selesai)} tone="safe" />
                                <MiniStat
                                    label="Menginap"
                                    value={formatNumber(data.menginap)}
                                    hint={`Trip ${OUTBOUND_LATE_HOURS} jam+`}
                                    tone={data.menginap > 0 ? "warning" : undefined}
                                />
                                <MiniStat
                                    label="Belum kembali"
                                    value={formatNumber(data.terlambat)}
                                    tone={data.terlambat > 0 ? "danger" : undefined}
                                />
                            </div>

                            {data.unitOutbound.length > 0 ? (
                                <div className="overflow-hidden rounded-lg border border-border/70">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium">Freight order</th>
                                                <th className="px-3 py-2 text-left font-medium">Keluar</th>
                                                <th className="px-3 py-2 text-left font-medium">Status</th>
                                                <th className="px-3 py-2 text-right font-medium">Durasi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {data.unitOutbound.slice(0, 10).map((o, idx) => {
                                                const info = outboundStatus(o.jam_out, o.jam_in)
                                                const dur = durationMinutesFromTimestamps(o.jam_out, o.jam_in)
                                                const menginap = isOutboundOvernight(o.jam_out, o.jam_in)
                                                return (
                                                    <tr key={`${o.freight_order ?? idx}`} className="hover:bg-muted/30">
                                                        <td className="px-3 py-2 font-mono tabular-nums">
                                                            {o.freight_order ?? "—"}
                                                        </td>
                                                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                                            {o.jam_out ? formatDateMedium(o.jam_out) : "—"}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className="flex flex-wrap items-center gap-1.5">
                                                                <Badge variant="outline" className={info.className}>
                                                                    {info.label}
                                                                </Badge>
                                                                {menginap && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        aria-label={`Menginap: keluar ${OUTBOUND_LATE_HOURS} jam atau lebih`}
                                                                        title={`Menginap — ${info.status === "selesai" ? `trip selesai, durasi ${formatDuration(dur)}` : "belum kembali"}`}
                                                                        className="w-5 shrink-0 justify-center gap-0 border-amber-500/35 bg-amber-500/10 px-0 text-amber-700 dark:text-amber-400"
                                                                    >
                                                                        <Moon className="h-3 w-3" />
                                                                    </Badge>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                                                            {formatDuration(dur)}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyNote>
                                    Belum ada pengiriman tercatat untuk nopol ini pada rentang data aktif.
                                </EmptyNote>
                            )}
                        </TabsContent>
                    </div>
                </Tabs>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
                    <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {data.unitHistory.length > 0 ? <FileText className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                        Data dari riwayat perbaikan, log servis, dan pengiriman yang sudah dimuat.
                    </p>
                    <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Tutup
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

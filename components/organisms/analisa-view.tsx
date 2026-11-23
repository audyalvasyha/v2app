"use client"

import React, { memo, useMemo, useState } from "react"
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    ChevronDown,
    Minus,
    Sparkles,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { compactNilai, formatQty } from "@/lib/skr-status"
import {
    buildKpiSnapshot,
    evalStatus,
    formatPct,
    KPI_MATRIKS,
    localHeadline,
    priorities,
    verdicts,
    worstKpiStatus,
    type AiBrief,
    type KpiStatus,
    type AnalisaSnapshot,
} from "@/lib/analisa-kpi"
import { useAiBrief } from "@/hooks/use-ai-brief"

//──────────────────────────────────────────────────────────────────────────
// ANALISA — Briefing Head of Transport (Wings)
//
// Bahasa visual: dashboard profesional — monokrom, divider hairline,
// status sebagai titik kecil + warna teks fungsional saja. Tanpa gradient,
// tanpa badge pill dekoratif. Semua angka dari lib/analisa-kpi; komponen
// ini hanya presentasi.
//──────────────────────────────────────────────────────────────────────────

interface AnalisaViewProps {
    equipments: any[]
    histories: any[]
    skrRows: any[]
    /** Baris SKR jendela lebih luas (3 bulan) — pembanding 30 hari sebelumnya */
    skrPrevRows: any[]
    outbounds: any[]
    /** Rentang tanggal outbound yang benar-benar di-fetch — pembagi ritase */
    outboundWindow: { from: string; to: string }
    isLoading: boolean
    error: string | null
}

/** Warna fungsional per status — dipakai untuk dot & teks, bukan latar blok. */
const STATUS_COLOR: Record<KpiStatus, string> = {
    aman: "text-emerald-600 dark:text-emerald-400",
    pantau: "text-amber-600 dark:text-amber-400",
    perhatian: "text-destructive",
}
const STATUS_DOT: Record<KpiStatus, string> = {
    aman: "bg-emerald-500",
    pantau: "bg-amber-500",
    perhatian: "bg-destructive",
}
const STATUS_LABEL: Record<KpiStatus, string> = {
    aman: "Aman",
    pantau: "Pantau",
    perhatian: "Perlu perhatian",
}

/* ── Elemen kecil yang dipakai ulang ────────────────────────────────────── */

/** Titik status + label singkat — sinyal rendah, tidak menyontek layar. */
function StatusDot({ status }: { status: KpiStatus }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", STATUS_COLOR[status])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
            {STATUS_LABEL[status]}
        </span>
    )
}

/** Delta sebagai teks kecil berarah — bukan pill. good=null → netral. */
function DeltaText({ text, good }: { text: string; good: boolean | null }) {
    const sign = text.trim().startsWith("+")
    const Icon = sign ? ArrowUpRight : text.trim().startsWith("−") || text.trim().startsWith("-") ? ArrowDownRight : Minus
    const color =
        good === null
            ? "text-muted-foreground"
            : good
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
    return (
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", color)}>
            <Icon className="h-3 w-3" />
            {text.replace("−", "-")}
        </span>
    )
}

/* ── Sel statistik (grid gap-px: divider hairline otomatis) ─────────────── */

function KpiCell({
    label,
    status,
    value,
    delta,
    narrative,
    children,
}: {
    label: string
    status: KpiStatus
    value: string
    delta?: { text: string; good: boolean | null } | null
    narrative: string
    children?: React.ReactNode
}) {
    return (
        <div className="flex flex-col bg-card p-5">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <StatusDot status={status} />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
            <div className="mt-1 min-h-[16px]">
                {delta ? <DeltaText text={delta.text} good={delta.good} /> : <span className="text-xs text-muted-foreground">—</span>}
            </div>
            <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{narrative}</p>
            {children}
        </div>
    )
}

/** Artikel briefing: ringkasan (+sumber) + tabel + prioritas + catatan. */
function BriefingBody({ brief }: { brief: AiBrief }) {
    const briefText = brief.ringkasan ?? brief.answer
    return (
        <div>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <p className="max-w-3xl whitespace-pre-line text-[13px] leading-relaxed text-foreground">{briefText}</p>
                {brief.provider && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                        {brief.provider === "openkey"
                            ? "Sumber: OpenKey"
                            : brief.provider === "gemini"
                                ? "Sumber: Gemini"
                                : "Sumber: data otomatis"}
                    </span>
                )}
            </div>
            {Array.isArray(brief.tabel) && brief.tabel.length > 0 && (
                <div className="mt-5">
                    <Table className="min-w-[560px] text-xs">
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8 px-0 pb-2 pr-3 text-xs">KPI</TableHead>
                                <TableHead className="h-8 px-3 pb-2 text-right text-xs">30 hari</TableHead>
                                <TableHead className="h-8 px-3 pb-2 text-right text-xs">Sebelumnya</TableHead>
                                <TableHead className="h-8 px-3 pb-2 text-right text-xs">Δ</TableHead>
                                <TableHead className="h-8 px-3 pb-2 text-xs">Status</TableHead>
                                <TableHead className="h-8 pb-2 pl-3 pr-0 text-xs">Telaah</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border/60">
                            {brief.tabel.map((row) => (
                                <TableRow key={row.kpi} className="align-top">
                                    <TableCell className="px-0 py-2.5 pr-3 align-top font-medium text-foreground">{row.kpi}</TableCell>
                                    <TableCell className="px-3 py-2.5 text-right align-top tabular-nums text-foreground">{row.nilai}</TableCell>
                                    <TableCell className="px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground">{row.pembanding}</TableCell>
                                    <TableCell className="px-3 py-2.5 text-right align-top tabular-nums text-foreground">{row.perubahan}</TableCell>
                                    <TableCell className="px-3 py-2.5 align-top"><StatusDot status={row.status} /></TableCell>
                                    <TableCell className="whitespace-normal py-2.5 pl-3 pr-0 align-top leading-relaxed text-muted-foreground">{row.telaah}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {Array.isArray(brief.prioritas) && brief.prioritas.length > 0 && (
                <div className="mt-5 border-t border-border/60 pt-4">
                    <p className="text-xs font-medium text-muted-foreground">Prioritas minggu ini</p>
                    <ol className="mt-2.5 space-y-2">
                        {brief.prioritas.map((t, i) => (
                            <li key={i} className="flex gap-3">
                                <span className="w-4 shrink-0 pt-px text-right font-mono text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                                <span className="text-[13px] leading-relaxed text-foreground">{t}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            {brief.catatan && (
                <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                    Catatan: {brief.catatan}
                </p>
            )}
        </div>
    )
}

/**
 * Scorecard KPI resmi Head of Transport — 11 KPI dari matriks resmi.
 *
 * Prinsipnya sama dengan briefing: angka yang dihitung dari data ditampilkan,
 * yang tidak punya datanya ditandai "—" plus keterangan sumber yang dibutuhkan
 * — TIDAK diangker supaya tabel terlihat penuh.
 */
interface ScorecardRow {
    id: string
    nama: string
    bobot: string
    target: string
    /** "—" (tidak ada data), teks aktual, atau aktual sebagian (qty tanpa %) */
    aktual: string
    /** null = tidak dihitung dari data — titik abu, bukan status penilaian */
    status: KpiStatus | null
    sumber: string
}

function buildScorecard(snapshot: AnalisaSnapshot, status: Record<string, KpiStatus>): ScorecardRow[] {
    return KPI_MATRIKS.map((row): ScorecardRow => {
        if (row.id === "redelivery") {
            return {
                ...row,
                aktual: snapshot.redelivery.share == null ? "—" : `${snapshot.redelivery.share.toFixed(2)}%`,
                status: status.redelivery,
            }
        }
        if (row.id === "ritase") {
            return {
                ...row,
                aktual:
                    snapshot.ritase.trips === 0
                        ? "—"
                        : `${snapshot.ritase.perUnitHari.toFixed(2)} trip/unit/hari`,
                status: status.ritase,
            }
        }
        if (row.id === "skr") {
            // Qty absolut tercatat, tapi % resminya butuh total qty kirim (BI).
            return {
                ...row,
                aktual: snapshot.skr.qty > 0 ? `${formatQty(snapshot.skr.qty)} unit · % belum` : "—",
                status: null,
            }
        }
        return { ...row, aktual: "—", status: null }
    })
}

/** Baris scorecard: dot abu untuk yang tanpa data — bukan status aman. */
function ScorecardStatus({ status }: { status: KpiStatus | null }) {
    if (status == null) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                Tanpa data
            </span>
        )
    }
    return <StatusDot status={status} />
}

/* ── View utama ──────────────────────────────────────────────────────────── */

function AnalisaViewImpl({ histories, skrRows, skrPrevRows, outbounds, outboundWindow, isLoading, error }: AnalisaViewProps) {
    /** Detail angka disembunyikan dulu; ringkasan teks selalu tampil. */
    const [detailOpen, setDetailOpen] = useState(false)
    const [showAllScorecard, setShowAllScorecard] = useState(false)

    const snapshot = useMemo(
        () => buildKpiSnapshot(histories, skrRows, skrPrevRows, outbounds, outboundWindow),
        [histories, skrRows, skrPrevRows, outbounds, outboundWindow],
    )
    const status = useMemo(() => evalStatus(snapshot), [snapshot])
    const text = useMemo(() => verdicts(snapshot, status), [snapshot, status])
    const tasks = useMemo(() => priorities(status, snapshot), [status, snapshot])
    const worstStatus = worstKpiStatus(status)
    const headline = localHeadline(worstStatus)

    const { brief: aiBrief, error: aiError, loading: aiLoading, regenerate } = useAiBrief(snapshot)
    const scorecard = useMemo(() => buildScorecard(snapshot, status), [snapshot, status])
    const visibleScorecard = showAllScorecard
        ? scorecard
        : scorecard.filter((row) => row.status !== null || row.aktual !== "—")
    const hiddenScorecardCount = scorecard.length - visibleScorecard.length

    /** Delta per KPI — arah naik/turun + apakah arah itu baik. */
    const deltas = useMemo(() => {
        const biaya =
            snapshot.biaya.delta == null
                ? null
                : { text: `${formatPct(snapshot.biaya.delta)} vs 30 hari lalu`, good: snapshot.biaya.delta <= 0 ? true : false }
        const redelivery =
            snapshot.redelivery.share == null || snapshot.redelivery.sharePrev == null
                ? null
                : (() => {
                      const pt = snapshot.redelivery.share - snapshot.redelivery.sharePrev
                      return { text: `${pt >= 0 ? "+" : "−"}${Math.abs(pt).toFixed(1)} pt vs sebelumnya`, good: pt <= 0 }
                  })()
        const skr =
            snapshot.skr.delta == null
                ? null
                : { text: `${formatPct(snapshot.skr.delta)} vs sebelumnya`, good: snapshot.skr.delta <= 0 }
        return { biaya, redelivery, skr, ritase: null as null }
    }, [snapshot])

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Card className="gap-0 py-0 shadow-sm">
                    <CardContent className="p-5">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="mt-2 h-3 w-64" />
                        <Skeleton className="mt-4 h-3 w-full max-w-2xl" />
                    </CardContent>
                </Card>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-2 bg-card p-5">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-6 w-24" />
                            <Skeleton className="h-3 w-16" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <Alert variant="destructive" className="items-start p-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Gagal menghitung analisa</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="space-y-5">
            {/* Briefing */}
            <section>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">Briefing Head of Transport</h2>
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">Wings · 30 hari terakhir vs 30 hari sebelumnya</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={regenerate}
                            disabled={aiLoading}
                            title="Paksa analisa AI ulang: lewati cache dan minta telaah baru dari model atas snapshot terbaru"
                            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                        >
                            <Sparkles className={cn("h-3 w-3", aiLoading && "animate-pulse")} />
                            {aiLoading ? "Menyusun…" : "Insight baru"}
                        </Button>
                    </div>
                </div>
                <Card className="mt-3 gap-0 py-0 shadow-sm">
                    <CardContent className="px-5 py-4">
                    {aiBrief ? (
                        <BriefingBody brief={aiBrief} />
                    ) : (
                        <div>
                            <p className="max-w-3xl text-[13px] leading-relaxed text-foreground">
                                {headline}
                            </p>
                            {aiError && (
                                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                                    Narasi AI gagal ({aiError}) — memakai ringkasan template lokal.
                                </p>
                            )}
                            <div className="mt-4 border-t border-border/60 pt-4">
                                <p className="text-xs font-medium text-muted-foreground">Prioritas minggu ini</p>
                                <ol className="mt-2.5 space-y-2">
                                    {tasks.map((t, i) => (
                                        <li key={i} className="flex gap-3">
                                            <span className="w-4 shrink-0 pt-px text-right font-mono text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                                            <span className="text-[13px] leading-relaxed text-foreground">{t}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                            {aiLoading && (
                                <p className="mt-3 text-[11px] italic text-muted-foreground">
                                    Briefing AI sedang disusun (bisa 30-60 detik) — tabel telaahnya menyusul.
                                </p>
                            )}
                        </div>
                    )}
                    </CardContent>
                </Card>
            </section>

            {/* Scorecard KPI resmi — 11 KPI matriks atasan; yang tak ada datanya
                ditandai jujur, bukan diisi angka supaya tabel terlihat penuh */}
            <section>
                <h2 className="text-sm font-semibold tracking-tight text-foreground">Scorecard KPI resmi</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Hanya KPI yang sudah punya data ditampilkan. Klik “tampilkan semua” untuk melihat matriks lengkap.
                </p>
                <Card className="mt-3 gap-0 py-0 shadow-sm">
                    <CardContent className="px-5 py-4">
                        <Table className="min-w-[720px] text-xs">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="h-8 px-0 pb-2 pr-3 text-xs">KPI</TableHead>
                                    <TableHead className="h-8 px-3 pb-2 text-right text-xs">Bobot</TableHead>
                                    <TableHead className="h-8 px-3 pb-2 text-right text-xs">Target</TableHead>
                                    <TableHead className="h-8 px-3 pb-2 text-right text-xs">Aktual 30 hari</TableHead>
                                    <TableHead className="h-8 px-3 pb-2 text-xs">Status</TableHead>
                                    <TableHead className="h-8 pb-2 pl-3 pr-0 text-xs">Sumber</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border/60">
                                {visibleScorecard.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="px-0 py-2.5 pr-3 align-top font-medium text-foreground">{row.nama}</TableCell>
                                        <TableCell className="px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground">{row.bobot || "—"}</TableCell>
                                        <TableCell className="px-3 py-2.5 text-right align-top tabular-nums text-foreground">{row.target}</TableCell>
                                        <TableCell className="px-3 py-2.5 text-right align-top tabular-nums text-foreground">{row.aktual}</TableCell>
                                        <TableCell className="px-3 py-2.5 align-top"><ScorecardStatus status={row.status} /></TableCell>
                                        <TableCell className="whitespace-normal py-2.5 pl-3 pr-0 align-top leading-relaxed text-muted-foreground">{row.sumber}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {hiddenScorecardCount > 0 && (
                            <div className="mt-3 flex justify-center border-t pt-3">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                                    onClick={() => setShowAllScorecard((open) => !open)}
                                    aria-expanded={showAllScorecard}
                                >
                                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllScorecard && "rotate-180")} />
                                    {showAllScorecard
                                        ? "Sembunyikan KPI tanpa data"
                                        : `Tampilkan ${hiddenScorecardCount} KPI tanpa data`}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            {/* Statistik KPI — grid gap-px = divider hairline antar sel */}
            <section>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border xl:grid-cols-4">
                    <KpiCell
                        label="Biaya Perbaikan Armada"
                        status={status.biaya}
                        value={`Rp ${compactNilai(snapshot.biaya.cur)}`}
                        delta={deltas.biaya}
                        narrative={text.biaya}
                    >
                        {detailOpen && snapshot.biaya.top.length > 0 ? <UnitCostBars top={snapshot.biaya.top} /> : undefined}
                    </KpiCell>
                    <KpiCell
                        label="% Redelivery Qty"
                        status={status.redelivery}
                        value={snapshot.redelivery.share == null ? "—" : `${snapshot.redelivery.share.toFixed(1)}%`}
                        delta={deltas.redelivery}
                        narrative={text.redelivery}
                    />
                    <KpiCell
                        label="Sisa Kiriman (SKR)"
                        status={status.skr}
                        value={`${formatQty(snapshot.skr.qty)} unit`}
                        delta={deltas.skr}
                        narrative={text.skr}
                    />
                    <KpiCell
                        label="Ritase / Hari"
                        status={status.ritase}
                        value={snapshot.ritase.perHari.toFixed(1)}
                        delta={deltas.ritase}
                        narrative={text.ritase}
                    >
                        {detailOpen ? (
                            <div className="mt-3 border-t border-border/60 pt-3">
                                <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                                    <span>Hari berkeberangkatan / {snapshot.ritase.spanHari} hari</span>
                                    <span>{snapshot.ritase.cakupanHari.toFixed(0)}%</span>
                                </div>
                                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, snapshot.ritase.cakupanHari))}%` }}
                                    />
                                </div>
                            </div>
                        ) : undefined}
                    </KpiCell>
                </div>
            </section>

            {/* Kaki halaman: catatan metode + toggle detail */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Ambang status provisional · biaya = catatan perbaikan/servis armada (belum termasuk BBM &amp; jasa mitra) · ritase mengikuti rentang data Pengiriman yang dimuat
                </p>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailOpen((v) => !v)}
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    aria-expanded={detailOpen}
                >
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", detailOpen && "rotate-180")} />
                    {detailOpen ? "Sembunyikan detail" : "Tampilkan detail rotasi"}
                </Button>
            </div>
        </div>
    )
}

function UnitCostBars({ top }: { top: [string, number][] }) {
    const max = Math.max(...top.map(([, v]) => v), 1)
    return (
        <div className="mt-3 border-t border-border/60 pt-3">
            <p className="text-xs font-medium text-muted-foreground">Penyumbang terbesar</p>
            <div className="mt-2 space-y-1.5">
                {top.map(([plate, v]) => (
                    <div key={plate} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 truncate font-mono text-[11px] text-foreground" title={plate}>
                            {plate}
                        </span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(v / max) * 100}%` }} />
                        </span>
                        <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{compactNilai(v)}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export const AnalisaView = memo(AnalisaViewImpl)

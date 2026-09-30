"use client"

import * as React from "react"
import { ArrowRight, CalendarRange, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { startOfZonedDay, startOfZonedDayMonthsAgo, zonedParts } from "@/lib/format"
import { cn } from "@/lib/utils"

interface DateRangeFieldProps {
    /** Unik per halaman agar id input tidak bentrok (mis. "skr", "outbound") */
    idPrefix: string
    /** Rentang aktif, format YYYY-MM-DD ("" = tanpa batas) */
    from: string
    to: string
    /** Dipanggil saat pengguna menekan Terapkan, Enter, atau preset */
    onApply: (from: string, to: string) => void
    /** Tampilkan status memuat di tombol Terapkan */
    isFetching?: boolean
    className?: string
}

interface Preset {
    id: string
    label: string
    from: string
    to: string
}

const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, "0")

/** Epoch ms tengah malam WIB → "YYYY-MM-DD" */
function toIso(ms: number): string {
    const p = zonedParts(new Date(ms))
    if (!p) return ""
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Rentang siap pakai — semua dihitung dalam WIB, bukan zona browser. */
function buildPresets(): Preset[] {
    const today = startOfZonedDay()
    const now = zonedParts(new Date(today))!

    const curFrom = `${now.year}-${pad(now.month)}-01`
    const curTo = toIso(today)

    // Bulan sebelumnya: satu bulan kalender mundur dari hari ini (bukan
    // 30 hari, yang bisa masih jatuh di bulan yang sama), lalu ambil tanggal 1
    // dan hari terakhir bulan itu.
    const prev = zonedParts(new Date(startOfZonedDayMonthsAgo(1)))!
    const lastDay = new Date(Date.UTC(prev.year, prev.month, 0)).getUTCDate()
    const prevFrom = `${prev.year}-${pad(prev.month)}-01`
    const prevTo = `${prev.year}-${pad(prev.month)}-${pad(lastDay)}`

    return [
        { id: "7d", label: "7 hari", from: toIso(today - 6 * DAY_MS), to: curTo },
        { id: "30d", label: "30 hari", from: toIso(today - 29 * DAY_MS), to: curTo },
        { id: "bulan-ini", label: "Bulan ini", from: curFrom, to: curTo },
        { id: "bulan-lalu", label: "Bulan lalu", from: prevFrom, to: prevTo },
        { id: "semua", label: "Semua", from: "", to: "" },
    ]
}

/** "2026-09-30" → "30 Sep 26" — ringkas untuk label tombol */
function ringkas(iso: string): string {
    if (!iso) return "..."
    const [y, m, d] = iso.split("-").map(Number)
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    return `${d} ${bulan[(m || 1) - 1]} ${String(y ?? 0).slice(2)}`
}

/**
 * Rentang tanggal kompak satu baris: popover berisi dua input, tombol
 * Terapkan, dan daftar preset. Nilai di-commit lewat `onApply` supaya fetch
 * parent tidak jalan setiap kali tanggal diketikan.
 */
export function DateRangeField({ idPrefix, from, to, onApply, isFetching, className }: DateRangeFieldProps) {
    const [draftFrom, setDraftFrom] = React.useState(from)
    const [draftTo, setDraftTo] = React.useState(to)
    const [open, setOpen] = React.useState(false)

    // Sinkronkan draft ketika rentang dari parent berubah (preset, reset, dll)
    React.useEffect(() => {
        setDraftFrom(from)
        setDraftTo(to)
    }, [from, to])

    const presets = React.useMemo(buildPresets, [])

    // Tanggal terbalik ditukar otomatis, supaya tidak pernah query kosong
    const commit = React.useCallback(
        (nextFrom: string, nextTo: string) => {
            if (nextFrom && nextTo && nextFrom > nextTo) {
                setDraftFrom(nextTo)
                setDraftTo(nextFrom)
                onApply(nextTo, nextFrom)
                return
            }
            onApply(nextFrom, nextTo)
        },
        [onApply],
    )

    const fromId = `${idPrefix}-from`
    const toId = `${idPrefix}-to`
    const activePreset = presets.find((p) => p.from === from && p.to === to)
    const noRange = !from && !to

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <div className={cn("flex items-center gap-2", className)}>
                {/* Tombol pemicu — menampilkan rentang aktif ringkas */}
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className={cn(
                            "h-9 gap-2 bg-card px-3 font-mono text-sm",
                            open && "border-primary/50 ring-1 ring-primary/25",
                        )}
                    >
                        <CalendarRange className="h-4 w-4 text-muted-foreground" />
                        <span className="tabular-nums">
                            {noRange ? "Semua tanggal" : `${ringkas(from)} – ${ringkas(to)}`}
                        </span>
                        {activePreset && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-sans font-medium text-primary">
                                {activePreset.label}
                            </span>
                        )}
                    </Button>
                </PopoverTrigger>
            </div>

            <PopoverContent align="start" className="w-[340px] rounded-xl p-3">
                <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={fromId} className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            Dari
                        </Label>
                        <Input
                            id={fromId}
                            type="date"
                            value={draftFrom}
                            max={draftTo || undefined}
                            onChange={(e) => setDraftFrom(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commit(draftFrom, draftTo)
                            }}
                            className="h-8 w-full font-mono text-sm"
                        />
                    </div>

                    <ArrowRight className="mb-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                    <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={toId} className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            Sampai
                        </Label>
                        <Input
                            id={toId}
                            type="date"
                            value={draftTo}
                            min={draftFrom || undefined}
                            onChange={(e) => setDraftTo(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commit(draftFrom, draftTo)
                            }}
                            className="h-8 w-full font-mono text-sm"
                        />
                    </div>
                </div>

                <Button
                    size="sm"
                    className="mt-3 h-8 w-full gap-1.5"
                    onClick={() => {
                        commit(draftFrom, draftTo)
                        setOpen(false)
                    }}
                    disabled={isFetching}
                >
                    {isFetching ? "Memuat…" : "Terapkan"}
                </Button>

                <div className="mt-2.5 border-t pt-2.5">
                    <p className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Preset
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {presets.map((p) => {
                            const active = p.from === from && p.to === to
                            return (
                                <Button
                                    key={p.id}
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                        commit(p.from, p.to)
                                        setOpen(false)
                                    }}
                                    className={cn(
                                        "h-7 gap-1 rounded-lg px-2 text-xs",
                                        active
                                            ? "bg-primary/10 text-primary hover:bg-primary/15"
                                            : "bg-muted/50 text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {active && <Check className="h-3 w-3" />}
                                    {p.label}
                                </Button>
                            )
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

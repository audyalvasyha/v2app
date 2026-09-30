"use client"

import * as React from "react"
import { ArrowRight, CalendarRange } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

/**
 * Rentang tanggal ringkas: dua input, tombol Terapkan (juga lewat Enter),
 * dan baris preset. Nilai di-commit lewat `onApply` supaya fetch parent tidak
 * jalan setiap kali tanggal diketikan.
 */
export function DateRangeField({ idPrefix, from, to, onApply, isFetching, className }: DateRangeFieldProps) {
    const [draftFrom, setDraftFrom] = React.useState(from)
    const [draftTo, setDraftTo] = React.useState(to)

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

    const unchanged = draftFrom === from && draftTo === to
    const fromId = `${idPrefix}-from`
    const toId = `${idPrefix}-to`

    return (
        <div className={cn("rounded-xl border bg-card p-3", className)}>
            <div className="flex flex-wrap items-end gap-2">
                <CalendarRange className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" />

                <div className="space-y-1">
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
                        className="h-8 w-[150px] font-mono text-sm"
                    />
                </div>

                <ArrowRight className="mb-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                <div className="space-y-1">
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
                        className="h-8 w-[150px] font-mono text-sm"
                    />
                </div>

                <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => commit(draftFrom, draftTo)}
                    disabled={unchanged || isFetching}
                >
                    {isFetching ? "Memuat…" : "Terapkan"}
                </Button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Preset</span>
                {presets.map((p) => {
                    const active = p.from === from && p.to === to
                    return (
                        <Button
                            key={p.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => commit(p.from, p.to)}
                            className={cn(
                                "h-7 text-xs",
                                active
                                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {p.label}
                        </Button>
                    )
                })}
            </div>
        </div>
    )
}

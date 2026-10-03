"use client"

import React, { memo } from "react"
import { CircleAlert, MousePointerClick } from "lucide-react"

import { cn } from "@/lib/utils"
import { compactRupiah, formatNumber } from "@/lib/format"
import {
    BAN_WHEEL_SLOT_LABELS,
    BAN_WHEEL_SLOT_ORDER,
    type BanSlotPoint,
    type BanWheelSlot,
} from "@/lib/ban-analytics"

/**
 * Aset gambar ban untuk menu Analisa Ban. Berkas SVG-nya ada di
 * `public/tyre-chassis-top.svg` (tampilan atas rangka moda: 4 ban jalan +
 * 1 ban serap terpasang di tengah rangka) dan tabel koordinat roda ada di
 * kepala berkas itu.
 *
 * Titik klik di bawah memakai PERSEN dari viewBox SVG (1600 x 900) — bukan
 * piksel — supaya hotspot tetap menempel tepat saat gambar diskalakan di
 * layar sempit. Mengganti gambarnya? Cukup sesuaikan angka `x`/`y` (dan
 * `w`/`aspect` untuk luas klik) di HOTSPOTS.
 */
export const BAN_TYRE_IMAGE = {
    src: "/tyre-chassis-top.svg",
    width: 1600,
    height: 900,
} as const

/**
 * Posisi tiap roda pada gambar, dalam persen dari viewBox. Mengikuti tabel
 * di `public/tyre-chassis-top.svg`: ban menghadap ke kiri (kabin di kiri),
 * sisi KANAN kendaraan di baris atas gambar, ban serap di tengah rangka.
 *
 * `w` = lebar area klik sebagai persen lebar gambar; `aspect` = rasio
 * lebar : tinggi area klik. Ban jalan berbentuk oval mengikuti bentuk tread
 * (140 x 96 unit), ban serap bulat (diameter 156 unit).
 */
const HOTSPOTS: Record<BanWheelSlot, { x: number; y: number; w: number; aspect: number }> = {
    "depan-kanan": { x: 28.9, y: 33.8, w: 10.5, aspect: 140 / 96 },
    "depan-kiri": { x: 28.9, y: 66.9, w: 10.5, aspect: 140 / 96 },
    "belakang-kanan": { x: 69.9, y: 35.2, w: 10.5, aspect: 140 / 96 },
    "belakang-kiri": { x: 69.9, y: 67.6, w: 10.5, aspect: 140 / 96 },
    serap: { x: 56.6, y: 48.0, w: 10.5, aspect: 1 },
}

export interface BanTyreMapProps {
    /** Data tiap roda untuk nopol yang sedang dipilih */
    bySlot: Record<BanWheelSlot, BanSlotPoint> | null
    /** Slot yang sedang dibuka */
    activeSlot: BanWheelSlot | null
    onSelectSlot: (slot: BanWheelSlot) => void
    /** Nopol terpilih — null berarti belum ada nopol yang dipilih */
    plate: string | null
}

/** Jumlah catatan ban untuk nopol ini yang tidak bisa dikaitkan ke roda. */
function BanTyreMapImpl({ bySlot, activeSlot, onSelectSlot, plate }: BanTyreMapProps) {
    // Interaktivitas hanya hidup kalau ada nopol yang sudah dipilih: tanpa
    // nopol, klik pada roda tidak punya data yang bisa ditampilkan, jadi
    // hotspot-nya sengaja dimatikan (bukan menampilkan angka unit lain).
    const active = plate != null && bySlot != null

    return (
        <div className="w-full overflow-hidden rounded-xl border bg-gradient-to-b from-muted/40 to-muted/10 p-2 sm:p-3">
            {/* Hotspot memakai persen, jadi harus duduk di kotak yang PERSIS sama
                dengan gambar — bukan di container yang ada padding-nya. */}
            <div className="relative w-full">
            <img
                src={BAN_TYRE_IMAGE.src}
                alt={`Peta ban untuk ${plate ?? "unit"} — empat ban jalan dan satu ban serap`}
                width={BAN_TYRE_IMAGE.width}
                height={BAN_TYRE_IMAGE.height}
                draggable={false}
                className={cn(
                    "block w-full select-none transition-opacity duration-200",
                    active ? "opacity-100" : "opacity-45",
                )}
            />

            {BAN_WHEEL_SLOT_ORDER.map((slot) => {
                const point = bySlot?.[slot]
                const hasData = active && (point?.entries ?? 0) > 0
                const isActive = active && slot === activeSlot
                const pos = HOTSPOTS[slot]
                return (
                    <button
                        key={slot}
                        type="button"
                        onClick={() => active && onSelectSlot(slot)}
                        disabled={!active}
                        tabIndex={active ? 0 : -1}
                        aria-pressed={isActive}
                        title={
                            active
                                ? `${BAN_WHEEL_SLOT_LABELS[slot]} — ${
                                      hasData
                                          ? `${point!.entries} entri · ${compactRupiah(point!.cost)}`
                                          : "tidak ada catatan"
                                  }`
                                : "Pilih nomor polisi terlebih dahulu"
                        }
                        aria-label={
                            active
                                ? `${BAN_WHEEL_SLOT_LABELS[slot]}, ${
                                      hasData ? `${point!.entries} catatan` : "belum ada catatan"
                                  }`
                                : `${BAN_WHEEL_SLOT_LABELS[slot]} — pilih nomor polisi terlebih dahulu`
                        }
                        style={{
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            // Area klik mengikuti proporsi ban pada gambar:
                            // oval untuk ban jalan, bulat untuk ban serap.
                            width: `${pos.w}%`,
                            aspectRatio: String(pos.aspect),
                        }}
                        className={cn(
                            "group absolute -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 transition-all duration-150",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            !active && "cursor-not-allowed",
                            active && "cursor-pointer",
                            hasData
                                ? "border-primary/70 bg-primary/10 hover:border-primary hover:bg-primary/25"
                                : "border-dashed border-muted-foreground/45 bg-background/25",
                            isActive && "border-primary bg-primary/35 ring-2 ring-primary/50",
                        )}
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums transition-colors",
                                hasData
                                    ? "border-primary/40 bg-background/90 text-primary"
                                    : "border-border bg-background/80 text-muted-foreground",
                            )}
                        >
                            {active && hasData ? formatNumber(point!.qty) : "·"}
                        </span>
                    </button>
                )
            })}

            {!active && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                    <div className="flex max-w-xs items-start gap-2.5 rounded-lg border bg-card/95 px-3.5 py-2.5 text-xs leading-relaxed shadow-sm backdrop-blur">
                        <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <p className="text-muted-foreground">
                            Peta ban belum aktif. Pilih nomor polisi lebih dulu — hotspot tiap
                            roda akan menampilkan catatan ban milik nopol itu.
                        </p>
                    </div>
                </div>
            )}
            </div>
        </div>
    )
}

export const BanTyreMap = memo(BanTyreMapImpl)

/**
 * Legenda slot: tombol yang sinkron dengan peta, jadi area peta yang kecil
 * (ponsel) tetap punya cara memilih roda yang jelas.
 */
export function BanTyreMapLegend({
    bySlot,
    activeSlot,
    onSelectSlot,
    plate,
    className,
}: BanTyreMapProps & { className?: string }) {
    const active = plate != null && bySlot != null
    return (
        <div className={cn("grid gap-1.5 sm:grid-cols-2", className)}>
            {BAN_WHEEL_SLOT_ORDER.map((slot) => {
                const point = bySlot?.[slot]
                const hasData = active && (point?.entries ?? 0) > 0
                const isActive = active && slot === activeSlot
                return (
                    <button
                        key={slot}
                        type="button"
                        onClick={() => active && onSelectSlot(slot)}
                        disabled={!active}
                        tabIndex={active ? 0 : -1}
                        aria-pressed={isActive}
                        className={cn(
                            "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            !active
                                ? "cursor-not-allowed border-dashed text-muted-foreground/70"
                                : "bg-card hover:bg-muted/50",
                            isActive && "border-primary/60 bg-primary/10",
                        )}
                    >
                        <span className="truncate text-xs font-medium">
                            {BAN_WHEEL_SLOT_LABELS[slot]}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {hasData ? compactRupiah(point!.cost) : "—"}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

/** Catatan jujur untuk entri yang tidak bisa dikaitkan ke roda tertentu. */
export function BanUnmappedNote({ count }: { count: number }) {
    if (count === 0) return null
    return (
        <p className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
                {formatNumber(count)} catatan ban untuk nopol ini tidak menyebut posisi roda,
                jadi tidak dikaitkan ke hotspot mana pun. Buka tabel di bawah untuk membaca
                uraian aslinya.
            </span>
        </p>
    )
}
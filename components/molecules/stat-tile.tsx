import React from "react"

import { cn } from "@/lib/utils"

export interface StatTileProps {
    label: string
    value: string
    /** Boleh berisi elemen (mis. penanda naik/turun berwarna) */
    hint?: React.ReactNode
    /** Nilai lengkap saat angka utama diringkas (mis. nominal penuh pada tooltip) */
    title?: string
    icon?: React.ReactNode
    /** Beri penekanan warna aksen untuk metrik utama */
    emphasis?: boolean
    className?: string
}

/**
 * Kartu ringkasan kecil untuk deretan metrik di atas tabel.
 * Dipakai bersama oleh menu Equipment dan Histories agar tampilannya konsisten.
 */
export function StatTile({ label, value, hint, title, icon, emphasis, className }: StatTileProps) {
    return (
        <div className={cn("rounded-xl border bg-card px-4 py-3 shadow-sm", className)} title={title}>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <div
                className={cn(
                    "mt-2 truncate text-lg font-semibold leading-none tabular-nums",
                    emphasis && "text-primary",
                )}
            >
                {value}
            </div>
            {hint && <div className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</div>}
        </div>
    )
}

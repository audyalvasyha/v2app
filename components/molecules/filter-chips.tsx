"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface FilterChipOption<T extends string> {
    id: T
    label: string
    /** Angka opsional di kanan label, mis. jumlah baris per status. */
    count?: number
}

interface FilterChipsProps<T extends string> {
    options: readonly FilterChipOption<T>[]
    value: T
    onChange: (value: T) => void
    ariaLabel: string
    className?: string
}

/**
 * Grup filter tunggal untuk semua menu. Wadahnya tanpa border/latar, setiap
 * tombol punya latar sendiri, dan item aktif memakai permukaan card. Dipakai
 * supaya filter di SKR, Pengiriman, Armada, Histories, Monitoring, dan Ban
 * identik.
 *
 * Di ponsel chip tidak dipaksa wrap: satu baris bisa digeser horizontal,
 * jadi toolbar tidak memakan tinggi dan tombol tetap berukuran sentuh.
 */
export function FilterChips<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className,
}: FilterChipsProps<T>) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className={cn(
                "inline-flex min-w-0 max-w-full touch-pan-x items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible",
                className,
            )}
        >
            {options.map((option) => {
                const active = option.id === value
                return (
                    <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(option.id)}
                        className={cn(
                            "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            active
                                ? "bg-card text-foreground shadow-sm ring-1 ring-border/70 dark:bg-secondary"
                                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                    >
                        {option.label}
                        {typeof option.count === "number" && (
                            <span className="text-xs tabular-nums opacity-60">
                                {option.count.toLocaleString("id-ID")}
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

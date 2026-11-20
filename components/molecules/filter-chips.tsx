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
 * Grup filter tunggal untuk semua menu. Bentuknya segmented control netral:
 * item aktif memakai permukaan card, sisanya muted. Dipakai supaya tombol
 * filter di SKR, Pengiriman, Armada, Histories, Monitoring, dan Ban identik.
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
                "inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1",
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
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
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

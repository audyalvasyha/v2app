"use client"

import * as React from "react"

import { DateRangeField } from "@/components/molecules/date-range-field"
import { SearchField } from "@/components/molecules/search-field"
import { cn } from "@/lib/utils"

export interface FilterToolbarDate {
    idPrefix: string
    from: string
    to: string
    onApply: (from: string, to: string) => void
    isFetching?: boolean
}

export interface FilterToolbarSearch {
    value: string
    onChange: (value: string) => void
    placeholder: string
    hint?: React.ReactNode
}

interface FilterToolbarProps {
    date: FilterToolbarDate
    search: FilterToolbarSearch
    /** Tombol tambahan di kanan (mis. export CSV, select urutan) */
    actions?: React.ReactNode
    className?: string
}

/**
 * Baris kontrol bersama untuk semua tabel: rentang tanggal di kiri, kotak
 * pencarian menempel di sampingnya, lalu grup aksi di kanan. Dipakai SKR dan
 * Pengiriman supaya susunannya identik di kedua menu.
 */
export function FilterToolbar({ date, search, actions, className }: FilterToolbarProps) {
    return (
        <div className={cn("flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between", className)}>
            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-start">
                <DateRangeField {...date} />
                <SearchField {...search} className="lg:max-w-sm lg:flex-1" />
            </div>

            {actions ? (
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div>
            ) : null}
        </div>
    )
}

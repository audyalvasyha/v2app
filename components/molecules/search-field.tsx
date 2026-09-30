"use client"

import * as React from "react"
import { Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SearchFieldProps {
    value: string
    onChange: (value: string) => void
    /** Placeholder — awali dengan "Cari" agar shortcut Ctrl + / tetap kena */
    placeholder?: string
    /** Teks kecil di kanan field saat kosong, mis. jumlah hasil */
    hint?: React.ReactNode
    className?: string
}

/**
 * Kotak pencarian ringkas: ikon di kiri, tombol bersihkan di kanan (muncul
 * hanya ada teks), Escape untuk kosongkan, dan garis fokus_oranye saat aktif.
 */
export function SearchField({ value, onChange, placeholder = "Cari...", hint, className }: SearchFieldProps) {
    const [focused, setFocused] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const hasValue = value.length > 0

    return (
        <div
            className={cn(
                "relative flex h-9 items-center rounded-xl border bg-card transition-colors",
                focused ? "border-primary/50 ring-1 ring-primary/25" : "hover:border-foreground/20",
                className,
            )}
        >
            <Search
                className={cn(
                    "pointer-events-none absolute left-3 h-4 w-4 transition-colors",
                    focused ? "text-primary" : "text-muted-foreground",
                )}
            />

            <Input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                    if (e.key === "Escape" && hasValue) {
                        e.preventDefault()
                        onChange("")
                    }
                }}
                placeholder={placeholder}
                aria-label={placeholder}
                className="h-9 border-0 bg-transparent pl-9 pr-16 shadow-none focus-visible:border-0 focus-visible:ring-0"
            />

            <div className="absolute right-2 flex items-center gap-1">
                {hasValue ? (
                    <button
                        type="button"
                        onClick={() => {
                            onChange("")
                            inputRef.current?.focus()
                        }}
                        title="Bersihkan pencarian"
                        aria-label="Bersihkan pencarian"
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                ) : hint ? (
                    <span className="hidden pr-0.5 text-[11px] tabular-nums text-muted-foreground sm:block">{hint}</span>
                ) : null}
            </div>
        </div>
    )
}

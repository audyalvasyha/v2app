"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface Suggestion {
    key: string
    label: string
    /** Teks kecil di kanan, mis. NIK sales atau nomor pelanggan. */
    hint?: string
}

interface SuggestFieldProps {
    id?: string
    value: string
    onValueChange: (value: string) => void
    onSelect: (suggestion: Suggestion) => void
    suggestions: Suggestion[]
    loading?: boolean
    emptyText?: string
    autoFocus?: boolean
    className?: string
}

/**
 * Input dengan daftar saran di bawahnya. Dipakai menggantikan <datalist>
 * yang tidak selalu muncul (terutama di dalam Dialog/Sheet). Nilai tetap
 * bisa diketik bebas kalau yang dicari tidak ada di daftar.
 */
export function SuggestField({
    id,
    value,
    onValueChange,
    onSelect,
    suggestions,
    loading,
    emptyText = "Tidak ada kecocokan",
    autoFocus,
    className,
}: SuggestFieldProps) {
    const [open, setOpen] = React.useState(false)
    const [active, setActive] = React.useState(0)
    const listId = React.useId()

    React.useEffect(() => {
        setActive(0)
    }, [value, suggestions])

    const visible = open && value.trim().length > 0

    const pick = (suggestion: Suggestion) => {
        onSelect(suggestion)
        setOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            setOpen(false)
            return
        }
        if (!visible || suggestions.length === 0) return
        if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((i) => (i + 1) % suggestions.length)
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
        } else if (e.key === "Enter") {
            e.preventDefault()
            const suggestion = suggestions[active]
            if (suggestion) pick(suggestion)
        }
    }

    return (
        <div
            className="relative"
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
            }}
        >
            <Input
                id={id}
                value={value}
                onChange={(e) => {
                    onValueChange(e.target.value)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                autoFocus={autoFocus}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={visible}
                aria-controls={visible ? listId : undefined}
                aria-activedescendant={
                    visible && suggestions[active] ? `${listId}-${active}` : undefined
                }
                className={className}
            />

            {visible && (
                <div
                    id={listId}
                    role="listbox"
                    className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                >
                    {loading ? (
                        <p className="px-2 py-2 text-xs text-muted-foreground">Mencari…</p>
                    ) : suggestions.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-muted-foreground">{emptyText}</p>
                    ) : (
                        suggestions.map((suggestion, i) => (
                            <button
                                key={suggestion.key}
                                id={`${listId}-${i}`}
                                type="button"
                                role="option"
                                aria-selected={i === active}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => pick(suggestion)}
                                className={cn(
                                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                                    i === active && "bg-muted",
                                )}
                            >
                                <span className="truncate">{suggestion.label}</span>
                                {suggestion.hint && (
                                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                        {suggestion.hint}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

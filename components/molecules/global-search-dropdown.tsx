"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import type { View } from "@/components/templates/dashboard-layout"
import { CornerDownLeft } from "lucide-react"

/**
 * Dropdown hasil pencarian global di header (pola command palette).
 *
 * — Muncul saat search input di header fokus; menampilkan hasil lintas menu
 *   yang sudah difilter di DashboardContent (sumber data tunggal).
 * — Klik item (atau Enter) → langsung pindah ke menu tujuan; kata pencarian
 *   dipertahankan sehingga menu yang dibuka sudah terfilter dalam keadaan siap.
 * — Navigasi keyboard: ↑/↓ pilih, Enter buka menu tujuan, Escape tutup.
 * — mouseDown di-panel di-preventDefault supaya blur input tidak menutup
 *   panel sebelum klik item sempat terproses.
 */

export interface GlobalSearchItem {
  /** Menu tujuan saat item dipilih */
  view: View
  /** Label group yang ditampilkan pada badge item */
  group: string
  /** Teks utama hasil */
  title: string
  /** Konteks tambahan (ID, tanggal, dsb.) */
  subtitle?: string
}

export interface GlobalSearchGroupCount {
  label: string
  view: View
  count: number
}

interface GlobalSearchDropdownProps {
  open: boolean
  /** Query belum menghasilkan apa pun (bedakan dgn "belum mengetik") */
  hasQuery: boolean
  items: GlobalSearchItem[]
  counts: GlobalSearchGroupCount[]
  onSelect: (view: View) => void
  onClose: () => void
}

export function GlobalSearchDropdown({ open, hasQuery, items, counts, onSelect, onClose }: GlobalSearchDropdownProps) {
  const [highlight, setHighlight] = useState(0)

  // Query berubah → kembalikan kursor ke hasil teratas
  useEffect(() => {
    setHighlight(0)
  }, [items])

  // Keyboard: Escape / ↑ / ↓ / Enter hanya aktif selama panel terbuka
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlight((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlight((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && items[highlight]) {
        e.preventDefault()
        onSelect(items[highlight].view)
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, items, highlight, onSelect, onClose])

  if (!open) return null

  return (
    <div
      className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          {hasQuery ? "Tidak ada hasil yang cocok — coba kata kunci lain." : "Ketik untuk mencari di semua menu: Equipment, Histories, SKR, Pengiriman."}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item, idx) => (
            <li key={`${item.view}-${item.title}-${idx}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item.view)
                  onClose()
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={[
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  idx === highlight ? "bg-muted/60" : "hover:bg-muted/40",
                ].join(" ")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {item.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                  )}
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {item.group}
                </Badge>
                {idx === highlight && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ringkasan jumlah per menu — jawaban cepat tanpa harus berpindah */}
      {counts.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
          {counts.map(
            (c) =>
              c.count > 0 && (
                <span key={c.label}>
                  <span className="font-medium text-foreground">{c.count.toLocaleString("id-ID")}</span> {c.label}
                </span>
              ),
          )}
        </div>
      )}
    </div>
  )
}

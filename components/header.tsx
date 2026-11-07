"use client"

import Image from "next/image"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import type { ThemePreference } from "@/hooks/use-theme"
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog"
import { NotificationsBell } from "./notifications-bell"
import { ThemeToggle } from "./theme-toggle"
import type { AlertView, AppAlert } from "@/lib/alerts"
import { GlobalSearchDropdown, type GlobalSearchGroupCount, type GlobalSearchItem } from "./molecules/global-search-dropdown"

interface HeaderProps {
  theme: "dark" | "light"
  themePreference: ThemePreference
  onToggleTheme: () => void
  /** Nilai pencarian global (kontrol dari DashboardContent) */
  searchTerm: string
  onSearchChange: (value: string) => void
  /** Teks hint placeholder search, mengikuti menu aktif */
  searchPlaceholder?: string
  /** Hasil pencarian lintas menu untuk dropdown */
  searchItems: GlobalSearchItem[]
  searchCounts: GlobalSearchGroupCount[]
  /** Item hasil dipilih → pindah ke menu tujuan */
  onSearchSelect: (view: "dashboard" | "equipment" | "maintenance" | "monitoring" | "about" | "skr" | "pengiriman" | "ban" | "weather" | "traffic" | "analisa") => void
  /** Peringatan operasional untuk lonceng notifikasi */
  alerts?: AppAlert[]
  /** Klik notifikasi → buka menu sumbernya */
  onSelectAlert?: (view: AlertView) => void
}

/**
 * Header hanya berisi branding + kontrol tampilan.
 *
 * Akun (email + tombol Keluar) tinggal di sidebar, dan dialog Export/Import
 * disembunyikan dari header. Komponen ExportImportDialog sengaja dibiarkan ada
 * di repo supaya gampang dipasang lagi kalau nanti diperlukan.
 */
export function Header({ theme, themePreference, onToggleTheme, searchTerm, onSearchChange, searchPlaceholder, searchItems, searchCounts, onSearchSelect, alerts = [], onSelectAlert }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  return (
    <header className="border-b border-border bg-background sticky top-0 z-20">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Image
              src="/icon.svg"
              alt="Logo Midaa"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
              priority
            />
            <div>
              <h1 className="text-xl font-bold">Midaa</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Transport Management System</p>
            </div>
          </div>
        </div>

        {/* Search global — bisa dipakai di semua menu, placeholder mengikuti menu aktif.
            Disembunyikan di layar sempit supaya header tidak meluber. */}
        <div className="flex flex-1 justify-end pr-4">
          <div className="relative hidden w-full max-w-sm md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              placeholder={searchPlaceholder ?? "Cari data…"}
              className="h-9 rounded-full pl-9 pr-9"
            />
            {searchTerm && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSearchChange("")
                  setSearchOpen(false)
                }}
                aria-label="Bersihkan pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Dropdown hasil pencarian lintas menu (command palette) */}
            <GlobalSearchDropdown
              open={searchOpen}
              hasQuery={searchTerm.trim().length > 0}
              items={searchItems}
              counts={searchCounts}
              onSelect={onSearchSelect}
              onClose={() => setSearchOpen(false)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSelectAlert && <NotificationsBell alerts={alerts} onSelect={onSelectAlert} />}
          <ThemeToggle theme={theme} preference={themePreference} onToggle={onToggleTheme} />
          <KeyboardShortcutsDialog />
        </div>
      </div>
    </header>
  )
}

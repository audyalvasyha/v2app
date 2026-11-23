"use client"

import Image from "next/image"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Menu, Search, X } from "lucide-react"
import type { ThemePreference } from "@/hooks/use-theme"
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog"
import { NotificationsBell } from "./notifications-bell"
import { ThemeToggle } from "./theme-toggle"
import type { AlertView, AppAlert } from "@/lib/alerts"
import { GlobalSearchDropdown, type GlobalSearchGroupCount, type GlobalSearchItem } from "./molecules/global-search-dropdown"
import type { View } from "@/components/templates/dashboard-layout"

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
  onSearchSelect: (view: View) => void
  /** Peringatan operasional untuk lonceng notifikasi */
  alerts?: AppAlert[]
  /** Klik notifikasi → buka menu sumbernya */
  onSelectAlert?: (view: AlertView) => void
  /** Buka drawer sidebar di layar kecil. */
  onOpenSidebar?: () => void
}

/**
 * Header hanya berisi branding + kontrol tampilan.
 *
 * Akun (email + tombol Keluar) tinggal di sidebar, dan dialog Export/Import
 * disembunyikan dari header. Komponen ExportImportDialog sengaja dibiarkan ada
 * di repo supaya gampang dipasang lagi kalau nanti diperlukan.
 */
export function Header({ theme, themePreference, onToggleTheme, searchTerm, onSearchChange, searchPlaceholder, searchItems, searchCounts, onSearchSelect, alerts = [], onSelectAlert, onOpenSidebar }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {onOpenSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSidebar}
              aria-label="Menu navigasi"
              className="h-9 w-9 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
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
              <h1 className="text-base font-semibold leading-tight tracking-tight">Midaa</h1>
              <p className="hidden text-[11px] text-muted-foreground sm:block">Transport Management System</p>
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
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setMobileSearchOpen(true)}
            aria-label="Cari data"
          >
            <Search className="h-4 w-4" />
          </Button>
          {onSelectAlert && <NotificationsBell alerts={alerts} onSelect={onSelectAlert} />}
          <ThemeToggle theme={theme} preference={themePreference} onToggle={onToggleTheme} />
          <KeyboardShortcutsDialog />
        </div>
      </div>

      <Dialog
        open={mobileSearchOpen}
        onOpenChange={(open) => {
          setMobileSearchOpen(open)
          if (!open) setSearchOpen(false)
        }}
      >
        <DialogContent className="top-3 w-[calc(100%-1rem)] max-w-lg translate-y-0 gap-3 p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>Cari data</DialogTitle>
            <DialogDescription>
              Cari equipment, riwayat, SKR, pengiriman, dan komplain dari seluruh menu.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              placeholder={searchPlaceholder ?? "Cari data…"}
              className="h-10 rounded-full pl-9 pr-9"
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

            <GlobalSearchDropdown
              open={searchOpen && mobileSearchOpen}
              hasQuery={searchTerm.trim().length > 0}
              items={searchItems}
              counts={searchCounts}
              onSelect={(view) => {
                onSearchSelect(view)
                setMobileSearchOpen(false)
                setSearchOpen(false)
              }}
              onClose={() => setSearchOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}

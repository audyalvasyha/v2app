"use client"

import { Button } from "@/components/ui/button"
import { Github } from "lucide-react"
import type { ThemePreference } from "@/hooks/use-theme"
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog"
import { ThemeToggle } from "./theme-toggle"

interface HeaderProps {
  theme: "dark" | "light"
  themePreference: ThemePreference
  onToggleTheme: () => void
}

/**
 * Header hanya berisi branding + kontrol tampilan.
 *
 * Akun (email + tombol Keluar) tinggal di sidebar, dan dialog Export/Import
 * disembunyikan dari header. Komponen ExportImportDialog sengaja dibiarkan ada
 * di repo supaya gampang dipasang lagi kalau nanti diperlukan.
 */
export function Header({ theme, themePreference, onToggleTheme }: HeaderProps) {
  return (
    <header className="border-b border-border bg-background sticky top-0 z-20">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">{"@"}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Midaa</h1>
              <p className="text-xs text-muted-foreground">Transport Management System</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} preference={themePreference} onToggle={onToggleTheme} />
          <KeyboardShortcutsDialog />

          {/* Tombol GitHub */}
          <Button asChild className="gap-2">
            <a
              href="https://github.com/audyalvasyha/v2app"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
              GitHub Repo
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}

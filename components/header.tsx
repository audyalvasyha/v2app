"use client"

import Image from "next/image"
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
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="flex h-[4.5rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/icon.svg"
            alt="Logo Midaa"
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-2xl"
            priority
          />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Midaa</h1>
            <p className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:block">Fleet intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle theme={theme} preference={themePreference} onToggle={onToggleTheme} />
          <KeyboardShortcutsDialog />

          {/* Tombol GitHub */}
          <Button asChild size="sm" variant="outline" className="hidden gap-2 rounded-xl sm:inline-flex">
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

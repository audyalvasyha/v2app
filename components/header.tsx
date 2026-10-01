"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Github, LogOut } from "lucide-react"
import { supabase } from "@/utils/supabase"
import type { ThemePreference } from "@/hooks/use-theme"
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog"
import { ExportImportDialog } from "./export-import-dialog"
import { ThemeToggle } from "./theme-toggle"

interface HeaderProps {
  theme: "dark" | "light"
  themePreference: ThemePreference
  onToggleTheme: () => void
}

export function Header({ theme, themePreference, onToggleTheme }: HeaderProps) {
  // Email user yang sedang login + tombol keluar (sesi dari klien Supabase
  // yang sama dengan AuthGate — logout di sini otomatis menampilkan login).
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setUserEmail(data.session?.user.email ?? null))
      .catch(() => setUserEmail(null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
      setUserEmail(s?.user.email ?? null),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // Hapus cache data armada di browser — supaya tidak ada data yang
    // tertinggal di perangkat setelah keluar (sama dengan CACHE_KEY di
    // app/page.tsx; tidak diimpor agar tidak terjadi import melingkar).
    try {
      localStorage.removeItem("fleet-cache-v2")
    } catch {
      /* localStorage tidak tersedia — abaikan */
    }
  }

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
          {userEmail && (
            <span
              className="hidden max-w-[220px] truncate text-xs text-muted-foreground lg:block"
              title={userEmail}
            >
              {userEmail}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleSignOut}
            title="Keluar dari akun"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
          <ThemeToggle theme={theme} preference={themePreference} onToggle={onToggleTheme} />
          <ExportImportDialog />
          <KeyboardShortcutsDialog />

          {/* Tombol GitHub */}
          <Button asChild className="gap-2">
            <a
              href="https://github.com/audyalvasyha/v2app" // Ganti dengan URL repo GitHub Anda
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

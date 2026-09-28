"use client"

import { Button } from "@/components/ui/button"
import { Github } from "lucide-react"
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog"
import { ExportImportDialog } from "./export-import-dialog"
import { ThemeToggle } from "./theme-toggle"

interface HeaderProps {
  onNewSnippet: () => void
  onExportJSON: () => string
  onImportJSON: (json: string) => { success: boolean; count: number; error?: string }
  onExportGist: () => { description: string; public: boolean; files: Record<string, { content: string }> }
  theme: "dark" | "light"
  onToggleTheme: () => void
}

export function Header({ onNewSnippet, onExportJSON, onImportJSON, onExportGist, theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="border-b border-border bg-background sticky top-0 z-20">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">{"@"}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">v2app</h1>
              <p className="text-xs text-muted-foreground">Fleet Management System</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <ExportImportDialog onExportJSON={onExportJSON} onImportJSON={onImportJSON} onExportGist={onExportGist} />
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

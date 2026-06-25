"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
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
    <header className="border-b border-border bg-background sticky top-0 z-10">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">{"</>"}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Snippet Manager</h1>
              <p className="text-xs text-muted-foreground">Developer's Code Library</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <ExportImportDialog onExportJSON={onExportJSON} onImportJSON={onImportJSON} onExportGist={onExportGist} />
          <KeyboardShortcutsDialog />
          <Button onClick={onNewSnippet} className="gap-2">
            <Plus className="h-4 w-4" />
            New Snippet
          </Button>
        </div>
      </div>
    </header>
  )
}

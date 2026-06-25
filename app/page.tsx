"use client"

import { useState, useRef } from "react"
import type { Snippet } from "@/lib/types"
import { useSnippets } from "@/hooks/use-snippets"
import { useTheme } from "@/hooks/use-theme"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { getSnippetCounts } from "@/lib/snippet-stats"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { SearchBar } from "@/components/search-bar"
import { SnippetList } from "@/components/snippet-list"
import { SnippetForm } from "@/components/snippet-form"
import { SnippetViewer } from "@/components/snippet-viewer"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function HomePage() {
  const { theme, toggleTheme } = useTheme()

  const {
    snippets,
    allSnippets,
    filters,
    setFilters,
    allTags,
    allCategories,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    exportJSON,
    importJSON,
    exportGist,
    isLoaded,
  } = useSnippets()

  const [formOpen, setFormOpen] = useState(false)
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null)
  const [viewingSnippet, setViewingSnippet] = useState<Snippet | null>(null)
  const [deletingSnippetId, setDeletingSnippetId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const snippetCounts = getSnippetCounts(allSnippets)

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      ctrl: true,
      description: "Create new snippet",
      handler: () => {
        setEditingSnippet(null)
        setFormOpen(true)
      },
    },
    {
      key: "k",
      ctrl: true,
      description: "Focus search",
      handler: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
    {
      key: "/",
      description: "Focus search",
      handler: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
    {
      key: "Escape",
      description: "Close dialogs",
      handler: () => {
        setFormOpen(false)
        setViewingSnippet(null)
      },
    },
  ])

  const handleNewSnippet = () => {
    setEditingSnippet(null)
    setFormOpen(true)
  }

  const handleEditSnippet = (snippet: Snippet) => {
    setEditingSnippet(snippet)
    setFormOpen(true)
    setViewingSnippet(null)
  }

  const handleSaveSnippet = (data: Omit<Snippet, "id" | "createdAt" | "updatedAt" | "versions">) => {
    if (editingSnippet) {
      updateSnippet(editingSnippet.id, data)
    } else {
      createSnippet(data)
    }
    setFormOpen(false)
    setEditingSnippet(null)
  }

  const handleDeleteSnippet = (id: string) => {
    deleteSnippet(id)
    setDeletingSnippetId(null)
    setViewingSnippet(null)
  }

  const handleViewSnippet = (snippet: Snippet) => {
    setViewingSnippet(snippet)
  }

  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">{"</>"}</span>
          </div>
          <p className="text-muted-foreground">Loading snippets...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <Header
        onNewSnippet={handleNewSnippet}
        onExportJSON={exportJSON}
        onImportJSON={importJSON}
        onExportGist={exportGist}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          allTags={allTags}
          allCategories={allCategories}
          filters={filters}
          onFiltersChange={setFilters}
          snippetCounts={snippetCounts}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 space-y-6">
            <SearchBar filters={filters} onFiltersChange={setFilters} allTags={allTags} allCategories={allCategories} />

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {snippets.length} snippet{snippets.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <SnippetList
              snippets={snippets}
              onEdit={handleEditSnippet}
              onDelete={(id) => setDeletingSnippetId(id)}
              onView={handleViewSnippet}
            />
          </div>
        </main>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSnippet ? "Edit Snippet" : "Create New Snippet"}</DialogTitle>
          </DialogHeader>
          <SnippetForm
            snippet={editingSnippet || undefined}
            onSave={handleSaveSnippet}
            onCancel={() => {
              setFormOpen(false)
              setEditingSnippet(null)
            }}
            theme={theme}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <SnippetViewer
        snippet={viewingSnippet}
        open={!!viewingSnippet}
        onOpenChange={(open) => !open && setViewingSnippet(null)}
        onEdit={() => viewingSnippet && handleEditSnippet(viewingSnippet)}
        onDelete={() => viewingSnippet && setDeletingSnippetId(viewingSnippet.id)}
        theme={theme}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingSnippetId} onOpenChange={(open) => !open && setDeletingSnippetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Snippet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this snippet? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingSnippetId && handleDeleteSnippet(deletingSnippetId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

"use client"

import type { Snippet } from "@/lib/types"
import { SnippetCard } from "./snippet-card"
import { FileCode } from "lucide-react"

interface SnippetListProps {
  snippets: Snippet[]
  onEdit: (snippet: Snippet) => void
  onDelete: (id: string) => void
  onView: (snippet: Snippet) => void
}

export function SnippetList({ snippets, onEdit, onDelete, onView }: SnippetListProps) {
  if (snippets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileCode className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No snippets found</h3>
        <p className="text-muted-foreground max-w-md">
          Create your first code snippet or adjust your filters to see more results.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {snippets.map((snippet) => (
        <SnippetCard
          key={snippet.id}
          snippet={snippet}
          onEdit={() => onEdit(snippet)}
          onDelete={() => onDelete(snippet.id)}
          onClick={() => onView(snippet)}
        />
      ))}
    </div>
  )
}

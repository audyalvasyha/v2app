"use client"

import type { Snippet } from "@/lib/types"
import { LANGUAGE_NAMES } from "@/lib/editor-languages"
import { CodeEditor } from "./code-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Eye, EyeOff, Calendar, Edit, Trash2 } from "lucide-react"

interface SnippetViewerProps {
  snippet: Snippet | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
  theme?: "dark" | "light"
}

export function SnippetViewer({ snippet, open, onOpenChange, onEdit, onDelete, theme = "dark" }: SnippetViewerProps) {
  if (!snippet) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl">{snippet.title}</DialogTitle>
              <DialogDescription className="mt-2">{snippet.description}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{LANGUAGE_NAMES[snippet.language]}</Badge>
            {snippet.category && <Badge variant="secondary">{snippet.category}</Badge>}
            {snippet.visibility === "public" ? (
              <Badge variant="default" className="gap-1">
                <Eye className="h-3 w-3" />
                Public
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <EyeOff className="h-3 w-3" />
                Private
              </Badge>
            )}
            {snippet.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Created: {new Date(snippet.createdAt).toLocaleString()}
            </div>
            <div>Updated: {new Date(snippet.updatedAt).toLocaleString()}</div>
            {snippet.versions.length > 0 && (
              <div>
                {snippet.versions.length} version{snippet.versions.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          <CodeEditor
            value={snippet.code}
            onChange={() => {}}
            language={snippet.language}
            readOnly
            minHeight="500px"
            theme={theme}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import type { Snippet } from "@/lib/types"
import { LANGUAGE_NAMES } from "@/lib/editor-languages"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Trash2, Eye, EyeOff, Calendar } from "lucide-react"

interface SnippetCardProps {
  snippet: Snippet
  onEdit: () => void
  onDelete: () => void
  onClick: () => void
}

export function SnippetCard({ snippet, onEdit, onDelete, onClick }: SnippetCardProps) {
  return (
    <Card className="cursor-pointer hover:border-primary transition-colors" onClick={onClick}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <CardTitle className="text-lg line-clamp-1">{snippet.title}</CardTitle>
            <CardDescription className="line-clamp-2">{snippet.description}</CardDescription>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
          {snippet.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          {snippet.tags.length > 3 && <Badge variant="outline">+{snippet.tags.length - 3}</Badge>}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(snippet.updatedAt).toLocaleDateString()}
          </div>
          {snippet.versions.length > 0 && (
            <div>
              {snippet.versions.length} version{snippet.versions.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import type React from "react"

import { useState } from "react"
import type { Snippet, Language } from "@/lib/types"
import { LANGUAGE_NAMES } from "@/lib/editor-languages"
import { CodeEditor } from "./code-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { X, Save, Clock } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface SnippetFormProps {
  snippet?: Snippet
  onSave: (data: Omit<Snippet, "id" | "createdAt" | "updatedAt" | "versions">) => void
  onCancel: () => void
  theme?: "dark" | "light"
}

export function SnippetForm({ snippet, onSave, onCancel, theme = "dark" }: SnippetFormProps) {
  const [title, setTitle] = useState(snippet?.title || "")
  const [description, setDescription] = useState(snippet?.description || "")
  const [code, setCode] = useState(snippet?.code || "")
  const [language, setLanguage] = useState<Language>(snippet?.language || "javascript")
  const [category, setCategory] = useState(snippet?.category || "")
  const [visibility, setVisibility] = useState<"public" | "private">(snippet?.visibility || "private")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>(snippet?.tags || [])
  const [showVersions, setShowVersions] = useState(false)

  const handleAddTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      title,
      description,
      code,
      language,
      category,
      visibility,
      tags,
    })
  }

  const languages = Object.keys(LANGUAGE_NAMES) as Language[]

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My awesome snippet"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {LANGUAGE_NAMES[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this snippet do?"
            rows={3}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Utilities, API"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select value={visibility} onValueChange={(value: "public" | "private") => setVisibility(value)}>
              <SelectTrigger id="visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                placeholder="Add tag..."
              />
              <Button type="button" onClick={handleAddTag} variant="secondary">
                Add
              </Button>
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Code</Label>
            {snippet && snippet.versions.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowVersions(true)} className="gap-2">
                <Clock className="h-4 w-4" />
                View History ({snippet.versions.length})
              </Button>
            )}
          </div>
          <CodeEditor value={code} onChange={setCode} language={language} theme={theme} />
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="gap-2">
            <Save className="h-4 w-4" />
            Save Snippet
          </Button>
        </div>
      </form>

      {snippet && (
        <Dialog open={showVersions} onOpenChange={setShowVersions}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {snippet.versions.map((version) => (
                <div key={version.id} className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{new Date(version.timestamp).toLocaleString()}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCode(version.code)
                        setShowVersions(false)
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                  <CodeEditor
                    value={version.code}
                    onChange={() => {}}
                    language={language}
                    readOnly
                    minHeight="200px"
                    theme={theme}
                  />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

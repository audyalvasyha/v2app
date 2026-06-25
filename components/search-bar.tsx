"use client"

import type React from "react"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, X, Filter } from "lucide-react"
import type { SnippetFilters, Language } from "@/lib/types"
import { LANGUAGE_NAMES } from "@/lib/editor-languages"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface SearchBarProps {
  filters: SnippetFilters
  onFiltersChange: (filters: SnippetFilters) => void
  allTags: string[]
  allCategories: string[]
}

export function SearchBar({ filters, onFiltersChange, allTags, allCategories }: SearchBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search || "")

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onFiltersChange({ ...filters, search: localSearch })
  }

  const clearFilters = () => {
    setLocalSearch("")
    onFiltersChange({})
  }

  const hasActiveFilters =
    filters.search ||
    filters.language ||
    filters.category ||
    (filters.tags && filters.tags.length > 0) ||
    filters.visibility

  const languages = Object.keys(LANGUAGE_NAMES) as Language[]

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search snippets... (title, description, code, tags)"
            className="pl-10"
          />
        </div>
        <Button type="submit">Search</Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 bg-transparent">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  !
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={filters.language || "all"}
                  onValueChange={(value) =>
                    onFiltersChange({ ...filters, language: value === "all" ? undefined : (value as Language) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Languages</SelectItem>
                    {languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {LANGUAGE_NAMES[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={filters.category || "all"}
                  onValueChange={(value) =>
                    onFiltersChange({ ...filters, category: value === "all" ? undefined : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {allCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select
                  value={filters.visibility || "all"}
                  onValueChange={(value) =>
                    onFiltersChange({
                      ...filters,
                      visibility: value === "all" ? undefined : (value as "public" | "private"),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {allTags.length > 0 && (
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="max-h-32 overflow-y-auto space-y-2">
                    {allTags.map((tag) => (
                      <div key={tag} className="flex items-center gap-2">
                        <Checkbox
                          id={`tag-${tag}`}
                          checked={filters.tags?.includes(tag)}
                          onCheckedChange={(checked) => {
                            const currentTags = filters.tags || []
                            const newTags = checked ? [...currentTags, tag] : currentTags.filter((t) => t !== tag)
                            onFiltersChange({ ...filters, tags: newTags.length > 0 ? newTags : undefined })
                          }}
                        />
                        <Label htmlFor={`tag-${tag}`} className="cursor-pointer">
                          {tag}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="regex"
                  checked={filters.useRegex}
                  onCheckedChange={(checked) => onFiltersChange({ ...filters, useRegex: checked as boolean })}
                />
                <Label htmlFor="regex" className="cursor-pointer">
                  Use Regular Expression
                </Label>
              </div>

              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} className="w-full gap-2 bg-transparent">
                  <X className="h-4 w-4" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </form>

      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <button
                onClick={() => {
                  setLocalSearch("")
                  onFiltersChange({ ...filters, search: undefined })
                }}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.language && (
            <Badge variant="secondary" className="gap-1">
              {LANGUAGE_NAMES[filters.language]}
              <button
                onClick={() => onFiltersChange({ ...filters, language: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.category && (
            <Badge variant="secondary" className="gap-1">
              {filters.category}
              <button
                onClick={() => onFiltersChange({ ...filters, category: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.visibility && (
            <Badge variant="secondary" className="gap-1">
              {filters.visibility}
              <button
                onClick={() => onFiltersChange({ ...filters, visibility: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

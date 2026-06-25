"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight, Tag, Folder, Code2, Eye, EyeOff } from "lucide-react"
import type { Language, SnippetFilters } from "@/lib/types"
import { LANGUAGE_NAMES } from "@/lib/editor-languages"

interface SidebarProps {
  allTags: string[]
  allCategories: string[]
  filters: SnippetFilters
  onFiltersChange: (filters: SnippetFilters) => void
  snippetCounts: {
    total: number
    public: number
    private: number
    byLanguage: Record<string, number>
    byCategory: Record<string, number>
    byTag: Record<string, number>
  }
}

export function Sidebar({ allTags, allCategories, filters, onFiltersChange, snippetCounts }: SidebarProps) {
  const [languagesOpen, setLanguagesOpen] = useState(true)
  const [categoriesOpen, setCategoriesOpen] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(true)

  const topLanguages = Object.entries(snippetCounts.byLanguage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  return (
    <div className="w-64 border-r border-border flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-lg">Organization</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Visibility Quick Filters */}
          <div className="space-y-2">
            <Button
              variant={!filters.visibility ? "secondary" : "ghost"}
              className="w-full justify-between"
              onClick={() => onFiltersChange({ ...filters, visibility: undefined })}
            >
              <span className="flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                All Snippets
              </span>
              <Badge variant="secondary">{snippetCounts.total}</Badge>
            </Button>
            <Button
              variant={filters.visibility === "public" ? "secondary" : "ghost"}
              className="w-full justify-between"
              onClick={() => onFiltersChange({ ...filters, visibility: "public" })}
            >
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Public
              </span>
              <Badge variant="secondary">{snippetCounts.public}</Badge>
            </Button>
            <Button
              variant={filters.visibility === "private" ? "secondary" : "ghost"}
              className="w-full justify-between"
              onClick={() => onFiltersChange({ ...filters, visibility: "private" })}
            >
              <span className="flex items-center gap-2">
                <EyeOff className="h-4 w-4" />
                Private
              </span>
              <Badge variant="secondary">{snippetCounts.private}</Badge>
            </Button>
          </div>

          <Separator />

          {/* Languages */}
          {topLanguages.length > 0 && (
            <Collapsible open={languagesOpen} onOpenChange={setLanguagesOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:text-foreground">
                <span className="flex items-center gap-2 font-medium">
                  <Code2 className="h-4 w-4" />
                  Languages
                </span>
                {languagesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {topLanguages.map(([lang, count]) => (
                  <Button
                    key={lang}
                    variant={filters.language === lang ? "secondary" : "ghost"}
                    className="w-full justify-between text-sm"
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        language: filters.language === lang ? undefined : (lang as Language),
                      })
                    }
                  >
                    <span>{LANGUAGE_NAMES[lang as Language]}</span>
                    <Badge variant="outline" className="text-xs">
                      {count}
                    </Badge>
                  </Button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator />

          {/* Categories */}
          {allCategories.length > 0 && (
            <Collapsible open={categoriesOpen} onOpenChange={setCategoriesOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:text-foreground">
                <span className="flex items-center gap-2 font-medium">
                  <Folder className="h-4 w-4" />
                  Categories
                </span>
                {categoriesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {allCategories.map((category) => (
                  <Button
                    key={category}
                    variant={filters.category === category ? "secondary" : "ghost"}
                    className="w-full justify-between text-sm"
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        category: filters.category === category ? undefined : category,
                      })
                    }
                  >
                    <span className="truncate">{category}</span>
                    <Badge variant="outline" className="text-xs">
                      {snippetCounts.byCategory[category] || 0}
                    </Badge>
                  </Button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator />

          {/* Tags */}
          {allTags.length > 0 && (
            <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:text-foreground">
                <span className="flex items-center gap-2 font-medium">
                  <Tag className="h-4 w-4" />
                  Tags
                </span>
                {tagsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {allTags.slice(0, 20).map((tag) => {
                  const isSelected = filters.tags?.includes(tag)
                  return (
                    <Button
                      key={tag}
                      variant={isSelected ? "secondary" : "ghost"}
                      className="w-full justify-between text-sm"
                      onClick={() => {
                        const currentTags = filters.tags || []
                        const newTags = isSelected ? currentTags.filter((t) => t !== tag) : [...currentTags, tag]
                        onFiltersChange({
                          ...filters,
                          tags: newTags.length > 0 ? newTags : undefined,
                        })
                      }}
                    >
                      <span className="truncate">{tag}</span>
                      <Badge variant="outline" className="text-xs">
                        {snippetCounts.byTag[tag] || 0}
                      </Badge>
                    </Button>
                  )
                })}
                {allTags.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">+{allTags.length - 20} more tags</p>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

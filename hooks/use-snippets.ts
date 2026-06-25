"use client"

import { useState, useEffect, useCallback } from "react"
import type { Snippet, SnippetFilters } from "@/lib/types"
import { SnippetStorage } from "@/lib/storage"
import { filterSnippets, getAllTags, getAllCategories } from "@/lib/search"

export function useSnippets() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [filters, setFilters] = useState<SnippetFilters>({})
  const [isLoaded, setIsLoaded] = useState(false)

  // Load snippets from storage
  useEffect(() => {
    const loaded = SnippetStorage.getAll()
    setSnippets(loaded)
    setIsLoaded(true)
  }, [])

  const filteredSnippets = filterSnippets(snippets, filters)
  const allTags = getAllTags(snippets)
  const allCategories = getAllCategories(snippets)

  const createSnippet = useCallback((snippet: Omit<Snippet, "id" | "createdAt" | "updatedAt" | "versions">) => {
    const newSnippet = SnippetStorage.create(snippet)
    setSnippets((prev) => [...prev, newSnippet])
    return newSnippet
  }, [])

  const updateSnippet = useCallback((id: string, updates: Partial<Snippet>, saveVersion = true) => {
    const updated = SnippetStorage.update(id, updates, saveVersion)
    if (updated) {
      setSnippets((prev) => prev.map((s) => (s.id === id ? updated : s)))
    }
    return updated
  }, [])

  const deleteSnippet = useCallback((id: string) => {
    const success = SnippetStorage.delete(id)
    if (success) {
      setSnippets((prev) => prev.filter((s) => s.id !== id))
    }
    return success
  }, [])

  const exportJSON = useCallback(() => {
    return SnippetStorage.exportJSON()
  }, [])

  const importJSON = useCallback((json: string) => {
    const result = SnippetStorage.importJSON(json)
    if (result.success) {
      setSnippets(SnippetStorage.getAll())
    }
    return result
  }, [])

  const exportGist = useCallback(() => {
    return SnippetStorage.exportGist()
  }, [])

  return {
    snippets: filteredSnippets,
    allSnippets: snippets,
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
  }
}

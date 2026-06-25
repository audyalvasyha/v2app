import type { Snippet, SnippetFilters } from "./types"

export function filterSnippets(snippets: Snippet[], filters: SnippetFilters): Snippet[] {
  return snippets.filter((snippet) => {
    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()

      if (filters.useRegex) {
        try {
          const regex = new RegExp(filters.search, "i")
          const matches =
            regex.test(snippet.title) ||
            regex.test(snippet.description) ||
            regex.test(snippet.code) ||
            snippet.tags.some((tag) => regex.test(tag))
          if (!matches) return false
        } catch {
          // Invalid regex, fall back to normal search
          const matches =
            snippet.title.toLowerCase().includes(searchTerm) ||
            snippet.description.toLowerCase().includes(searchTerm) ||
            snippet.code.toLowerCase().includes(searchTerm) ||
            snippet.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
          if (!matches) return false
        }
      } else {
        const matches =
          snippet.title.toLowerCase().includes(searchTerm) ||
          snippet.description.toLowerCase().includes(searchTerm) ||
          snippet.code.toLowerCase().includes(searchTerm) ||
          snippet.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
        if (!matches) return false
      }
    }

    // Language filter
    if (filters.language && snippet.language !== filters.language) {
      return false
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      const hasAllTags = filters.tags.every((tag) => snippet.tags.some((st) => st.toLowerCase() === tag.toLowerCase()))
      if (!hasAllTags) return false
    }

    // Category filter
    if (filters.category && snippet.category !== filters.category) {
      return false
    }

    // Visibility filter
    if (filters.visibility && snippet.visibility !== filters.visibility) {
      return false
    }

    return true
  })
}

export function getAllTags(snippets: Snippet[]): string[] {
  const tags = new Set<string>()
  snippets.forEach((snippet) => {
    snippet.tags.forEach((tag) => tags.add(tag))
  })
  return Array.from(tags).sort()
}

export function getAllCategories(snippets: Snippet[]): string[] {
  const categories = new Set<string>()
  snippets.forEach((snippet) => {
    if (snippet.category) categories.add(snippet.category)
  })
  return Array.from(categories).sort()
}

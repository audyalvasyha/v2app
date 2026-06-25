import type { Snippet, SnippetVersion } from "./types"

const STORAGE_KEY = "code-snippets"
const VERSION_LIMIT = 10

export class SnippetStorage {
  static getAll(): Snippet[] {
    if (typeof window === "undefined") return []
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  }

  static save(snippets: Snippet[]): void {
    if (typeof window === "undefined") return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets))
  }

  static create(snippet: Omit<Snippet, "id" | "createdAt" | "updatedAt" | "versions">): Snippet {
    const snippets = this.getAll()
    const newSnippet: Snippet = {
      ...snippet,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [],
    }
    snippets.push(newSnippet)
    this.save(snippets)
    return newSnippet
  }

  static update(id: string, updates: Partial<Snippet>, saveVersion = true): Snippet | null {
    const snippets = this.getAll()
    const index = snippets.findIndex((s) => s.id === id)
    if (index === -1) return null

    const snippet = snippets[index]

    // Save version if code changed
    if (saveVersion && updates.code && updates.code !== snippet.code) {
      const version: SnippetVersion = {
        id: crypto.randomUUID(),
        code: snippet.code,
        timestamp: new Date().toISOString(),
      }
      snippet.versions.unshift(version)
      // Keep only last VERSION_LIMIT versions
      if (snippet.versions.length > VERSION_LIMIT) {
        snippet.versions = snippet.versions.slice(0, VERSION_LIMIT)
      }
    }

    snippets[index] = {
      ...snippet,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    this.save(snippets)
    return snippets[index]
  }

  static delete(id: string): boolean {
    const snippets = this.getAll()
    const filtered = snippets.filter((s) => s.id !== id)
    if (filtered.length === snippets.length) return false
    this.save(filtered)
    return true
  }

  static getById(id: string): Snippet | null {
    const snippets = this.getAll()
    return snippets.find((s) => s.id === id) || null
  }

  static exportJSON(): string {
    const snippets = this.getAll()
    return JSON.stringify(snippets, null, 2)
  }

  static importJSON(json: string): { success: boolean; count: number; error?: string } {
    try {
      const imported = JSON.parse(json) as Snippet[]
      if (!Array.isArray(imported)) {
        return { success: false, count: 0, error: "Invalid format: expected array" }
      }

      const existing = this.getAll()
      const merged = [...existing, ...imported]
      this.save(merged)

      return { success: true, count: imported.length }
    } catch (error) {
      return { success: false, count: 0, error: (error as Error).message }
    }
  }

  static exportGist() {
    const snippets = this.getAll()
    const gist: { [key: string]: { content: string } } = {}

    snippets.forEach((snippet) => {
      const extension = getLanguageExtension(snippet.language)
      const filename = `${snippet.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}${extension}`
      gist[filename] = {
        content: `// ${snippet.title}\n// ${snippet.description}\n// Tags: ${snippet.tags.join(", ")}\n\n${snippet.code}`,
      }
    })

    return {
      description: "Code snippets export",
      public: false,
      files: gist,
    }
  }
}

function getLanguageExtension(language: string): string {
  const extensions: { [key: string]: string } = {
    javascript: ".js",
    typescript: ".ts",
    python: ".py",
    java: ".java",
    cpp: ".cpp",
    c: ".c",
    csharp: ".cs",
    go: ".go",
    rust: ".rs",
    ruby: ".rb",
    php: ".php",
    swift: ".swift",
    kotlin: ".kt",
    scala: ".scala",
    dart: ".dart",
    html: ".html",
    css: ".css",
    scss: ".scss",
    json: ".json",
    yaml: ".yaml",
    xml: ".xml",
    sql: ".sql",
    graphql: ".graphql",
    bash: ".sh",
    shell: ".sh",
    powershell: ".ps1",
    markdown: ".md",
    jsx: ".jsx",
    tsx: ".tsx",
    vue: ".vue",
    svelte: ".svelte",
  }
  return extensions[language] || ".txt"
}

"use client"

import { useEffect } from "react"

interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  handler: () => void
  description: string
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl === undefined || shortcut.ctrl === (e.ctrlKey || e.metaKey)
        const shiftMatch = shortcut.shift === undefined || shortcut.shift === e.shiftKey
        const altMatch = shortcut.alt === undefined || shortcut.alt === e.altKey
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          e.preventDefault()
          shortcut.handler()
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [shortcuts])
}

export const KEYBOARD_SHORTCUTS = [
  { key: "n", ctrl: true, description: "Create new snippet" },
  { key: "k", ctrl: true, description: "Focus search" },
  { key: "s", ctrl: true, description: "Save current snippet" },
  { key: "e", ctrl: true, description: "Export snippets" },
  { key: "/", ctrl: false, description: "Focus search (alternative)" },
  { key: "Escape", ctrl: false, description: "Close dialogs" },
]

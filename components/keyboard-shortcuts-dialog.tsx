"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Keyboard } from "lucide-react"
import { KEYBOARD_SHORTCUTS } from "@/hooks/use-keyboard-shortcuts"
import { Badge } from "@/components/ui/badge"

export function KeyboardShortcutsDialog() {
  // Dibaca setelah mount agar render server dan klien pertama identik.
  // Menghitung navigator saat render membuat label ⌘/Ctrl bisa hydration mismatch.
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform))
  }, [])
  const ctrlKey = isMac ? "⌘" : "Ctrl"

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Pintasan keyboard"
          aria-label="Pintasan keyboard"
          className="hidden h-9 w-9 md:inline-flex"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pintasan Keyboard</DialogTitle>
          <DialogDescription>Percepat kerja dengan pintasan berikut.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.key} className="flex items-center justify-between">
              <span className="text-sm">{shortcut.description}</span>
              <div className="flex gap-1">
                {shortcut.ctrl && <Badge variant="outline">{ctrlKey}</Badge>}
                {shortcut.shift && <Badge variant="outline">Shift</Badge>}
                {shortcut.alt && <Badge variant="outline">Alt</Badge>}
                <Badge variant="outline">{shortcut.key === "/" ? "/" : shortcut.key.toUpperCase()}</Badge>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

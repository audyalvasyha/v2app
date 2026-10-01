"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ThemePreference } from "@/hooks/use-theme"

interface ThemeToggleProps {
  theme: "dark" | "light"
  preference: ThemePreference
  onToggle: () => void
}

const LABEL: Record<ThemePreference, string> = {
  system: "Tema: mengikuti device — klik untuk Terang",
  light: "Tema: Terang — klik untuk Gelap",
  dark: "Tema: Gelap — klik untuk kembali mengikuti device",
}

/**
 * Berputar tiga status: system (ikut device) → light → dark → system.
 * Ikon Monitor menandakan mode otomatis sedang aktif, jadi user tahu device
 * yang menentukan tema — dan selalu bisa balik ke mode itu.
 */
export function ThemeToggle({ theme, preference, onToggle }: ThemeToggleProps) {
  const Icon = preference === "system" ? Monitor : theme === "dark" ? Sun : Moon
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      title={LABEL[preference]}
      aria-label={LABEL[preference]}
      className="h-9 w-9"
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}
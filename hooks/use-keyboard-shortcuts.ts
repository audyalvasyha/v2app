import { useEffect } from "react"
import type { View } from "@/components/templates/dashboard-layout"

export type Shortcut = {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  description: string
}

// Daftar Shortcut Khusus Fleet Management System
export const KEYBOARD_SHORTCUTS: Shortcut[] = [
  { key: "/", ctrl: true, description: "Fokus ke Kolom Pencarian" },
  { key: "d", alt: true, description: "Buka Tab Dashboard" },
  { key: "e", alt: true, description: "Buka Tab Equipment" },
  { key: "h", alt: true, description: "Buka Tab Histories" },
  { key: "m", alt: true, description: "Buka Tab Monitoring" },
  { key: "s", alt: true, description: "Buka Tab SKR (Sisa Kiriman)" },
  { key: "p", alt: true, description: "Buka Tab Pengiriman" },
  { key: "b", alt: true, description: "Buka Tab Analisa Ban" },
  { key: "w", alt: true, description: "Buka Tab Perkiraan Cuaca" },
  { key: "t", alt: true, description: "Ganti Tema (Dark/Light)" },
]

export function useKeyboardShortcuts(
  onViewChange?: (view: View) => void,
  onToggleTheme?: () => void
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Abaikan jika user sedang mengetik di dalam input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Ctrl + / : Fokus Search
      if (e.ctrlKey && e.key === "/") {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="Cari"]') as HTMLInputElement
        if (searchInput) searchInput.focus()
      }

      // Alt + D : Dashboard
      if (e.altKey && e.key.toLowerCase() === "d" && onViewChange) {
        e.preventDefault(); onViewChange("dashboard");
      }
      // Alt + E : Equipment
      if (e.altKey && e.key.toLowerCase() === "e" && onViewChange) {
        e.preventDefault(); onViewChange("equipment");
      }
      // Alt + H : Histories
      if (e.altKey && e.key.toLowerCase() === "h" && onViewChange) {
        e.preventDefault(); onViewChange("maintenance");
      }
      // Alt + M : Monitoring
      if (e.altKey && e.key.toLowerCase() === "m" && onViewChange) {
        e.preventDefault(); onViewChange("monitoring");
      }
      // Alt + S : SKR
      if (e.altKey && e.key.toLowerCase() === "s" && onViewChange) {
        e.preventDefault(); onViewChange("skr");
      }
      // Alt + P : Pengiriman
      if (e.altKey && e.key.toLowerCase() === "p" && onViewChange) {
        e.preventDefault(); onViewChange("pengiriman");
      }
      // Alt + B : Analisa Ban
      if (e.altKey && e.key.toLowerCase() === "b" && onViewChange) {
        e.preventDefault(); onViewChange("ban");
      }
      // Alt + W : Perkiraan Cuaca
      if (e.altKey && e.key.toLowerCase() === "w" && onViewChange) {
        e.preventDefault(); onViewChange("weather");
      }
      // Alt + T : Tema
      if (e.altKey && e.key.toLowerCase() === "t" && onToggleTheme) {
        e.preventDefault(); onToggleTheme();
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onViewChange, onToggleTheme])
}
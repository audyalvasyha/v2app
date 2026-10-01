"use client"

import { useEffect, useState } from "react"

type Theme = "dark" | "light"

// Pilihan manual user disimpan di sini; kalau kosong, tema mengikuti
// pengaturan sistem operasi (Settings → Appearance / Dark Mode).
const STORAGE_KEY = "snippet-manager-theme"

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "dark" || stored === "light" ? stored : null
  } catch {
    return null // localStorage tidak tersedia (mis. mode privat)
  }
}

function readSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

/**
 * Tema mengikuti pengaturan device secara default: sistem dark → aplikasi
 * dark, sistem light → aplikasi light, dan berubah ikut device saat real-time
 * (mis. OS masuk mode malam).
 *
 * Tombol tema di header tetap ada sebagai pengecualian: sekali diklik, pilihan
 * manual user disimpan dan device tidak lagi menimpa. Hapus storage key
 * "snippet-manager-theme" di browser untuk kembali ke mode otomatis.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light")

  // Terapkan tema awal saat mount. Class `dark` sudah dipasang lebih awal oleh
  // script inline di app/layout.tsx — ini hanya menyinkronkan state React.
  useEffect(() => {
    const initial = readStoredTheme() ?? readSystemTheme()
    setTheme(initial)
    applyTheme(initial)
  }, [])

  // Ikuti perubahan device selama belum ada pilihan manual.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      if (readStoredTheme()) return // pilihan manual lebih diprioritaskan
      const next = readSystemTheme()
      setTheme(next)
      applyTheme(next)
    }
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark"
    setTheme(newTheme)
    try {
      localStorage.setItem(STORAGE_KEY, newTheme)
    } catch {
      /* localStorage tidak tersedia — tema tetap berubah untuk sesi ini */
    }
    applyTheme(newTheme)
  }

  return { theme, toggleTheme }
}
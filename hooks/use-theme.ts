"use client"

import { useEffect, useState } from "react"

export type Theme = "dark" | "light"
// "system" = ikut pengaturan device. Nilai inilah yang jadi default.
export type ThemePreference = Theme | "system"

const STORAGE_KEY = "snippet-manager-theme"

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "dark" || stored === "light" || stored === "system") return stored
  } catch {
    /* localStorage tidak tersedia (mis. mode privat) */
  }
  return "system"
}

function readSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolve(preference: ThemePreference): Theme {
  return preference === "system" ? readSystemTheme() : preference
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

/**
 * Tema mengikuti pengaturan device: sistem dark → aplikasi dark, sistem light
 * → aplikasi light, dan ikut berubah real-time (mis. OS masuk mode malam).
 *
 * Tombol tema berputar tiga status — system → light → dark → system. Mode
 * "system" harus selalu bisa dicapai lagi: kalau hanya dua status, user yang
 * pernah menyetel manual akan terkunci selamanya di pilihan itu dan device
 * tidak lagi bisa mengaturnya (ini sempat jadi bug: localStorage sudah berisi
 * nilai lama, padahal user justru ingin balik ikut device).
 */
export function useTheme() {
  // Default "system" supaya SSR dan render pertama sama dengan nilai client
  // sebelum efek berjalan — menghindari kedip tema.
  const [preference, setPreference] = useState<ThemePreference>("system")
  const [theme, setTheme] = useState<Theme>("light")

  // Terapkan tema awal saat mount. Class `dark` sudah dipasang lebih awal oleh
  // script inline di app/layout.tsx — ini hanya menyinkronkan state React.
  useEffect(() => {
    const stored = readStoredPreference()
    const resolved = resolve(stored)
    setPreference(stored)
    setTheme(resolved)
    applyTheme(resolved)
  }, [])

  // Ikuti perubahan device selama belum ada pilihan manual. localStorage
  // dibaca langsung (bukan state) supaya selalu sesuai dengan sumber kebenaran
  // — setiap pilihan user langsung disimpan.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      if (readStoredPreference() !== "system") return // pilihan manual menang
      const next = readSystemTheme()
      setTheme(next)
      applyTheme(next)
    }
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [])

  const toggleTheme = () => {
    const next: ThemePreference =
      preference === "system" ? "light" : preference === "light" ? "dark" : "system"
    const resolved = resolve(next)
    setPreference(next)
    setTheme(resolved)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* localStorage tidak tersedia — tema tetap berubah untuk sesi ini */
    }
    applyTheme(resolved)
  }

  return { theme, preference, toggleTheme }
}
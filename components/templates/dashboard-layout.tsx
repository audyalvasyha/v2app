import React, { memo, useState, useCallback, useEffect } from "react"
// Sesuaikan import ini jika Anda sudah memindahkan header & sidebar ke folder organisms
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import type { ThemePreference } from "@/hooks/use-theme"
import type { GlobalSearchItem, GlobalSearchGroupCount } from "@/components/molecules/global-search-dropdown"
import type { AlertView, AppAlert } from "@/lib/alerts"

export type View = 'dashboard' | 'tugas' | 'equipment' | 'maintenance' | 'monitoring' | 'about' | 'skr' | 'pengiriman' | 'ban' | 'weather' | 'traffic' | 'analisa'

const SIDEBAR_COLLAPSED_KEY = "fleet-sidebar-collapsed"

export interface DashboardLayoutProps {
  theme: "dark" | "light";
  themePreference: ThemePreference;
  onToggleTheme: () => void;
  activeView: View;
  onViewChange: (view: View) => void;
  equipmentCounts: { total: number; available: number };
  /** Menu yang boleh tampil untuk peran user aktif (lihat lib/roles.ts) */
  allowedViews: View[];
  /** Pencarian global di header — akan dioper ke komponen Header */
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Hasil search lintas menu untuk dropdown search header */
  searchItems: GlobalSearchItem[];
  searchCounts: GlobalSearchGroupCount[];
  /** Item hasil dipilih → pindah ke menu tujuan */
  onSearchSelect: (view: View) => void;
  /** Peringatan operasional untuk lonceng di header */
  alerts?: AppAlert[];
  onSelectAlert?: (view: AlertView) => void;
  children: React.ReactNode;
}

function DashboardLayoutImpl({
  theme,
  themePreference,
  onToggleTheme,
  activeView,
  onViewChange,
  equipmentCounts,
  allowedViews,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  searchItems,
  searchCounts,
  onSearchSelect,
  alerts,
  onSelectAlert,
  children
}: DashboardLayoutProps) {
  // State collapse sidebar — dipulihkan dari localStorage saat mount
  const [collapsed, setCollapsed] = useState(false)
  // Di layar kecil sidebar tampil sebagai drawer supaya konten tidak
  // terjepit oleh lebar tetap 256px.
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true")
    } catch { /* localStorage tidak tersedia */ }
  }, [])

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* abaikan */ }
      return next
    })
  }, [])

  const handleViewChange = useCallback((view: View) => {
    onViewChange(view)
    setMobileOpen(false)
  }, [onViewChange])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)")
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false)
    }
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [])

  return (
    // Document dikunci setinggi viewport. Scroll konten terjadi di <main>, bukan
    // di body — ini yang membuat address bar mobile tidak ikut sembunyi saat
    // halaman About/tabel panjang digulir.
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Header
        theme={theme}
        themePreference={themePreference}
        onToggleTheme={onToggleTheme}
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        searchItems={searchItems}
        searchCounts={searchCounts}
        onSearchSelect={onSearchSelect}
        alerts={alerts}
        onSelectAlert={onSelectAlert}
        onOpenSidebar={() => setMobileOpen((open) => !open)}
      />

      {mobileOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/40 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {/* Sidebar fixed (selalu terlihat di bawah header); konten utama punya
          scroll container sendiri supaya body tetap diam. */}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          equipmentCounts={equipmentCounts}
          collapsed={mobileOpen ? false : collapsed}
          onToggleCollapsed={handleToggleCollapsed}
          allowedViews={allowedViews}
          mobileOpen={mobileOpen}
        />

        <main
          id="app-scroll"
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-background transition-[margin] duration-200 ease-in-out ${
            collapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

// Memo: layout tidak pernah re-render saat data tabel berubah, hanya saat prop-nya berubah
export const DashboardLayout = memo(DashboardLayoutImpl)

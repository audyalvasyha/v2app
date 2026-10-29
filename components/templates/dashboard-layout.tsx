import React, { memo, useState, useCallback, useEffect } from "react"
// Sesuaikan import ini jika Anda sudah memindahkan header & sidebar ke folder organisms
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import type { ThemePreference } from "@/hooks/use-theme"
import type { GlobalSearchItem, GlobalSearchGroupCount } from "@/components/molecules/global-search-dropdown"

export type View = 'dashboard' | 'equipment' | 'maintenance' | 'monitoring' | 'about' | 'skr' | 'pengiriman' | 'ban' | 'weather' | 'traffic' | 'analisa'

const SIDEBAR_COLLAPSED_KEY = "fleet-sidebar-collapsed"

export interface DashboardLayoutProps {
  theme: "dark" | "light";
  themePreference: ThemePreference;
  onToggleTheme: () => void;
  activeView: View;
  onViewChange: (view: View) => void;
  equipmentCounts: { total: number; available: number };
  /** Pencarian global di header — akan dioper ke komponen Header */
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Hasil search lintas menu untuk dropdown search header */
  searchItems: GlobalSearchItem[];
  searchCounts: GlobalSearchGroupCount[];
  /** Item hasil dipilih → pindah ke menu tujuan */
  onSearchSelect: (view: View) => void;
  children: React.ReactNode;
}

function DashboardLayoutImpl({
  theme,
  themePreference,
  onToggleTheme,
  activeView,
  onViewChange,
  equipmentCounts,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  searchItems,
  searchCounts,
  onSearchSelect,
  children
}: DashboardLayoutProps) {
  // State collapse sidebar — dipulihkan dari localStorage saat mount
  const [collapsed, setCollapsed] = useState(false)

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

  return (
    // Tanpa overflow-hidden: halaman di-scroll lewat scroll utama dokumen (window)
    <div className="min-h-screen flex flex-col">
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
      />

      {/* Sidebar fixed (selalu terlihat di bawah header); konten utama scroll di level dokumen */}
      <div className="flex flex-1">
        <Sidebar
          activeView={activeView}
          onViewChange={onViewChange}
          equipmentCounts={equipmentCounts}
          collapsed={collapsed}
          onToggleCollapsed={handleToggleCollapsed}
        />

        <main
          className={`flex-1 min-w-0 flex flex-col bg-background transition-[margin] duration-200 ease-in-out ${
            collapsed ? 'ml-16' : 'ml-64'
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

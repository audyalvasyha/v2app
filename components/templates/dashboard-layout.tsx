import React, { memo, useState, useCallback, useEffect } from "react"
// Sesuaikan import ini jika Anda sudah memindahkan header & sidebar ke folder organisms
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"

export type View = 'dashboard' | 'equipment' | 'maintenance' | 'monitoring' | 'about' | 'skr' | 'pengiriman'

const SIDEBAR_COLLAPSED_KEY = "fleet-sidebar-collapsed"

export interface DashboardLayoutProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  activeView: View;
  onViewChange: (view: View) => void;
  equipmentCounts: { total: number; available: number };
  children: React.ReactNode;
}

function DashboardLayoutImpl({
  theme,
  onToggleTheme,
  activeView,
  onViewChange,
  equipmentCounts,
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
      <Header theme={theme} onToggleTheme={onToggleTheme} />

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

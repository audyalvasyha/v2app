import React from "react"
// Sesuaikan import ini jika Anda sudah memindahkan header & sidebar ke folder organisms
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"

interface DashboardLayoutProps {
  theme: string;
  onToggleTheme: () => void;
  activeView: 'equipment' | 'maintenance' | 'about';
  onViewChange: (view: 'equipment' | 'maintenance' | 'about') => void;
  equipmentCounts: { total: number; available: number };
  children: React.ReactNode;
}

export function DashboardLayout({
  theme,
  onToggleTheme,
  activeView,
  onViewChange,
  equipmentCounts,
  children
}: DashboardLayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        onNewSnippet={() => console.log("New Item clicked")}
        onExportJSON={() => { }}
        onImportJSON={() => { }}
        onExportGist={() => { }}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onViewChange={onViewChange}
          equipmentCounts={equipmentCounts}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {children}
        </main>
      </div>
    </div>
  )
}
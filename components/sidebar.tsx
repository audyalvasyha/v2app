"use client"

import React, { useEffect, useState } from "react"
import { Settings, History, Activity, LayoutDashboard, User, PanelLeftClose, PanelLeftOpen, Boxes, Send, Disc3, CloudSun, LogOut, MapPin, BotMessageSquare, Layers, ChevronDown, Info, ListChecks, ClipboardCheck, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/utils/supabase"
import { clearSensitiveBrowserCache } from "@/lib/browser-cache"
import type { View } from "@/components/templates/dashboard-layout"

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  equipmentCounts: { total: number; available: number };
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Menu yang boleh tampil untuk peran user aktif (lihat lib/roles.ts) */
  allowedViews: View[];
  /** Nama tampilan user aktif — email tidak dirender di sidebar. */
  displayName?: string | null;
  /** Drawer terbuka di layar kecil — diabaikan pada desktop. */
  mobileOpen?: boolean;
}

interface SidebarButtonProps {
  icon: LucideIcon
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
  badge?: React.ReactNode
}

function SidebarButton({ icon: Icon, label, active, collapsed, onClick, badge }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
        collapsed ? 'justify-center px-0' : 'justify-between'
      } ${
        active
          ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : ''}`} />
        {!collapsed && <span>{label}</span>}
      </div>
      {!collapsed && badge}
    </button>
  )
}

function SidebarSectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-2 my-2 border-t border-sidebar-border" role="presentation" />
  }
  return (
    <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 select-none">
      {label}
    </div>
  )
}

export function Sidebar({ activeView, onViewChange, equipmentCounts, collapsed, onToggleCollapsed, allowedViews, displayName, mobileOpen = false }: SidebarProps) {
  const can = (view: View) => allowedViews.includes(view)
  const [accountOpen, setAccountOpen] = useState(false)
  const [fleetOpen, setFleetOpen] = useState(true)
  const fleetSubmenuActive = ["equipment", "maintenance", "ban", "monitoring"].includes(activeView)

  useEffect(() => {
    if (fleetSubmenuActive) setFleetOpen(true)
  }, [fleetSubmenuActive])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // Jangan tinggalkan data operasional/percakapan di perangkat bersama.
    clearSensitiveBrowserCache()
  }

  // Drawer mengikuti tinggi area konten di bawah header (parent `relative`),
  // bukan fixed terhadap viewport. Ini yang bikin sisi atas tetap utuh saat
  // address bar mobile muncul/hilang dan `100dvh` berubah.
  return (
    <aside
      className={`absolute inset-y-0 left-0 z-40 flex w-64 flex-col overflow-visible border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-in-out lg:z-10 lg:translate-x-0 ${
        collapsed ? 'lg:w-16' : 'lg:w-64'
      } ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
    >
      <div className={`flex items-center border-b border-sidebar-border p-4 ${collapsed ? 'justify-center px-2' : 'justify-between'}`}>
        {!collapsed && <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Menu Utama</h2>}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Tampilkan menu lengkap' : 'Perkecil menu (icon saja)'}
          aria-label={collapsed ? 'Tampilkan menu lengkap' : 'Perkecil menu (icon saja)'}
          className="hidden shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground lg:inline-flex"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Hanya daftar menu yang scroll. Footer About + akun dipaku di bawah
          supaya tidak ikut naik ke tengah layar saat menu panjang. */}
      <nav className="flex-1 min-h-0 p-2 space-y-1 flex flex-col overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {can('dashboard') && (
          <SidebarButton
            icon={LayoutDashboard}
            label="Dashboard"
            active={activeView === 'dashboard'}
            collapsed={collapsed}
            onClick={() => onViewChange('dashboard')}
          />
        )}

        {can('tugas') && (
          <SidebarButton
            icon={ListChecks}
            label="Complaint Board"
            active={activeView === 'tugas'}
            collapsed={collapsed}
            onClick={() => onViewChange('tugas')}
          />
        )}

        {can('review') && (
          <SidebarButton
            icon={ClipboardCheck}
            label="Review"
            active={activeView === 'review'}
            collapsed={collapsed}
            onClick={() => onViewChange('review')}
          />
        )}

        {(can('monitoring') || can('equipment') || can('maintenance') || can('ban')) && (
          <>
            {collapsed && <SidebarSectionLabel label="Fleet" collapsed />}
            <button
              type="button"
              onClick={() => setFleetOpen((open) => !open)}
              title={collapsed ? "Fleet" : undefined}
              aria-expanded={fleetOpen}
              className={`flex w-full items-center rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                collapsed ? "justify-center px-0" : "justify-between"
              } ${fleetSubmenuActive ? "bg-sidebar-accent/60 text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"}`}
            >
              <span className="flex items-center gap-3">
                <Layers className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Fleet</span>}
              </span>
              {!collapsed && (
                <ChevronDown className={`h-4 w-4 transition-transform ${fleetOpen ? "rotate-0" : "-rotate-90"}`} />
              )}
            </button>

            {fleetOpen && (
              <div className={`space-y-1 ${collapsed ? "" : "ml-3 border-l border-border pl-2"}`}>
                {can('monitoring') && (
                  <SidebarButton
                    icon={Activity}
                    label="Servis Rutin"
                    active={activeView === 'monitoring'}
                    collapsed={collapsed}
                    onClick={() => onViewChange('monitoring')}
                  />
                )}
                {can('equipment') && (
                  <SidebarButton
                    icon={Settings}
                    label="Equipment"
                    active={activeView === 'equipment'}
                    collapsed={collapsed}
                    onClick={() => onViewChange('equipment')}
                    badge={
                      <Badge variant="secondary" className="min-w-6">
                        {equipmentCounts.total}
                      </Badge>
                    }
                  />
                )}
                {can('maintenance') && (
                  <SidebarButton
                    icon={History}
                    label="Histories"
                    active={activeView === 'maintenance'}
                    collapsed={collapsed}
                    onClick={() => onViewChange('maintenance')}
                  />
                )}
                {can('ban') && (
                  <SidebarButton
                    icon={Disc3}
                    label="Ban"
                    active={activeView === 'ban'}
                    collapsed={collapsed}
                    onClick={() => onViewChange('ban')}
                  />
                )}
              </div>
            )}
          </>
        )}

        <SidebarSectionLabel label="Ekspedisi" collapsed={collapsed} />

        {can('analisa') && (
          <SidebarButton
            icon={BotMessageSquare}
            label="Analisa"
            active={activeView === 'analisa'}
            collapsed={collapsed}
            onClick={() => onViewChange('analisa')}
          />
        )}

        {can('skr') && (
          <SidebarButton
            icon={Boxes}
            label="SKR"
            active={activeView === 'skr'}
            collapsed={collapsed}
            onClick={() => onViewChange('skr')}
          />
        )}

        {can('pengiriman') && (
          <SidebarButton
            icon={Send}
            label="Pengiriman"
            active={activeView === 'pengiriman'}
            collapsed={collapsed}
            onClick={() => onViewChange('pengiriman')}
          />
        )}

        {can('weather') && (
          <SidebarButton
            icon={CloudSun}
            label="Perkiraan Cuaca"
            active={activeView === 'weather'}
            collapsed={collapsed}
            onClick={() => onViewChange('weather')}
          />
        )}

        {can('traffic') && (
          <SidebarButton
            icon={MapPin}
            label="Traffic"
            active={activeView === 'traffic'}
            collapsed={collapsed}
            onClick={() => onViewChange('traffic')}
          />
        )}

      </nav>

      {/* Footer sengaja sticky + shrink-0: About dan akun harus tetap di
          dasar sidebar, bukan ikut tergulung bersama daftar menu. */}
      <div className="sticky bottom-0 z-20 shrink-0 border-t border-sidebar-border bg-sidebar p-2">
        <div className="relative">
        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          title={collapsed ? (displayName || "Akun") : undefined}
          aria-label={displayName ? `Akun ${displayName}` : "Akun"}
          aria-expanded={accountOpen}
          className={`flex w-full min-w-0 items-center overflow-hidden rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
            collapsed ? "justify-center px-0" : "justify-between"
          } ${accountOpen ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"}`}
        >
          <span className={`flex items-center gap-3 ${collapsed ? "" : "min-w-0 flex-1"}`}>
            <User className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{displayName || "Akun"}</span>}
          </span>
          {!collapsed && <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${accountOpen ? "rotate-180" : ""}`} />}
        </button>

        {accountOpen && (
          <div className={collapsed
            ? "absolute bottom-0 left-full z-20 ml-2 w-44 rounded-md border bg-popover p-1 shadow-md"
            : "absolute bottom-full left-0 right-0 z-20 mb-1 rounded-md border bg-popover p-1 shadow-md"}
          >
            <button
              type="button"
              onClick={() => {
                onViewChange('about')
                setAccountOpen(false)
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <Info className="h-4 w-4 shrink-0" />
              <span>Tentang aplikasi</span>
            </button>
            <div className="my-1 h-px bg-border" role="separator" />
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Keluar</span>
            </button>
          </div>
        )}
        </div>
      </div>
    </aside>
  )
}

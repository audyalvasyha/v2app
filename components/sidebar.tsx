"use client"

import React, { useEffect, useState } from "react"
import { Settings, History, Activity, LayoutDashboard, User, PanelLeftClose, PanelLeftOpen, Boxes, Send, Disc3, CloudSun, LogOut, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/utils/supabase"
// Sumber tunggal tipe View — sebelumnya union ini diduplikasi di tiga
// berkas (layout, sidebar, hook) dan bisa berbeda tanpa disadari.
// `import type` sehingga tidak menambah siklus impor runtime.
import type { View } from "@/components/templates/dashboard-layout"

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  equipmentCounts: { total: number; available: number };
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface SidebarButtonProps {
  icon: LucideIcon
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
  badge?: React.ReactNode
  pushToBottom?: boolean
}

function SidebarButton({ icon: Icon, label, active, collapsed, onClick, badge, pushToBottom }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
        collapsed ? 'justify-center px-0' : 'justify-between'
      } ${pushToBottom ? 'mt-auto' : ''} ${
        active
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{label}</span>}
      </div>
      {!collapsed && badge}
    </button>
  )
}

/** Label kecil pemisah antar kategori menu */
function SidebarSectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    // Saat mini, cukup garis pemisah agar ikon menu tetap rapi
    return <div className="mx-2 my-2 border-t border-border" role="presentation" />
  }
  return (
    <div className="px-3 pt-4 pb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80 select-none">
      {label}
    </div>
  )
}

export function Sidebar({ activeView, onViewChange, equipmentCounts, collapsed, onToggleCollapsed }: SidebarProps) {
  // Akun pemilik sesi — email tampil di sidebar, tombol Keluar pindah ke sini
  // dari header agar area atas tetap lapang (branding + kontrol tampilan).
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setUserEmail(data.session?.user.email ?? null))
      .catch(() => setUserEmail(null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
      setUserEmail(s?.user.email ?? null),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // Bersihkan cache data armada agar tidak tertinggal di perangkat setelah
    // keluar (sama dengan CACHE_KEY di app/page.tsx).
    try {
      localStorage.removeItem("fleet-cache-v2")
    } catch {
      /* localStorage tidak tersedia — abaikan */
    }
  }

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } fixed top-16 bottom-0 left-0 z-10 border-r bg-background flex flex-col transition-[width] duration-200 ease-in-out`}
    >
      <div className={`p-4 border-b flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between'}`}>
        {!collapsed && <h2 className="text-sm font-bold uppercase tracking-wider">Menu Utama</h2>}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Tampilkan menu lengkap' : 'Perkecil menu (icon saja)'}
          aria-label={collapsed ? 'Tampilkan menu lengkap' : 'Perkecil menu (icon saja)'}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1 flex flex-col overflow-y-auto">
        {/* ---------- Kategori: Fleet Management ---------- */}
        <SidebarSectionLabel label="Fleet Management" collapsed={collapsed} />

        <SidebarButton
          icon={LayoutDashboard}
          label="Dashboard"
          active={activeView === 'dashboard'}
          collapsed={collapsed}
          onClick={() => onViewChange('dashboard')}
        />

        <SidebarButton
          icon={Activity}
          label="Monitoring Servis"
          active={activeView === 'monitoring'}
          collapsed={collapsed}
          onClick={() => onViewChange('monitoring')}
        />

        <SidebarButton
          icon={Settings}
          label="Equipment"
          active={activeView === 'equipment'}
          collapsed={collapsed}
          onClick={() => onViewChange('equipment')}
          badge={
            <Badge variant="secondary" className="h-5 px-1.5 min-w-5 flex items-center justify-center">
              {equipmentCounts.total}
            </Badge>
          }
        />

        <SidebarButton
          icon={History}
          label="Histories"
          active={activeView === 'maintenance'}
          collapsed={collapsed}
          onClick={() => onViewChange('maintenance')}
        />

        <SidebarButton
          icon={Disc3}
          label="Analisa Ban"
          active={activeView === 'ban'}
          collapsed={collapsed}
          onClick={() => onViewChange('ban')}
        />

        <SidebarButton
          icon={CloudSun}
          label="Perkiraan Cuaca"
          active={activeView === 'weather'}
          collapsed={collapsed}
          onClick={() => onViewChange('weather')}
        />

        {/* ---------- Kategori: Ekspedisi ---------- */}
        <SidebarSectionLabel label="Ekspedisi" collapsed={collapsed} />

        <SidebarButton
          icon={Boxes}
          label="SKR"
          active={activeView === 'skr'}
          collapsed={collapsed}
          onClick={() => onViewChange('skr')}
        />

        <SidebarButton
          icon={Send}
          label="Pengiriman"
          active={activeView === 'pengiriman'}
          collapsed={collapsed}
          onClick={() => onViewChange('pengiriman')}
        />

        {/* ---------- About: menempel di bawah daftar menu ---------- */}
        <SidebarButton
          icon={User}
          label="About"
          active={activeView === 'about'}
          collapsed={collapsed}
          onClick={() => onViewChange('about')}
          pushToBottom
        />

        {/* ---------- Akun & Keluar ---------- */}
        <div className={`border-t border-border pt-2 ${collapsed ? '' : 'mt-1'}`}>
          {collapsed ? (
            <button
              onClick={handleSignOut}
              title={userEmail ? `Keluar — ${userEmail}` : 'Keluar'}
              aria-label="Keluar dari akun"
              className="flex w-full items-center justify-center rounded-md px-0 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0" />
            </button>
          ) : (
            <div className="px-1">
              <p
                className="truncate px-2 pb-1.5 text-[11px] text-muted-foreground"
                title={userEmail ?? undefined}
              >
                {userEmail ?? 'Belum login'}
              </p>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>
      </nav>
    </aside>
  )
}

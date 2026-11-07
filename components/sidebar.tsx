"use client"

import React, { useEffect, useState } from "react"
import { Settings, History, Activity, LayoutDashboard, User, PanelLeftClose, PanelLeftOpen, Boxes, Send, Disc3, CloudSun, LogOut, MapPin, Gauge, Layers, ChevronDown, Info, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/utils/supabase"
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

function SidebarSectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-2 my-2 border-t border-border" role="presentation" />
  }
  return (
    <div className="px-3 pt-4 pb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80 select-none">
      {label}
    </div>
  )
}

export function Sidebar({ activeView, onViewChange, equipmentCounts, collapsed, onToggleCollapsed }: SidebarProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [fleetOpen, setFleetOpen] = useState(true)
  const fleetSubmenuActive = ["equipment", "maintenance", "ban", "monitoring"].includes(activeView)

  useEffect(() => {
    if (fleetSubmenuActive) setFleetOpen(true)
  }, [fleetSubmenuActive])

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setUserEmail(data.session?.user.email ?? null))
      .catch(() => setUserEmail(null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserEmail(session?.user.email ?? null),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
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
        <SidebarButton
          icon={LayoutDashboard}
          label="Dashboard"
          active={activeView === 'dashboard'}
          collapsed={collapsed}
          onClick={() => onViewChange('dashboard')}
        />

        {collapsed && <SidebarSectionLabel label="Fleet" collapsed />}
        <button
          type="button"
          onClick={() => setFleetOpen((open) => !open)}
          title={collapsed ? "Fleet" : undefined}
          aria-expanded={fleetOpen}
          className={`flex w-full items-center rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
            collapsed ? "justify-center px-0" : "justify-between"
          } ${fleetSubmenuActive ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
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
                <Badge variant="secondary" className="min-w-5">
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
          </div>
        )}

        <SidebarSectionLabel label="Ekspedisi" collapsed={collapsed} />

        <SidebarButton
          icon={Gauge}
          label="Analisa"
          active={activeView === 'analisa'}
          collapsed={collapsed}
          onClick={() => onViewChange('analisa')}
        />

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

        <SidebarButton
          icon={CloudSun}
          label="Perkiraan Cuaca"
          active={activeView === 'weather'}
          collapsed={collapsed}
          onClick={() => onViewChange('weather')}
        />

        <SidebarButton
          icon={MapPin}
          label="Traffic"
          active={activeView === 'traffic'}
          collapsed={collapsed}
          onClick={() => onViewChange('traffic')}
        />

        <SidebarButton
          icon={Info}
          label="About"
          active={activeView === 'about'}
          collapsed={collapsed}
          onClick={() => onViewChange('about')}
          pushToBottom
        />
      </nav>

      <div className="relative border-t border-border p-2">
        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          title={collapsed ? (userEmail ?? "Akun") : undefined}
          aria-label={userEmail ? `Akun ${userEmail}` : "Akun"}
          aria-expanded={accountOpen}
          className={`flex w-full min-w-0 items-center overflow-hidden rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
            collapsed ? "justify-center px-0" : "justify-between"
          } ${accountOpen ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          <span className={`flex items-center gap-3 ${collapsed ? "" : "min-w-0 flex-1"}`}>
            <User className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{userEmail ?? "Akun"}</span>}
          </span>
          {!collapsed && <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${accountOpen ? "rotate-180" : ""}`} />}
        </button>

        {accountOpen && (
          <div className={collapsed
            ? "absolute bottom-0 left-full z-20 ml-2 w-40 rounded-md border bg-popover p-1 shadow-md"
            : "mt-1 rounded-md bg-muted/40 p-1"}
          >
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Keluar</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

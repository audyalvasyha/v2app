import React from "react"
import { Settings, History, Activity, LayoutDashboard, User, PanelLeftClose, PanelLeftOpen, Boxes, Send, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"

type View = 'dashboard' | 'equipment' | 'maintenance' | 'monitoring' | 'about' | 'skr' | 'pengiriman'

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
      </nav>
    </aside>
  )
}

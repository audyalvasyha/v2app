import React from "react"
import { Settings, History, Activity, LayoutDashboard, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Tambahkan 'dashboard' ke dalam tipe union
interface SidebarProps {
  activeView: 'dashboard' | 'equipment' | 'maintenance' | 'monitoring' | 'about';
  onViewChange: (view: 'dashboard' | 'equipment' | 'maintenance' | 'monitoring' | 'about') => void;
  equipmentCounts: { total: number; available: number };
}

export function Sidebar({ activeView, onViewChange, equipmentCounts }: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-background flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-sm font-bold uppercase tracking-wider">Menu Utama</h2>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {/* Menu 0: Dashboard (BARU) */}
        <button
          onClick={() => onViewChange('dashboard')}
          className={`flex items-center justify-between w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${activeView === 'dashboard'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
        >
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </div>
        </button>

        {/* Menu 1: Equipment */}
        <button
          onClick={() => onViewChange('equipment')}
          className={`flex items-center justify-between w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${activeView === 'equipment'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
        >
          <div className="flex items-center gap-3">
            <Settings className="h-4 w-4" />
            <span>Equipment</span>
          </div>
          <Badge variant="secondary" className="h-5 px-1.5 min-w-5 flex items-center justify-center">
            {equipmentCounts.total}
          </Badge>
        </button>

        {/* Menu 2: Histories */}
        <button
          onClick={() => onViewChange('maintenance')}
          className={`flex items-center justify-between w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${activeView === 'maintenance'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
        >
          <div className="flex items-center gap-3">
            <History className="h-4 w-4" />
            <span>Histories</span>
          </div>
        </button>

        {/* Menu 3: Monitoring Servis */}
        <button
          onClick={() => onViewChange('monitoring')}
          className={`flex items-center justify-between w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${activeView === 'monitoring'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
        >
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4" />
            <span>Monitoring Servis</span>
          </div>
        </button>
        {/*Menu 4: Aboout me*/}
        <button
          onClick={() => onViewChange('about')}
          className={`flex items-center justify-between w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${activeView === 'about'
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground mt-auto'
            }`}
        >
          <div className="flex items-center gap-3">
            <User className="h-4 w-4" />
            <span>About</span>
          </div>
        </button>
      </nav>
    </aside>
  )
}
"use client"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Code2 } from "lucide-react"

interface SidebarProps {
  items?: Array<{
    id: string
    label: string
    icon?: React.ReactNode
    onClick?: () => void
  }>
  onItemClick?: (id: string) => void
  activeItemId?: string
}

export function Sidebar({ items = [], onItemClick, activeItemId }: SidebarProps) {
  const defaultItems = [
    {
      id: "all",
      label: "All Items",
      icon: <Code2 className="h-4 w-4" />,
    },
  ]

  const sidebarItems = items.length > 0 ? items : defaultItems

  return (
    <div className="w-64 border-r border-border flex flex-col h-full bg-sidebar">
      <div className="p-4 border-b border-sidebar-border">
        <h2 className="font-semibold text-lg text-sidebar-foreground">Menu</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {sidebarItems.map((item) => (
            <Button
              key={item.id}
              variant={activeItemId === item.id ? "default" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => {
                item.onClick?.()
                onItemClick?.(item.id)
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

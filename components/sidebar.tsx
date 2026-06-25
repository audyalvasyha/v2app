"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Code2 } from "lucide-react"
import type { SnippetFilters } from "@/lib/types"

interface SidebarProps {
  filters: SnippetFilters
  onFiltersChange: (filters: SnippetFilters) => void
  snippetCounts: {
    total: number
  }
}

export function Sidebar({ filters, onFiltersChange, snippetCounts }: SidebarProps) {
  return (
    <div className="w-64 border-r border-border flex flex-col h-full bg-sidebar">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-lg">Menu</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          
          {/* Menu Tunggal: All Snippets */}
          <div className="space-y-2">
            <Button
              variant="secondary" // Aktif terus karena ini satu-satunya menu
              className="w-full justify-between"
              onClick={() => onFiltersChange({})} // Reset semua filter saat diklik
            >
              <span className="flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                All Snippets
              </span>
              <Badge variant="secondary">{snippetCounts.total}</Badge>
            </Button>
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}
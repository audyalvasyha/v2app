"use client"

import { Button } from "@/components/ui/button"

interface HeaderProps {
  title?: string
  subtitle?: string
  children?: React.ReactNode
}

export function Header({ title = "My App", subtitle = "Welcome", children }: HeaderProps) {
  return (
    <header className="border-b border-border bg-background sticky top-0 z-10">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">{"</>"}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {children}
        </div>
      </div>
    </header>
  )
}

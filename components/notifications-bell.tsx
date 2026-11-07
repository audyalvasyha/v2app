"use client"

import { useState } from "react"
import { AlertTriangle, Bell, ChevronRight, PackageX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { AlertView, AppAlert } from "@/lib/alerts"

/**
 * Lonceng notifikasi operasional di header.
 *
 * Isinya bukan feed aktivitas, melainkan hal yang benar-benar perlu ditindak
 * hari ini: servis terlewat/mendekat dan unit yang belum kembali dari
 * pengiriman. Setiap item mengarah ke menu sumbernya supaya user bisa
 * langsung bertindak.
 */
export function NotificationsBell({
    alerts,
    onSelect,
}: {
    alerts: AppAlert[]
    onSelect: (view: AlertView) => void
}) {
    const [open, setOpen] = useState(false)
    const dangerCount = alerts.filter((a) => a.tone === "danger").length

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-9 w-9 cursor-pointer"
                    aria-label={
                        alerts.length > 0
                            ? `Notifikasi, ${alerts.length} perlu perhatian`
                            : "Notifikasi"
                    }
                >
                    <Bell className="h-4 w-4" />
                    {alerts.length > 0 && (
                        <span
                            className={cn(
                                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none",
                                dangerCount > 0
                                    ? "bg-destructive text-destructive-foreground"
                                    : "bg-amber-500 text-white",
                            )}
                        >
                            {alerts.length > 9 ? "9+" : alerts.length}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent align="end" className="w-[min(92vw,23rem)] p-0">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold leading-none">Notifikasi</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {alerts.length === 0
                                ? "Tidak ada yang mendesak"
                                : `${alerts.length} hal perlu perhatian`}
                        </p>
                    </div>
                    {dangerCount > 0 && (
                        <Badge variant="destructive">
                            {dangerCount} kritis
                        </Badge>
                    )}
                </div>

                {alerts.length > 0 ? (
                    <ul className="max-h-[320px] divide-y overflow-y-auto">
                        {alerts.map((alert) => {
                            const Icon = alert.tone === "danger" ? AlertTriangle : PackageX
                            return (
                                <li key={alert.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelect(alert.view)
                                            setOpen(false)
                                        }}
                                        className="group flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                                    >
                                        <span
                                            className={cn(
                                                "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md",
                                                alert.tone === "danger"
                                                    ? "bg-destructive/10 text-destructive"
                                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                            )}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-semibold">
                                                {alert.title}
                                            </span>
                                            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                                                {alert.description}
                                            </span>
                                        </span>
                                        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                    <div className="px-4 py-8 text-center">
                        <Bell className="mx-auto h-5 w-5 text-muted-foreground" />
                        <p className="mt-2 text-xs text-muted-foreground">
                            Semua servis aman dan tidak ada pengiriman yang terlambat.
                        </p>
                    </div>
                )}

                <p className="border-t bg-muted/20 px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
                    Dihitung dari jadwal servis dan pengiriman aktif. Klik item untuk membuka menunya.
                </p>
            </PopoverContent>
        </Popover>
    )
}

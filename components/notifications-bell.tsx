"use client"

import { useState } from "react"
import { AlertTriangle, Bell, PackageX, Wrench, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { AlertCategory, AlertView, AppAlert } from "@/lib/alerts"

type AlertFilter = "all" | AlertCategory

const FILTERS: { id: AlertFilter; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "service", label: "Servis" },
    { id: "outbound", label: "Pengiriman" },
]

/** Hitungan tab dibuat sebagai teks kecil, bukan pill, supaya panel lebih tenang. */
function TabCount({ count, active }: { count: number; active: boolean }) {
    return (
        <span
            className={cn(
                "text-[10px] font-normal leading-none tabular-nums",
                active ? "text-primary" : "text-muted-foreground/60",
            )}
        >
            {count}
        </span>
    )
}

function AlertItem({ alert, onSelect }: { alert: AppAlert; onSelect: (view: AlertView) => void }) {
    const Icon =
        alert.category === "outbound" ? PackageX : alert.tone === "danger" ? AlertTriangle : Wrench

    return (
        <li>
            <button
                type="button"
                onClick={() => onSelect(alert.view)}
                className="group flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
            >
                <Icon
                    aria-hidden="true"
                    className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        alert.tone === "danger"
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400",
                    )}
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-snug">{alert.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                        {alert.description}
                    </span>
                </span>
            </button>
        </li>
    )
}

function AlertList({
    alerts,
    filter,
    onSelect,
}: {
    alerts: AppAlert[]
    filter: AlertFilter
    onSelect: (view: AlertView) => void
}) {
    const visible = filter === "all" ? alerts : alerts.filter((alert) => alert.category === filter)

    if (visible.length === 0) {
        const EmptyIcon = filter === "service" ? Wrench : filter === "outbound" ? PackageX : Bell
        return (
            <div className="px-4 py-7 text-center">
                <EmptyIcon aria-hidden="true" className="mx-auto h-4 w-4 text-muted-foreground/70" />
                <p className="mt-2 text-[11px] text-muted-foreground">
                    {filter === "service"
                        ? "Tidak ada servis yang perlu perhatian."
                        : filter === "outbound"
                          ? "Tidak ada pengiriman yang terlambat."
                          : "Tidak ada notifikasi."}
                </p>
            </div>
        )
    }

    return (
        <ul className="max-h-[min(50vh,19rem)] divide-y divide-border/40 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visible.map((alert) => (
                <AlertItem key={alert.id} alert={alert} onSelect={onSelect} />
            ))}
        </ul>
    )
}

/**
 * Lonceng notifikasi operasional di header.
 *
 * Isinya bukan feed aktivitas, melainkan hal yang benar-benar perlu ditindak
 * hari ini: servis terlewat/mendekat dan unit yang belum kembali dari
 * pengiriman. Tab memisahkan kedua kategori supaya panel tetap terbaca saat
 * jumlah alert bertambah. Setiap item mengarah ke menu sumbernya.
 */
export function NotificationsBell({
    alerts,
    onSelect,
}: {
    alerts: AppAlert[]
    onSelect: (view: AlertView) => void
}) {
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState<AlertFilter>("all")
    const dangerCount = alerts.filter((alert) => alert.tone === "danger").length

    const counts: Record<AlertFilter, number> = {
        all: alerts.length,
        service: alerts.filter((alert) => alert.category === "service").length,
        outbound: alerts.filter((alert) => alert.category === "outbound").length,
    }

    const handleSelect = (view: AlertView) => {
        onSelect(view)
        setOpen(false)
    }

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (!next) setFilter("all")
            }}
        >
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

            <PopoverContent
                align="end"
                sideOffset={8}
                aria-label="Notifikasi"
                className="w-[min(92vw,21.5rem)] overflow-hidden rounded-lg border-border/70 p-0 shadow-md"
            >
                <div className="flex items-center justify-between gap-3 px-3.5 pb-1 pt-3.5">
                    <p className="text-sm font-medium leading-none tracking-tight">Notifikasi</p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setOpen(false)}
                        aria-label="Tutup notifikasi"
                        className="-mr-1 h-6 w-6 shrink-0 text-muted-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <Tabs
                    value={filter}
                    onValueChange={(value) => setFilter(value as AlertFilter)}
                    className="gap-0"
                >
                    <TabsList className="h-auto w-full justify-start gap-4 overflow-x-auto rounded-none border-b border-border/50 bg-transparent px-3.5 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {FILTERS.map((item) => (
                            <TabsTrigger
                                key={item.id}
                                value={item.id}
                                className="-mb-px h-auto flex-none gap-1 rounded-none border-0 border-b border-transparent bg-transparent px-0 pb-2 pt-2.5 text-[11px] font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground"
                            >
                                {item.label}
                                <TabCount count={counts[item.id]} active={filter === item.id} />
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {FILTERS.map((item) => (
                        <TabsContent key={item.id} value={item.id} className="mt-0">
                            <AlertList alerts={alerts} filter={item.id} onSelect={handleSelect} />
                        </TabsContent>
                    ))}
                </Tabs>
            </PopoverContent>
        </Popover>
    )
}

import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Jejak halaman ringkas pengganti judul + subjudul.
 *
 * Item terakhir adalah halaman aktif. Parent seperti Fleet/Ekspedisi hanya
 * label pengelompokan menu, bukan rute terpisah.
 */
export function PageBreadcrumb({
    items,
    className,
}: {
    items: string[]
    className?: string
}) {
    return (
        <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
            <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-none">
                {items.map((item, index) => {
                    const current = index === items.length - 1
                    return (
                        <li key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5">
                            {index > 0 && (
                                <ChevronRight
                                    aria-hidden="true"
                                    className="h-3 w-3 shrink-0 text-muted-foreground/45"
                                />
                            )}
                            <span
                                aria-current={current ? "page" : undefined}
                                className={cn(
                                    "min-w-0 truncate",
                                    current
                                        ? "font-medium text-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                {item}
                            </span>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}

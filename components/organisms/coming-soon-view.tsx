import React from "react"
import { Construction } from "lucide-react"

interface ComingSoonViewProps {
    /** Judul menu yang belum tersedia, mis. "SKR" */
    title: string
}

/**
 * Halaman placeholder untuk menu yang strukturnya belum dibangun.
 * Ditampilkan sementara sampai desain database dan tampilan finalnya jadi.
 */
export function ComingSoonView({ title }: ComingSoonViewProps) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Construction className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Halaman ini sedang disiapkan. Struktur data dan tampilannya akan menyusul —
                sementara menu ini dibiarkan kosong dulu.
            </p>
        </div>
    )
}

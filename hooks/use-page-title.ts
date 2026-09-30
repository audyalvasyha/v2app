"use client"

import { useEffect } from "react"

/**
 * Ubah <title> tab browser secara dinamis, mis. "SKR — Midaa".
 * Kembalikan ke judul default saat komponen unmount, jadi navigasi antar
 * halaman selalu meninggalkan title yang benar.
 */
export function usePageTitle(title: string | null | undefined) {
    const DEFAULT_TITLE = "Midaa — Transport Management System"

    useEffect(() => {
        if (typeof document === "undefined") return
        const previous = document.title
        document.title = title ? `${title} — Midaa` : DEFAULT_TITLE
        return () => {
            document.title = previous
        }
    }, [title])
}

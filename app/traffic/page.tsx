"use client"

import { TrafficView } from "@/components/organisms/traffic-view"

/**
 * Halaman `/traffic` — dibuka langsung dari daftar link luar (bookmark/langsung
 * URL), namun dalam dashboard menu Traffic tetap dirender sebagai view lewat
 * `components/organisms/traffic-view.tsx`. Halaman ini tinggal membungkus komponen
 * yang sama supaya tidak ada dua implementasi tampilan yang berbeda.
 */
export default function TrafficPage() {
    return <TrafficView />
}

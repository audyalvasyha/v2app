/**
 * Peran user aplikasi & menu yang boleh dibuka.
 *
 * Peran disimpan di tabel `app_users` (supabase/sql/app_users.sql), dipetakan
 * per email Supabase Auth. Tabel itu hanya bisa DIBACA dari aplikasi;
 * penulisannya lewat SQL Editor / service role supaya user tidak bisa
 * menaikkan perannya sendiri dari browser.
 *
 * Catatan penting: pembatasan di sini adalah lapisan UI. RLS tabel data masih
 * memberi akses baca ke semua user `authenticated` (lihat auth_lockdown.sql),
 * jadi role ini mencegah menu terbuka — bukan menggantikan RLS per-peran.
 */

import type { View } from "@/components/templates/dashboard-layout"

export type AppRole = "admin" | "terbatas"

export const ROLE_LABEL: Record<AppRole, string> = {
    admin: "Admin",
    terbatas: "Terbatas",
}

export const ALL_VIEWS: readonly View[] = [
    "dashboard",
    "tugas",
    "equipment",
    "maintenance",
    "monitoring",
    "skr",
    "pengiriman",
    "ban",
    "weather",
    "traffic",
    "analisa",
    "about",
]

/**
 * Menu untuk role "terbatas": operasional harian + follow-up komplain.
 * Sengaja tanpa data bengkel/biaya (Equipment, Histories, Monitoring, Ban)
 * dan tanpa Analisa AI, karena schema AI bisa membaca seluruh tabel.
 */
const LIMITED_VIEWS: readonly View[] = [
    "dashboard",
    "tugas",
    "skr",
    "pengiriman",
    "weather",
    "traffic",
    "about",
]

/** Nilai dari database → peran yang dikenal. Nilai aneh jatuh ke yang paling aman. */
export function normalizeRole(value: unknown): AppRole {
    return value === "terbatas" ? "terbatas" : "admin"
}

export function allowedViews(role: AppRole): View[] {
    return role === "admin" ? [...ALL_VIEWS] : [...LIMITED_VIEWS]
}

export function canView(role: AppRole, view: View): boolean {
    return allowedViews(role).includes(view)
}

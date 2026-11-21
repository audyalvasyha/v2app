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

/** Satu-satunya akun yang boleh mendapat menu admin. */
export const PRIMARY_ADMIN_EMAIL = "audyal.vasyah@pekanbaru-dr.com"

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
 * Menu untuk role "terbatas": operasional harian + follow-up komplain + Analisa.
 * Sengaja tanpa data bengkel/biaya (Equipment, Histories, Monitoring, Ban).
 * Dashboard juga tidak termasuk; halaman awal jatuh ke Complaint Board.
 */
const LIMITED_VIEWS: readonly View[] = [
    "tugas",
    "analisa",
    "skr",
    "pengiriman",
    "weather",
    "traffic",
    "about",
]

/** Nilai dari database → peran yang dikenal. Nilai aneh jatuh ke yang paling aman. */
export function normalizeRole(value: unknown): AppRole {
    return value === "admin" ? "admin" : "terbatas"
}

/**
 * Role efektif user. Baris admin untuk email selain admin utama sengaja
 * diabaikan — kalau tidak, data role lama bisa membuka menu Fleet/AI ke
 * user yang seharusnya terbatas. Admin utama tanpa baris tetap admin agar
 * tidak terkunci saat migrasi app_users belum dijalankan.
 */
export function roleForUser(email: string | null | undefined, storedRole: unknown): AppRole {
    const normalizedEmail = (email ?? "").trim().toLowerCase()
    if (normalizedEmail !== PRIMARY_ADMIN_EMAIL) return "terbatas"
    return storedRole == null ? "admin" : normalizeRole(storedRole)
}

export function allowedViews(role: AppRole): View[] {
    return role === "admin" ? [...ALL_VIEWS] : [...LIMITED_VIEWS]
}

export function canView(role: AppRole, view: View): boolean {
    return allowedViews(role).includes(view)
}

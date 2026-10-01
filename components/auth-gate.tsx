"use client"

import React, { useEffect, useState } from "react"
import { LogIn, ShieldCheck } from "lucide-react"
import { isSupabaseConfigured, supabase } from "@/utils/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

/**
 * Gerbang login untuk dashboard utama.
 *
 * Polanya sama dengan halaman /skr/input: sesi dicek dari klien Supabase yang
 * sama (utils/supabase.ts). Setelah login, klien yang sama otomatis membawa
 * JWT user pada setiap query — sehingga data hanya bisa dibaca oleh user
 * terdaftar, terutama setelah supabase/sql/auth_lockdown.sql dijalankan
 * (policy SELECT dikunci khusus role authenticated).
 *
 * Akun baru dibuat dari Supabase Dashboard → Authentication → Users →
 * Add user. Pendaftaran mandiri (sign-up) disarankan dimatikan agar orang
 * luar tidak bisa membuat akun sendiri — lihat README bagian Autentikasi.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
    const [checking, setChecking] = useState(true)
    const [userEmail, setUserEmail] = useState<string | null>(null)

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [signingIn, setSigningIn] = useState(false)
    const configured = isSupabaseConfigured()

    // Sesi dicek sekali saat mount; perubahan sesi (logout di tab lain) ikut.
    useEffect(() => {
        if (!configured) {
            setChecking(false)
            return
        }

        supabase.auth
            .getSession()
            .then(({ data }) => setUserEmail(data.session?.user.email ?? null))
            .catch(() => setUserEmail(null))
            .finally(() => setChecking(false))
        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
            setUserEmail(s?.user.email ?? null),
        )
        return () => sub.subscription.unsubscribe()
    }, [])

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        setSigningIn(true)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        setSigningIn(false)
        if (error) toast.error("Login gagal", { description: error.message })
    }

    if (checking) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="w-full max-w-sm space-y-3">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </main>
        )
    }

    if (!configured) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-4">
                <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
                        <ShieldCheck className="size-5 text-muted-foreground" />
                    </div>
                    <h1 className="text-lg font-semibold">Aplikasi siap digunakan</h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Login dan data dashboard membutuhkan konfigurasi Supabase. Tambahkan
                        NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY untuk
                        mengaktifkan akses aplikasi.
                    </p>
                </section>
            </main>
        )
    }

    // ── Belum login: tampilkan form ─────────────────────────────────
    if (!userEmail) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-4">
                <form
                    onSubmit={handleSignIn}
                    className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-sm"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                            <span className="text-lg font-bold text-primary-foreground">@</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-tight">Midaa</h1>
                            <p className="text-xs text-muted-foreground">Transport Management System</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p className="text-muted-foreground">
                            Akses terbatas untuk user terdaftar. Masuk dengan akun yang
                            diberikan admin.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="username"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="nama@contoh.com"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <Button type="submit" className="w-full gap-1.5" disabled={signingIn}>
                        <LogIn className="h-4 w-4" />
                        {signingIn ? "Memeriksa…" : "Masuk"}
                    </Button>
                </form>
            </main>
        )
    }

    // ── Sudah login: render dashboard ───────────────────────────────
    return <>{children}</>
}

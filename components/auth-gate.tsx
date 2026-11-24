"use client"

import Image from "next/image"
import React, { useEffect, useState } from "react"
import { LogIn, ShieldCheck } from "lucide-react"
import { supabase } from "@/utils/supabase"
import { clearSensitiveBrowserCache } from "@/lib/browser-cache"
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

    // Sesi dicek sekali saat mount; perubahan sesi (logout di tab lain) ikut.
    useEffect(() => {
        supabase.auth
            .getSession()
            .then(({ data }) => setUserEmail(data.session?.user.email ?? null))
            .catch(() => setUserEmail(null))
            .finally(() => setChecking(false))
        const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
            setUserEmail(s?.user.email ?? null)
            // Sesi bisa berakhir tanpa lewat tombol Keluar (expired/revoked di
            // tab lain). Jangan biarkan cache operasional tertinggal di perangkat.
            if (event === "SIGNED_OUT" || !s) clearSensitiveBrowserCache()
        })
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
                <div
                    role="status"
                    aria-busy="true"
                    className="w-full max-w-sm rounded-sm border border-border/70 bg-card p-6 shadow-none"
                >
                    <span className="sr-only">Memeriksa sesi…</span>
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-sm" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-3 w-40" />
                        </div>
                    </div>
                    <div className="mt-5 space-y-3">
                        <Skeleton className="h-10 w-full rounded-sm" />
                        <Skeleton className="h-10 w-full rounded-sm" />
                        <Skeleton className="h-10 w-full rounded-sm" />
                    </div>
                </div>
            </main>
        )
    }

    // ── Belum login: tampilkan form ─────────────────────────────────
    if (!userEmail) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-4">
                <form
                    onSubmit={handleSignIn}
                    className="w-full max-w-sm space-y-5 rounded-sm border border-border/70 bg-card p-6 shadow-none"
                >
                    <div className="flex items-center gap-3">
                        <Image
                            src="/icon.svg"
                            alt="Logo Midaa"
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-sm"
                            priority
                        />
                        <div>
                            <h1 className="text-base font-medium leading-tight tracking-tight">Midaa</h1>
                            <p className="text-[11px] text-muted-foreground">Transport Management System</p>
                        </div>
                    </div>

                    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        Akses terbatas untuk user terdaftar. Masuk dengan akun yang diberikan
                        admin.
                    </p>

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
                    <Button type="submit" className="w-full gap-1.5 rounded-sm" disabled={signingIn}>
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

"use client"

import React, { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileUp, LogOut, ShieldCheck, Upload, Download, TriangleAlert } from "lucide-react"
import { supabase } from "@/utils/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { parseSkrCsv, SKR_CSV_TEMPLATE, type SkrCsvRow } from "@/lib/skr-csv"
import { formatQty } from "@/lib/skr-status"

export default function SkrInputPage() {
    const router = useRouter()
    const [checking, setChecking] = useState(true)
    const [session, setSession] = useState<{ email?: string } | null>(null)

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [signingIn, setSigningIn] = useState(false)

    const [rows, setRows] = useState<SkrCsvRow[] | null>(null)
    const [parseSummary, setParseSummary] = useState<{
        headerMap: { csvHeader: string; dbColumn: string }[]
        unknownHeaders: string[]
        errors: { rowNumber: number; message: string }[]
    } | null>(null)
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    // Sesi dicek sekali saat mount; perubahan sesi (logout di tab lain) ikut.
    React.useEffect(() => {
        supabase.auth
            .getSession()
            .then(({ data }) => setSession(data.session ? { email: data.session.user.email } : null))
            .catch(() => setSession(null))
            .finally(() => setChecking(false))
        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
            setSession(s ? { email: s.user.email } : null),
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

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        setRows(null)
        setParseSummary(null)
        if (fileRef.current) fileRef.current.value = ""
    }

    const handleFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith(".csv")) {
            toast.error("Hanya file .csv yang didukung")
            return
        }
        const text = await file.text()
        const result = parseSkrCsv(text)
        setRows(result.rows)
        setParseSummary({
            headerMap: result.headerMap,
            unknownHeaders: result.unknownHeaders,
            errors: result.errors,
        })
        if (result.rows.length === 0) {
            toast.warning("Tidak ada baris valid", {
                description: "Periksa header & isi CSV — bandingkan dengan template.",
            })
        }
    }

    const handleUpload = async () => {
        if (!rows || rows.length === 0) return
        const total = rows.length
        const label = `${total.toLocaleString("id-ID")} baris akan menggantikan seluruh data SKR lama. Lanjutkan?`
        if (!window.confirm(label)) return

        setUploading(true)
        const { data, error } = await supabase.rpc("replace_skr_detail", { rows: rows as unknown as never[] })
        setUploading(false)
        if (error) {
            toast.error("Upload gagal — data lama tidak berubah", { description: error.message })
            return
        }
        const inserted = (data as { inserted?: number } | null)?.inserted ?? total
        toast.success(`Berhasil: ${formatQty(inserted, "baris")} tersimpan`, {
            description: "Seluruh data lama telah diganti. Grafik & tabel di dashboard langsung memakai data baru.",
        })
        setRows(null)
        setParseSummary(null)
        if (fileRef.current) fileRef.current.value = ""
    }

    const downloadTemplate = () => {
        const blob = new Blob([SKR_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "template-skr.csv"
        a.click()
        URL.revokeObjectURL(url)
    }

    const previewRows = useMemo(() => rows?.slice(0, 8) ?? [], [rows])

    if (checking) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="w-full max-w-sm space-y-3">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </main>
        )
    }

    // ── Login gate ──────────────────────────────────────────────────
    if (!session) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-4">
                <form
                    onSubmit={handleSignIn}
                    className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
                >
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <h1 className="text-base font-semibold">Import SKR — Admin</h1>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Halaman khusus admin untuk mengganti data SKR. Dashboard utama di
                        transportbaganbatu.com tidak terpengaruh dan tetap bisa dibaca tanpa login.
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
                            placeholder="admin@contoh.com"
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
                    <Button type="submit" className="w-full" disabled={signingIn}>
                        {signingIn ? "Memeriksa…" : "Masuk"}
                    </Button>
                </form>
            </main>
        )
    }

    // ── Panel upload ────────────────────────────────────────────────
    return (
        <main className="mx-auto min-h-screen max-w-3xl space-y-4 bg-background p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FileUp className="h-5 w-5 text-primary" />
                    <h1 className="text-base font-semibold">Import Data SKR</h1>
                </div>
                <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:block">{session.email}</span>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSignOut}>
                        <LogOut className="h-3.5 w-3.5" /> Keluar
                    </Button>
                </div>
            </div>

            {/* Peringatan mode replace */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs leading-relaxed">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p>
                    <span className="font-medium text-amber-700 dark:text-amber-400">Replace penuh.</span>{" "}
                    <span className="text-muted-foreground">
                        Upload akan <b>menghapus seluruh</b> data SKR lama lalu menggantinya dengan isi file ini —
                        dalam satu transaksi (gagal di tengah = tidak ada yang berubah). Pastikan CSV berisi data lengkap.
                    </span>
                </p>
            </div>

            {/* Langkah 1 — template */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
                <div>
                    <p className="text-sm font-medium">1. Unduh template (opsional)</p>
                    <p className="text-xs text-muted-foreground">
                        Header CSV asli dengan spasi/kapital tetap dikenali otomatis — template hanya contoh susunan.
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadTemplate}>
                    <Download className="h-3.5 w-3.5" /> template-skr.csv
                </Button>
            </div>

            {/* Langkah 2 — pilih file */}
            <div className="space-y-2 rounded-xl border bg-card px-4 py-3">
                <p className="text-sm font-medium">2. Pilih file CSV</p>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleFile(f)
                    }}
                    className="block w-full cursor-pointer rounded-lg border border-dashed p-3 text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground hover:border-primary/40"
                />

                {parseSummary && (
                    <div className="space-y-2 pt-1 text-xs">
                        <div className="flex flex-wrap gap-1.5">
                            {parseSummary.headerMap.map((m) => (
                                <Badge key={m.csvHeader} variant="outline" className="gap-1 font-normal">
                                    <span className="text-muted-foreground">{m.csvHeader}</span>
                                    <span aria-hidden>→</span>
                                    <span className="font-mono">{m.dbColumn}</span>
                                </Badge>
                            ))}
                            {parseSummary.unknownHeaders.map((h) => (
                                <Badge key={h} variant="outline" className="border-amber-500/40 font-normal text-amber-700 dark:text-amber-400">
                                    {h} (diabaikan)
                                </Badge>
                            ))}
                        </div>
                        {parseSummary.errors.length > 0 && (
                            <ul className="space-y-0.5 rounded-md bg-destructive/5 px-3 py-2 text-destructive">
                                {parseSummary.errors.slice(0, 5).map((e) => (
                                    <li key={e.rowNumber}>
                                        Baris {e.rowNumber}: {e.message}
                                    </li>
                                ))}
                                {parseSummary.errors.length > 5 && (
                                    <li>…dan {parseSummary.errors.length - 5} error lainnya</li>
                                )}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* Langkah 3 — preview + upload */}
            {rows && rows.length > 0 && (
                <div className="space-y-2 rounded-xl border bg-card px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                            3. Periksa & unggah — {formatQty(rows.length, "baris")} terbaca
                        </p>
                        <Button className="gap-1.5" onClick={handleUpload} disabled={uploading}>
                            <Upload className="h-4 w-4" />
                            {uploading ? "Mengunggah…" : "Ganti seluruh data"}
                        </Button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[720px] text-left text-xs">
                            <thead className="bg-muted/40 text-muted-foreground">
                                <tr>
                                    {["Delivery", "Tanggal", "Plat", "Sales", "Customer", "SKU", "Qty", "Nilai", "Alasan"].map((h) => (
                                        <th key={h} className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y font-mono tabular-nums">
                                {previewRows.map((r, i) => (
                                    <tr key={i} className="hover:bg-muted/30">
                                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.delivery_number || "—"}</td>
                                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.pod_date}</td>
                                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.license_no}</td>
                                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.salesman || "—"}</td>
                                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.customer_id || "—"}</td>
                                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.skr_base_unit || "—"}</td>
                                        <td className="px-2.5 py-1.5 text-right">{r.skr_sales_unit}</td>
                                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.skr_value || "—"}</td>
                                        <td className="max-w-[160px] truncate px-2.5 py-1.5" title={r.pod_reason}>
                                            {r.pod_reason || "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rows.length > previewRows.length && (
                        <p className="text-[11px] text-muted-foreground">
                            Menampilkan {previewRows.length} dari {rows.length.toLocaleString("id-ID")} baris.
                        </p>
                    )}
                </div>
            )}
        </main>
    )
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AiBrief } from "@/lib/analisa-kpi"

/**
 * Hook Analisa — ambil briefing AI per snapshot + cache localStorage.
 *
 * ── Kenapa jadi hook ──
 *
 * Efek fetch + dedupe + cache sebelumnya hidup di tengah komponen 700+
 * baris, sehingga sulit dilihat polanya. Hook ini punya kontrak kecil:
 * masukan snapshot (angka KPI), keluaran {brief, error, loading, regenerate}.
 *
 * ── Kunci dedupe & cache = isi snapshot sendiri (content-addressed) ──
 *
 * snapshotKey adalah JSON angka KPI itu sendiri, jadi:
 *   - angka sama → tidak di-fetch ulang (dedupe antar re-render,
 *     tahan terhadap double-mount React Strict Mode lewat ref);
 *   - data berubah sedikit pun → kunci berubah → cache otomatis basi.
 * Tidak ada cache berbasis waktu yang bisa menyajikan data lawas.
 *
 * ── Tombol paksa (regenerate) ──
 *
 * regenerate() menaikkan regenCount → effect jalan lagi dengan
 * `force: true`, bypass cache localStorage DAN cache server (15 menit).
 * Dipakai tombol "Insight baru" — data tiap hari berubah, sedangkan
 * kunci cache hanya berubah kalau angkanya memang bergerak; tombol ini
 * memberi jalan minta telaah baru atas angka yang sama.
 */
const BRIEF_CACHE_KEY = "analisa-brief-cache-v1"
/** Batas waktu client > batas server (90s OpenKey + 20s Gemini + overhead). */
const REQUEST_TIMEOUT_MS = 150_000

export function useAiBrief(snapshot: unknown) {
    const [brief, setBrief] = useState<AiBrief | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    /** >0 berarti user meminta analisa ulang paksa (`force: true`). */
    const [regenCount, setRegenCount] = useState(0)

    /** Tombol "Insight baru" — bypass semua cache, minta telaah baru. */
    const regenerate = useCallback(() => {
        setRegenCount((c) => c + 1)
    }, [])

    /** Kunci stabil tanpa memicu fetch ulang tiap memo recompute. */
    const snapshotKey = useMemo(() => JSON.stringify(snapshot), [snapshot])
    const fetchedKey = useRef<string | null>(null)

    useEffect(() => {
        const key = `${regenCount}:${snapshotKey}`
        if (fetchedKey.current === key) return
        fetchedKey.current = key
        const force = regenCount > 0
        let cancelled = false

        // Cache lokal → muncul SEKETIKA tanpa menyentuh provider. Snapshot
        // angkanya sama persis dengan yang menghasilkan briefing itu, jadi
        // tidak ada risiko tampilan basi. Saat force, cache dilewati —
        // user yang menekan tombol eksplisit minta hasil segar.
        if (!force) {
            try {
                const cached = JSON.parse(localStorage.getItem(BRIEF_CACHE_KEY) ?? "null")
                if (cached?.snapshotKey === snapshotKey && cached?.brief) {
                    setBrief(cached.brief as AiBrief)
                    setError(null)
                    setLoading(false)
                    return
                }
            } catch {
                // localStorage korup/tidak tersedia → jalur fetch normal saja.
            }
        } else {
            // Buang catatan lama supaya jika fetch force gagal, kunjungan
            // berikutnya tidak menampilkan briefing lama yang sengaja dibuang.
            try {
                localStorage.removeItem(BRIEF_CACHE_KEY)
            } catch {
                // Abaikan — hapus cache bukan kegagalan fitur.
            }
        }

        setBrief(null)
        setError(null)
        setLoading(true)
        ;(async () => {
            try {
                // JWT sesi aktif — pola sama dengan panel Tanya Midaa;
                // route memvalidasi identitas sebelum memanggil provider
                // berbayar, jadi anonim tidak bisa memicu kredit.
                const { supabase } = await import("@/utils/supabase")
                const { data } = await supabase.auth.getSession()
                const token = data?.session?.access_token ?? ""
                const res = await fetch("/api/analisa/summary", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ snapshot: JSON.parse(snapshotKey), force }),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                })
                const body = await res.json().catch(() => null)
                if (cancelled) return
                if (!res.ok) {
                    setError(body?.error ?? "Gagal menyusun analisa AI.")
                    setBrief(null)
                } else {
                    setBrief(body ?? null)
                    // Simpan hasil → buka berikutnya muncul instan. Payload
                    // provider "fallback" (AI gagal) TIDAK di-cache: req
                    // berikutnya masih berpeluang dapat briefing AI penuh.
                    if (body && body.provider !== "fallback") {
                        try {
                            localStorage.setItem(
                                BRIEF_CACHE_KEY,
                                JSON.stringify({ snapshotKey, brief: body }),
                            )
                        } catch {
                            // Penuh/ditolak → bukan kegagalan fitur.
                        }
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof DOMException && err.name === "TimeoutError"
                            ? `Analisa memakan waktu terlama (>150 detik). Coba lagi — model reasoning bisa lambat pada jam sibuk.`
                            : "Tidak bisa menghubungi layanan analisa.",
                    )
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
            // Lepas dedupe saat effect dibersihkan. Di React Strict Mode
            // (dev), setup→cleanup→setup berjalan pada instance yang sama:
            // tanpa reset ini, eksekusi kedua early-return pada key yang
            // sama padahal fetch eksekusi pertama sudah dicancel — briefing
            // tidak pernah muat dan loading gantung. Dengan reset, eksekusi
            // setelah cancel selalu benar-benar fetch; re-render biasa
            // tidak terdampak karena dependencies memoized dan cleanup
            // tidak berjalan di antara render.
            fetchedKey.current = null
        }
    }, [snapshotKey, regenCount])

    return { brief, error, loading, regenerate }
}

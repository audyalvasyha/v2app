import { NextResponse } from "next/server"
import { supabase } from "@/utils/supabase"
import { getSupabaseAdmin } from "@/utils/supabase-admin"
import {
    evaluateServiceStatus,
    remainingDaysLabel,
    remainingKmLabel,
} from "@/lib/service-status"

/**
 * Reminder email harian untuk jadwal servis (dipicu Vercel Cron).
 *
 * Aturannya 100% sama dengan UI dashboard karena keduanya memakai
 * evaluateServiceStatus dari lib/service-status.ts — tidak ada logika
 * status kedua yang bisa meleset.
 *
 * Environment (diatur di Vercel → Settings → Environment Variables):
 * - RESEND_API_KEY     : API key Resend (wajib agar email terkirim)
 * - REMINDER_EMAIL_TO  : alamat penerima (opsional, default audialfasha@gmail.com)
 * - REMINDER_EMAIL_CC  : alamat CC, dipisah koma (opsional, mis. "a@x.com, b@x.com")
 * - CRON_SECRET        : bila diisi, request cron wajib membawa
 *                        header `Authorization: Bearer <CRON_SECRET>`
 *                        (Vercel Cron mengirimkannya otomatis).
 * - SUPABASE_SERVICE_ROLE_KEY : bila diisi, kueri data memakai klien
 *                        service-role (bypass RLS). Wajib setelah
 *                        supabase/sql/auth_lockdown.sql dijalankan, karena
 *                        role anon tidak lagi bisa membaca tabel.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EQUIPMENT_COLS = "equipment_id,license_plate,last_odometer,status"
const SERVICE_LOG_COLS =
    "equipment_id,service_date,next_service_date,next_service_odometer,odometer_at_service"

const RECIPIENT_FALLBACK = "audialfasha@gmail.com"
const FROM = "Midaa Reminder <onboarding@resend.dev>"

export async function GET(request: Request) {
    // Cukup aman untuk cron: hanya Vercel (dan pemilik secret) yang tahu secret.
    const secret = process.env.CRON_SECRET
    if (secret) {
        const auth = request.headers.get("authorization")
        if (auth !== `Bearer ${secret}`) {
            return NextResponse.json({ error: "Tidak berwenang" }, { status: 401 })
        }
    }

    try {
        // Service role key = kueri server bebas RLS (butuh setelah RLS dikunci
        // untuk user terdaftar). Bila belum di-set, jatuh ke klien anon.
        const db = getSupabaseAdmin() ?? supabase
        const [eqRes, logRes] = await Promise.all([
            db.from("equipment").select(EQUIPMENT_COLS),
            db
                .from("service_logs")
                .select(SERVICE_LOG_COLS)
                .order("service_date", { ascending: false }),
        ])
        if (eqRes.error) throw new Error(eqRes.error.message)
        if (logRes.error) throw new Error(logRes.error.message)

        // Log terbaru per unit (service_logs sudah terurut terbaru dulu).
        const latestLog = new Map<string, (typeof logRes.data)[number]>()
        for (const log of logRes.data ?? []) {
            if (log.equipment_id && !latestLog.has(log.equipment_id)) {
                latestLog.set(log.equipment_id, log)
            }
        }

        const today = new Date()
        const rows = (eqRes.data ?? [])
            .map((eq) => ({
                eq,
                status: evaluateServiceStatus(eq, latestLog.get(eq.equipment_id) ?? null, today),
            }))
            .filter((r) => r.status.id === "overdue" || r.status.id === "warning")
            .sort((a, b) => a.status.rank - b.status.rank || (a.status.remainingDays ?? 999) - (b.status.remainingDays ?? 999))

        if (rows.length === 0) {
            return NextResponse.json({ sent: false, reason: "Semua unit aman — tidak ada yang perlu direminder" })
        }

        const apiKey = process.env.RESEND_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: "RESEND_API_KEY belum diisi di environment" },
                { status: 500 },
            )
        }

        const to = process.env.REMINDER_EMAIL_TO?.trim() || RECIPIENT_FALLBACK
        // CC opsional: "a@x.com, b@x.com". Alamat yang bukan email dibuang diam-diam
        // supaya satu env var yang salah ketik tidak menggagalkan seluruh kiriman.
        const cc = (process.env.REMINDER_EMAIL_CC ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
        const overdueCount = rows.filter((r) => r.status.id === "overdue").length
        const dateLabel = new Intl.DateTimeFormat("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Jakarta",
        }).format(today)

        const rowHtml = rows
            .map((r) => {
                const color = r.status.id === "overdue" ? "#dc2626" : "#d97706"
                const bg = r.status.id === "overdue" ? "#fef2f2" : "#fffbeb"
                const detail = [remainingDaysLabel(r.status.remainingDays), remainingKmLabel(r.status.remainingKm)]
                    .filter((s) => s !== "—")
                    .join(" · ")
                return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">${r.eq.license_plate ?? "-"}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #eee"><span style="background:${bg};color:${color};padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600">${r.status.label}</span></td>
  <td style="padding:8px 12px;border-bottom:1px solid #eee">${detail}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${Number(r.eq.last_odometer ?? 0).toLocaleString("id-ID")} km</td>
</tr>`
            })
            .join("")

        const subject =
            overdueCount > 0
                ? `⚠️ Midaa: ${overdueCount} unit terlewat servis (${rows.length} perlu perhatian)`
                : `Midaa: ${rows.length} unit mendekati jadwal servis`

        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: FROM,
                to: [to],
                ...(cc.length > 0 ? { cc } : {}),
                subject,
                html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px">
  <h2 style="margin:0 0 4px">Reminder Servis Armada</h2>
  <p style="margin:0 0 16px;color:#666">${dateLabel} · ${rows.length} unit perlu perhatian</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead>
      <tr style="text-align:left;color:#666">
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Unit</th>
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Status</th>
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Jadwal</th>
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Odometer</th>
      </tr>
    </thead>
    <tbody>${rowHtml}</tbody>
  </table>
  <p style="margin:16px 0 0;color:#999;font-size:12px">Ambang peringatan: 14 hari / 1.000 km sebelum jadwal. Kiriman otomatis dari dashboard Midaa.</p>
</div>`,
            }),
        })
        if (!res.ok) {
            const body = await res.text()
            throw new Error(`Resend ${res.status}: ${body}`)
        }

        return NextResponse.json({ sent: true, to, cc, count: rows.length })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Gagal mengirim reminder"
        // Petunjuk khusus: setelah RLS dikunci (auth_lockdown.sql), klien anon
        // tidak lagi bisa membaca — cron butuh SUPABASE_SERVICE_ROLE_KEY.
        const hint =
            !process.env.SUPABASE_SERVICE_ROLE_KEY && /permission denied/i.test(message)
                ? " — set SUPABASE_SERVICE_ROLE_KEY di environment (data kini dikunci khusus user terdaftar)."
                : ""
        return NextResponse.json({ error: message + hint }, { status: 500 })
    }
}

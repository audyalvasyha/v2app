import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

import {
    buildComplaintReminderRows,
    complaintReminderSubject,
    COMPLAINT_REMINDER_POLICY,
    type ComplaintReminderTask,
} from "@/lib/complaint-reminder"
import { PRIMARY_ADMIN_EMAIL } from "@/lib/roles"
import { statusLabel } from "@/lib/tasks"
import { supabase } from "@/utils/supabase"
import { getSupabaseAdmin } from "@/utils/supabase-admin"

/**
 * Digest email harian komplain yang belum selesai (dipicu Vercel Cron).
 *
 * Isinya hanya tiket yang sudah melewati ambang 3 hari atau 7 hari, memakai
 * `buildComplaintReminderRows` yang sama dengan logika papan dan lonceng.
 * Penerima default adalah admin utama; bisa dioverride lewat
 * COMPLAINT_REMINDER_TO tanpa mengubah kode.
 *
 * Environment:
 * - RESEND_API_KEY          : wajib agar email terkirim
 * - COMPLAINT_REMINDER_TO   : opsional, default PRIMARY_ADMIN_EMAIL
 * - CRON_SECRET             : WAJIB, endpoint fail-closed
 * - SUPABASE_SERVICE_ROLE_KEY : wajib setelah RLS dikunci
 * - NEXT_PUBLIC_APP_URL     : opsional, default transportbaganbatu.com
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TASK_COLS =
    "id,title,status,created_at,license_plate,delivery_no,freight_order,sales_name"

const FROM = "Midaa Reminder <reminder@transportbaganbatu.com>"
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://transportbaganbatu.com").replace(
    /\/+$/,
    "",
)

function esc(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8")
    const bufB = Buffer.from(b, "utf8")
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}

function dateLabel(value: string): string {
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
    }).format(new Date(value))
}

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        return NextResponse.json(
            {
                error:
                    "CRON_SECRET belum di-set, jadi endpoint ini dikunci. " +
                    "Isi CRON_SECRET di Vercel → Settings → Environment Variables.",
            },
            { status: 503 },
        )
    }

    const header = request.headers.get("authorization") ?? ""
    const expected = `Bearer ${secret}`
    if (header.length !== expected.length || !safeEqual(header, expected)) {
        return NextResponse.json({ error: "Tidak berwenang" }, { status: 401 })
    }

    try {
        const db = getSupabaseAdmin() ?? supabase
        const { data, error } = await db
            .from("tasks")
            .select(TASK_COLS)
            .neq("status", "done")
            .order("created_at", { ascending: true })

        if (error) throw new Error(error.message)

        const rows = buildComplaintReminderRows((data ?? []) as ComplaintReminderTask[])
        if (rows.length === 0) {
            return NextResponse.json({
                sent: false,
                reason: "Tidak ada komplain yang perlu follow-up",
            })
        }

        const apiKey = process.env.RESEND_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: "RESEND_API_KEY belum diisi di environment" },
                { status: 500 },
            )
        }

        const to = process.env.COMPLAINT_REMINDER_TO?.trim() || PRIMARY_ADMIN_EMAIL
        const overdueCount = rows.filter((row) => row.level === "overdue").length
        const today = new Intl.DateTimeFormat("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Jakarta",
        }).format(new Date())

        const rowHtml = rows
            .map((row) => {
                const overdue = row.level === "overdue"
                const color = overdue ? "#b91c1c" : "#b45309"
                const bg = overdue ? "#fef2f2" : "#fffbeb"
                const identity = [
                    row.task.license_plate,
                    row.task.delivery_no ? `DO ${row.task.delivery_no}` : null,
                    row.task.freight_order ? `FO ${row.task.freight_order}` : null,
                    row.task.sales_name,
                ]
                    .filter(Boolean)
                    .join(" · ")

                return `<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top">
    <span style="white-space:nowrap;background:${bg};color:${color};padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700">
      ${overdue ? "Terlambat" : "Perlu FU"} ${row.days} hari
    </span>
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top">
    <div style="font-weight:600;color:#111">${esc(row.task.title)}</div>
    <div style="margin-top:3px;color:#777;font-size:12px">${esc(identity) || "Tanpa identitas pengiriman"}</div>
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap;vertical-align:top">
    ${esc(statusLabel(row.task.status))}
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#777;white-space:nowrap;vertical-align:top">
    ${esc(dateLabel(row.task.created_at))}
  </td>
</tr>`
            })
            .join("")

        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: FROM,
                to: [to],
                subject: complaintReminderSubject(rows),
                html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px">
  <h2 style="margin:0 0 4px">Komplain perlu follow-up</h2>
  <p style="margin:0 0 16px;color:#666">${esc(today)} · ${rows.length} tiket belum selesai${
      overdueCount > 0 ? ` · ${overdueCount} terlambat` : ""
  }</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead>
      <tr style="text-align:left;color:#666">
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Umur</th>
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Komplain</th>
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Status</th>
        <th style="padding:8px 12px;border-bottom:2px solid #ddd">Dibuat</th>
      </tr>
    </thead>
    <tbody>${rowHtml}</tbody>
  </table>
  <p style="margin:20px 0 0">
    <a href="${esc(`${APP_URL}/?view=tugas`)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:9px 14px;border-radius:6px;font-size:13px;font-weight:600">
      Buka Complaint Board
    </a>
  </p>
  <p style="margin:16px 0 0;color:#999;font-size:12px">${esc(COMPLAINT_REMINDER_POLICY)} Kiriman otomatis dari dashboard Midaa.</p>
</div>`,
            }),
        })

        if (!res.ok) {
            const body = await res.text()
            throw new Error(`Resend ${res.status}: ${body}`)
        }

        return NextResponse.json({
            sent: true,
            to,
            count: rows.length,
            overdue: overdueCount,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Gagal mengirim digest komplain"
        const hint =
            !process.env.SUPABASE_SERVICE_ROLE_KEY && /permission denied/i.test(message)
                ? " — set SUPABASE_SERVICE_ROLE_KEY di environment (data kini dikunci khusus user terdaftar)."
                : ""
        return NextResponse.json({ error: message + hint }, { status: 500 })
    }
}

"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Eraser, Loader2, Send, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AI_SUGGESTIONS } from "@/lib/ai/schema-client"
import { formatNumber } from "@/lib/format"
import { supabase } from "@/utils/supabase"

/**
 * Panel chatbot analitik.
 *
 * Tombol mengambang di kanan bawah, panel muncul saat diklik. Sengaja
 * tidak dibuat sebagai tab penuh: user tetap perlu melihat dashboard di
 * belakang sambil bertanya.
 *
 * Prinsip tampilan: jawaban AI ditampilkan BESERTA SQL dan data
 * mentahnya. Kalau user tidak percaya jawabannya, dia bisa cek
 * sendiri angkanya — dan itu penting, karena "kenapa SKR tinggi?"
 * adalah pertanyaan yang jawabannya dipakai untuk mengambil keputusan.
 */

interface ChatResult {
  sql: string
  rows: Array<Record<string, unknown>>
  answer: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  result?: ChatResult
  error?: boolean
}

/**
 * Riwayat percakapan disimpan di localStorage.
 *
 * Panel ini muncul di banyak halaman dan sering dibuka-tutup sambil
 * bekerja; tanpa penyimpanan, setiap reload menghapus konteks yang
 * barusan dibangun — padahal jawaban AI biasanya justru akan dipakai
 * ulang ("yang tadi itu angkanya berapa?").
 *
 * Batas 60 pesan: JSON obrolan ikut ke bundle storage, dan pesan lama
 * memang sudah kehilangan nilai (angkanya sudah basi / sudah terlihat).
 * Gagal menulis (mode privat, kuota penuh) diabaikan diam-diam —
 * riwayat hilang itu sayang, tapi bukan alasan untuk menggagalkan chat.
 */
const STORAGE_KEY = "midaa.ai-chat.v1"
const MAX_STORED_MESSAGES = 60

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : []
  } catch {
    return []
  }
}

export function AIChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Riwayat dibaca SETELAH mount, bukan dari lazy initializer useState.
  // Kalau komponen ikut di-render saat SSR, initializer tidak melihat
  // localStorage lalu state awalnya kosong — dan efek penyimpanan akan
  // menimpa riwayat yang tersimpan dengan array kosong. Bendera `loaded`
  // menahan tulisan sampai pembacaan benar-benar selesai.
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [expandedSql, setExpandedSql] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll ke pesan terbaru setiap ada perubahan — tanpa ini, jawaban
  // panjang akan muncul di bawah area yang sedang dilihat.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Simpan setiap kali percakapan berubah. `slice` di sini bukan sekadar
  // penghemat ruang: ia juga membatasi ukuran tulisan berikutnya, jadi
  // riwayat tidak pernah tumbuh tanpa batas.
  useEffect(() => {
    if (!historyLoaded) return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)),
      )
    } catch {
      // Storage penuh / diblokir: riwayat tidak tersimpan, bukan error.
    }
  }, [messages, historyLoaded])

  useEffect(() => {
    setMessages(loadStoredMessages())
    setHistoryLoaded(true)
  }, [])

  const clearHistory = useCallback(() => {
    setMessages([])
    setExpandedSql({})
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Aman diabaikan — state di memori sudah dikosongkan.
    }
  }, [])

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || loading) return

    setInput("")
    setLoading(true)

    // Id placeholder dibuat SEBELUM kirim dan dipakai untuk mencocokkan
    // jawaban. Versi lama mencocokkan berdasarkan `content === ""` —
    // dengan riwayat yang dipulihkan dari localStorage, satu pesan
    // kosong lama bisa tertimpa jawaban pertanyaan yang sama sekali
    // berbeda.
    const assistantId = `a-${Date.now()}`

    // Pesan user langsung tampil supaya terasa responsif, walau
    // jawabannya masih beberapa detik lagi.
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "" },
    ])

    try {
      // Token sesi wajib ikut: Route Handler meneruskannya ke
      // Supabase supaya query dijalankan dengan RLS user ini,
      // bukan sebagai admin.
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token

      if (!accessToken) throw new Error("Sesi tidak ditemukan. Silakan masuk ulang.")

      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ question: trimmed }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? "Gagal memproses pertanyaan.")
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: payload.answer, result: payload as ChatResult }
            : m,
        ),
      )
    } catch (error) {
      // Pertanyaan dikembalikan ke kolom input: kalau jawabannya error,
      // user biasanya mau mengulang atau merapikan kalimatnya — tanpa ini
      // dia harus mengetik ulang dari nol (input sudah dikosongkan di awal).
      setInput(trimmed)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.",
                error: true,
              }
            : m,
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [loading])

  return (
    <>
      {/* Tombol mengambang — bentuk pil supaya label ikut terbaca */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Tutup asisten AI" : "Buka asisten AI"}
        className="fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="h-5 w-5 shrink-0" /> : <Sparkles className="h-5 w-5 shrink-0" />}
        <span className="text-sm font-semibold">{open ? "Tutup" : "Tanya Midaa"}</span>
      </button>

      {open && (
        // Permukaan panel sengaja memakai `bg-muted`, BUKAN `bg-card`:
        // token --card identik dengan --background di mode terang, sehingga
        // panel sebelumnya menyatu dengan latar dan terlihat seperti lubang.
        // --muted jelas berbeda di kedua tema, dan kepala panel diberi
        // lapisan primary supaya terbaca sebagai permukaan tersendiri.
        <div className="fixed bottom-24 right-6 z-40 flex h-[min(36rem,calc(100vh-8rem))] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-border bg-muted shadow-2xl">
          {/* Kepala */}
          <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Tanya Midaa</p>
              <p className="text-xs text-muted-foreground">Jawaban dihitung dari database</p>
            </div>
            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                title="Hapus seluruh riwayat percakapan"
                className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Eraser className="h-3.5 w-3.5" /> Bersihkan
              </Button>
            )}
          </div>

          {/* Riwayat */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Tanya apa saja tentang data di dasbor ini. Contoh:
                </p>
                {AI_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                loading={loading && message.content === ""}
                sqlOpen={expandedSql[message.id] ?? false}
                onToggleSql={() =>
                  setExpandedSql((prev) => ({ ...prev, [message.id]: !prev[message.id] }))
                }
              />
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya apa saja…"
              maxLength={500}
              disabled={loading}
              aria-label="Pertanyaan untuk asisten AI"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </>
  )
}

function MessageBubble({
  message,
  loading,
  sqlOpen,
  onToggleSql,
}: {
  message: ChatMessage
  loading: boolean
  sqlOpen: boolean
  onToggleSql: () => void
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </p>
      </div>
    )
  }

  // Spinner hanya untuk pesan jawaban yang MASIH kosong (placeholder
  // pertanyaan yang sedang dikirim). Kondisi lama memeriksa `loading`
  // saja, sehingga seluruh jawaban yang sudah ada ikut berubah jadi
  // "Menghitung…" setiap kali ada pertanyaan baru — bug yang kini makin
  // sering terlihat karena riwayat dipulihkan dari localStorage.
  if (loading && !message.content && !message.error) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Menghitung…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className={message.error ? "text-sm text-destructive" : "text-sm"}>{message.content}</p>

      {message.result && (
        <>
          {message.result.rows.length > 0 ? (
            <ResultTable rows={message.result.rows} />
          ) : (
            // Query sukses tapi 0 baris: bedakan dari kegagalan. Tanpa
            // pesan ini, panel terlihat seolah-olah tidak menjawab apa pun.
            <p className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground">
              Query berhasil dijalankan — tidak ada baris yang cocok dengan
              pertanyaan ini.
            </p>
          )}

          {message.result.sql && (
            <div>
              <button
                type="button"
                onClick={onToggleSql}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${sqlOpen ? "rotate-180" : ""}`}
                />
                Lihat query
              </button>
              {sqlOpen && (
                <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-card p-2 text-[11px] leading-relaxed">
                  {message.result.sql}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Tabel hasil query.
 *
 * Nilai angka diformat ribuan supaya mudah dibaca mata; teks
 * dipotong supaya satu kolom panjang tidak merusak layout panel
 * yang sempit ini.
 */
function ResultTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const columns = Object.keys(rows[0] ?? {}).slice(0, 6)
  if (columns.length === 0) return null

  const formatCell = (value: unknown): string => {
    if (value === null || value === undefined) return "—"
    if (typeof value === "number") return formatNumber(value)
    if (typeof value === "object") return JSON.stringify(value)
    const text = String(value)
    return text.length > 28 ? `${text.slice(0, 28)}…` : text
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, index) => (
            <tr key={index} className="border-t border-border">
              {columns.map((column) => (
                <td key={column} className="whitespace-nowrap px-2 py-1.5">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && (
        <p className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
          Menampilkan 20 dari {rows.length} baris.
        </p>
      )}
    </div>
  )
}
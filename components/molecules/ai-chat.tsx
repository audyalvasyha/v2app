"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eraser,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suggestionsForView } from "@/lib/ai/schema-client";
import { formatNumber } from "@/lib/format";
import { supabase } from "@/utils/supabase";

/**
 * Panel chatbot analitik.
 *
 * Tombol mengambang di kanan bawah, panel muncul saat diklik. Sengaja
 * tidak dibuat sebagai tab penuh: user tetap perlu melihat dashboard di
 * belakang sambil bertanya.
 *
 * Prinsip tampilan: jawaban AI berupa narasi, TANPA menampilkan SQL
 * yang dieksekusi dan TANPA tabel data otomatis. Tabel hanya muncul
 * terlipat saat hasil query lebih dari satu baris — yang perlu
 * memverifikasi angka membukanya sendiri, sisanya tidak dibebani.
 */

interface ChatResult {
  sql: string;
  rows: Array<Record<string, unknown>>;
  answer: string;
  /** Memori baru yang berhasil disimpan server (boleh kosong). */
  remembered?: string[];
  /** Saran tanya-lanjutan dari model — maksimal 3, boleh kosong. */
  saran?: string[];
}

interface MemoryItem {
  id: string;
  content: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: ChatResult;
  error?: boolean;
  /** Terisi saat jawaban gagal — pertanyaan aslinya, untuk tombol Coba lagi */
  retryQuestion?: string;
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
const STORAGE_KEY = "midaa.ai-chat.v1";
const MAX_STORED_MESSAGES = 60;

/** Label konteks menu untuk header panel — bukan id mentah "pengiriman". */
const VIEW_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  equipment: "Equipment",
  maintenance: "Histories",
  monitoring: "Monitoring",
  skr: "SKR",
  pengiriman: "Pengiriman",
  ban: "Analisa Ban",
  weather: "Cuaca",
  traffic: "Lalu Lintas",
  analisa: "Analisa",
  about: "Tentang",
};

/**
 * Inline mini-markdown: hanya **bold** — sesuatu yang model memang kerap
 * pakai. Semua teks dirender sebagai child React (bukan innerHTML), jadi
 * tidak ada Permukaan XSS meski jawaban datang dari model.
 */
function inlineNodes(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/**
 * Render jawaban dengan format ringan: bullet "- / •", daftar bernomor,
 * **bold**, dan baris kosong pemisah. Plain text panjang dari model jadi
 * terbaca seperti jawaban asisten, bukan blocang teks mentah.
 */
function RichAnswer({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      className={
        error ? "space-y-1 text-sm text-destructive" : "space-y-1.5 text-sm"
      }
    >
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed)
          return <div key={i} aria-hidden className="h-1.5" />;

        // Bullet: "- " atau "• "
        const bullet = trimmed.startsWith("- ")
          ? trimmed.slice(2)
          : trimmed.startsWith("• ")
            ? trimmed.slice(2)
            : null;
        if (bullet !== null) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <span className="flex-1 leading-relaxed">{inlineNodes(bullet)}</span>
            </div>
          );
        }

        // Daftar bernomor: "1. ..." / "2) ..."
        const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 font-semibold text-primary">
                {numbered[1]}.
              </span>
              <span className="flex-1 leading-relaxed">{inlineNodes(numbered[2])}</span>
            </div>
          );
        }

        return (
          <p key={i} className="leading-relaxed">
            {inlineNodes(line)}
          </p>
        );
      })}
    </div>
  );
}

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function AIChat({ activeView }: { activeView?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Riwayat dibaca SETELAH mount, bukan dari lazy initializer useState.
  // Kalau komponen ikut di-render saat SSR, initializer tidak melihat
  // localStorage lalu state awalnya kosong — dan efek penyimpanan akan
  // menimpa riwayat yang tersimpan dengan array kosong. Bendera `loaded`
  // menahan tulisan sampai pembacaan benar-benar selesai.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryInput, setMemoryInput] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryAvailable, setMemoryAvailable] = useState(true);
  // Tombol "ingat ini": menyala = kalimat yang sedang diketik akan
  // disimpan ke ingatan apa pun jawabannya.
  const [rememberNext, setRememberNext] = useState(false);
  // Pesan kegagalan sekalian isi memori. Tanpa ini, insert yang ditolak
  // server membuat tombol + seakan-akan berhasil padahal tidak ada yang
  // tersimpan — persis yang terjadi di versi sebelumnya.
  const [memoryError, setMemoryError] = useState<string | null>(null);
  // Tombol mengambang menyingkir saat user scroll ke bawah. Fixed
  // positioning berarti tombol ini selalu menutupi isi kanan bawah
  // layar, dan di halaman tabel isi itu sering kali kontrol paginasi.
  const [fabHidden, setFabHidden] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Shortcut keyboard: Alt+A buka/tutup panel, Escape tutup saat terbuka.
  // Sebagian besar asisten punya shortcut — pola yang sama bikin chat bisa
  // dimanggil dalam dua ketukan dari mana pun, tanpa berhenti scroll dulu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sembunyikan tombol saat scroll turun, tampilkan lagi saat scroll naik
  // atau berhenti. Arah scroll dibaca dari selisih posisi, bukan dari
  // event scroll-nya sendiri, karena event itu tidak membawa arah.
  useEffect(() => {
    let lastY = window.scrollY;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY + 4;
      const goingUp = y < lastY - 4;
      lastY = y;

      if (goingUp) setFabHidden(false);
      else if (goingDown) setFabHidden(true);

      // Diam sebentar -> tampilkan lagi, supaya tombol tidak menggantung
      // hilang setelah user berhenti scroll untuk membaca.
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setFabHidden(false), 700);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  // Scroll ke pesan terbaru setiap ada perubahan — tanpa ini, jawaban
  // panjang akan muncul di bawah area yang sedang dilihat.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Textarea pertanyaan ikut tumbuh mengikuti isi (batas ~5 baris). Efek
  // berjalan pada [input] supaya tinggi juga pulih saat pesan terkirim.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input, open]);

  /**
   * Unduh percakapan sebagai .txt — bahan catatan risalah/slide.
   * Tanpa server, tanpa dependensi: cukup Blob + anchor download.
   */
  const exportChat = useCallback(() => {
    if (messages.length === 0) return;
    const lines = messages
      .filter((m) => m.content)
      .map((m) => `${m.role === "user" ? "Kamu" : "Midaa"}:${m.content}`)
      .join("\n\n");
    const header = `Tanya Midaa — diekspor ${new Date().toLocaleString("id-ID")}\n\n`;
    const url = URL.createObjectURL(
      new Blob([header + lines], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `tanya-midaa-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Simpan setiap kali percakapan berubah. `slice` di sini bukan sekadar
  // penghemat ruang: ia juga membatasi ukuran tulisan berikutnya, jadi
  // riwayat tidak pernah tumbuh tanpa batas.
  useEffect(() => {
    if (!historyLoaded) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)),
      );
    } catch {
      // Storage penuh / diblokir: riwayat tidak tersimpan, bukan error.
    }
  }, [messages, historyLoaded]);

  useEffect(() => {
    setMessages(loadStoredMessages());
    setHistoryLoaded(true);
  }, []);

  /**
   * Panggil endpoint memori dengan token sesi yang sama seperti chat.
   *
   * Semua kegagalan di sini ditelan: memori adalah bonus, bukan syarat.
   * Kalau tabelnya belum ada, `available` bernilai false dan panel menampilkan
   * petunjuk setup — bukan membuat panel menampilkan error merah.
   */
  const refreshMemories = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      const response = await fetch("/api/ai/memory", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;

      const payload = await response.json();
      setMemories(Array.isArray(payload?.items) ? payload.items : []);
      setMemoryAvailable(payload?.available !== false);
    } catch {
      // Jaringan atau sesi bermasalah: biarkan isi panel apa adanya.
    }
  }, []);

  // Ambil daftar memori saat panel memori dibuka, bukan saat komponen
  // mount — sebagian besar pengguna tidak pernah membuka tab itu, jadi
  // request-nya tidak perlu dibebankan di awal.
  useEffect(() => {
    if (memoryOpen) refreshMemories();
  }, [memoryOpen, refreshMemories]);

  const addMemory = useCallback(async () => {
    const content = memoryInput.trim();
    if (!content || memoryBusy) return;

    setMemoryBusy(true);
    setMemoryError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      const response = await fetch("/api/ai/memory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content }),
      });
      // Berhasil: kolom input dikosongkan supaya catatan yang sama tidak
      // terkirim dua kali lewat klik ganda.
      if (response.ok) {
        setMemoryInput("");
        await refreshMemories();
        return;
      }

      const payload = await response.json().catch(() => null);
      setMemoryError(
        payload?.error ?? "Catatan gagal disimpan. Coba lagi sebentar ya.",
      );
    } catch {
      setMemoryError(
        "Tidak bisa menghubungi server. Cek koneksi internet kamu.",
      );
    } finally {
      setMemoryBusy(false);
    }
  }, [memoryInput, memoryBusy, refreshMemories]);

  const forgetMemory = useCallback(async (id: string) => {
    setMemories((prev) => prev.filter((item) => item.id !== id));
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      await fetch(`/api/ai/memory?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // Sudah hilang dari tampilan; kalau server menolak, daftar memori
      // akan kembali penuh begitu panel dibuka lagi.
    }
  }, []);

  const forgetAllMemories = useCallback(async () => {
    setMemories([]);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      await fetch("/api/ai/memory?all=1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // Sama seperti di atas — tampilan sudah bersih.
    }
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Aman diabaikan — state di memori sudah dikosongkan.
    }
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;

      setInput("");
      setLoading(true);
      // Tombol "ingat ini" hanya berlaku untuk satu pertanyaan, jadi
      // langsung dimatikan lagi supaya kalimat berikutnya tidak ikut
      // tersimpan tanpa disadari.
      setRememberNext(false);

      // Id placeholder dibuat SEBELUM kirim dan dipakai untuk mencocokkan
      // jawaban. Versi lama mencocokkan berdasarkan `content === ""` —
      // dengan riwayat yang dipulihkan dari localStorage, satu pesan
      // kosong lama bisa tertimpa jawaban pertanyaan yang sama sekali
      // berbeda.
      const assistantId = `a-${Date.now()}`;

      // Pesan user langsung tampil supaya terasa responsif, walau
      // jawabannya masih beberapa detik lagi.
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: trimmed },
        { id: assistantId, role: "assistant", content: "" },
      ]);

      try {
        // Token sesi wajib ikut: Route Handler meneruskannya ke
        // Supabase supaya query dijalankan dengan RLS user ini,
        // bukan sebagai admin.
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken)
          throw new Error("Sesi tidak ditemukan. Silakan masuk ulang.");

        const response = await fetch("/api/ai/ask", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            question: trimmed,
            // Riwayat dikirim sebagai konteks agar pertanyaan lanjutan
            // ("yang bulan lalu berapa?") punya referensinya. Hanya 10
            // pesan terakhir yang dikirim — server juga memotong ulang,
            // karena isinya datang dari klien dan tidak boleh dipercaya.
            history: messages.slice(-10).map((m) => ({
              role: m.role,
              content: m.content,
            })),
            // Menu yang sedang dibuka — jawaban lebih nyambung dengan
            // data yang user sedang lihat. Server mem-whitelist id-nya.
            view: activeView ?? "",
            // Salam satu: server akan menyimpan kalimat ini apa adanya ke
            // ai_memory, tanpa bergantung pada keputusan model.
            remember: rememberNext,
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error ?? "Gagal memproses pertanyaan.");
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: payload.answer, result: payload as ChatResult }
              : m,
          ),
        );

        // Midaa bisa saja menyimpan butir memori baru dari jawabannya.
        // Daftar lokal disegarkan supaya badge jumlah ingatan langsung
        // akurat tanpa harus menutup dan membuka panel.
        if (
          Array.isArray(payload?.remembered) &&
          payload.remembered.length > 0
        ) {
          refreshMemories();
        }
      } catch (error) {
        // Pertanyaan dikembalikan ke kolom input: kalau jawabannya error,
        // user biasanya mau mengulang atau merapikan kalimatnya — tanpa ini
        // dia harus mengetik ulang dari nol (input sudah dikosongkan di awal).
        setInput(trimmed);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    error instanceof Error
                      ? error.message
                      : "Terjadi kesalahan yang tidak diketahui.",
                  error: true,
                  retryQuestion: trimmed,
                }
              : m,
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, refreshMemories, rememberNext],
  );

  // Saran pembuka & cadangan chip — ikut menu aktif, dihitung sekali per menu.
  const contextualSuggestions = useMemo(
    () => suggestionsForView(activeView).slice(0, 3),
    [activeView],
  );

  return (
    <>
      {/* Tombol mengambang — bentuk pil supaya label ikut terbaca.
          `translate-y` + `opacity` dipakai untuk menyembunyikannya saat
          user sedang scroll ke bawah: di posisi fixed, tombol ini
          menutupi apa pun yang ada di kanan bawah layar — termasuk
          paginasi tabel. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Tutup asisten AI" : "Buka asisten AI"}
        className={`fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          fabHidden && !open
            ? "pointer-events-none translate-y-20 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        {open ? (
          <X className="h-5 w-5 shrink-0" />
        ) : (
          <Sparkles className="h-5 w-5 shrink-0" />
        )}
        <span className="text-sm font-semibold">
          {open ? "Tutup" : "Tanya Midaa"}
        </span>
      </button>

      {open && (
        // Permukaan panel memakai token khusus `bg-ai-panel`, bukan
        // `bg-muted` atau `bg-card`:
        //
        // - `--card` identik dengan `--background` di mode terang, jadi
        //   panel lama terlihat seperti lubang di layar, bukan lapisan.
        // - `--muted` (hsl 210 40% 96%) juga nyaris putih, dan di mode
        //   gelap (oklch 0.2) masih terlalu dekat dengan latar 0.1.
        //
        // Token baru di `app/globals.css` sengaja berbeda di kedua tema:
        // terang = biru muda yang jelas bukan putih, gelap = lebih terang
        // dari latar. Dua-duanya dibaca sebagai "permukaan di atas".
        //
        // UKURAN & POSISI: panel kini POP-UP di TENGAH layar, 70% dari
        // ukuran penuh viewport, dengan efek motion zoom+fade saat
        // muncul (utility animate-in yang sama dipakai <Dialog>).
        // muncul (utility animate-in yang sama dipakai <Dialog>).
        // Centering memakai wrapper flex inset-0 — BUKAN translate-x/y
        // pada panel — karena keyframes transform dari animate-in akan
        // menimpa translate centering selama animasi dan panel terlihat
        // melompat. Wrapper pointer-events-none supaya klik di luar
        // panel tetap jatuh ke dashboard di belakangnya.
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="pointer-events-auto flex h-[min(70vh,42rem)] w-[max(20rem,70vw)] flex-col overflow-hidden rounded-2xl border border-ai-panel-foreground/15 bg-ai-panel text-ai-panel-foreground shadow-2xl duration-200 animate-in fade-in-0 zoom-in-95">
            {/* Kepala — shrink-0 supaya strip minimalnya selalu penuh */}
            <div className="flex shrink-0 items-center gap-2 border-b border-ai-panel-foreground/10 bg-ai-panel-foreground/[0.06] px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">
                  Tanya Midaa
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Jawaban dihitung dari database
                  {activeView && VIEW_LABELS[activeView]
                    ? ` · konteks: ${VIEW_LABELS[activeView]}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMemoryOpen((v) => !v)}
                title="Lihat dan kelola yang Midaa ingat tentangmu"
                className={`h-7 shrink-0 gap-1 px-2 text-xs hover:text-foreground ${
                  memoryOpen ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Brain className="h-3.5 w-3.5" />
                Ingatan
                {memories.length > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                    {memories.length}
                  </span>
                )}
              </Button>
              {messages.length > 0 && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={exportChat}
                    title="Unduh percakapan sebagai teks — bahan laporan/presentasi"
                    className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" /> Unduh
                  </Button>
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
                </>
              )}
            </div>

            {/* Memori — bisa disembunyikan supaya tidak memakan tinggi panel */}
            {memoryOpen && (
              <div className="max-h-56 shrink-0 space-y-2 overflow-y-auto border-b border-ai-panel-foreground/10 bg-ai-panel-foreground/[0.04] px-3 py-3">
                {!memoryAvailable ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Memori belum aktif. Jalankan{" "}
                    <code className="rounded bg-ai-panel-foreground/10 px-1 py-0.5">
                      supabase/sql/ai_memory.sql
                    </code>{" "}
                    di Supabase SQL Editor, lalu buka panel ini lagi. Sampai
                    itu, Tanya Data tetap jalan normal — cuma tidak mengingat
                    apa-apa.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Yang Midaa ingat tentangmu
                      </p>
                      {memories.length > 0 && (
                        <button
                          type="button"
                          onClick={forgetAllMemories}
                          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Lupakan semua
                        </button>
                      )}
                    </div>

                    {memories.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Belum ada. Midaa akan menyimpannya sendiri kalau kamu
                        menyuruh dia selalu melakukan sesuatu dengan cara
                        tertentu — atau tulis sendiri di bawah.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {memories.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-start gap-2 rounded-md border border-ai-panel-foreground/15 bg-ai-panel-foreground/[0.05] px-2 py-1.5 text-xs"
                          >
                            <span className="flex-1 leading-relaxed">
                              {item.content}
                            </span>
                            <button
                              type="button"
                              onClick={() => forgetMemory(item.id)}
                              aria-label="Hapus ingatan ini"
                              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {memoryError && (
                      <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                        {memoryError}
                      </p>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        addMemory();
                      }}
                      className="flex gap-1.5"
                    >
                      <Input
                        value={memoryInput}
                        onChange={(e) => setMemoryInput(e.target.value)}
                        placeholder="Contoh: selalu pakai rentang 3 bulan"
                        maxLength={300}
                        aria-label="Catatan untuk diingat Midaa"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="secondary"
                        disabled={memoryBusy || !memoryInput.trim()}
                        aria-label="Simpan ingatan"
                      >
                        {memoryBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            )}

            {/* Riwayat */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Tanya apa saja tentang data di dasbor ini. Contoh:
                  </p>
                  {/* Saran pembuka mengikuti menu yang sedang dibuka —
                    supaya contohnya relevan, bukan daftar paksa global. */}
                  {suggestionsForView(activeView).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="block w-full rounded-lg border border-ai-panel-foreground/15 bg-ai-panel-foreground/[0.05] px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10"
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
                  onAsk={ask}
                  fallbackSuggestions={contextualSuggestions}
                />
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex gap-2 border-t border-ai-panel-foreground/10 bg-ai-panel-foreground/[0.04] p-3"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={loading}
                onClick={() => setRememberNext((v) => !v)}
                title="Simpan pertanyaan ini ke ingatan Midaa"
                aria-pressed={rememberNext}
                className={`shrink-0 ${rememberNext ? "text-primary" : "text-muted-foreground"}`}
              >
                <Brain
                  className={`h-4 w-4 ${rememberNext ? "fill-current" : ""}`}
                />
              </Button>
              {/* Textarea multi-baris: pertanyaan panjang akhirnya bisa
                  ditulis utuh. Enter = kirim, Shift+Enter = baris baru —
                  pola standar aplikasi chat (Slack/WhatsApp). */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !loading) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                rows={1}
                maxLength={1000}
                disabled={loading}
                aria-label="Pertanyaan untuk asisten AI"
                placeholder={
                  rememberNext
                    ? "Ketik yang mau diingat…"
                    : "Tanya apa saja… (Enter kirim, Shift+Enter baris baru)"
                }
                className="max-h-[120px] min-h-[2.25rem] flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={loading || !input.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  message,
  loading,
  onAsk,
  fallbackSuggestions,
}: {
  message: ChatMessage;
  loading: boolean;
  /** Dipakai tombol Coba lagi & chip saran lanjutan. */
  onAsk?: (question: string) => void;
  /** Cadangan bila model tidak memberi saran — 3 saran kontekstual menu. */
  fallbackSuggestions?: string[];
}) {
  // Saran chip selalu ada: model lebih dahulu, kalau dia tidak memberinya
  // (atau jawaban lama di localStorage tidak punya field itu), panel
  // memakai saran kontekstual menu aktif. Panel tidak pernah memendek
  // tanpa jalan lanjutan hanya karena model malas mengembalikan satu array.
  const saranChips =
    !message.error && message.result
      ? (message.result.saran?.length ?? 0) > 0
        ? message.result.saran!
        : (fallbackSuggestions ?? [])
      : [];
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </p>
      </div>
    );
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
    );
  }

  return (
    <div className="space-y-2">
      <RichAnswer text={message.content} error={message.error} />

      {/* Tahan banting: jawaban gagal bisa diulang satu klik dengan
          pertanyaan yang sama — tanpa mengetik ulang lewat kolom input. */}
      {message.error && message.retryQuestion != null && onAsk && (
        <button
          type="button"
          onClick={() => onAsk(message.retryQuestion!)}
          className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Coba lagi
        </button>
      )}

      {message.result && (
        <>
          {message.result.remembered &&
            message.result.remembered.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs text-foreground">
                <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Aku simpan ini:{" "}
                  {message.result.remembered.map((item, i) => (
                    <span key={item}>
                      {i > 0 && "; "}
                      {item}
                    </span>
                  ))}
                </span>
              </p>
            )}

          {/* Tabel tidak lagi ditampilkan di setiap jawaban: satu baris
              sudah tercakup penuh oleh angka di narasi, jadi tabel hanya
              ditawarkan terlipat saat hasilnya multi-baris — hemat ruang
              dan yang butuh detail membukanya sendiri. */}
          {message.result.rows.length > 1 ? (
            <FoldableData rows={message.result.rows} />
          ) : message.result.rows.length === 0 ? (
            // Query sukses tapi 0 baris: bedakan dari kegagalan. Tanpa
            // pesan ini, panel terlihat seolah-olah tidak menjawab apa pun.
            <p className="rounded-md border border-ai-panel-foreground/15 bg-ai-panel-foreground/[0.05] px-2 py-1.5 text-xs text-muted-foreground">
              Sudah dicek — tidak ada data yang cocok dengan pertanyaan ini.
            </p>
          ) : null}
        </>
      )}

      {/* Saran tanya-lanjutan: dari model bila ada, cadangan menu bila tidak.
          Chip yang diklik mengirim pertanyaan baru persis seperti diketik. */}
      {/* Chip sengaja ringkas: tanpi latar, padding mungil, teks 10px —
          baris chip tidak boleh memakan ruang lebih dari satu baris kecil. */}
      {saranChips.length > 0 && onAsk && (
        <div className="flex flex-wrap gap-1 pt-1">
          {saranChips.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAsk(s)}
              className="rounded-full border border-ai-panel-foreground/15 px-2 py-[2px] text-[10px] leading-snug text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {!message.error && message.content && (
        <CopyAnswer text={message.content} />
      )}
    </div>
  );
}

/** Tombol salin jawaban — feedback "Tersalin" 2 detik, gagal senyap. */
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard bisa ditolak (permission) — biarkan tombol tetap ada,
        // tidak perlu merusak panel untuk satu kegagalan kecil.
      });
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Tersalin" : "Salin"}
    </button>
  );
}

/**
 * Tabel data hasil query, TERLIPAT secara default.
 *
 * Tidak semua jawaban perlu tabel — narasi sudah memuat angka
 * utamanya — jadi tabel hanya muncul kalau user membukanya sendiri.
 *
 * Nilai angka diformat ribuan supaya mudah dibaca mata; teks
 * dipotong supaya satu kolom panjang tidak merusak layout panel
 * yang sempit ini.
 */
function FoldableData({ rows }: { rows: Array<Record<string, unknown>> }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "Sembunyikan data" : `Lihat data (${rows.length} baris)`}
      </button>
      {open && <ResultTable rows={rows} />}
    </div>
  );
}

function ResultTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const columns = Object.keys(rows[0] ?? {}).slice(0, 6);
  if (columns.length === 0) return null;

  const formatCell = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") return formatNumber(value);
    if (typeof value === "object") return JSON.stringify(value);
    const text = String(value);
    return text.length > 28 ? `${text.slice(0, 28)}…` : text;
  };

  return (
    <div className="overflow-x-auto rounded-md border border-ai-panel-foreground/15 bg-ai-panel-foreground/[0.05]">
      <table className="w-full text-xs">
        <thead className="bg-ai-panel-foreground/[0.08]">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap px-2 py-1.5 text-left font-medium"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, index) => (
            <tr key={index} className="border-t border-ai-panel-foreground/10">
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
        <p className="border-t border-ai-panel-foreground/10 px-2 py-1.5 text-[11px] text-muted-foreground">
          Menampilkan 20 dari {rows.length} baris.
        </p>
      )}
    </div>
  );
}

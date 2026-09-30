import React from "react"
import { ArrowUpRight, Mail, Instagram } from "lucide-react"

// Data teknis ditulis sebagai baris spesifikasi (bukan badge) agar terasa seperti
// lembar data produk, bukan deretan chip generik.
const SPECS: { label: string; value: string }[] = [
    { label: "Framework", value: "Next.js 16 · App Router" },
    { label: "Bahasa", value: "TypeScript" },
    { label: "Antarmuka", value: "Tailwind CSS + shadcn/ui" },
    { label: "Basis Data", value: "Supabase · PostgreSQL" },
    { label: "Visualisasi", value: "Recharts" },
]

const CAPABILITIES: { index: string; title: string; desc: string }[] = [
    {
        index: "01",
        title: "Inventaris Unit",
        desc: "Setiap unit tercatat lengkap dengan nomor plat, tahun konstruksi, dan odometer terakhir. Status ketersediaan langsung terbaca dari tabel.",
    },
    {
        index: "02",
        title: "Riwayat Perbaikan",
        desc: "Seluruh pengeluaran pemeliharaan tersimpan per unit, lalu dirangkum menjadi tren biaya harian untuk tiga bulan terakhir.",
    },
    {
        index: "03",
        title: "Jadwal Servis",
        desc: "Bandingkan tanggal dan odometer servis berikutnya untuk menandai unit yang aman, mendekati, atau sudah terlambat servis.",
    },
    {
        index: "04",
        title: "Sisa Kiriman (SKR)",
        desc: "Dasbor Sisa Kiriman per armada, sales, dan toko: dokumen, qty, dan nilai tersaji berdampingan dengan tren harian dibanding bulan sebelumnya.",
    },
    {
        index: "05",
        title: "Pengiriman Outbound",
        desc: "Jam keluar dan kembali tiap armada dirangkap durasi tempuh, dengan filter rentang tanggal dan pencarian cepat nomor polisi.",
    },
    {
        index: "06",
        title: "Import Data Harian",
        desc: "Halaman terproteksi login untuk mengunggah CSV dari sistem: baris yang sama ditimpa, yang baru ditambah — data hari sebelumnya tetap aman.",
    },
]

const SKILLS = ["Next.js", "TypeScript", "Tailwind", "Supabase", "Firebase", "GitHub", "Vercel"]

export function AboutView() {
    return (
        <div className="w-full max-w-5xl mx-auto pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Masthead: penanda seksi + versi, dipisah satu garis rambut */}
            <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                    <span className="h-2 w-2 bg-primary" aria-hidden="true" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                        Tentang Aplikasi
                    </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums uppercase tracking-[0.28em] text-muted-foreground">
                    v2.0
                </span>
            </div>

            {/* Hero asimetris: narasi di kiri, lembar spesifikasi di kanan */}
            <div className="mt-12 grid gap-12 md:grid-cols-12 md:gap-10">
                <div className="md:col-span-7">
                    <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl">
                        Transport
                        <br />
                        <span className="text-muted-foreground/50">Management System</span>
                        <span className="text-primary">.</span>
                    </h1>
                    <p className="mt-8 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
                        Satu dasbor operasional untuk mengelola armada kendaraan mulai dari inventaris
                        unit, riwayat perbaikan, hingga pengingat servis yang dihitung dari tanggal maupun
                        odometer. Dibangun agar tim lapangan dan tim administrasi membaca angka yang sama.
                    </p>
                </div>

                <div className="md:col-span-5 md:pt-2">
                    <dl className="border-y border-border divide-y divide-border">
                        {SPECS.map((spec) => (
                            <div key={spec.label} className="flex items-baseline justify-between gap-6 py-3">
                                <dt className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                    {spec.label}
                                </dt>
                                <dd className="text-right text-sm text-foreground/90">{spec.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>

            {/* Cakupan: nomor indeks + judul, bukan kartu berikon */}
            <div className="mt-20 border-t border-border pt-10">
                <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    Cakupan
                </div>
                <div className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
                    {CAPABILITIES.map((item) => (
                        <div key={item.index} className="group">
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-xs tabular-nums text-primary">{item.index}</span>
                                <span
                                    className="h-px flex-1 bg-border transition-colors duration-300 group-hover:bg-primary/60"
                                    aria-hidden="true"
                                />
                            </div>
                            <h3 className="mt-4 text-lg font-medium tracking-tight">{item.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Profil: potret, narasi, dan rel kontak */}
            <div className="mt-20 border-t border-border pt-10">
                <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    Dikembangkan Oleh
                </div>

                <div className="mt-8 grid gap-10 md:grid-cols-12">
                    <div className="flex items-start gap-5 md:col-span-4">
                        <img
                            src="/IMG_20260929_045219.jpg"
                            alt="Audy Al Vasyah"
                            width={112}
                            height={112}
                            className="h-24 w-24 shrink-0 rounded-lg border border-border object-cover grayscale transition duration-500 hover:grayscale-0 md:h-28 md:w-28"
                        />
                        <div className="pt-1">
                            <h2 className="text-xl font-semibold tracking-tight">Audy Al Vasyah</h2>
                            <p className="mt-1 text-sm text-[#f97316]">
                                Transport Planner &amp; Operations Tech
                            </p>
                        </div>
                    </div>

                    <div className="md:col-span-5 md:col-start-6">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Menggabungkan sisi <i>engineering</i> dengan pengelolaan armada: menyusun
                            arsitektur aplikasi, merancang antarmuka, hingga mengintegrasi{" "}
                            <i>database</i> dari hulu ke hilir.
                        </p>
                        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
                            {SKILLS.join(" / ")}
                        </p>
                    </div>

                    <div className="md:col-span-2 md:col-start-11">
                        <div className="flex flex-col divide-y divide-border border-y border-border">
                            <a
                                href="mailto:audialfasha@gmail.com"
                                className="group flex items-center justify-between gap-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <span className="flex items-center gap-2">
                                    <Mail className="h-3.5 w-3.5" />
                                    Email
                                </span>
                                <ArrowUpRight className="h-3.5 w-3.5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                            </a>
                            <a
                                href="https://www.instagram.com/audysignin?stkn=d3hubDN6eTBnMG8x"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center justify-between gap-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <span className="flex items-center gap-2">
                                    <Instagram className="h-3.5 w-3.5" />
                                    Instagram
                                </span>
                                <ArrowUpRight className="h-3.5 w-3.5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Catatan proses: kolaborasi bersama asisten AI, ditulis sebagai anotasi */}
            <div className="mt-16 grid gap-4 border-t border-border pt-6 md:grid-cols-12">
                <div className="md:col-span-3">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                        <span className="h-1.5 w-1.5 bg-primary" aria-hidden="true" />
                        Catatan Proses
                    </div>
                </div>
                <div className="md:col-span-9">
                    <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
                        Pengoptimalan komponen ke pola <i>Atomic Design</i>, penajaman performa di ekosistem
                        Next.js, serta penyempurnaan antarmuka dengan Tailwind dan shadcn/ui dikerjakan bersama
                        asisten AI sebagai rekan peninjau memeriksa keputusan teknis.
                    </p>
                </div>
            </div>
        </div>
    )
}

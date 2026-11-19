import type React from "react"
import type { Metadata, Viewport } from "next"

import "./globals.css"

import { Geist_Mono } from 'next/font/google'

import { Toaster } from "@/components/ui/sonner"
import { Analytics } from "@vercel/analytics/next"

// Font utama saja — inisialisasi font tak terpakai (Source Serif, double Geist Mono)
// membuat build lebih lambat dan menambah CSS font yang tidak dipakai
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" })

export const metadata: Metadata = {
  title: "Midaa - Transport Management System",
  description:
    "Midaa — sistem manajemen armada: inventaris equipment, riwayat maintenance, monitoring jadwal servis, pengiriman, dan ringkasan sisa kiriman SKR.",
    generator: 'v0.app',
  // File ikon berada di public/ sehingga tidak otomatis dideteksi Next.js — ditautkan manual
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-light-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-dark-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // suppressHydrationWarning pada <html> wajib ada: script di dalam head
  // memodifikasi class <html> SEBELUM React hydrate, sehingga DOM di sisi
  // klien sudah punya class="dark" sementara hasil render server tidak.
  // Tanpa flag itu React menganggapnya hydration mismatch dan melempar error.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Terapkan tema sebelum halaman digambar supaya pengguna device dark
            tidak melihat kedipan putih. Logikanya sama dengan hooks/use-theme.ts:
            "dark"/"light" = pilihan manual, "system"/kosong = ikut device. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("snippet-manager-theme");var t=(s==="dark"||s==="light")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`,
          }}
        />
        {/* Koneksi ke Supabase dipanaskan lebih awal — menghemat handshake TLS pada fetch data pertama */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin} crossOrigin="anonymous" />
        )}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="dns-prefetch" href={new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin} />
        )}
      </head>
      <body className={`${geistMono.className} antialiased`}>
        {children}
        <Toaster position="top-center" richColors closeButton />
        <Analytics />
      </body>
    </html>
  )
}

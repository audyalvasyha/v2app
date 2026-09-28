import type React from "react"
import type { Metadata, Viewport } from "next"

import "./globals.css"

import { Geist_Mono } from 'next/font/google'

// Font utama saja — inisialisasi font tak terpakai (Source Serif, double Geist Mono)
// membuat build lebih lambat dan menambah CSS font yang tidak dipakai
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" })

export const metadata: Metadata = {
  title: "v2app - Fleet Management System",
  description:
    "A powerful code snippet manager with syntax highlighting, tagging, and advanced search capabilities for developers.",
    generator: 'v0.app'
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
  return (
    <html lang="en">
      <head>
        {/* Koneksi ke Supabase dipanaskan lebih awal — menghemat handshake TLS pada fetch data pertama */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin} crossOrigin="anonymous" />
        )}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="dns-prefetch" href={new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin} />
        )}
      </head>
      <body className={`${geistMono.className} antialiased`}>{children}</body>
    </html>
  )
}

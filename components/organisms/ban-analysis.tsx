"use client";

import React from "react";
import { HinoTyreMap } from "./hino-tyre-map";

/**
 * Board Analisa Ban.
 *
 * Isinya kini peta posisi ban (`components/organisms/hino-tyre-map.tsx`):
 * gambar rangka Hino dengan titik tiap ban, garis kurva ke kotak detail
 * (posisi, tekanan angin, ketebalan mm, merk ban). Peta menerima props
 * `tyres` — kolom tekanan/ketebalan/merk belum ada di Supabase, jadi
 * untuk sekarang peta memakai data contohnya sendiri. Tanda tangan komponen
 * tetap sama agar panggilan `next/dynamic` di `app/page.tsx` tidak berubah.
 */
export interface BanAnalysisProps {
  /** Seluruh riwayat perbaikan (sudah termasuk kolom uraian & jumlah_harga). */
  histories: any[]
  isLoading: boolean
  error: string | null
}

export function BanAnalysis({ histories, isLoading, error }: BanAnalysisProps) {
  return <HinoTyreMap />;
}

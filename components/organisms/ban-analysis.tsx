"use client";

import React from "react";
import { HinoTyreMap } from "./hino-tyre-map";

/**
 * Board Analisa Ban.
 *
 * Isinya kini peta posisi ban (`components/organisms/hino-tyre-map.tsx`):
 * dropdown nomor polisi dari tabel `equipment` + gambar rangka Hino dengan
 * titik tiap ban, garis kurva ke kotak detail (posisi, tekanan angin,
 * ketebalan mm, merk ban). Jumlah panel hotspot mengikuti `type_vehicle`:
 * 6R/6D → 6 roda, 4R/4D → 4 roda. Kolom tekanan/ketebalan/merk belum ada di
 * Supabase, jadi untuk sekarang peta memakai data contohnya sendiri. Tanda
 * tangan komponen hanya bertambah — panggilan `next/dynamic` di `app/page.tsx`
 * tidak berubah.
 */
export interface BanAnalysisProps {
  /** Seluruh riwayat perbaikan (sudah termasuk kolom uraian & jumlah_harga). */
  histories: any[]
  /** Inventaris unit dari tabel `equipment` — sumber dropdown nopol & type_vehicle. */
  equipments: any[]
  isLoading: boolean
  error: string | null
}

export function BanAnalysis({ histories, equipments, isLoading, error }: BanAnalysisProps) {
  return <HinoTyreMap equipments={equipments} />;
}

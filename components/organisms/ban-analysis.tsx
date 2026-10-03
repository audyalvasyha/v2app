"use client";

import React from "react";
import { ComingSoon } from "./coming-soon";

/**
 * Board Analisa Ban.
 *
  Saat ini menu ini masih dalam pengembangan. Isinya (peta ban, tabel rincian,
  filter, dll) dipindahkan ke `components/organisms/coming-soon.tsx` agar
  `BanAnalysis` bisa dipanggil persis seperti dulu dari `app/page.tsx` tanpa
  mengubah penamaan atau tanda tangannya. Ketika peta ban selesai, ganti
  `<ComingSoon />` ini dengan view peta yang baru.
 */
export interface BanAnalysisProps {
  /** Seluruh riwayat perbaikan (sudah termasuk kolom uraian & jumlah_harga). */
  histories: any[]
  isLoading: boolean
  error: string | null
}

export function BanAnalysis({ histories, isLoading, error }: BanAnalysisProps) {
  return <ComingSoon />;
}

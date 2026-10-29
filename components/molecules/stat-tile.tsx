import React from "react";

import { cn } from "@/lib/utils";

export interface StatTileProps {
  label: string;
  value: string;
  /** Boleh berisi elemen (mis. penanda naik/turun berwarna) */
  hint?: React.ReactNode;
  /** Nilai lengkap saat angka utama diringkas (mis. nominal penuh pada tooltip) */
  title?: string;
  icon?: React.ReactNode;
  /** Beri penekanan warna aksen untuk metrik utama */
  emphasis?: boolean;
  className?: string;
}

/**
 * Kartu ringkasan kecil untuk deretan metrik di atas tabel.
 * Dipakai bersama oleh menu Equipment dan Histories agar tampilannya konsisten.
 */
/**
 * Tinggi kartu SELALU menyamai baris grid-nya (h-full + flex), isi di-center
 * vertikal — tanpa ini kartu yang punya `hint` (mis. "Unit bermasalah") lebih
 * tinggi dari kartu satunya baris, dan deretan KPI terlihat bergerigi.
 */
export function StatTile({
  label,
  value,
  hint,
  title,
  icon,
  emphasis,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-primary/30",
        className,
      )}
      title={title}
    >
      {/* Eyebrow: ikon dalam bubble aksen + label kapital — bahasa kartu yang
          sama dengan header kartu besar (CardHeaderBadge) supaya satu halaman
          terbaca sebagai satu sistem, bukan kumpulan komponen berbeda gaya. */}
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-3.5 [&_svg]:w-3.5">
            {icon}
          </div>
        )}
        <span className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "mt-3 truncate text-xl font-semibold leading-none tabular-nums",
          emphasis && "text-primary",
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 text-xs leading-snug text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  );
}

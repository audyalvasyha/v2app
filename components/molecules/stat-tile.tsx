import React from "react";

import { Card, CardContent } from "@/components/ui/card";
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
  /** Versi rapat: padding, ikon, dan angka lebih kecil — untuk deretan KPI
   *  yang tidak perlu mendominasi halaman (mis. papan tugas). */
  compact?: boolean;
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
  compact,
  className,
}: StatTileProps) {
  return (
    <Card
      className={cn(
        "h-full gap-0 py-0 shadow-sm transition-colors hover:border-primary/30",
        className,
      )}
      title={title}
    >
      <CardContent
        className={cn(
          "flex h-full flex-col",
          compact ? "px-3 py-2.5" : "px-3 py-3 sm:px-4 sm:py-3.5",
        )}
      >
        {/* Ikon datar tanpa bubble aksen — KPI tetap punya penanda visual
            tanpa terlihat seperti deretan kartu starter dashboard. */}
        <div className={cn("flex items-center", compact ? "gap-2" : "gap-2.5")}>
          {icon && (
            <span className="shrink-0 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
              {icon}
            </span>
          )}
          <span className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </span>
        </div>
        <div
          className={cn(
            "truncate font-semibold leading-none tabular-nums",
            compact ? "mt-2 text-lg" : "mt-2 text-lg sm:mt-3 sm:text-xl",
            emphasis && "text-primary",
          )}
        >
          {value}
        </div>
        {hint && (
          <div
            className={cn(
              "leading-snug text-muted-foreground",
              compact ? "mt-1 text-[11px]" : "mt-1 text-[11px] sm:mt-1.5 sm:text-xs",
            )}
          >
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

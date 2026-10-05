"use client";

import React, { memo, useState } from "react";
import { Gauge, Ruler, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BanWheelSlot } from "@/lib/ban-analytics";

/**
 * Peta posisi ban untuk menu Analisa Ban.
 *
 * Dasar petanya foto rangka Hino di `public/Hino Chasis.png` (foto atas 3/4,
 * mobil menghadap ke kanan). Tiap ban ditandai sebuah titik, lalu garis kurva
 * (bezier, SVG overlay) menariknya ke kotak detail yang menampilkan
 * singkatan posisi, tekanan angin, ketebalan mm, dan merk ban.
 *
 * PENTING — kalibrasi titik ban:
 * Posisi titik ada di konstanta `HOTSPOTS` dalam PERSEN dari gambar
 * (x dari kiri, y dari atas, 0–100). Kalau sebuah titik tidak tepat duduk di
 * atas ban pada foto, cukup geser angka `x`/`y` slot itu — tidak ada yang
 * perlu diubah di tempat lain; garis kurva dan kotak detail mengikuti
 * otomatis.
 */

const HINO_IMAGE = {
  /** Nama berkas memakai spasi, jadi di-encode jadi %20. */
  src: "/Hino%20Chasis.png",
  width: 669,
  height: 373,
} as const;

export interface HinoTyreInfo {
  /** Slot roda yang sudah ada di model data (ban-analytics). */
  slot: BanWheelSlot
  /** Singkatan posisi, mis. "RL" untuk Rear Left. */
  code: string
  /** Nama lengkap posisi, mis. "Rear Left". */
  name: string
  /** Tekanan angin siap tampil, mis. "5.8 bar" — null bila belum diukur. */
  pressureBar: string | null
  /** Ketebalan tread dalam mm — null bila belum diukur. */
  thicknessMm: number | null
  /** Merk ban — null bila tidak dicatat. */
  brand: string | null
}

/**
 * DATA CONTOH. Kolom tekanan/ketebalan/merk ban belum ada di Supabase, jadi
 * nilai berikut masih contoh agar peta bisa dilihat utuh. Bila datanya sudah
 * tersedia, kirim lewat props `tyres` (struktur `HinoTyreInfo`) dari
 * `ban-analysis.tsx` — komponen ini tidak perlu diubah.
 */
const CONTOH_DATA_BAN: Record<BanWheelSlot, HinoTyreInfo> = {
  "depan-kiri": {
    slot: "depan-kiri",
    code: "FL",
    name: "Front Left",
    pressureBar: "5.6 bar",
    thicknessMm: 6.4,
    brand: "GT Radial",
  },
  "depan-kanan": {
    slot: "depan-kanan",
    code: "FR",
    name: "Front Right",
    pressureBar: "5.8 bar",
    thicknessMm: 6.8,
    brand: "GT Radial",
  },
  "belakang-kiri": {
    slot: "belakang-kiri",
    code: "RL",
    name: "Rear Left",
    pressureBar: "6.2 bar",
    thicknessMm: 7.2,
    brand: "Dunlop",
  },
  "belakang-kanan": {
    slot: "belakang-kanan",
    code: "RR",
    name: "Rear Right",
    pressureBar: "6.0 bar",
    thicknessMm: 7.5,
    brand: "Dunlop",
  },
  serap: {
    slot: "serap",
    code: "SP",
    name: "Spare Tire",
    pressureBar: "6.0 bar",
    thicknessMm: 8.1,
    brand: "GT Radial",
  },
};

/** Urutan tampil kotak detail kolom kiri (belakang) dan kanan (depan). */
const LEFT_SLOTS: BanWheelSlot[] = ["belakang-kiri", "belakang-kanan", "serap"];
const RIGHT_SLOTS: BanWheelSlot[] = ["depan-kanan", "depan-kiri"];

/**
 * Posisi titik tiap ban, dalam PERSEN dari gambar (x dari kiri, y dari atas).
 * Foto menghadap kanan: sisi dekat kamera (bagian bawah foto) = sisi kanan
 * kendaraan, sisi jauh (atas) = sisi kiri. Sesuaikan angkanya bila titik
 * belum tepat di atas ban pada foto.
 */
const HOTSPOTS: Record<BanWheelSlot, { x: number; y: number }> = {
  "depan-kanan": { x: 78, y: 85 },
  "depan-kiri": { x: 77, y: 61 },
  "belakang-kanan": { x: 27, y: 85 },
  "belakang-kiri": { x: 26, y: 60 },
  serap: { x: 18, y: 72 },
};

/** Geometri diagram desktop: semua dalam % agar tetap menempel saat discale. */
const LAYOUT = {
  /** Rasio lebar : tinggi kanvas diagram. */
  aspect: 2,
  /** Lebar gambar Hino dalam % lebar kanvas. */
  imgW: 52,
} as const;

const IMG_LEFT = (100 - LAYOUT.imgW) / 2;
const IMG_H = LAYOUT.imgW * (HINO_IMAGE.height / HINO_IMAGE.width) * LAYOUT.aspect;
const IMG_TOP = (100 - IMG_H) / 2;

/** Ubah posisi (dalam % gambar) ke % kanvas diagram. */
function toCanvas(p: { x: number; y: number }) {
  return {
    x: IMG_LEFT + (p.x / 100) * LAYOUT.imgW,
    y: IMG_TOP + (p.y / 100) * IMG_H,
  };
}

/** Posisi (pusat vertikal) tiap kotak detail, dalam % tinggi kanvas. */
const BOX_Y: Record<BanWheelSlot, number> = {
  "belakang-kiri": 19,
  "belakang-kanan": 83,
  serap: 51,
  "depan-kanan": 67,
  "depan-kiri": 35,
};

const BOX_W = 17;
const BOX_X_LEFT = 1.5; // kotak kolom kiri: right edge = BOX_X_LEFT + BOX_W
const BOX_X_RIGHT = 100 - 1.5 - BOX_W; // kotak kolom kanan: left edge

function fmtThickness(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} mm`;
}

/* -------------------------------------------------------------------------- */
/* Kotak detail                                                                */
/* -------------------------------------------------------------------------- */

interface DetailBoxProps {
  info: HinoTyreInfo
  active: boolean
  onToggle: () => void
  className?: string
  style?: React.CSSProperties
}

function TyreDetailBox({ info, active, onToggle, className, style }: DetailBoxProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      style={style}
      className={cn(
        "block w-full rounded-xl border bg-card/95 p-2.5 text-left shadow-sm backdrop-blur transition-all duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary/70 shadow-md ring-2 ring-primary/40"
          : "border-border hover:border-primary/50 hover:shadow-md",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold leading-none",
            active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {info.code}
        </span>
        <span className="truncate text-[11px] font-semibold leading-none">
          {info.name} <span className="font-normal text-muted-foreground">({info.code})</span>
        </span>
      </div>

      <dl className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
            <Gauge className="h-3 w-3" aria-hidden /> Tekanan
          </dt>
          <dd className="truncate text-[11px] font-medium leading-none tabular-nums">
            {info.pressureBar ?? "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
            <Ruler className="h-3 w-3" aria-hidden /> Ketebalan
          </dt>
          <dd className="truncate text-[11px] font-medium leading-none tabular-nums">
            {fmtThickness(info.thicknessMm)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
            <Tag className="h-3 w-3" aria-hidden /> Merk
          </dt>
          <dd className="truncate text-[11px] font-medium leading-none">{info.brand ?? "—"}</dd>
        </div>
      </dl>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Titik ban pada gambar                                                       */
/* -------------------------------------------------------------------------- */

interface WheelDotProps {
  info: HinoTyreInfo
  x: number
  y: number
  active: boolean
  onToggle: () => void
}

function WheelDot({ info, x, y, active, onToggle }: WheelDotProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${info.name} (${info.code})`}
      title={`${info.name} (${info.code})`}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={cn(
        "group absolute z-10 -translate-x-1/2 -translate-y-1/2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full",
      )}
    >
      <span
        className={cn(
          "block h-4 w-4 rounded-full border-2 shadow-sm transition-all duration-150",
          active
            ? "border-primary bg-primary ring-2 ring-primary/40"
            : "border-primary/70 bg-background/90 group-hover:border-primary group-hover:bg-primary/20",
        )}
      />
      <span
        className={cn(
          "absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded px-1 py-px text-[9px] font-semibold leading-none transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-background/85 text-foreground/80",
        )}
        aria-hidden
      >
        {info.code}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Peta utama                                                                  */
/* -------------------------------------------------------------------------- */

export interface HinoTyreMapProps {
  /** Data per roda; bila tidak dikirim, memakai `CONTOH_DATA_BAN`. */
  tyres?: Partial<Record<BanWheelSlot, HinoTyreInfo>>
  className?: string
}

function HinoTyreMapImpl({ tyres, className }: HinoTyreMapProps) {
  const [activeSlot, setActiveSlot] = useState<BanWheelSlot | null>(null);

  const data: Record<BanWheelSlot, HinoTyreInfo> = { ...CONTOH_DATA_BAN, ...tyres };

  const toggle = (slot: BanWheelSlot) =>
    setActiveSlot((prev) => (prev === slot ? null : slot));

  /** Kurva penghubung tiap slot: dari titik ban ke tepi kotak detailnya. */
  const links = (Object.keys(data) as BanWheelSlot[]).map((slot) => {
    const from = toCanvas(HOTSPOTS[slot]);
    const toLeft = LEFT_SLOTS.includes(slot);
    const to = {
      x: toLeft ? BOX_X_LEFT + BOX_W : BOX_X_RIGHT,
      y: BOX_Y[slot],
    };
    // Cubic dengan tangen horizontal — kurva S halus, khas konektor diagram.
    const dx = to.x - from.x;
    const cx1 = from.x + dx * 0.45;
    const cx2 = to.x - dx * 0.45;
    const f = (n: number) => n.toFixed(2);
    return {
      slot,
      d: `M ${f(from.x)} ${f(from.y)} C ${f(cx1)} ${f(from.y)}, ${f(cx2)} ${f(to.y)}, ${f(to.x)} ${f(to.y)}`,
    };
  });

  return (
    <section className={cn("w-full", className)}>
      <div className="rounded-2xl border bg-gradient-to-b from-muted/40 to-muted/10 p-3 sm:p-5">
        {/* ---------- Diagram desktop (sm ke atas): gambar + kurva + kotak ---------- */}
        <div
          className="relative hidden w-full sm:block"
          style={{ aspectRatio: String(LAYOUT.aspect) }}
        >
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden
          >
            {links.map((l) => (
              <path
                key={l.slot}
                d={l.d}
                className={cn(
                  "transition-[stroke] duration-150",
                  activeSlot === l.slot ? "stroke-primary" : "stroke-muted-foreground/45",
                )}
                strokeWidth={activeSlot === l.slot ? 2 : 1.25}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Gambar dasar peta */}
          <img
            src={HINO_IMAGE.src}
            alt="Peta posisi ban rangka Hino dilihat dari atas"
            width={HINO_IMAGE.width}
            height={HINO_IMAGE.height}
            draggable={false}
            className="absolute select-none rounded-xl border border-border/60 shadow-sm"
            style={{
              left: `${IMG_LEFT}%`,
              top: `${IMG_TOP}%`,
              width: `${LAYOUT.imgW}%`,
            }}
          />

          {/* Titik posisi ban */}
          {(Object.keys(data) as BanWheelSlot[]).map((slot) => {
            const p = toCanvas(HOTSPOTS[slot]);
            return (
              <WheelDot
                key={slot}
                info={data[slot]}
                x={p.x}
                y={p.y}
                active={activeSlot === slot}
                onToggle={() => toggle(slot)}
              />
            );
          })}

          {/* Kotak detail kolom kiri (belakang) & kanan (depan) */}
          {LEFT_SLOTS.map((slot) => (
            <TyreDetailBox
              key={slot}
              info={data[slot]}
              active={activeSlot === slot}
              onToggle={() => toggle(slot)}
              className="absolute -translate-y-1/2"
              style={{
                left: `${BOX_X_LEFT}%`,
                top: `${BOX_Y[slot]}%`,
                width: `${BOX_W}%`,
              }}
            />
          ))}
          {RIGHT_SLOTS.map((slot) => (
            <TyreDetailBox
              key={slot}
              info={data[slot]}
              active={activeSlot === slot}
              onToggle={() => toggle(slot)}
              className="absolute -translate-y-1/2"
              style={{
                left: `${BOX_X_RIGHT}%`,
                top: `${BOX_Y[slot]}%`,
                width: `${BOX_W}%`,
              }}
            />
          ))}
        </div>

        {/* ---------- Versi layar sempit: gambar + titik, kotak di bawah ---------- */}
        <div className="sm:hidden">
          <div className="relative w-full">
            <img
              src={HINO_IMAGE.src}
              alt="Peta posisi ban rangka Hino dilihat dari atas"
              width={HINO_IMAGE.width}
              height={HINO_IMAGE.height}
              draggable={false}
              className="block w-full select-none rounded-xl border border-border/60 shadow-sm"
            />
            {(Object.keys(data) as BanWheelSlot[]).map((slot) => (
              <WheelDot
                key={slot}
                info={data[slot]}
                x={HOTSPOTS[slot].x}
                y={HOTSPOTS[slot].y}
                active={activeSlot === slot}
                onToggle={() => toggle(slot)}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(Object.keys(data) as BanWheelSlot[]).map((slot) => (
              <TyreDetailBox
                key={slot}
                info={data[slot]}
                active={activeSlot === slot}
                onToggle={() => toggle(slot)}
              />
            ))}
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
          <Tag className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            Klik titik ban atau kotaknya untuk menyorot pasangannya. Nilai tekanan,
            ketebalan, dan merk saat ini masih <em>data contoh</em> — akan
            disambungkan ke data ban yang sesungguhnya begitu kolomnya tersedia di
            database.
          </span>
        </p>
      </div>
    </section>
  );
}

export const HinoTyreMap = memo(HinoTyreMapImpl);

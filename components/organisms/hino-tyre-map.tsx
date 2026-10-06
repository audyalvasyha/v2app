"use client";

import React, { memo, useState, useMemo } from "react";
import { Gauge, Ruler, Tag, Truck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BanWheelSlot } from "@/lib/ban-analytics";

/**
 * Peta posisi ban untuk menu Analisa Ban.
 */

const HINO_IMAGE = {
  src: "/Hino%20Chasis.png",
  width: 669,
  height: 373,
} as const;

export interface HinoTyreInfo {
  slot: BanWheelSlot
  code: string
  name: string
  pressureBar: string | null
  thicknessMm: number | null
  brand: string | null
}

// Data kendaraan contoh (diambil sebagian dari referensi)
const VEHICLES = [
  { id: "STDM000064", nopol: "B 9837 SXS", type: "4D" },
  { id: "STDM000048", nopol: "B 9830 SXS", type: "4R" },
  { id: "STDM000266", nopol: "B 9518 SXT", type: "6D" },
  { id: "STDM000157", nopol: "B 9974 SXS", type: "6R" },
];

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
  "belakang-kiri-dalam": {
    slot: "belakang-kiri-dalam",
    code: "RL-I",
    name: "Rear Left In",
    pressureBar: "6.2 bar",
    thicknessMm: 7.2,
    brand: "Dunlop",
  },
  "belakang-kiri-luar": {
    slot: "belakang-kiri-luar",
    code: "RL-O",
    name: "Rear Left Out",
    pressureBar: "6.2 bar",
    thicknessMm: 7.2,
    brand: "Dunlop",
  },
  "belakang-kanan-luar": {
    slot: "belakang-kanan-luar",
    code: "RR-O",
    name: "Rear Right Out",
    pressureBar: "6.0 bar",
    thicknessMm: 7.5,
    brand: "Dunlop",
  },
  "belakang-kanan-dalam": {
    slot: "belakang-kanan-dalam",
    code: "RR-I",
    name: "Rear Right In",
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

/** Pembagian posisi kotak panel master */
const LEFT_SLOTS: BanWheelSlot[] = [
  "belakang-kiri-dalam",
  "belakang-kiri-luar",
  "belakang-kanan-dalam",
  "belakang-kanan-luar"
];
const RIGHT_SLOTS: BanWheelSlot[] = ["depan-kanan", "depan-kiri"];
const BOTTOM_SLOTS: BanWheelSlot[] = ["serap"];

/** Konfigurasi slot berdasarkan jumlah roda */
const TYPE_6_WHEELS: BanWheelSlot[] = [
  "depan-kiri", "depan-kanan",
  "belakang-kiri-luar", "belakang-kiri-dalam",
  "belakang-kanan-luar", "belakang-kanan-dalam",
  "serap"
];
// Untuk 4 roda, kita sembunyikan ban "-dalam"
const TYPE_4_WHEELS: BanWheelSlot[] = [
  "depan-kiri", "depan-kanan",
  "belakang-kiri-luar", "belakang-kanan-luar",
  "serap"
];

/** Koordinat titik di atas foto mobil (0-100%) */
const HOTSPOTS: Record<BanWheelSlot, { x: number; y: number }> = {
  "depan-kanan": { x: 78, y: 85 },
  "depan-kiri": { x: 78, y: 61 },
  "belakang-kiri-dalam": { x: 26, y: 62 },
  "belakang-kiri-luar": { x: 26, y: 62 },
  "belakang-kanan-dalam": { x: 27, y: 85 },
  "belakang-kanan-luar": { x: 27, y: 85 },
  serap: { x: 18, y: 72 },
};

const LAYOUT = {
  aspect: 2,
  imgW: 52,
} as const;

const IMG_LEFT = (100 - LAYOUT.imgW) / 2;
const IMG_H = LAYOUT.imgW * (HINO_IMAGE.height / HINO_IMAGE.width) * LAYOUT.aspect;
const IMG_TOP = (100 - IMG_H) / 2;

function toCanvas(p: { x: number; y: number }) {
  return {
    x: IMG_LEFT + (p.x / 100) * LAYOUT.imgW,
    y: IMG_TOP + (p.y / 100) * IMG_H,
  };
}

/** Posisi vertikal panel di kanvas (0-100%) */
const BOX_Y: Record<BanWheelSlot, number> = {
  "belakang-kiri-dalam": 16,
  "belakang-kiri-luar": 41,
  "belakang-kanan-dalam": 66,
  "belakang-kanan-luar": 91,
  serap: 91,
  "depan-kiri": 35,
  "depan-kanan": 67,
};

const BOX_W = 17;
const BOX_X_LEFT = 1.5;
const BOX_X_RIGHT = 100 - 1.5 - BOX_W;

function fmtThickness(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} mm`;
}

interface DetailBoxProps {
  info: HinoTyreInfo
  active: boolean
  is4Wheel?: boolean
  onToggle: () => void
  className?: string
  style?: React.CSSProperties
}

function TyreDetailBox({ info, active, is4Wheel, onToggle, className, style }: DetailBoxProps) {
  // Jika 4 roda, ganti label "Out" / "-O" menjadi label ban tunggal standar ("Rear Left" / "RL")
  const displayName = is4Wheel ? info.name.replace(" Out", "") : info.name;
  const displayCode = is4Wheel ? info.code.replace("-O", "") : info.code;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      style={style}
      className={cn(
        "block w-full rounded-xl border bg-card/95 p-2.5 text-left shadow-sm backdrop-blur transition-all duration-150 relative z-40",
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
          {displayCode}
        </span>
        <span className="truncate text-[11px] font-semibold leading-none">
          {displayName} <span className="font-normal text-muted-foreground">({displayCode})</span>
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

interface WheelDotProps {
  info: HinoTyreInfo
  x: number
  y: number
  active: boolean
  is4Wheel?: boolean
  onToggle: () => void
  zIndexClass: string
}

function WheelDot({ info, x, y, active, is4Wheel, onToggle, zIndexClass }: WheelDotProps) {
  const displayCode = is4Wheel ? info.code.replace("-O", "") : info.code;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${info.name} (${displayCode})`}
      title={`${info.name} (${displayCode})`}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={cn(
        "group absolute -translate-x-1/2 -translate-y-1/2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full",
        zIndexClass
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
        {displayCode}
      </span>
    </button>
  );
}

export interface HinoTyreMapProps {
  tyres?: Partial<Record<BanWheelSlot, HinoTyreInfo>>
  className?: string
}

function HinoTyreMapImpl({ tyres, className }: HinoTyreMapProps) {
  const [activeSlot, setActiveSlot] = useState<BanWheelSlot | null>(null);

  // State untuk dropdown Nopol
  const [selectedNopol, setSelectedNopol] = useState<string>(VEHICLES[2].nopol);

  const data: Record<BanWheelSlot, HinoTyreInfo> = { ...CONTOH_DATA_BAN, ...tyres };

  const toggle = (slot: BanWheelSlot) =>
    setActiveSlot((prev) => (prev === slot ? null : slot));

  // Menentukan tipe mobil berdasarkan pilihan dropdown
  const selectedVehicle = useMemo(() => VEHICLES.find(v => v.nopol === selectedNopol) || VEHICLES[2], [selectedNopol]);
  const is4Wheel = selectedVehicle.type.startsWith("4");
  const activeSlotsConfig = is4Wheel ? TYPE_4_WHEELS : TYPE_6_WHEELS;

  // Memfilter slot agar yang dirender hanya sesuai dengan tipe mobilnya
  const activeLeftSlots = LEFT_SLOTS.filter(slot => activeSlotsConfig.includes(slot));
  const activeRightSlots = RIGHT_SLOTS.filter(slot => activeSlotsConfig.includes(slot));
  const activeBottomSlots = BOTTOM_SLOTS.filter(slot => activeSlotsConfig.includes(slot));

  const getLayerOrder = (slot: string) => {
    if (slot.includes("kanan")) return 3;
    if (slot === "serap") return 2;
    return 1;
  };

  const sortedActiveSlots = (Object.keys(data) as BanWheelSlot[])
    .filter(slot => activeSlotsConfig.includes(slot))
    .sort((a, b) => getLayerOrder(a) - getLayerOrder(b));

  const links = sortedActiveSlots.map((slot) => {
    const from = toCanvas(HOTSPOTS[slot]);
    const f = (n: number) => n.toFixed(2);

    if (activeBottomSlots.includes(slot)) {
      const to = { x: 50, y: BOX_Y[slot] };
      const dy = to.y - from.y;
      const cy1 = from.y + dy * 0.45;
      const cy2 = to.y - dy * 0.45;
      return {
        slot,
        d: `M ${f(from.x)} ${f(from.y)} C ${f(from.x)} ${f(cy1)}, ${f(to.x)} ${f(cy2)}, ${f(to.x)} ${f(to.y)}`,
      };
    }

    const toLeft = activeLeftSlots.includes(slot);
    const to = {
      x: toLeft ? BOX_X_LEFT + BOX_W : BOX_X_RIGHT,
      y: BOX_Y[slot],
    };
    const dx = to.x - from.x;
    const cx1 = from.x + dx * 0.45;
    const cx2 = to.x - dx * 0.45;
    return {
      slot,
      d: `M ${f(from.x)} ${f(from.y)} C ${f(cx1)} ${f(from.y)}, ${f(cx2)} ${f(to.y)}, ${f(to.x)} ${f(to.y)}`,
    };
  });

  return (
    <section className={cn("w-full space-y-4", className)}>
      <div className="rounded-2xl border bg-gradient-to-b from-muted/40 to-muted/10 p-3 sm:p-5">
        <div
          className="relative hidden w-full sm:block"
          style={{ aspectRatio: String(LAYOUT.aspect) }}
        >
          <svg
            className="absolute inset-0 h-full w-full overflow-visible z-0"
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

          <img
            src={HINO_IMAGE.src}
            alt="Peta posisi ban rangka Hino dilihat dari atas"
            width={HINO_IMAGE.width}
            height={HINO_IMAGE.height}
            draggable={false}
            className="absolute select-none rounded-xl border border-border/60 shadow-sm z-0"
            style={{
              left: `${IMG_LEFT}%`,
              top: `${IMG_TOP}%`,
              width: `${LAYOUT.imgW}%`,
            }}
          />

          {sortedActiveSlots.map((slot) => {
            const p = toCanvas(HOTSPOTS[slot]);
            const layerOrder = getLayerOrder(slot);
            const zIndexClass = layerOrder === 3 ? "z-30" : layerOrder === 2 ? "z-20" : "z-10";

            return (
              <WheelDot
                key={slot}
                info={data[slot]}
                x={p.x}
                y={p.y}
                active={activeSlot === slot}
                is4Wheel={is4Wheel}
                onToggle={() => toggle(slot)}
                zIndexClass={zIndexClass}
              />
            );
          })}

          {activeLeftSlots.map((slot) => (
            <TyreDetailBox
              key={slot}
              info={data[slot]}
              active={activeSlot === slot}
              is4Wheel={is4Wheel}
              onToggle={() => toggle(slot)}
              className="absolute -translate-y-1/2"
              style={{
                left: `${BOX_X_LEFT}%`,
                top: `${BOX_Y[slot]}%`,
                width: `${BOX_W}%`,
              }}
            />
          ))}

          {activeBottomSlots.map((slot) => (
            <TyreDetailBox
              key={slot}
              info={data[slot]}
              active={activeSlot === slot}
              is4Wheel={is4Wheel}
              onToggle={() => toggle(slot)}
              className="absolute -translate-x-1/2 -translate-y-1/2 shadow-lg"
              style={{
                left: `50%`,
                top: `${BOX_Y[slot]}%`,
                width: `${BOX_W}%`,
              }}
            />
          ))}

          {activeRightSlots.map((slot) => (
            <TyreDetailBox
              key={slot}
              info={data[slot]}
              active={activeSlot === slot}
              is4Wheel={is4Wheel}
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

        {/* Versi Mobile */}
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
            {sortedActiveSlots.map((slot) => {
              const layerOrder = getLayerOrder(slot);
              const zIndexClass = layerOrder === 3 ? "z-30" : layerOrder === 2 ? "z-20" : "z-10";
              return (
                <WheelDot
                  key={slot}
                  info={data[slot]}
                  x={HOTSPOTS[slot].x}
                  y={HOTSPOTS[slot].y}
                  active={activeSlot === slot}
                  is4Wheel={is4Wheel}
                  onToggle={() => toggle(slot)}
                  zIndexClass={zIndexClass}
                />
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {sortedActiveSlots.map((slot) => (
              <TyreDetailBox
                key={slot}
                info={data[slot]}
                active={activeSlot === slot}
                is4Wheel={is4Wheel}
                onToggle={() => toggle(slot)}
              />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

export const HinoTyreMap = memo(HinoTyreMapImpl);
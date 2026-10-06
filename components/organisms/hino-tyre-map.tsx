"use client";

import React, { memo, useState, useMemo, useEffect, useRef } from "react";
import { Gauge, Ruler, Tag, CircleDot } from "lucide-react";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Peta posisi ban untuk menu Analisa Ban.
 *
 * - Dropdown nomor polisi diisi dari tabel `equipment` (pilihan kedua tipe
 *   6R/6D/4R/4D disimpan sebagai entri sintetis bila belum dipilih).
 * - Jumlah panel hotspot mengikuti `type_vehicle` di tabel itu:
 *   6R/6D → 6 panel roda (ban belakang dobel: dalam + luar),
 *   4R/4D → 4 panel roda (ban belakang tunggal).
 * - Ban serap (SP) selalu tampil sebagai 1 panel di bawah gambar, di luar
 *   hitungan panel roda — tekanan/ketebalannya masih data contoh.
 * - Gambar rangka tetap `public/Hino Chasis.png`; angka ban pada panel adalah
 *   data contoh sampai kolom tekanan/ketebalan/merk tersedia di database.
 */

const HINO_IMAGE = {
  src: "/Hino%20Chasis.png",
  width: 669,
  height: 373,
} as const;

/** Empat konfigurasi roda yang dikenal tabel equipment. */
export type VehicleType = "6R" | "6D" | "4R" | "4D";

/** Enam roda fisik pada konfigurasi ban dobel. */
const SIX_WHEEL_SLOTS = ["FL", "FR", "RL-O", "RL-I", "RR-I", "RR-O"] as const;
/** Empat roda fisik pada konfigurasi ban tunggal (tanpa ban dalam). */
const FOUR_WHEEL_SLOTS = ["FL", "FR", "RL", "RR"] as const;

export interface HinoTyreInfo {
  code: string;
  name: string;
  pressureBar: string | null;
  thicknessMm: number | null;
  brand: string | null;
}

/** Data ban contoh per roda — dipakai sampai kolom ban tersedia di database. */
const CONTOH_DATA_BAN: Record<string, HinoTyreInfo> = {
  FL: { code: "FL", name: "Front Left", pressureBar: "5.6 bar", thicknessMm: 6.4, brand: "GT Radial" },
  FR: { code: "FR", name: "Front Right", pressureBar: "5.8 bar", thicknessMm: 6.8, brand: "GT Radial" },
  "RL-I": { code: "RL-I", name: "Rear Left In", pressureBar: "6.2 bar", thicknessMm: 7.2, brand: "Dunlop" },
  "RL-O": { code: "RL-O", name: "Rear Left Out", pressureBar: "6.2 bar", thicknessMm: 7.2, brand: "Dunlop" },
  "RR-O": { code: "RR-O", name: "Rear Right Out", pressureBar: "6.0 bar", thicknessMm: 7.5, brand: "Dunlop" },
  "RR-I": { code: "RR-I", name: "Rear Right In", pressureBar: "6.0 bar", thicknessMm: 7.5, brand: "Dunlop" },
  RL: { code: "RL", name: "Rear Left", pressureBar: "6.2 bar", thicknessMm: 7.2, brand: "Dunlop" },
  RR: { code: "RR", name: "Rear Right", pressureBar: "6.0 bar", thicknessMm: 7.5, brand: "Dunlop" },
  SP: { code: "SP", name: "Ban Serap", pressureBar: "6.0 bar", thicknessMm: 8.1, brand: "GT Radial" },
};

/**
 * Roda tampil di kolom kiri/kanan gambar, atas ke bawah — urutan ini tetap.
 * Konvensi panel: semua roda FRONT di kolom kanan, semua roda REAR di kolom
 * kiri (mengikuti posisi axle di gambar: depan di kanan, belakang di kiri).
 */
const SIX_LAYOUT = {
  left: ["RL-O", "RL-I", "RR-O", "RR-I"],
  right: ["FL", "FR"],
} as const;
const FOUR_LAYOUT = {
  left: ["RL", "RR"],
  right: ["FL", "FR"],
} as const;

/**
 * Posisi titik hotspot di atas gambar (persen dari area gambar).
 * Orientasi gambar: rangka menghadap kanan — axle depan di kanan gambar
 * (x ≈ 78), axle belakang di kiri (x ≈ 26), sisi kiri unit di bagian atas
 * (y ≈ 61) dan sisi kanan di bawah (y ≈ 85). Ban dobel belakang dipisah
 * tegak lurus sumbu truk: "luar" makin menjauhi garis tengah rangka.
 */
const HOTSPOTS: Record<string, { x: number; y: number }> = {
  FL: { x: 78, y: 61 },
  FR: { x: 78, y: 85 },
  "RL-O": { x: 26, y: 57 },
  "RL-I": { x: 26, y: 67 },
  "RR-I": { x: 27, y: 80 },
  "RR-O": { x: 27, y: 90 },
  RL: { x: 26, y: 62 },
  RR: { x: 27, y: 85 },
  // Ban serap: tergantung di rangka tengah-bawah (antara dua axle).
  SP: { x: 50, y: 70 },
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

/**
 * Posisi vertikal panel detail per kolom (persen, atas ke bawah).
 * Kolom kiri (rear) memuat 4 panel di mode 6 roda & 2 panel di mode 4 roda;
 * kolom kanan (front) selalu 2 panel — didistribusikan sejajar gambar.
 */
const LEFT_Y_6 = [16, 39, 62, 85];
const RIGHT_Y_6 = [30, 70];
const LEFT_Y_4 = [25, 75];
const RIGHT_Y_4 = [30, 70];

const BOX_W = 21;
const BOX_X_LEFT = 1.5;
const BOX_X_RIGHT = 100 - 1.5 - BOX_W;

function fmtThickness(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} mm`;
}

interface DetailBoxProps {
  info: HinoTyreInfo;
  active: boolean;
  onToggle: () => void;
  className?: string;
  style?: React.CSSProperties;
}

function TyreDetailBox({ info, active, onToggle, className, style }: DetailBoxProps) {
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

interface WheelDotProps {
  info: HinoTyreInfo;
  x: number;
  y: number;
  active: boolean;
  onToggle: () => void;
  zIndexClass: string;
}

function WheelDot({ info, x, y, active, onToggle, zIndexClass }: WheelDotProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${info.name} (${info.code})`}
      title={`${info.name} (${info.code})`}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={cn(
        "group absolute -translate-x-1/2 -translate-y-1/2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full",
        zIndexClass,
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

export interface HinoTyreMapProps {
  /** Inventaris unit dari tabel `equipment` — sumber dropdown nopol & type_vehicle. */
  equipments?: any[];
  className?: string;
}

function HinoTyreMapImpl({ equipments, className }: HinoTyreMapProps) {
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  const data = CONTOH_DATA_BAN;

  /** Peta plat (dinormalisasi tanpa spasi, huruf besar) → type_vehicle. */
  const typeByPlate = useMemo(() => {
    const map = new Map<string, string>();
    for (const eq of equipments ?? []) {
      const plate = String(eq?.license_plate ?? "").replace(/\s+/g, "").toUpperCase();
      const type = String(eq?.type_vehicle ?? "").trim().toUpperCase();
      if (plate && type) map.set(plate, type);
    }
    return map;
  }, [equipments]);

  /**
   * Dropdown hanya memuat nopol dari tabel equipment; unit pertama langsung
   * terpilih supaya peta hidup tanpa klik tambahan.
   */
  const plateOptions = useMemo(
    () =>
      (equipments ?? [])
        .map((eq) => String(eq?.license_plate ?? "").trim())
        .filter((p) => p.length > 0),
    [equipments],
  );
  const [selectedKey, setSelectedKey] = useState<string>("");
  // Unit pertama terpilih otomatis sekali saja di awal (bukan tiap render),
  // dan pilihan user tidak pernah ditimpa saat data ter-refresh.
  const didInitSelection = useRef(false);
  useEffect(() => {
    if (!didInitSelection.current && plateOptions.length > 0) {
      didInitSelection.current = true;
      setSelectedKey(plateOptions[0]);
    }
  }, [plateOptions]);
  useEffect(() => {
    // Data equipment terlambat datang (cache dulu, fetch kemudian): kunci
    // terpilih mungkin belum ada di daftar — pilih unit pertama yang ada.
    if (selectedKey && plateOptions.length > 0 && !plateOptions.includes(selectedKey)) {
      setSelectedKey(plateOptions[0]);
    }
  }, [plateOptions, selectedKey]);

  const isTypeValue = (v: string): v is VehicleType =>
    v === "6R" || v === "6D" || v === "4R" || v === "4D";

  /** Tipe kendaraan dari kunci terpilih; "6R" default bila data belum jelas.
   *  selectedKey adalah plat mentah dari dropdown — key typeByPlate ternormalisasi,
   *  jadi lookup-nya harus dinormalisasi dengan cara yang sama. */
  const selectedType = useMemo<VehicleType>(() => {
    if (isTypeValue(selectedKey)) return selectedKey;
    const normKey = selectedKey.replace(/\s+/g, "").toUpperCase();
    const type = typeByPlate.get(normKey) ?? "";
    return isTypeValue(type) ? type : "6R";
  }, [selectedKey, typeByPlate]);

  /** Nopol yang type_vehicle-nya tidak dikenal (mis. selain 4R/4D/6R/6D). */
  const unknownTypePlates = useMemo(() => {
    const out = new Set<string>();
    for (const eq of equipments ?? []) {
      const plate = String(eq?.license_plate ?? "").trim();
      const type = String(eq?.type_vehicle ?? "").trim().toUpperCase();
      if (plate && type && !isTypeValue(type)) out.add(plate);
    }
    return out;
  }, [equipments]);

  const is6Wheel = selectedType.startsWith("6");
  const wheelSlots: readonly string[] = is6Wheel ? SIX_WHEEL_SLOTS : FOUR_WHEEL_SLOTS;
  const layout = is6Wheel ? SIX_LAYOUT : FOUR_LAYOUT;
  const activeSlots = [...layout.left, ...layout.right];

  const toggle = (slot: string) =>
    setActiveSlot((prev) => (prev === slot ? null : slot));

  /** Posisi vertikal panel slot: kolom kiri (rear) & kanan (front) punya
   *  distribusi Y masing-masing supaya panel sejajar dengan roda di gambar. */
  const boxTop = (slot: string) => {
    const li = (layout.left as readonly string[]).indexOf(slot);
    if (li >= 0) return (is6Wheel ? LEFT_Y_6 : LEFT_Y_4)[li] ?? 50;
    const ri = (layout.right as readonly string[]).indexOf(slot);
    return (is6Wheel ? RIGHT_Y_6 : RIGHT_Y_4)[ri] ?? 50;
  };

  const getLayerOrder = (slot: string) => {
    if (slot.startsWith("FR") || slot.startsWith("RR")) return 3;
    if (slot === "SP") return 2;
    return 1;
  };

  const sortedActiveSlots = (Object.keys(data) as string[])
    .filter((slot) => wheelSlots.includes(slot) || slot === "SP")
    .sort((a, b) => getLayerOrder(a) - getLayerOrder(b));

  const links = sortedActiveSlots.map((slot) => {
    const from = toCanvas(HOTSPOTS[slot]);
    const f = (n: number) => n.toFixed(2);

    // Ban serap: panel di bawah gambar, garis turun vertikal dari rangka.
    if (slot === "SP") {
      const to = { x: 50, y: 89 };
      const dy = to.y - from.y;
      const cy = from.y + dy * 0.35;
      return {
        slot,
        d: `M ${f(from.x)} ${f(from.y)} C ${f(from.x)} ${f(cy)}, ${f(to.x)} ${f(to.y - dy * 0.35)}, ${f(to.x)} ${f(to.y)}`,
      };
    }

    const toLeft = (layout.left as readonly string[]).includes(slot);
    const to = {
      x: toLeft ? BOX_X_LEFT + BOX_W : BOX_X_RIGHT,
      y: boxTop(slot),
    };
    const dx = to.x - from.x;
    const cx1 = from.x + dx * 0.45;
    const cx2 = to.x - dx * 0.45;
    return {
      slot,
      d: `M ${f(from.x)} ${f(from.y)} C ${f(cx1)} ${f(from.y)}, ${f(cx2)} ${f(to.y)}, ${f(to.x)} ${f(to.y)}`,
    };
  });

  const renderBox = (slot: string, side: "left" | "right") => (
    <TyreDetailBox
      key={slot}
      info={data[slot]}
      active={activeSlot === slot}
      onToggle={() => toggle(slot)}
      className="absolute -translate-y-1/2"
      style={{
        left: `${side === "left" ? BOX_X_LEFT : BOX_X_RIGHT}%`,
        top: `${boxTop(slot)}%`,
        width: `${BOX_W}%`,
      }}
    />
  );

  return (
    <section className={cn("w-full space-y-4", className)}>
      {/* Dropdown nomor polisi — sumbernya tabel equipment */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedKey} onValueChange={(v) => { setSelectedKey(v); setActiveSlot(null); }}>
          <SelectTrigger size="sm" className="min-w-[13rem] sm:w-64" aria-label="Pilih nomor polisi unit">
            <SelectValue placeholder="Pilih nomor polisi" />
          </SelectTrigger>
          <SelectContent>
            {plateOptions.map((plate) => (
              <SelectItem key={plate} value={plate}>
                {plate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground">
          Panel mengikuti <span className="font-medium text-foreground">type_vehicle</span> unit ini di tabel equipment
          {" — "}<span className="font-medium text-foreground">{selectedType}</span>{" "}
          ({is6Wheel ? "6 panel roda" : "4 panel roda"}).
        </p>
      </div>

      <div className="rounded-2xl border bg-gradient-to-b from-muted/40 to-muted/10 p-3 sm:p-5">
        {/* Peta desktop: panel di kiri & kanan gambar */}
        <div
          className="relative hidden w-full md:block"
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
                onToggle={() => toggle(slot)}
                zIndexClass={zIndexClass}
              />
            );
          })}

          {layout.left.map((slot) => renderBox(slot, "left"))}
          {layout.right.map((slot) => renderBox(slot, "right"))}

          {/* Ban serap: satu panel di bawah gambar, semua tipe kendaraan */}
          <TyreDetailBox
            key="SP"
            info={data.SP}
            active={activeSlot === "SP"}
            onToggle={() => toggle("SP")}
            className="absolute -translate-x-1/2 -translate-y-1/2 shadow-lg"
            style={{
              left: "50%",
              top: "89%",
              width: `${BOX_W}%`,
            }}
          />
        </div>

        {/* Peta mobile: gambar + titik roda, panel bergrid di bawahnya */}
        <div className="md:hidden space-y-3">
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
                  onToggle={() => toggle(slot)}
                  zIndexClass={zIndexClass}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {activeSlots.map((slot) => (
              <TyreDetailBox
                key={slot}
                info={data[slot]}
                active={activeSlot === slot}
                onToggle={() => toggle(slot)}
              />
            ))}
          </div>
          {/* Ban serap: satu panel lebar penuh di bawah grid roda */}
          <TyreDetailBox
            key="SP"
            info={data.SP}
            active={activeSlot === "SP"}
            onToggle={() => toggle("SP")}
          />
        </div>

        {/* Keterangan di bawah gambar */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CircleDot className="h-3.5 w-3.5" aria-hidden />
            {is6Wheel ? "6 roda — belakang dobel (dalam + luar)" : "4 roda — belakang tunggal"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-primary bg-primary/20" aria-hidden />
            {wheelSlots.length} panel roda + 1 ban serap
          </span>
          {unknownTypePlates.size > 0 && (
            <span>
              {unknownTypePlates.size} unit punya type_vehicle di luar 4R/4D/6R/6D — tipe tidak dikenal,
              panel default 6 roda.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export const HinoTyreMap = memo(HinoTyreMapImpl);

"use client";

import React, { memo, useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import { Camera, Gauge, Ruler, Tag, CircleDot, History } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIRE_HEALTH_TONE, tireHealthLevel, type TireHealthLevel } from "@/lib/tire-health";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Peta posisi ban untuk menu Analisa Ban.
 *
 * - Dropdown nomor polisi diisi dari tabel `equipment`, dikelompokkan per
 *   `type_vehicle`: grup 6R/6D/4R/4D berlabel jumlah unit, tipe di luar daftar
 *   itu masuk grup "Tipe lain" di paling bawah (panel default 6 roda).
 * - Jumlah panel hotspot mengikuti `type_vehicle` di tabel itu:
 *   6R/6D → 6 panel roda (ban belakang dobel: dalam + luar),
 *   4R/4D → 4 panel roda (ban belakang tunggal).
 * - Ban serap (SP) selalu tampil sebagai 1 panel di bawah gambar, di luar
 *   hitungan panel roda — tekanan/ketebalannya masih data contoh.
 * - Icon kamera di kanan judul tiap panel membuka modal fullscreen berisi
 *   foto aktual ban: sidewall & tread. Sumber fotonya: data pemeriksaan
 *   `tire_check_details` (prop `tireChecks`) atau override prop `tyrePhotos`
 *   (URL http(s) atau path AppSheet — dirangkai jadi proxy gettablefileurl).
 *   Bila tidak ada foto / gagal dimuat, modal menampilkan placeholder "Foto
 *   belum tersedia" — bukan gambar rusak, dan tidak ada path internal yang
 *   dikira URL asli oleh pembacanya.
 * - Angka pada panel memakai data pemeriksaan asli (tekanan psi, ketebalan
 *   mm, kondisi) bila tersedia untuk posisi itu; tanpa data pemeriksaan,
 *   panel kembali menampilkan data contoh (tekanan bar, ketebalan, merk).
 * - Warna status ban: titik roda & badge panel mengikuti level kesehatan dari
 *   `lib/tire-health.ts` (merah = perlu tindakan, kuning = waspada, hijau =
 *   aman) — ditentukan dari kondisi verbal, ketebalan mm, dan tekanan psi.
 * - Modal foto menampilkan riwayat pemeriksaan posisi itu (psi/mm antar
 *   tanggal + Δ) bila prop `tireHistory` disediakan pemanggil.
 */

const HINO_IMAGE = {
  src: "/Hino%20Chasis.png",
  width: 669,
  height: 373,
} as const;

/** Empat konfigurasi roda yang dikenal tabel equipment. */
export type VehicleType = "6R" | "6D" | "4R" | "4D";

/**
 * Grup dropdown: 4 tipe kendaraan yang dikenal (urutan tetap) + catch-all
 * "Tipe lain" paling bawah, supaya dropdown unit yang panjang tetap gampang
 * discan per kategori.
 */
const GROUP_ORDER = ["6R", "6D", "4R", "4D", "Tipe lain"] as const;
type PlateGroupKey = (typeof GROUP_ORDER)[number];

function plateGroupKey(type: unknown): PlateGroupKey {
  const t = String(type ?? "").trim().toUpperCase();
  return ((GROUP_ORDER as readonly string[]).includes(t) ? t : "Tipe lain") as PlateGroupKey;
}

/** Label kepala grup: kode tipe + konfigurasi rodanya. */
function plateGroupLabel(key: PlateGroupKey): string {
  if (key === "Tipe lain") return "Tipe lain";
  return `${key} — ${key.startsWith("6") ? "6 roda, belakang dobel" : "4 roda"}`;
}

/** Enam roda fisik pada konfigurasi ban dobel. */
const SIX_WHEEL_SLOTS = ["FL", "FR", "RLO", "RLI", "RRI", "RRO"] as const;
/** Empat roda fisik pada konfigurasi ban tunggal (tanpa ban dalam). */
const FOUR_WHEEL_SLOTS = ["FL", "FR", "RL", "RR"] as const;

export interface HinoTyreInfo {
  code: string;
  name: string;
  pressureBar: string | null;
  thicknessMm: number | null;
  brand: string | null;
}

/** Pasangan foto aktual satu posisi ban. */
export interface TyrePhotos {
  /** Foto sisi pinggir ban (sidewall) — URL atau path publik. */
  sidewall?: string | null;
  /** Foto tapak ban (tread) — URL atau path publik. */
  tread?: string | null;
}

/** Hasil pemeriksaan ban harian (tabel `tire_check_details`) untuk satu posisi. */
export interface TireCheckInfo {
  /** Tekanan angin terukur (psi). */
  pressurePsi: number | null;
  /** Kedalaman tapak (mm). */
  treadDepthMm: number | null;
  /** Kondisi ban versi driver/AI (mis. "Bagus", "Gundul"). */
  condition: string | null;
  /** Catatan driver saat pemeriksaan. */
  notes: string | null;
  /** Tanggal pemeriksaan (YYYY-MM-DD). */
  inspectionDate: string | null;
  /** Foto aktual dari Storage; nilai null berarti tidak ada. */
  photos: TyrePhotos;
}

/**
 * Satu catatan di riwayat pemeriksaan satu posisi ban — termasuk Δ psi/mm
 * dibanding pengukuran tepat sebelumnya (null bila salah satu tak tercatat).
 */
export interface TireCheckHistoryEntry {
  /** Timestamp baris dari database (created_at). */
  createdAt: string;
  info: TireCheckInfo;
  deltaPsi: number | null;
  deltaMm: number | null;
}

/** numeric dari PostgREST bisa berupa number atau string — rapikan ke number|null. */
export function toFiniteNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function fmtPsi(v: number | null): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Warna teks kondisi ban: merah untuk buruk, amber waspada, hijau bagus. */
function conditionClass(c: string | null | undefined): string {
  const v = (c ?? "").toLowerCase();
  if (!v) return "bg-muted text-muted-foreground";
  if (/(gundul|aus|habis|rusak|bocor|kempes|ganti|crit)/.test(v))
    return "bg-red-500/15 text-red-600 dark:text-red-400";
  if (/(cukup|waspad|perhatian|tipis)/.test(v))
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  if (/(bagus|baik|good|normal)/.test(v))
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  return "bg-muted text-muted-foreground";
}

/** Kunci plat ternormalisasi (tanpa spasi, huruf besar) — sama dengan peta. */
function normKey(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/**
 * URL foto satu sisi ban: hanya dari data asli (database / AppSheet).
 * Konvensi `public/ban/{KODE}--{side}.jpg` dihapus — file itu tidak pernah
 * disediakan, jadi fallback itu memicu permintaan yang pasti 404
 * (= placeholder + path internal yang menyesatkan). Tidak ada foto di
 * database berarti memang sudah jujur saja tanpa foto (placeholder).
 */
function tyrePhotoUrl(_slot: string, side: "sidewall" | "tread", override?: TyrePhotos): string | null {
  const custom = override?.[side]?.trim();
  return custom ? custom : null;
}

/** Data ban contoh per roda — dipakai sampai kolom ban tersedia di database. */
const CONTOH_DATA_BAN: Record<string, HinoTyreInfo> = {
  FL: { code: "FL", name: "Front Left", pressureBar: "5.6 bar", thicknessMm: 6.4, brand: "GT Radial" },
  FR: { code: "FR", name: "Front Right", pressureBar: "5.8 bar", thicknessMm: 6.8, brand: "GT Radial" },
  "RLI": { code: "RLI", name: "Rear Left In", pressureBar: "6.2 bar", thicknessMm: 7.2, brand: "Dunlop" },
  "RLO": { code: "RLO", name: "Rear Left Out", pressureBar: "6.2 bar", thicknessMm: 7.2, brand: "Dunlop" },
  "RRO": { code: "RRO", name: "Rear Right Out", pressureBar: "6.0 bar", thicknessMm: 7.5, brand: "Dunlop" },
  "RRI": { code: "RRI", name: "Rear Right In", pressureBar: "6.0 bar", thicknessMm: 7.5, brand: "Dunlop" },
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
  left: ["RLO", "RLI", "RRO", "RRI"],
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
  "RLO": { x: 27, y: 60 },
  "RLI": { x: 27, y: 60 },
  "RRI": { x: 27, y: 85 },
  "RRO": { x: 27, y: 85 },
  RL: { x: 26, y: 62 },
  RR: { x: 27, y: 85 },
  // Ban serap: tergantung di rangka tengah-bawah (antara dua axle).
  SP: { x: 18, y: 72 },
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
const RIGHT_Y_6 = [30, 75];
const LEFT_Y_4 = [25, 75];
const RIGHT_Y_4 = [30, 75];

const BOX_W = 21;
const BOX_X_LEFT = 1.5;
const BOX_X_RIGHT = 100 - 1.5 - BOX_W;

function fmtThickness(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} mm`;
}

/** Δ.Format untuk blok riwayat: nilai bertanda + satuan, dash bila kosong. */
function fmtDelta(v: number | null, unit: string): string {
  if (v == null) return "—";
  const number = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${v > 0 ? "+" : ""}${number} ${unit}`;
}

/** Warna teks Δ: turun (merah) biasanya yang lain untuk ban. */
function deltaClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v < 0
    ? "text-red-500 dark:text-red-400"
    : "text-emerald-500 dark:text-emerald-400";
}

interface DetailBoxProps {
  info: HinoTyreInfo;
  active: boolean;
  onToggle: () => void;
  /** Buka modal foto aktual (sidewall & tread) posisi ini. */
  onOpenPhotos: () => void;
  /** Data pemeriksaan asli posisi ini — bila ada, panel menampilkannya. */
  check?: TireCheckInfo;
  /** Level kesehatan posisi ini dari lib/tire-health — mewarnai border. */
  health?: TireHealthLevel;
  className?: string;
  style?: React.CSSProperties;
}

function TyreDetailBox({ info, active, onToggle, onOpenPhotos, check, health, className, style }: DetailBoxProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      onClick={onToggle}
      aria-pressed={active}
      style={style}
      className={cn(
        "block w-full rounded-xl border bg-card/95 p-2.5 text-left shadow-sm backdrop-blur transition-all duration-150 relative z-40 cursor-pointer",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary/70 shadow-md ring-2 ring-primary/40"
          : health === "action"
            ? "border-red-500/60 hover:border-red-500 hover:shadow-md"
            : health === "warning"
              ? "border-amber-500/50 hover:border-amber-500 hover:shadow-md"
              : health === "ok"
                ? "border-emerald-500/40 hover:border-emerald-500 hover:shadow-md"
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPhotos();
          }}
          title="Lihat foto aktual ban (sidewall & tread)"
          aria-label={`Lihat foto aktual ban ${info.name} (${info.code})`}
          className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <dl className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
            <Gauge className="h-3 w-3" aria-hidden /> Tekanan
          </dt>
          <dd className="truncate text-[11px] font-medium leading-none tabular-nums">
            {check
              ? check.pressurePsi != null
                ? `${fmtPsi(check.pressurePsi)} psi`
                : "—"
              : info.pressureBar ?? "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
            <Ruler className="h-3 w-3" aria-hidden /> Ketebalan
          </dt>
          <dd className="truncate text-[11px] font-medium leading-none tabular-nums">
            {check ? fmtThickness(check.treadDepthMm) : fmtThickness(info.thicknessMm)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
            {check ? (
              <>
                <CircleDot className="h-3 w-3" aria-hidden /> Kondisi
              </>
            ) : (
              <>
                <Tag className="h-3 w-3" aria-hidden /> Merk
              </>
            )}
          </dt>
          {check ? (
            <dd className="truncate">
              <span
                className={cn(
                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                  conditionClass(check.condition),
                )}
              >
                {check.condition ?? "—"}
              </span>
            </dd>
          ) : (
            <dd className="truncate text-[11px] font-medium leading-none">{info.brand ?? "—"}</dd>
          )}
        </div>
      </dl>
    </div>
  );
}

/**
 * Foto satu sisi ban.
 *
 * Sumber gambar AppSheet proxy (`gettablefileurl`) dikenal lambat — kadang
 * butuh beberapa detik sebelum Google Drive mengembalikan filenya. Prop
 * unoptimized memakai URL apa adanya tanpa pipeline optimizer, supaya
 * refresh foto modal tidak ikut antre di serve. Loader spinner dikombinasikan
 * dengan fallback placeholder bila proxy gagal.
 */
function TyrePhoto({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const isNextImage = !!src && /^https:\/\/www\.appsheet\.com\//i.test(src);

  if (!src || failed) {
    return (
      <div className="flex min-h-24 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-center">
        <Camera className="h-5 w-5 text-muted-foreground/50" aria-hidden />
        <p className="text-xs text-muted-foreground">Foto belum tersedia</p>
        {src ? (
          <p className="max-w-full truncate font-mono text-[10px] text-muted-foreground/70">{src}</p>
        ) : null}
      </div>
    );
  }

  // next-image diberi remote appsheet hanya jika URL itu — atribut lain
  // (Dataatu lama Storage) tidak lulus whitelist remotePatterns.
  const image = isNextImage ? (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 640px) 90vw, 45vw"
      unoptimized
      className="rounded-lg object-contain"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="min-h-0 flex-1 rounded-lg border border-border/60 object-contain"
      onError={() => setFailed(true)}
    />
  );

  return (
    <div className="relative min-h-0 flex-1">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-border/60 bg-muted/30">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      )}
      {image}
    </div>
  );
}

interface WheelDotProps {
  info: HinoTyreInfo;
  x: number;
  y: number;
  active: boolean;
  onToggle: () => void;
  zIndexClass: string;
  /** Level kesehatan dari lib/tire-health — mewarnai titik status ban. */
  health?: TireHealthLevel;
}

function WheelDot({ info, x, y, active, onToggle, zIndexClass, health }: WheelDotProps) {
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
            : health === "action"
              ? "border-red-500 bg-red-500/25 group-hover:border-red-500 group-hover:bg-red-500/40"
              : health === "warning"
                ? "border-amber-500 bg-amber-500/20 group-hover:border-amber-500 group-hover:bg-amber-500/40"
                : health === "ok"
                  ? "border-emerald-500 bg-emerald-500/20 group-hover:border-emerald-500 group-hover:bg-emerald-500/40"
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
  /** Foto aktual per posisi ban (dari database nantinya) — override konvensi file. */
  tyrePhotos?: Partial<Record<string, TyrePhotos>>;
  /** Data pemeriksaan ban harian: plat (ternormalisasi) → posisi → hasil cek terbaru. */
  tireChecks?: Record<string, Record<string, TireCheckInfo>>;
  /** Riwayat semua pemeriksaan: plat (ternormalisasi) → posisi → entri terbaru dulu. */
  tireHistory?: Record<string, Record<string, TireCheckHistoryEntry[]>>;
  /**
   * Nopol terpilih dari luar — panel "Ban perlu tindakan" menyendek unit ini.
   * Bila ada (non-null), komponen jadi kontrol penuh pemanggil.
   */
  selectedPlate?: string | null;
  /** Dipanggil saat nopol diganti (dropdown/pet tool dari luar) agar tetap selaras. */
  onSelectPlate?: (plate: string) => void;
  className?: string;
}

function HinoTyreMapImpl({ equipments, tyrePhotos, tireChecks, tireHistory, selectedPlate, onSelectPlate, className }: HinoTyreMapProps) {
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  /** Posisi ban yang modalnya terbuka (foto aktual sidewall & tread). */
  const [photoSlot, setPhotoSlot] = useState<string | null>(null);

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
   * Nopol dikelompokkan per type_vehicle — plat unik (dedup), urutan dalam
   * grup mengikuti tabel equipment, grup tanpa anggota tidak ditampilkan.
   */
  const plateGroups = useMemo(() => {
    const acc = new Map<PlateGroupKey, string[]>();
    for (const eq of equipments ?? []) {
      const plate = String(eq?.license_plate ?? "").trim();
      if (!plate) continue;
      const key = plateGroupKey(eq?.type_vehicle);
      const list = acc.get(key) ?? [];
      if (!list.includes(plate)) list.push(plate);
      acc.set(key, list);
    }
    return GROUP_ORDER.filter((k) => acc.has(k)).map((key) => ({
      key,
      label: plateGroupLabel(key),
      plates: acc.get(key)!,
    }));
  }, [equipments]);

  /**
   * Daftar datar untuk inisialisasi pilihan pertama & penjagaan pilihan tetap
   * valid — urutan sama persis dengan grup di dropdown.
   */
  const plateOptions = useMemo(
    () => plateGroups.flatMap((g) => g.plates),
    [plateGroups],
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

  /**
   * Nopol aktif: bila `selectedPlate` diberikan (non-null), komponen jadi
   * kontrol penuh pemanggil (panel "Ban perlu tindakan"); kalau tidak,
   * state internal seperti sebelumnya — auto-pilih unit pertama tetap jalan.
   */
  const controlled = selectedPlate != null;
  const effectivePlate = controlled ? selectedPlate : selectedKey;

  /** Hasil pemeriksaan ban untuk unit terpilih (plat dinormalisasi). */
  const checksForUnit = useMemo(
    () => tireChecks?.[normKey(effectivePlate)] ?? {},
    [tireChecks, effectivePlate],
  );

  /** Level kesehatan per slot untuk unit aktif — mewarnai dot & panel. */
  const healthBySlot = useMemo(() => {
    const out: Record<string, TireHealthLevel> = {};
    for (const [slot, check] of Object.entries(checksForUnit)) {
      out[slot] = tireHealthLevel(check);
    }
    return out;
  }, [checksForUnit]);

  const isTypeValue = (v: string): v is VehicleType =>
    v === "6R" || v === "6D" || v === "4R" || v === "4D";

  /** Tipe kendaraan dari kunci terpilih; "6R" default bila data belum jelas.
   *  selectedKey adalah plat mentah dari dropdown — key typeByPlate ternormalisasi,
   *  jadi lookup-nya harus dinormalisasi dengan cara yang sama. */
  const selectedType = useMemo<VehicleType>(() => {
    if (isTypeValue(effectivePlate)) return effectivePlate;
    const normalized = effectivePlate.replace(/\s+/g, "").toUpperCase();
    const type = typeByPlate.get(normalized) ?? "";
    return isTypeValue(type) ? type : "6R";
  }, [effectivePlate, typeByPlate]);

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
      const cy = from.y + dy * 0.95;
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

  /** Data pemeriksaan (bila ada) untuk posisi yang modal fotonya terbuka. */
  const activeCheck = photoSlot != null ? checksForUnit[photoSlot] : undefined;

  /** Riwayat posisi yang modal fotonya terbuka — entri terbaru dulu. */
  const activeHistory = useMemo(
    () =>
    (photoSlot != null
      ? tireHistory?.[normKey(effectivePlate)]?.[photoSlot] ?? []
      : []),
    [tireHistory, effectivePlate, photoSlot],
  );

  const renderBox = (slot: string, side: "left" | "right") => (
    <TyreDetailBox
      key={slot}
      info={data[slot]}
      active={activeSlot === slot}
      onToggle={() => toggle(slot)}
      onOpenPhotos={() => setPhotoSlot(slot)}
      check={checksForUnit[slot]}
      health={healthBySlot[slot]}
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
        <Select
          value={effectivePlate}
          onValueChange={(v) => {
            if (controlled && onSelectPlate) onSelectPlate(v);
            else setSelectedKey(v);
            setActiveSlot(null);
          }}
        >
          <SelectTrigger size="sm" className="min-w-[13rem] sm:w-64" aria-label="Pilih nomor polisi unit">
            <SelectValue placeholder="Pilih nomor polisi" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {plateGroups.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Belum ada unit di tabel equipment
              </p>
            ) : (
              plateGroups.map((group) => (
                <SelectGroup key={group.key}>
                  <SelectLabel className="flex items-center justify-between gap-6 pr-8">
                    <span className="font-medium">{group.label}</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground/70">
                      {group.plates.length} unit
                    </span>
                  </SelectLabel>
                  {group.plates.map((plate) => (
                    <SelectItem key={plate} value={plate}>
                      {plate}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))
            )}
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
                health={healthBySlot[slot]}
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
            onOpenPhotos={() => setPhotoSlot("SP")}
            check={checksForUnit["SP"]}
            health={healthBySlot["SP"]}
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
                  health={healthBySlot[slot]}
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
                onOpenPhotos={() => setPhotoSlot(slot)}
                check={checksForUnit[slot]}
                health={healthBySlot[slot]}
              />
            ))}
          </div>
          {/* Ban serap: satu panel lebar penuh di bawah grid roda */}
          <TyreDetailBox
            key="SP"
            info={data.SP}
            active={activeSlot === "SP"}
            onToggle={() => toggle("SP")}
            onOpenPhotos={() => setPhotoSlot("SP")}
            check={checksForUnit["SP"]}
            health={healthBySlot["SP"]}
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
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-emerald-500 bg-emerald-500/20" aria-hidden />
            aman
            <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-amber-500 bg-amber-500/20" aria-hidden />
            waspada
            <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-red-500 bg-red-500/25" aria-hidden />
            perlu tindakan
          </span>
          {unknownTypePlates.size > 0 && (
            <span>
              {unknownTypePlates.size} unit punya type_vehicle di luar 4R/4D/6R/6D — tipe tidak dikenal,
              panel default 6 roda.
            </span>
          )}
        </div>
      </div>

      {/* Modal foto aktual ban: fullscreen, sidewall & tread berdampingan */}
      <Dialog open={photoSlot != null} onOpenChange={(open) => !open && setPhotoSlot(null)}>
        {photoSlot != null && data[photoSlot] && (
          <DialogContent className="h-screen w-screen max-w-none rounded-none border-none bg-black/95 p-4 sm:p-6 [&>button]:top-3 [&>button]:right-3 [&>button]:z-10">
            <DialogHeader className="sr-only">
              <DialogTitle>
                Foto ban {data[photoSlot].name} ({data[photoSlot].code})
              </DialogTitle>
              <DialogDescription>Pasangan foto aktual sidewall dan tread ban posisi ini.</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 pt-8">
              <div className="flex items-center justify-center gap-2">
                <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                  {data[photoSlot].code}
                </span>
                <span className="text-sm font-semibold text-foreground">{data[photoSlot].name}</span>
              </div>
              {(activeCheck?.inspectionDate || activeCheck?.condition || activeCheck?.notes) && (
                <p className="text-center text-xs text-muted-foreground">
                  {activeCheck?.inspectionDate && <span>Pemeriksaan {activeCheck.inspectionDate} · </span>}
                  {activeCheck?.condition && <span>Kondisi: {activeCheck.condition} · </span>}
                  {activeCheck?.notes && <span>Catatan: {activeCheck.notes}</span>}
                </p>
              )}
              {activeHistory.length > 1 && (
                <div className="mx-auto w-full max-w-2xl rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                  <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <History className="h-3 w-3" aria-hidden />
                    Riwayat pemeriksaan — {activeHistory.length}× posisi ini
                  </p>
                  <div className="mt-1.5 max-h-28 overflow-y-auto">
                    {activeHistory.slice(0, 10).map((entry, i) => (
                      <div
                        key={`${entry.createdAt}-${i}`}
                        className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs"
                      >
                        <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                          {entry.info.inspectionDate ?? entry.createdAt.slice(0, 10)}
                        </span>
                        <span className="flex-1 text-center tabular-nums">
                          {entry.info.pressurePsi != null ? `${fmtPsi(entry.info.pressurePsi)} psi` : "—"}
                          <span className={cn("ml-1.5 inline-block w-14 text-left text-[10px]", deltaClass(entry.deltaPsi))}>
                            {fmtDelta(entry.deltaPsi, "psi")}
                          </span>
                        </span>
                        <span className="flex-1 text-center tabular-nums">
                          {entry.info.treadDepthMm != null ? fmtThickness(entry.info.treadDepthMm) : "—"}
                          <span className={cn("ml-1.5 inline-block w-12 text-left text-[10px]", deltaClass(entry.deltaMm))}>
                            {fmtDelta(entry.deltaMm, "mm")}
                          </span>
                        </span>
                        {entry.info.condition ? (
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                              conditionClass(entry.info.condition),
                            )}
                          >
                            {entry.info.condition}
                          </span>
                        ) : (
                          <span className="w-2 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-center text-[10px] text-muted-foreground">
                    angka kecil = selisih dibanding pengukuran sebelumnya (merah = turun) · ditampilkan maks 10 terakhir
                  </p>
                </div>
              )}
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                {(["sidewall", "tread"] as const).map((side) => (
                  <figure key={side} className="flex min-h-0 flex-col gap-1.5">
                    <figcaption className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {side === "sidewall" ? "Sidewall — sisi pinggir ban" : "Tread — tapak ban"}
                    </figcaption>
                    <TyrePhoto
                      src={activeCheck?.photos?.[side] ?? tyrePhotoUrl(photoSlot, side, tyrePhotos?.[photoSlot])}
                      alt={`Foto ${side === "sidewall" ? "sidewall" : "tread"} ban ${data[photoSlot].name} (${data[photoSlot].code})`}
                    />
                  </figure>
                ))}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

export const HinoTyreMap = memo(HinoTyreMapImpl);

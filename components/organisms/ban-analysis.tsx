"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import {
  CalendarCheck,
  CircleCheck,
  Download,
  TriangleAlert,
  Truck,
} from "lucide-react";
import {
  HinoTyreMap,
  toFiniteNumber,
  type TireCheckHistoryEntry,
  type TireCheckInfo,
} from "./hino-tyre-map";
import { supabase } from "@/utils/supabase";
import { appsheetFileUrl } from "@/lib/appsheet-image";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/molecules/stat-tile";
import { cn } from "@/lib/utils";
import {
  TIRE_HEALTH_TONE,
  tireChecksCsv,
  tireHealthLevel,
  tireHealthPriority,
  tireIssueReason,
  type TireHealthLevel,
} from "@/lib/tire-health";
import type { TireCheckCsvRow } from "@/lib/tire-health";

/**
 * Board Analisa Ban.
 *
 * Di atas peta posisi ban (`components/organisms/hino-tyre-map.tsx`) kini ada
 * data ASLI pemeriksaan ban harian dari Supabase: tabel `daily_tire_inspections`
 * (per unit & tanggal) dengan detail per ban di `tire_check_details` (posisi,
 * tekanan psi, ketebalan mm, kondisi, foto sidewall/tread, catatan driver).
 *
 * - Pemetaan unit: `daily_tire_inspections.equipment_id` (uuid) dicocokkan ke
 *   kolom `id`/`equipment_id` tabel `equipment` yang sudah dimuat dashboard —
 *   tanpa fetch tambahan (tabel `equipment` terkunci RLS untuk anon).
 * - Posisi: kolom `tire_position` berformat "FR - (Depan Kanan)" — kode di
 *   depan diambil dan dicocokkan ke slot peta (FL/FR/RL/RR/RL-I/…/SP).
 *   Posisi di luar daftar slot peta dihitung "tidak dikenali" dan tidak
 *   dipaksakan ke hotspot mana pun.
 * - Bila satu posisi diperiksa berkali-kali, yang tampil di peta adalah yang
 *   terbaru; seluruh riwayatnya (dengan Δ psi/mm antar pengukuran) tampil di
 *   modal foto posisi itu.
 * - Kesehatan: level per posisi dari `lib/tire-health.ts` (kondisi verbal >
 *   ketebalan mm > tekanan psi) — memwarnai titik & panel peta, dan memenuhi
 *   panel "Ban perlu tindakan" di atas peta.
 * - Foto: nilai http(s) dipakai apa adanya; path relatif AppSheet
 *   ("tire_check_details_Images/foto.jpg") dibungkus URL proxy AppSheet
 *   (gettablefileurl — lihat lib/appsheet-image.ts). Path kosong atau
 *   konfigurasi appName belum diisi tampil sebagai placeholder
 *   "Foto belum tersedia" di modal — bukan gambar rusak.
 * - Export CSV: seluruh baris pemeriksaan (bukan hanya yang terbaru) bisa
 *   diunduh — status kesehatannya dihitung oleh lib yang sama.
 */
export interface BanAnalysisProps {
  /** Seluruh riwayat perbaikan (sudah termasuk kolom uraian & jumlah_harga). */
  histories: any[];
  /** Inventaris unit dari tabel `equipment` — sumber dropdown nopol & type_vehicle. */
  equipments: any[];
  isLoading: boolean;
  error: string | null;
}

/** Kode posisi ban yang dikenali peta. */
const VALID_SLOTS = new Set([
  "FL",
  "FR",
  "RL",
  "RR",
  "SP",
  "RLI",
  "RLO",
  "RRI",
  "RRO",
]);

/** "FR - (Depan Kanan)" → "FR"; null bila kode tidak dikenali peta. */
function normalizePosition(raw: unknown): string | null {
  const m = String(raw ?? "")
    .toUpperCase()
    .trim()
    .match(/^([A-Z]{1,3}(?:-[IO])?)\b/);
  return m && VALID_SLOTS.has(m[1]) ? m[1] : null;
}

/**
 * Path kolom foto → URL siap render.
 *   - URL http(s) utuh   → dipakai apa adanya (data lama).
 *   - Path relatif AppSheet ("..._Images/foto.jpg") → URL proxy AppSheet.
 *   - kosong              → null (placeholder di modal).
 */
function storagePublicUrl(path: unknown): string | null {
  const p = String(path ?? "").trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return appsheetFileUrl(p, "tire_check_details");
}

/** Plat tanpa spasi + huruf besar, agar cocok dengan kunci peta. */
function normPlate(p: unknown): string {
  return String(p ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Bulatkan ke 1 desimal — Δ psi/mm tidak butuh presisi lebih. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface DetailRow {
  id: string;
  tire_position: string | null;
  tread_depth_mm: number | string | null;
  pressure_psi: number | string | null;
  condition: string | null;
  sidewall_img_url: string | null;
  tread_img_url: string | null;
  driver_notes: string | null;
  created_at: string | null;
}

interface InspectionRow {
  id: string;
  equipment_id: string | null;
  inspection_date: string | null;
  tire_check_details?: DetailRow[] | null;
}

/** Satu catatan mentah per posisi ban, siap diurutkan antar tanggal. */
interface TireRecord {
  createdAt: string;
  psi: number | null;
  mm: number | null;
  info: TireCheckInfo;
}

/**
 * Satu kartu panel "Ban perlu tindakan" — satu unit (nopol).
 *
 * Panel diagregasi PER UNIT, bukan per posisi: kalau 27 mobil semuanya
 * bermasalah, daftar nodek tetap sejumlah UNIT yang dirutkan terburuk dulu
 * dan dibatasi jumlahnya — bukan tonjakan seratus kartu posisi ban. Detail
 * atas mana ban bermasalah tetap ada melalui `issues` + peta di bawah.
 */
interface TireActionItem {
  /** Kunci peta (plat ternormalisasi) — dipakai memilih nopol di dropdown. */
  plateKey: string;
  /** Nopol asli untuk tampilan. */
  plate: string;
  /** Level paling buruk dari seluruh posisi milik unit ini. */
  worstLevel: TireHealthLevel;
  /** Posisi bermasalah (terurut terburuk dulu): slot + level + info terbarunya. */
  issues: Array<{ slot: string; level: TireHealthLevel; info: TireCheckInfo }>;
  /** Tanggal pemeriksaan terbaru di antara semua posisi. */
  lastInspected: string | null;
}

/** Warna teks level — dipakai pada baris alasan utama tiap butir. */
const LEVEL_TEXT: Record<TireHealthLevel, string> = {
  action: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-500",
  ok: "text-emerald-600 dark:text-emerald-400",
  none: "text-muted-foreground",
};

/**
 * Framer Motion — entrance halus untuk Analisa Ban.
 *
 * Container: stagger antar anak; item: fade + naik dari bawah. Gaya ini
 * dipakai bersama oleh deretan StatTile, panel "Ban perlu tindakan", dan
 * peta supaya halaman terasa sebagai satu gerakan, bukan tiga animasi
 * yang berbeda pacing.
 *
 * PENTING: hanya entrance + fade — tidak ada whileHover/lift karena baris
 * kartu tindakan sudah punya hover CSS sendiri (translate + shadow), dan
 * dua sistem transform akan saling menimpa.
 */
const panelContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const riseIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

export function BanAnalysis({
  histories,
  equipments,
  isLoading,
  error,
}: BanAnalysisProps) {
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [tireError, setTireError] = useState<string | null>(null);
  const [isLoadingTire, setIsLoadingTire] = useState(true);
  /**
   * Nopol yang dipilih panel "Ban perlu tindakan" (null = bebas, peta pakai
   * pilihan internalnya sendiri — auto unit pertama).
   */
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingTire(true);
      const { data, error: qError } = await supabase
        .from("daily_tire_inspections")
        .select(
          "id,equipment_id,inspection_date,tire_check_details(id,tire_position,tread_depth_mm,pressure_psi,condition,sidewall_img_url,tread_img_url,driver_notes,created_at)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (qError) {
        setTireError(qError.message);
        setInspections([]);
      } else {
        setTireError(null);
        setInspections((data as InspectionRow[]) ?? []);
      }
      setIsLoadingTire(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** id equipment (uuid atau kode) → plat, untuk memetakan inspection ke unit. */
  const plateByEquipmentKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const eq of equipments ?? []) {
      const plate = String(eq?.license_plate ?? "").trim();
      if (!plate) continue;
      if (eq?.id != null && !map.has(String(eq.id)))
        map.set(String(eq.id), plate);
      if (eq?.equipment_id != null && !map.has(String(eq.equipment_id)))
        map.set(String(eq.equipment_id), plate);
    }
    return map;
  }, [equipments]);

  /** Kunci peta (plat ternormalisasi) → nopol asli, untuk tampilan & Select. */
  const plateByNorm = useMemo(() => {
    const map = new Map<string, string>();
    for (const plate of plateByEquipmentKey.values()) {
      const p = String(plate ?? "").trim();
      if (p && !map.has(normPlate(p))) map.set(normPlate(p), p);
    }
    return map;
  }, [plateByEquipmentKey]);

  /**
   * Satu pass merangkai SEMUA catatan pemeriksaan: kunci peta → slot →
   * daftar catatan (urut terbaru dulu). Sumber tunggal untuk peta (terbaru),
   * riwayat modal (seluruhnya + Δ), dan export CSV.
   */
  const plateSlotRecords = useMemo(() => {
    const acc = new Map<string, Map<string, TireRecord[]>>();
    for (const insp of inspections) {
      const plate = plateByEquipmentKey.get(String(insp?.equipment_id ?? ""));
      if (!plate) continue;
      const key = normPlate(plate);
      let slotMap = acc.get(key);
      if (!slotMap) {
        slotMap = new Map();
        acc.set(key, slotMap);
      }
      for (const tc of insp?.tire_check_details ?? []) {
        const slot = normalizePosition(tc?.tire_position);
        if (!slot) continue;
        let list = slotMap.get(slot);
        if (!list) {
          list = [];
          slotMap.set(slot, list);
        }
        list.push({
          createdAt: String(tc?.created_at ?? ""),
          psi: toFiniteNumber(tc?.pressure_psi),
          mm: toFiniteNumber(tc?.tread_depth_mm),
          info: {
            pressurePsi: toFiniteNumber(tc?.pressure_psi),
            treadDepthMm: toFiniteNumber(tc?.tread_depth_mm),
            condition: tc?.condition?.trim() || null,
            notes: tc?.driver_notes?.trim() || null,
            inspectionDate: insp?.inspection_date ?? null,
            photos: {
              sidewall: storagePublicUrl(tc?.sidewall_img_url),
              tread: storagePublicUrl(tc?.tread_img_url),
            },
          },
        });
      }
    }
    for (const slotMap of acc.values()) {
      for (const list of slotMap.values()) {
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
    }
    return acc;
  }, [inspections, plateByEquipmentKey]);

  /** plat (ternormalisasi) → { posisi → data pemeriksaan terbaru } untuk peta. */
  const checksByPlate = useMemo(() => {
    const out: Record<string, Record<string, TireCheckInfo>> = {};
    for (const [key, slotMap] of plateSlotRecords) {
      const slots: Record<string, TireCheckInfo> = {};
      for (const [slot, list] of slotMap) slots[slot] = list[0].info;
      out[key] = slots;
    }
    return out;
  }, [plateSlotRecords]);

  /**
   * Riwayat seluruh posisi (plat → slot → entri terbaru dulu) dengan Δ psi/mm
   * vs pengukuran tepat sebelumnya — modal foto menampilkannya sebagai tren.
   */
  const historyByPlate = useMemo(() => {
    const out: Record<string, Record<string, TireCheckHistoryEntry[]>> = {};
    for (const [key, slotMap] of plateSlotRecords) {
      const slots: Record<string, TireCheckHistoryEntry[]> = {};
      for (const [slot, list] of slotMap) {
        // Δ dihitung atas urutan kronologis (terjadwal), lalu dibalik untuk tampil.
        const ascending = [...list].reverse();
        const entries: TireCheckHistoryEntry[] = [];
        for (let i = 0; i < ascending.length; i++) {
          const cur = ascending[i];
          const prev = i > 0 ? ascending[i - 1] : undefined;
          entries.push({
            createdAt: cur.createdAt,
            info: cur.info,
            deltaPsi:
              prev?.psi != null && cur.psi != null
                ? round1(cur.psi - prev.psi)
                : null,
            deltaMm:
              prev?.mm != null && cur.mm != null
                ? round1(cur.mm - prev.mm)
                : null,
          });
        }
        entries.reverse();
        slots[slot] = entries;
      }
      out[key] = slots;
    }
    return out;
  }, [plateSlotRecords]);

  /**
   * Daftar "Ban perlu tindakan" — diagregasi PER UNIT supaya tidak menumpuk
   * bila banyak unit sekaligus bermasalah. Satu kartu = satu nopol berisi
   * seluruh posisi bermasalahnya; diurutkan level terburuk dulu, lalu jumlah
   * posisi bermasalah, lalu tanggal terbaru.
   */
  const actionItems = useMemo<TireActionItem[]>(() => {
    const byPlate = new Map<string, TireActionItem>();
    for (const [plateKey, slots] of Object.entries(checksByPlate)) {
      const issues: TireActionItem["issues"] = [];
      let lastInspected: string | null = null;
      for (const [slot, info] of Object.entries(slots)) {
        const level = tireHealthLevel(info);
        if (level === "ok" || level === "none") continue;
        issues.push({ slot, level, info });
        if (
          info.inspectionDate &&
          (!lastInspected || info.inspectionDate > lastInspected)
        ) {
          lastInspected = info.inspectionDate;
        }
      }
      if (issues.length === 0) continue;
      // Urutan issues: terburuk (action) dulu — elemen pertama = terburuk.
      issues.sort(
        (a, b) => tireHealthPriority(b.level) - tireHealthPriority(a.level),
      );
      byPlate.set(plateKey, {
        plateKey,
        plate: plateByNorm.get(plateKey) ?? plateKey,
        worstLevel: issues[0].level,
        issues,
        lastInspected,
      });
    }
    return [...byPlate.values()].sort(
      (a, b) =>
        tireHealthPriority(b.worstLevel) - tireHealthPriority(a.worstLevel) ||
        b.issues.length - a.issues.length ||
        String(b.lastInspected ?? "").localeCompare(
          String(a.lastInspected ?? ""),
        ) ||
        a.plate.localeCompare(b.plate),
    );
  }, [checksByPlate, plateByNorm]);

  const summary = useMemo(() => {
    let positions = 0;
    for (const slots of Object.values(checksByPlate))
      positions += Object.keys(slots).length;
    const latestDate = inspections.reduce<string | null>(
      (acc, i) =>
        i?.inspection_date && (!acc || i.inspection_date > acc)
          ? i.inspection_date
          : acc,
      null,
    );
    return { units: Object.keys(checksByPlate).length, positions, latestDate };
  }, [checksByPlate, inspections]);

  /** Unduh seluruh baris pemeriksaan (bukan hanya terbaru per posisi) sebagai CSV. */
  const exportInspectionsCsv = () => {
    const rows: TireCheckCsvRow[] = [];
    for (const insp of inspections) {
      const plate =
        plateByEquipmentKey.get(String(insp?.equipment_id ?? "")) ?? "";
      for (const tc of insp?.tire_check_details ?? []) {
        const condition = tc?.condition?.trim() || "";
        const pressurePsi = toFiniteNumber(tc?.pressure_psi);
        const treadDepthMm = toFiniteNumber(tc?.tread_depth_mm);
        rows.push({
          plate,
          inspectionDate: String(insp?.inspection_date ?? ""),
          position: String(tc?.tire_position ?? ""),
          slot: normalizePosition(tc?.tire_position) ?? "",
          pressurePsi,
          treadDepthMm,
          condition,
          notes: tc?.driver_notes?.trim() || "",
          recordedAt: String(tc?.created_at ?? ""),
        });
      }
    }
    rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    // BOM supaya Excel membaca UTF-8 (catatan driver bisa berisi koma/petik).
    const blob = new Blob(["\uFEFF", tireChecksCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pemeriksaan-ban-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Hitungan posisi (semua unit gabung) — untuk tile ringkasan. */
  const actionCount = actionItems.reduce(
    (n, u) => n + u.issues.filter((x) => x.level === "action").length,
    0,
  );
  const warningCount =
    actionItems.reduce((n, u) => n + u.issues.length, 0) - actionCount;
  /** Hitungan unit — untuk badge panel (satu kartu = satu unit). */
  const actionUnits = actionItems.filter(
    (u) => u.worstLevel === "action",
  ).length;
  const warningUnits = actionItems.length - actionUnits;
  /**
   * Panel daftar SEMUA unit bermasalah sebagai baris rapat dalam area
   * scroll — bukan grid kartu yang terpotong. Bila semua 27 mobil
   * bermasalah, panel tingginya tetap: user scroll, peta tidak tertendang
   * ke bawah halaman.
   */

  return (
    <div className="space-y-4">
      {/* Kepala menu + tombol export — selalu tampil apapun status data */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">
            Analisa Ban Harian
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Hasil pemeriksaan ban dari app driver — tekanan, ketebalan, kondisi,
            dan foto tiap posisi.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={exportInspectionsCsv}
          disabled={isLoadingTire || inspections.length === 0}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export CSV
        </Button>
      </div>

      {/* Status data: gagal / memuat / kosong / ringkasan berhitung */}
      {tireError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Gagal memuat data pemeriksaan ban
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tireError}</p>
        </div>
      ) : isLoadingTire && inspections.length === 0 ? (
        /* Skeleton dengan tinggi meniru StatTile supaya tidak lompat saat data masuk. */
        <motion.div
          variants={panelContainer}
          initial="hidden"
          animate="show"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              variants={riseIn}
              className="rounded-xl border bg-card px-4 py-3 shadow-sm"
            >
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-5 w-16 animate-pulse rounded bg-muted" />
            </motion.div>
          ))}
        </motion.div>
      ) : inspections.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-6">
          <CircleCheck
            className="h-5 w-5 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            Belum ada pemeriksaan ban harian — hasil cek dari app driver akan
            muncul di sini.
          </p>
        </div>
      ) : (
        <motion.div
          variants={panelContainer}
          initial="hidden"
          animate="show"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <motion.div variants={riseIn}>
            <StatTile
              icon={<Truck className="h-3.5 w-3.5" aria-hidden />}
              label="Unit terdata"
              value={String(summary.units)}
            />
          </motion.div>
          <motion.div variants={riseIn}>
            <StatTile
              icon={<CircleCheck className="h-3.5 w-3.5" aria-hidden />}
              label="Posisi ban"
              value={String(summary.positions)}
            />
          </motion.div>
          <motion.div variants={riseIn}>
            <StatTile
              icon={<CalendarCheck className="h-3.5 w-3.5" aria-hidden />}
              label="Terakhir diperiksa"
              value={summary.latestDate ?? "—"}
            />
          </motion.div>
          <motion.div variants={riseIn}>
            <StatTile
              className={
                actionItems.length > 0
                  ? "border-destructive/25 bg-destructive/[0.03]"
                  : undefined
              }
              emphasis={actionItems.length > 0}
              icon={
                <TriangleAlert
                  className={cn(
                    "h-3.5 w-3.5",
                    actionItems.length > 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                  aria-hidden
                />
              }
              label="Unit bermasalah"
              value={String(actionItems.length)}
              hint={
                actionCount > 0 && warningCount > 0
                  ? `${actionCount} posisi tindakan · ${warningCount} waspada`
                  : actionCount > 0
                    ? `${actionCount} posisi perlu tindakan`
                    : warningCount > 0
                      ? `${warningCount} posisi waspada`
                      : "semua ban aman"
              }
            />
          </motion.div>
        </motion.div>
      )}

      {/* Panel "Ban perlu tindakan" — klik butir untuk menyorot unit di peta */}
      {actionItems.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="rounded-xl border bg-card/60 p-3 sm:p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Ban perlu tindakan</h3>
              {actionUnits > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    TIRE_HEALTH_TONE.action.badge,
                  )}
                >
                  {actionUnits} unit tindakan
                </span>
              )}
              {warningUnits > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    TIRE_HEALTH_TONE.warning.badge,
                  )}
                >
                  {warningUnits} unit waspada
                </span>
              )}
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {actionCount + warningCount} posisi ban
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              klik butir untuk menyorot unit di peta
            </span>
          </div>
          {/* SATU baris per unit dalam area scroll (max-h terbatas):
              semua unit bermasalah bisa ditampilkan tanpa menumpuk halaman.
              Klik baris tetap menyorot unitnya di peta. */}
          <motion.ul
            variants={panelContainer}
            initial="hidden"
            animate="show"
            className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1"
          >
            {actionItems.map((item) => {
              const tone = TIRE_HEALTH_TONE[item.worstLevel];
              const selected = selectedPlate === item.plate;
              const worst = item.issues[0];
              /* Alasan posisi TERBURUK unit ini — satu kalimat dari lib. */
              const reason = tireIssueReason(worst.info) ?? tone.label;
              const slotText = item.issues.map((x) => x.slot).join(" ");
              return (
                <motion.li key={item.plateKey} variants={riseIn}>
                  <button
                    type="button"
                    onClick={() => setSelectedPlate(item.plate)}
                    aria-label={`${item.plate} — ${item.issues.length} posisi bermasalah: ${slotText} — ${reason}`}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/30",
                      selected
                        ? "border-primary/60 ring-1 ring-primary/40"
                        : "",
                      item.worstLevel === "action"
                        ? "border-l-2 border-l-red-500"
                        : item.worstLevel === "warning"
                          ? "border-l-2 border-l-amber-500"
                          : "border-l-2 border-l-muted-foreground/40",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        tone.dot,
                      )}
                      aria-hidden
                    />
                    {/* Nopol: lebar tetap supaya semua baris rata kiri */}
                    <span className="w-40 shrink-0 truncate text-sm font-semibold leading-none max-sm:w-28">
                      {item.plate}
                    </span>
                    {/* Alasan: mengisi sisa lebar, satu baris */}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-xs font-medium leading-none max-sm:hidden",
                        LEVEL_TEXT[item.worstLevel],
                      )}
                    >
                      {reason}
                    </span>
                    <span
                      className="shrink-0 font-mono text-[10px] font-medium leading-none text-muted-foreground max-sm:hidden"
                      title={`Posisi bermasalah: ${slotText}`}
                    >
                      {slotText}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
                        tone.badge,
                      )}
                    >
                      {item.issues.length} ban
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        </motion.section>
      )}

      {/* Peta masuk paling akhir — deretan kartu & panel selesai menjolong dulu,
          supaya matanya sudah berada di tengah halaman saat peta fade-in. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
      >
        <HinoTyreMap
          equipments={equipments}
          tireChecks={checksByPlate}
          tireHistory={historyByPlate}
          selectedPlate={selectedPlate}
          onSelectPlate={setSelectedPlate}
        />
      </motion.div>
    </div>
  );
}

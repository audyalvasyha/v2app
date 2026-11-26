"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
} from "lucide-react";
import {
  HinoTyreMap,
  toFiniteNumber,
  type TireCheckHistoryEntry,
  type TireCheckInfo,
} from "./hino-tyre-map";
import { supabase } from "@/utils/supabase";
import { formatDateMedium } from "@/lib/format";
import { appsheetFileUrl } from "@/lib/appsheet-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FilterChips } from "@/components/molecules/filter-chips";
import { BanPageSkeleton } from "@/components/molecules/view-skeleton";
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

/** Maksimal nopol per halaman pada panel "Perlu perhatian". */
const ACTION_PAGE_SIZE = 5;

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


export function BanAnalysis({
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
  /** Filter level panel + kunci unit yang detail posisinya sedang dibuka. */
  const [actionFilter, setActionFilter] = useState<"all" | "action" | "warning">("all");
  const [expandedPlateKey, setExpandedPlateKey] = useState<string | null>(null);
  /** Halaman panel — maksimal 5 nopol per halaman supaya panel tetap ramping. */
  const [actionPage, setActionPage] = useState(1);

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

  /** Daftar unit yang tampil — mengikuti filter level; nol bila level kosong. */
  const visibleActionItems = useMemo(
    () =>
      actionFilter === "all"
        ? actionItems
        : actionItems.filter((u) => u.worstLevel === actionFilter),
    [actionItems, actionFilter],
  );

  /** Selalu mulai dari halaman pertama saat filter berubah atau datanya berganti. */
  useEffect(() => {
    setActionPage(1);
  }, [actionFilter, actionItems.length]);

  const actionTotalPages = Math.max(
    1,
    Math.ceil(visibleActionItems.length / ACTION_PAGE_SIZE),
  );
  const safeActionPage = Math.min(actionPage, actionTotalPages);
  const pagedActionItems = visibleActionItems.slice(
    (safeActionPage - 1) * ACTION_PAGE_SIZE,
    safeActionPage * ACTION_PAGE_SIZE,
  );

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

  /** Hitungan unit — untuk badge panel (satu kartu = satu unit). */
  const actionUnits = actionItems.filter(
    (u) => u.worstLevel === "action",
  ).length;
  const warningUnits = actionItems.length - actionUnits;
  /**
   * Panel menampilkan maksimal 5 nopol per halaman supaya tetap ramping.
   * Area scroll hanya menampung detail terbuka; halaman berikutnya lewat
   * tombol Sebelumnya/Berikutnya di footer panel.
   */

  if (isLoadingTire && inspections.length === 0) {
    return <BanPageSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar ringkas — judul sudah ada di header halaman, jadi di sini
          cukup ringkasan + aksi supaya tidak ada heading dobel. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs tabular-nums text-muted-foreground">
          {isLoadingTire
            ? "Memuat pemeriksaan ban…"
            : inspections.length > 0
              ? `${inspections.length} pemeriksaan · ${actionItems.length} unit perlu perhatian`
              : "Belum ada pemeriksaan ban."}
        </p>
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

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-muted-foreground">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span>Data armada mungkin belum lengkap: {error}</span>
        </div>
      )}

      {/* Status data: gagal / memuat / kosong / ringkasan berhitung */}
      {tireError ? (
        <div className="rounded-lg border border-border/70 bg-card px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Gagal memuat data pemeriksaan ban
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tireError}</p>
        </div>
      ) : isLoadingTire && inspections.length === 0 ? (
        <Skeleton className="h-10 w-full rounded-lg border" />
      ) : inspections.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/70 px-4 py-6">
          <CircleCheck
            className="h-5 w-5 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            Belum ada pemeriksaan ban.
          </p>
        </div>
      ) : null}

      {/* Peta menjadi konten utama; daftar unit bermasalah menjadi pendamping
          di kanan pada layar lebar. Urutan DOM menaruh peta dulu supaya fokus
          visual dan alur mobile tetap ke peta, sementara komponen petanya
          sendiri tidak diubah. */}
      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div
          className={cn(
            "min-w-0",
            actionItems.length > 0 ? "lg:col-span-7 xl:col-span-8" : "lg:col-span-12",
          )}
        >
          {isLoading && equipments.length === 0 ? (
            <Skeleton className="h-[420px] w-full rounded-lg border" />
          ) : (
            <HinoTyreMap
              equipments={equipments}
              tireChecks={checksByPlate}
              tireHistory={historyByPlate}
              selectedPlate={selectedPlate}
              onSelectPlate={setSelectedPlate}
            />
          )}
        </div>
        {actionItems.length > 0 && (
          <aside className="min-w-0 lg:col-span-5 xl:col-span-4">
            <section className="overflow-hidden rounded-lg border border-border/70 bg-card lg:sticky lg:top-4">
              <div className="border-b border-border/70 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium">Perlu perhatian</h2>
                  <Badge variant="outline" className="tabular-nums">
                    {actionItems.length} unit
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pilih unit untuk menyorotnya di peta.
                </p>
                <FilterChips
                  ariaLabel="Filter level ban"
                  className="mt-2 w-full"
                  options={
                    [
                      { id: "all", label: "Semua", count: actionItems.length },
                      { id: "action", label: "Tindakan", count: actionUnits },
                      { id: "warning", label: "Waspada", count: warningUnits },
                    ] as const
                  }
                  value={actionFilter}
                  onChange={setActionFilter}
                />
              </div>
              {visibleActionItems.length > 0 ? (
                <ul className="max-h-[420px] divide-y divide-border/70 overflow-y-auto lg:max-h-[560px]">
                  {pagedActionItems.map((item) => {
                    const selected = selectedPlate === item.plate;
                    const expanded = expandedPlateKey === item.plateKey;
                    const worst = item.issues[0];
                    const reason =
                      tireIssueReason(worst.info) ??
                      TIRE_HEALTH_TONE[item.worstLevel].label;
                    const inspected = item.lastInspected
                      ? formatDateMedium(item.lastInspected)
                      : "—";
                    return (
                      <li key={item.plateKey}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlate(item.plate);
                            setExpandedPlateKey(expanded ? null : item.plateKey);
                          }}
                          aria-expanded={expanded}
                          aria-label={`${item.plate} — ${item.issues.length} ban bermasalah — ${reason}, diperiksa ${inspected}`}
                          aria-current={selected ? "true" : undefined}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                            selected && "bg-muted/40",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                              item.worstLevel === "action"
                                ? "bg-destructive"
                                : "bg-amber-500",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium">
                                {item.plate}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {item.issues.length} ban
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {reason} · {inspected}
                            </span>
                          </span>
                          <ChevronDown
                            className={cn(
                              "mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                              expanded && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </button>
                        {expanded && (
                          <div className="border-t border-border/70 bg-muted/20 px-4 py-1">
                            {item.issues.map((x) => {
                              const posTone = TIRE_HEALTH_TONE[x.level];
                              const latest =
                                historyByPlate[item.plateKey]?.[x.slot]?.[0];
                              const psi = latest?.info.pressurePsi;
                              const mm = latest?.info.treadDepthMm;
                              const detail =
                                x.info.condition || x.info.inspectionDate
                                  ? `${x.info.condition ?? "—"} · ${x.info.inspectionDate ? formatDateMedium(x.info.inspectionDate) : "—"}`
                                  : "—";
                              return (
                                <div
                                  key={x.slot}
                                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/70 py-2 first:border-t-0"
                                >
                                  <div className="min-w-0">
                                    <p className="font-mono text-xs font-medium">
                                      {x.slot} · {posTone.label}
                                    </p>
                                    <p
                                      className="mt-0.5 truncate text-xs text-muted-foreground"
                                      title={detail}
                                    >
                                      {detail}
                                    </p>
                                  </div>
                                  <dl className="flex shrink-0 items-center gap-4 text-xs tabular-nums">
                                    <div>
                                      <dt className="text-muted-foreground">Tekanan</dt>
                                      <dd>
                                        {psi != null ? `${psi} psi` : "—"}
                                        {latest?.deltaPsi != null && (
                                          <span className="text-muted-foreground">
                                            {` (${latest.deltaPsi > 0 ? "+" : ""}${latest.deltaPsi})`}
                                          </span>
                                        )}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-muted-foreground">Tapak</dt>
                                      <dd>
                                        {mm != null ? `${mm} mm` : "—"}
                                        {latest?.deltaMm != null && (
                                          <span className="text-muted-foreground">
                                            {` (${latest.deltaMm > 0 ? "+" : ""}${latest.deltaMm})`}
                                          </span>
                                        )}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              );
                            })}
                            <p className="py-2 text-xs text-muted-foreground">
                              Riwayat dan foto tiap posisi tersedia di peta.
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Tidak ada unit pada level ini.
                </p>
              )}
              {visibleActionItems.length > ACTION_PAGE_SIZE && (
                <nav
                  aria-label="Navigasi halaman unit"
                  className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-2.5"
                >
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {(safeActionPage - 1) * ACTION_PAGE_SIZE + 1}–
                    {Math.min(
                      safeActionPage * ACTION_PAGE_SIZE,
                      visibleActionItems.length,
                    )}{" "}
                    dari {visibleActionItems.length} unit
                  </p>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={safeActionPage <= 1}
                      onClick={() => setActionPage(safeActionPage - 1)}
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={safeActionPage >= actionTotalPages}
                      onClick={() => setActionPage(safeActionPage + 1)}
                    >
                      Berikutnya
                    </Button>
                  </div>
                </nav>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}

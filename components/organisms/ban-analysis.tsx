"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  HinoTyreMap,
  toFiniteNumber,
  type TireCheckHistoryEntry,
  type TireCheckInfo,
} from "./hino-tyre-map";
import { supabase } from "@/utils/supabase";
import { appsheetFileUrl } from "@/lib/appsheet-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TIRE_HEALTH_TONE,
  tireChecksCsv,
  tireHealthLevel,
  tireHealthPriority,
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
  histories: any[]
  /** Inventaris unit dari tabel `equipment` — sumber dropdown nopol & type_vehicle. */
  equipments: any[]
  isLoading: boolean
  error: string | null
}

/** Kode posisi ban yang dikenali peta. */
const VALID_SLOTS = new Set(["FL", "FR", "RL", "RR", "SP", "RLI", "RLO", "RRI", "RRO"]);

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
  return String(p ?? "").replace(/\s+/g, "").toUpperCase();
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

/** Satu butir panel "Ban perlu tindakan". */
interface TireActionItem {
  /** Kunci peta (plat ternormalisasi) — dipakai memilih nopol di dropdown. */
  plateKey: string;
  /** Nopol asli untuk tampilan. */
  plate: string;
  slot: string;
  level: TireHealthLevel;
  info: TireCheckInfo;
}

export function BanAnalysis({ histories, equipments, isLoading, error }: BanAnalysisProps) {
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
      if (eq?.id != null && !map.has(String(eq.id))) map.set(String(eq.id), plate);
      if (eq?.equipment_id != null && !map.has(String(eq.equipment_id))) map.set(String(eq.equipment_id), plate);
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
              prev?.psi != null && cur.psi != null ? round1(cur.psi - prev.psi) : null,
            deltaMm:
              prev?.mm != null && cur.mm != null ? round1(cur.mm - prev.mm) : null,
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
   * Daftar "Ban perlu tindakan": posisi ban dengan level action/warning dari
   * pemeriksaan TERBARU masing-masing posisi, diurutkan: action dulu, lalu
   * tanggal pemeriksaan terbaru, lalu plat.
   */
  const actionItems = useMemo<TireActionItem[]>(() => {
    const items: TireActionItem[] = [];
    for (const [plateKey, slots] of Object.entries(checksByPlate)) {
      for (const [slot, info] of Object.entries(slots)) {
        const level = tireHealthLevel(info);
        if (level === "ok" || level === "none") continue;
        items.push({
          plateKey,
          plate: plateByNorm.get(plateKey) ?? plateKey,
          slot,
          level,
          info,
        });
      }
    }
    return items.sort(
      (a, b) =>
        tireHealthPriority(b.level) - tireHealthPriority(a.level) ||
        String(b.info.inspectionDate ?? "").localeCompare(String(a.info.inspectionDate ?? "")) ||
        a.plate.localeCompare(b.plate),
    );
  }, [checksByPlate, plateByNorm]);

  const summary = useMemo(() => {
    let positions = 0;
    for (const slots of Object.values(checksByPlate)) positions += Object.keys(slots).length;
    const latestDate = inspections.reduce<string | null>(
      (acc, i) => (i?.inspection_date && (!acc || i.inspection_date > acc) ? i.inspection_date : acc),
      null,
    );
    return { units: Object.keys(checksByPlate).length, positions, latestDate };
  }, [checksByPlate, inspections]);

  /** Unduh seluruh baris pemeriksaan (bukan hanya terbaru per posisi) sebagai CSV. */
  const exportInspectionsCsv = () => {
    const rows: TireCheckCsvRow[] = [];
    for (const insp of inspections) {
      const plate = plateByEquipmentKey.get(String(insp?.equipment_id ?? "")) ?? "";
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
    const blob = new Blob(["\uFEFF", tireChecksCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pemeriksaan-ban-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionCount = actionItems.filter((i) => i.level === "action").length;
  const warningCount = actionItems.length - actionCount;

  return (
    <div className="space-y-3">
      {/* Ringkasan data pemeriksaan ban harian + tombol export */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {tireError ? (
            <span className="text-destructive">Gagal memuat data pemeriksaan ban: {tireError}</span>
          ) : isLoadingTire && inspections.length === 0 ? (
            <span>Memuat data pemeriksaan ban…</span>
          ) : inspections.length === 0 ? (
            <span>Belum ada pemeriksaan ban harian — hasil cek dari app driver akan muncul di sini.</span>
          ) : (
            <span>
              Pemeriksaan ban harian:{" "}
              <span className="font-medium text-foreground">{summary.units} unit</span>
              {" · "}
              <span className="font-medium text-foreground">{summary.positions} posisi ban</span> terdata
              {summary.latestDate ? (
                <>
                  {" · terakhir "}
                  <span className="font-medium text-foreground">{summary.latestDate}</span>
                </>
              ) : null}
            </span>
          )}
        </div>
        {inspections.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={exportInspectionsCsv}
            disabled={isLoadingTire}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </Button>
        )}
      </div>

      {/* Panel "Ban perlu tindakan" — klik butir untuk memilih nopol di peta */}
      {actionItems.length > 0 && (
        <section className="rounded-xl border bg-card/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Ban perlu tindakan</h2>
            <span className="text-xs text-muted-foreground">
              {actionCount > 0 && (
                <>
                  <span className="font-medium text-red-600 dark:text-red-400">{actionCount} perlu tindakan</span>
                  {warningCount > 0 ? " · " : ""}
                </>
              )}
              {warningCount > 0 && (
                <span className="font-medium text-amber-600 dark:text-amber-400">{warningCount} waspada</span>
              )}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              klik butir untuk menyorot unit di peta
            </span>
          </div>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {actionItems.map((item) => {
              const tone = TIRE_HEALTH_TONE[item.level];
              return (
                <li key={`${item.plateKey}-${item.slot}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedPlate(item.plate)}
                    aria-label={`${item.plate} posisi ${item.slot} — ${tone.label}`}
                    className={cn(
                      "w-full cursor-pointer rounded-lg border-l-4 border-y border-r border-border px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40",
                      tone.edge,
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
                      <span className="truncate text-xs font-semibold">{item.plate}</span>
                      <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-bold text-primary">
                        {item.slot}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground underline-offset-2 group-hover:underline">
                        {item.info.inspectionDate}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">psi {item.info.pressurePsi ?? "—"}</span>
                      <span className="tabular-nums">mm {item.info.treadDepthMm ?? "—"}</span>
                      <span className={cn("font-medium", item.level === "action" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                        {item.info.condition ?? tone.label}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <HinoTyreMap
        equipments={equipments}
        tireChecks={checksByPlate}
        tireHistory={historyByPlate}
        selectedPlate={selectedPlate}
        onSelectPlate={setSelectedPlate}
      />
    </div>
  );
}

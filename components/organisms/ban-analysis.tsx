"use client";

import React, { useEffect, useMemo, useState } from "react";
import { HinoTyreMap, type TireCheckInfo, toFiniteNumber } from "./hino-tyre-map";
import { supabase } from "@/utils/supabase";

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
 * - Bila satu posisi diperiksa berkali-kali, yang tampil adalah yang terbaru
 *   (bandingkan `created_at`).
 * - Foto: nilai http(s) dipakai apa adanya; path Storage ("bucket/file.jpg")
 *   dibungkus URL public Storage project ini. Bucket yang hilang akan tampil
 *   sebagai placeholder "Foto belum tersedia" di modal — bukan gambar rusak.
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
const VALID_SLOTS = new Set(["FL", "FR", "RL", "RR", "SP", "RL-I", "RL-O", "RR-I", "RR-O"]);

/** "FR - (Depan Kanan)" → "FR"; null bila kode tidak dikenali peta. */
function normalizePosition(raw: unknown): string | null {
  const m = String(raw ?? "")
    .toUpperCase()
    .trim()
    .match(/^([A-Z]{1,3}(?:-[IO])?)\b/);
  return m && VALID_SLOTS.has(m[1]) ? m[1] : null;
}

/** Path Storage ("bucket/file.jpg") → URL public; http(s) dipakai apa adanya. */
function storagePublicUrl(path: unknown): string | null {
  const p = String(path ?? "").trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${p.replace(/^\/+/, "")}`;
}

/** Plat tanpa spasi + huruf besar, agar cocok dengan kunci peta. */
function normPlate(p: unknown): string {
  return String(p ?? "").replace(/\s+/g, "").toUpperCase();
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

export function BanAnalysis({ histories, equipments, isLoading, error }: BanAnalysisProps) {
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [tireError, setTireError] = useState<string | null>(null);
  const [isLoadingTire, setIsLoadingTire] = useState(true);

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

  /** plat (ternormalisasi) → { posisi → data pemeriksaan terbaru }. */
  const checksByPlate = useMemo(() => {
    // plate → slot → { info, createdAt } (createdAt dipakai untuk "terbaru menang")
    const acc = new Map<string, Map<string, { info: TireCheckInfo; createdAt: string }>>();
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
        const createdAt = String(tc?.created_at ?? "");
        const prev = slotMap.get(slot);
        if (prev && prev.createdAt >= createdAt) continue;
        slotMap.set(slot, {
          createdAt,
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
    const out: Record<string, Record<string, TireCheckInfo>> = {};
    for (const [key, slotMap] of acc) {
      const slots: Record<string, TireCheckInfo> = {};
      for (const [slot, { info }] of slotMap) slots[slot] = info;
      out[key] = slots;
    }
    return out;
  }, [inspections, plateByEquipmentKey]);

  const summary = useMemo(() => {
    let positions = 0;
    for (const slots of Object.values(checksByPlate)) positions += Object.keys(slots).length;
    const latestDate = inspections.reduce<string | null>(
      (acc, i) => (i?.inspection_date && (!acc || i.inspection_date > acc) ? i.inspection_date : acc),
      null,
    );
    return { units: Object.keys(checksByPlate).length, positions, latestDate };
  }, [checksByPlate, inspections]);

  return (
    <div className="space-y-3">
      {/* Ringkasan data pemeriksaan ban harian */}
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
            {" — panel memakai data asli bila posisinya terdata, data contoh bila belum."}
          </span>
        )}
      </div>

      <HinoTyreMap equipments={equipments} tireChecks={checksByPlate} />
    </div>
  );
}

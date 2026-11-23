import React, { memo, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/molecules/stat-tile";
import { WeatherBanner } from "@/components/organisms/weather-banner";
import {
  compactRupiah,
  formatNumber,
  formatRupiah,
  startOfZonedDay,
  startOfZonedDayMonthsAgo,
  APP_TIMEZONE,
} from "@/lib/format";
import {
  evaluateServiceStatus,
  remainingDaysLabel,
  remainingKmLabel,
  type ServiceScheduleStatus,
} from "@/lib/service-status";
import { unitStatusTone, unitStatusLabel } from "@/lib/unit-status";
import {
  durationMinutesFromTimestamps,
  formatDuration,
  outboundStatus,
} from "@/lib/outbound-status";
import { cn } from "@/lib/utils";
import type { View } from "@/components/templates/dashboard-layout";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  FileText,
  ListChecks,
  MessageSquareText,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Truck,
  Wrench,
} from "lucide-react";

// Chart di-lazy-load sebagai komponen utuh (chunk terpisah dari bundle dashboard).
// Ketiganya keluar dari modul boundary yang sama (components/molecules/charts)
// supaya Turbopack membuat SATU chunk recharts, bukan salinan per grafik.
const LazyCostChart = dynamic(() =>
  import("@/components/molecules/charts").then((m) => m.CostChart),
);
const LazyUnitCostRankingChart = dynamic(() =>
  import("@/components/molecules/charts").then((m) => m.UnitCostRankingChart),
);

interface DashboardViewProps {
  equipments: any[];
  histories: any[];
  serviceLogs: any[];
  /** Dataset menu Pengiriman & SKR — untuk kartu ringkasan menu (boleh kosong) */
  outbounds: any[];
  skrDetails: any[];
  /** Error fetch menu.GetCurrentMethod — supaya kartu jujur bila hydrate gagal */
  skrError?: string | null;
  outboundError?: string | null;
  isLoading: boolean;
  /** Dipakai tombol pintas "buka menu X" di dalam dashboard */
  onNavigate?: (view: View) => void;
}

const DAY_MS = 86_400_000;

/** Kepala dashboard tetap tampil saat data masih dimuat, jadi tanggal dan
 *  aksi tidak ikut menunggu query armada. */
function DashboardHeader({ onNavigate }: { onNavigate?: (view: View) => void }) {
  const today = useMemo(() => new Date(), []);
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-[1.75rem]">
          Dashboard
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Ringkasan operasional armada ·{" "}
          {today.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: APP_TIMEZONE,
          })}
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        <Button
          size="sm"
          className="w-full gap-1.5 px-2 text-xs sm:w-auto sm:px-3 sm:text-sm"
          onClick={() => onNavigate?.("analisa")}
        >
          <MessageSquareText className="h-3.5 w-3.5 shrink-0" /> Tanya Midaa
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 bg-card px-2 text-xs sm:w-auto sm:px-3 sm:text-sm"
          onClick={() => onNavigate?.("monitoring")}
        >
          <Activity className="h-3.5 w-3.5 shrink-0" />
          <span className="sm:hidden">Monitoring</span>
          <span className="hidden sm:inline">Monitoring servis</span>
        </Button>
      </div>
    </header>
  );
}

function DashboardViewImpl({
  equipments,
  histories,
  serviceLogs,
  outbounds,
  skrDetails,
  skrError,
  outboundError,
  isLoading,
  onNavigate,
}: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-3 pb-2 sm:gap-4 lg:gap-5">
      <DashboardHeader onNavigate={onNavigate} />
      {/* Cuaca punya fetch sendiri; tampil lebih dulu tanpa menunggu armada. */}
      <WeatherBanner onOpenDetail={() => onNavigate?.("weather")} />
      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <DashboardContent
          equipments={equipments}
          histories={histories}
          serviceLogs={serviceLogs}
          outbounds={outbounds}
          skrDetails={skrDetails}
          skrError={skrError}
          outboundError={outboundError}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

// Skeleton isi dashboard — kepala dan cuaca sudah tampil nyata di atasnya.
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:gap-4 lg:gap-5" role="status" aria-busy="true">
      {/* Kesiapan armada */}
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-2.5 w-full max-w-xl" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-16 w-full rounded-lg sm:h-20 ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}
            />
          ))}
        </div>
      </div>
      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card px-3 py-3 sm:px-4 sm:py-3.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-6 w-24" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      {/* Tren + pengiriman */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-60" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[190px] w-full rounded-md sm:h-[220px]" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-2.5 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      {/* Tindakan + SKR */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7 xl:col-span-8">
          <CardHeader>
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-5 xl:col-span-4">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-32" />
          </CardContent>
        </Card>
      </div>
      {/* Peringkat */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[130px] w-full rounded-md sm:h-[150px]" />
        </CardContent>
      </Card>
    </div>
  );
}

/** Penanda naik/turun biaya vs periode sebelumnya */
function DeltaBadge({
  delta,
  suffix,
}: {
  delta: number | null;
  suffix?: string;
}) {
  if (delta == null) {
    return (
      <span className="text-xs text-muted-foreground">
        Belum ada pembanding
      </span>
    );
  }
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.5;
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        flat
          ? "text-muted-foreground"
          : up
            ? "text-destructive"
            : "text-emerald-600 dark:text-emerald-400",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {flat
        ? "Stabil"
        : `${Math.abs(delta).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
      {suffix && (
        <span className="font-normal text-muted-foreground">{suffix}</span>
      )}
    </span>
  );
}

/**
 * Ikon aksen untuk kepala kartu. Kartu yang di-redesain memakai pola ini
 * supaya satu baris dashboard terbaca sebagai satu keluarga visual,
 * berbeda dari kartu tren yang mempertahankan gaya lamanya.
 */
function CardHeaderBadge({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      {icon}
    </div>
  );
}

/**
 * Sinyal kecil di hero: satu angka penting + arah klik ke menu terkait.
 * Dipakai untuk hal yang butuh keputusan (terlewat servis, pengiriman
 * aktif), bukan sekadar angka statistik.
 */
function HeroSignal({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  onClick,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: "danger" | "warning" | "neutral";
  onClick?: () => void;
  className?: string;
}) {
  const valueTone =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-lg border border-border/70 bg-background/60 p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:p-3",
        className,
      )}
    >
      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground [&_svg]:h-3 [&_svg]:w-3 sm:gap-1.5 sm:text-xs sm:[&_svg]:h-3.5 sm:[&_svg]:w-3.5">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "mt-1.5 block text-base font-semibold leading-none tabular-nums sm:mt-2 sm:text-lg",
          valueTone,
        )}
      >
        {value}
      </span>
      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground sm:mt-1 sm:text-[11px]">
        {hint}
      </span>
    </button>
  );
}

interface UrgentUnit {
  equipment: any;
  status: ServiceScheduleStatus;
}

function DashboardContent({
  equipments,
  histories,
  serviceLogs,
  outbounds,
  skrDetails,
  skrError,
  outboundError,
  onNavigate,
}: {
  equipments: any[];
  histories: any[];
  serviceLogs: any[];
  outbounds: any[];
  skrDetails: any[];
  skrError?: string | null;
  outboundError?: string | null;
  onNavigate?: (view: View) => void;
}) {
  const today = useMemo(() => new Date(), []);

  /**
   * Satu kali jalan untuk semua turunan data (metrik, tren 3 bulan, peringkat
   * 6 bulan, ringkasan 30 hari, status unit, dan prioritas servis) — sebelumnya
   * `histories` dipindai tiga kali terpisah.
   */
  const analytics = useMemo(() => {
    const startOfTodayMs = startOfZonedDay(today);
    const cutoff30 = startOfTodayMs - 30 * DAY_MS;
    const cutoff60 = startOfTodayMs - 60 * DAY_MS;
    // Rentang tren dipertahankan sama seperti sebelumnya (3 bulan kalender)
    const cutoff3m = new Date(startOfZonedDayMonthsAgo(3, today));
    const cutoff6m = new Date(startOfZonedDayMonthsAgo(6, today));

    let totalCost = 0;
    let cost30 = 0;
    let costPrev30 = 0;
    let entries30 = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    const byDay3m = new Map<string, number>();
    const byUnit6m = new Map<string, { totalCost: number; count: number }>();
    let cost6mTotal = 0;
    let entries6m = 0;

    for (const h of histories) {
      const time = new Date(h.tanggal).getTime();
      if (Number.isNaN(time)) continue;
      const cost = Number(h.jumlah_harga) || 0;
      const unit = String(h.equipment_id ?? "").trim();

      totalCost += cost;
      if (oldest === null || time < oldest) oldest = time;
      if (newest === null || time > newest) newest = time;

      if (time >= cutoff30) {
        cost30 += cost;
        entries30 += 1;
      } else if (time >= cutoff60) {
        costPrev30 += cost;
      }

      if (time >= cutoff3m.getTime()) {
        const dayKey = new Date(time).toISOString().split("T")[0];
        byDay3m.set(dayKey, (byDay3m.get(dayKey) ?? 0) + cost);
      }

      if (time >= cutoff6m.getTime() && unit) {
        const prev = byUnit6m.get(unit);
        if (prev) {
          prev.totalCost += cost;
          prev.count += 1;
        } else {
          byUnit6m.set(unit, { totalCost: cost, count: 1 });
        }
      }

      if (time >= cutoff6m.getTime()) {
        cost6mTotal += cost;
        entries6m += 1;
      }
    }

    // Tren harian (urut dari terlama ke terbaru)
    const trend = Array.from(byDay3m.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([date, cost]) => ({
        date,
        displayDate: new Date(date).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          timeZone: APP_TIMEZONE,
        }),
        cost,
      }));
    const trendTotal = trend.reduce((sum, point) => sum + point.cost, 0);
    const peak = trend.reduce<{ cost: number; displayDate: string } | null>(
      (best, point) => (best && best.cost >= point.cost ? best : point),
      null,
    );

    // Peta STDM → nomor polisi untuk label peringkat biaya (tampil nopol, bukan STDM)
    const plateByUnit = new Map<string, string>();
    for (const eq of equipments) {
      const id = String(eq.equipment_id ?? "").trim();
      const plate = String(eq.license_plate ?? "").trim();
      if (id && plate) plateByUnit.set(id, plate);
    }

    // Peringkat biaya per unit (6 bulan)
    const ranking = Array.from(byUnit6m.entries()).map(([equipment_id, v]) => ({
      equipment_id,
      label: plateByUnit.get(equipment_id) ?? equipment_id,
      totalCost: v.totalCost,
      count: v.count,
    }));
    ranking.sort((a, b) => b.totalCost - a.totalCost);

    // Distribusi status operasional (apa adanya, bukan "total - available")
    const statusCounts = new Map<string, number>();
    let availableCount = 0;
    for (const eq of equipments) {
      const raw = String(eq.status ?? "").trim() || "Tidak diketahui";
      statusCounts.set(raw, (statusCounts.get(raw) ?? 0) + 1);
      if (eq.status === "Available") availableCount += 1;
    }
    const statusBreakdown = Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // Prioritas servis — pakai aturan bersama dari lib/service-status
    const latestLogByUnit = new Map<string, any>();
    for (const log of serviceLogs) {
      const key = String(log.equipment_id ?? "");
      if (!key) continue;
      const existing = latestLogByUnit.get(key);
      if (
        !existing ||
        new Date(log.service_date).getTime() >
          new Date(existing.service_date).getTime()
      ) {
        latestLogByUnit.set(key, log);
      }
    }

    const urgent: UrgentUnit[] = [];
    let overdueCount = 0;
    let warningCount = 0;
    let withoutLog = 0;
    for (const eq of equipments) {
      const status = evaluateServiceStatus(
        eq,
        latestLogByUnit.get(eq.equipment_id) ?? null,
        today,
      );
      if (status.id === "overdue") overdueCount += 1;
      else if (status.id === "warning") warningCount += 1;
      else if (status.id === "none") withoutLog += 1;
      if (status.id === "overdue" || status.id === "warning")
        urgent.push({ equipment: eq, status });
    }
    urgent.sort((a, b) => {
      if (a.status.rank !== b.status.rank) return a.status.rank - b.status.rank;
      const da = a.status.remainingDays ?? Number.MAX_SAFE_INTEGER;
      const db = b.status.remainingDays ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return (
        (a.status.remainingKm ?? Number.MAX_SAFE_INTEGER) -
        (b.status.remainingKm ?? Number.MAX_SAFE_INTEGER)
      );
    });

    // ── Pengiriman: status dari pasangan jam keluar/masuk ──
    let outSelesai = 0;
    let outBerjalan = 0;
    let outMenunggu = 0;
    let outDurationTotal = 0;
    let outDurationCount = 0;
    let outDurationMax = 0;
    for (const o of outbounds) {
      const info = outboundStatus(o.jam_out, o.jam_in);
      if (info.status === "selesai") {
        outSelesai += 1;
        const dur = durationMinutesFromTimestamps(o.jam_out, o.jam_in);
        if (dur != null) {
          outDurationTotal += dur;
          outDurationCount += 1;
          if (dur > outDurationMax) outDurationMax = dur;
        }
      } else if (info.status === "berjalan") {
        outBerjalan += 1;
      } else if (info.status === "menunggu") {
        outMenunggu += 1;
      }
    }
    // ── SKR: sisa kiriman yang belum tuntas ──
    let skrQty = 0;
    let skrNilai = 0;
    const skrStores = new Set<string>();
    for (const r of skrDetails) {
      skrQty += Number(r.qty) || 0;
      skrNilai += Number(r.nilai) || 0;
      if (r.customer_id != null && String(r.customer_id).trim()) {
        skrStores.add(String(r.customer_id).trim());
      }
    }

    const totalUnits = equipments.length;

    return {
      trend,
      trendTotal,
      trendAverage: trend.length > 0 ? trendTotal / trend.length : 0,
      peak,
      top5: ranking.slice(0, 5),
      bottom5: [...ranking]
        .sort((a, b) => a.totalCost - b.totalCost)
        .slice(0, 5),
      totalCost,
      cost30,
      costPrev30,
      entries30,
      averageEntry30: entries30 > 0 ? cost30 / entries30 : 0,
      delta30:
        costPrev30 > 0 ? ((cost30 - costPrev30) / costPrev30) * 100 : null,
      averagePerUnit: totalUnits > 0 ? totalCost / totalUnits : 0,
      statusBreakdown,
      availableCount,
      capacityRate: totalUnits > 0 ? (availableCount / totalUnits) * 100 : 0,
      totalUnits,
      urgent: urgent.slice(0, 5),
      urgentTotal: urgent.length,
      outSelesai,
      outBerjalan,
      outMenunggu,
      outTotal: outbounds.length,
      outAverageDuration: outDurationCount > 0 ? outDurationTotal / outDurationCount : null,
      outLongestDuration: outDurationMax > 0 ? outDurationMax : null,
      cost6mTotal,
      entries6m,
      skrDocs: skrDetails.length,
      skrQty,
      skrNilai,
      skrStores: skrStores.size,
      overdueCount,
      warningCount,
      withoutLog,
    };
  }, [equipments, histories, serviceLogs, outbounds, skrDetails, today]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 lg:gap-5">
      {/* ── HERO: satu pandangan tentang kondisi hari ini ─────────── */}
      <section
        aria-label="Kondisi armada hari ini"
        className="rounded-xl border border-border/80 bg-card p-3.5 shadow-sm sm:p-4 lg:p-5"
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Activity className="h-3.5 w-3.5" /> Kesiapan armada
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-3xl font-semibold tracking-tight tabular-nums lg:text-4xl">
                {analytics.capacityRate.toFixed(0)}%
              </span>
              <h2 className="text-base font-medium text-foreground lg:text-lg">
                armada siap beroperasi
              </h2>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
              {formatNumber(analytics.availableCount)} dari{" "}
              {formatNumber(analytics.totalUnits)} unit tersedia untuk operasional hari ini.
            </p>
          </div>

          <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:items-center">
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {analytics.statusBreakdown.map(({ status, count }) => {
                  if (count <= 0 || analytics.totalUnits <= 0) return null;
                  const tone = unitStatusTone(status);
                  return (
                    <div
                      key={status}
                      className={cn("h-full transition-[width] duration-500", tone.bar)}
                      style={{ width: `${(count / analytics.totalUnits) * 100}%` }}
                      title={`${unitStatusLabel(status)}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analytics.statusBreakdown.map(({ status, count }) => {
                  const tone = unitStatusTone(status);
                  return (
                    <Badge
                      key={status}
                      variant="outline"
                      className="gap-1.5 bg-card/80"
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-[1px]", tone.dot)} />
                      {unitStatusLabel(status)}
                      <span className="tabular-nums text-foreground">{count}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
              <HeroSignal
                label="Terlewat servis"
                value={formatNumber(analytics.overdueCount)}
                hint="unit lewat jadwal"
                tone={analytics.overdueCount > 0 ? "danger" : "neutral"}
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                onClick={() => onNavigate?.("monitoring")}
              />
              <HeroSignal
                label="Tanpa jadwal"
                value={formatNumber(analytics.withoutLog)}
                hint="belum ada log servis"
                icon={<Wrench className="h-3.5 w-3.5" />}
                onClick={() => onNavigate?.("monitoring")}
              />
              <HeroSignal
                label="Pengiriman aktif"
                value={formatNumber(analytics.outBerjalan)}
                hint={`${formatNumber(analytics.outMenunggu)} menunggu berangkat`}
                tone={analytics.outBerjalan > 0 ? "warning" : "neutral"}
                icon={<PackageCheck className="h-3.5 w-3.5" />}
                onClick={() => onNavigate?.("pengiriman")}
                className="col-span-2 sm:col-span-1"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI: hanya angka yang tidak diulang hero maupun kartu lain.
          Urgensi servis sudah hidup di sinyal hero + kartu Perlu Tindakan;
          total FO pengiriman sudah ada di kartu Operasional Pengiriman. ── */}
      <section aria-label="Metrik pendukung" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile
          label="Biaya Perbaikan · 30 Hari"
          value={compactRupiah(analytics.cost30)}
          title={formatRupiah(analytics.cost30)}
          hint={<DeltaBadge delta={analytics.delta30} suffix="vs 30 hari lalu" />}
          icon={<CircleDollarSign />}
          emphasis
          className="border-primary/20 bg-card shadow-sm"
        />
        <StatTile
          label="Rata-rata / Entri"
          value={compactRupiah(analytics.averageEntry30)}
          title={formatRupiah(analytics.averageEntry30)}
          hint={`${formatNumber(analytics.entries30)} entri maintenance 30 hari`}
          icon={<ReceiptText />}
          className="border-border/70 bg-card shadow-sm"
        />
        <StatTile
          label="Biaya Perbaikan · 6 Bulan"
          value={compactRupiah(analytics.cost6mTotal)}
          title={formatRupiah(analytics.cost6mTotal)}
          hint={`${formatNumber(analytics.entries6m)} entri maintenance`}
          icon={<BarChart3 />}
          className="border-border/70 bg-card shadow-sm"
        />
        <StatTile
          label="Armada Tersedia"
          value={formatNumber(analytics.availableCount)}
          hint={`dari ${formatNumber(analytics.totalUnits)} unit terdaftar`}
          icon={<Truck />}
          className="border-border/70 bg-card shadow-sm"
        />
      </section>

      {/* TREN BIAYA + OPERASIONAL PENGIRIMAN */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
      <Card className="overflow-hidden border-border/70 gap-3 py-4 shadow-sm sm:gap-4 sm:py-5 lg:col-span-7 xl:col-span-8">
        <CardHeader className="flex flex-row items-start gap-2.5 space-y-0 sm:gap-3 pb-1">
          <CardHeaderBadge icon={<TrendingUp className="h-4 w-4" />} />
          <div>
            <CardTitle>Tren Biaya Perbaikan</CardTitle>
            <CardDescription>3 bulan terakhir</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {analytics.trend.length > 0 ? (
            <>
              <Suspense
                fallback={<Skeleton className="h-[190px] w-full rounded-md sm:h-[220px] lg:h-[210px]" />}
              >
                <LazyCostChart data={analytics.trend} />
              </Suspense>
              <dl className="mt-3 grid gap-2.5 border-t pt-3 sm:mt-4 sm:gap-4 sm:pt-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Total 3 bulan
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                    {formatRupiah(analytics.trendTotal)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Rata-rata harian
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                    {formatRupiah(analytics.trendAverage)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Hari terbesar
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                    {analytics.peak ? formatRupiah(analytics.peak.cost) : "—"}
                    {analytics.peak && (
                      <span className="ml-1.5 font-sans font-normal text-muted-foreground">
                        · {analytics.peak.displayDate}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="flex h-[190px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground sm:h-[220px] lg:h-[210px]">
              Belum ada data pengeluaran dalam 3 bulan terakhir.
            </div>
          )}
        </CardContent>
      </Card>

        <Card className="overflow-hidden border-border/70 gap-3 py-4 shadow-sm sm:gap-4 sm:py-5 lg:col-span-5 xl:col-span-4">
          <CardHeader className="flex flex-row items-start gap-2.5 space-y-0 sm:gap-3 pb-2">
            <CardHeaderBadge icon={<PackageCheck className="h-4 w-4" />} />
            <div>
              <CardTitle>Operasional Pengiriman</CardTitle>
              <CardDescription>Freight order 30 hari terakhir.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {outboundError ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                Gagal memuat data pengiriman.
              </p>
            ) : analytics.outTotal === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                Belum ada data pengiriman.
              </p>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Sedang berjalan
                    </p>
                    <p className="mt-1 text-xl font-semibold leading-none tabular-nums sm:text-2xl">
                      {formatNumber(analytics.outBerjalan)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-border bg-muted/30"
                  >
                    {formatNumber(analytics.outTotal)} FO
                  </Badge>
                </div>

                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {analytics.outSelesai > 0 && (
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(analytics.outSelesai / analytics.outTotal) * 100}%` }}
                      title={`Selesai: ${analytics.outSelesai}`}
                    />
                  )}
                  {analytics.outBerjalan > 0 && (
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${(analytics.outBerjalan / analytics.outTotal) * 100}%` }}
                      title={`Berjalan: ${analytics.outBerjalan}`}
                    />
                  )}
                  {analytics.outMenunggu > 0 && (
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${(analytics.outMenunggu / analytics.outTotal) * 100}%` }}
                      title={`Menunggu: ${analytics.outMenunggu}`}
                    />
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  {[
                    { label: "Selesai", count: analytics.outSelesai, dot: "bg-emerald-500" },
                    { label: "Berjalan", count: analytics.outBerjalan, dot: "bg-amber-500" },
                    { label: "Menunggu", count: analytics.outMenunggu, dot: "bg-sky-500" },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className={cn("h-1.5 w-1.5 rounded-full", row.dot)} />
                        {row.label}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatNumber(row.count)}
                      </span>
                    </div>
                  ))}
                </div>

                <dl className="mt-auto space-y-1.5 border-t pt-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Rata-rata durasi</dt>
                    <dd className="font-mono tabular-nums">
                      {formatDuration(analytics.outAverageDuration)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Durasi terlama</dt>
                    <dd className="font-mono tabular-nums">
                      {formatDuration(analytics.outLongestDuration)}
                    </dd>
                  </div>
                </dl>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full justify-between text-muted-foreground hover:text-foreground"
                  onClick={() => onNavigate?.("pengiriman")}
                >
                  Buka Pengiriman
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PERLU TINDAKAN + SISA KIRIMAN — dua panel yang butuh perhatian,
          berbagi satu baris agar dashboard tidak memanjang tanpa guna. */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
        <Card className="overflow-hidden border-border/70 gap-3 py-4 shadow-sm sm:gap-4 sm:py-5 lg:col-span-7 xl:col-span-8">
          <CardHeader className="flex flex-row items-start justify-between gap-2.5 space-y-0 pb-2 sm:gap-4">
            <div className="flex items-start gap-3">
              <CardHeaderBadge icon={<ListChecks className="h-4 w-4" />} />
              <div>
                <CardTitle>Perlu Tindakan Segera</CardTitle>
                <CardDescription>
                  Terlewat jadwal atau mendekati batas tanggal / odometer.
                </CardDescription>
              </div>
            </div>
            {analytics.urgentTotal > 0 && (
              <Badge
                variant="outline"
                className="shrink-0 border-destructive/35 bg-destructive/10 text-destructive"
              >
                {analytics.urgentTotal}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {analytics.urgent.length > 0 ? (
              <div className="space-y-2">
                {analytics.urgent.map(({ equipment, status }) => (
                  <div
                    key={String(equipment.id ?? equipment.equipment_id)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border py-2 pl-2.5 pr-3 transition-colors hover:bg-muted/30 sm:gap-4 sm:py-2.5 sm:pl-3 sm:pr-3.5 lg:py-2",
                      status.tone.accent,
                      status.id === "overdue"
                        ? "border-l-2 border-l-destructive bg-destructive/[0.04] hover:bg-destructive/[0.07]"
                        : "border-l-2 border-l-amber-500 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium leading-none">
                          {equipment.equipment_id}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("gap-1.5", status.tone.badge)}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-[1px]",
                              status.tone.dot,
                            )}
                          />
                          {status.label}
                        </Badge>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {equipment.license_plate || "—"}
                        {equipment.description
                          ? ` · ${equipment.description}`
                          : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          status.id === "overdue"
                            ? "text-destructive"
                            : "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {remainingDaysLabel(status.remainingDays)}
                      </div>
                      <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {remainingKmLabel(status.remainingKm)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
                <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium">
                  Semua unit dalam jadwal aman
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 sm:mt-4 sm:gap-3 sm:pt-4">
              <p className="text-xs text-muted-foreground">
                {analytics.urgentTotal > 0
                  ? `${analytics.urgentTotal} unit perlu perhatian`
                  : "Tidak ada tindakan mendesak"}
                {analytics.withoutLog > 0 &&
                  ` · ${analytics.withoutLog} unit belum punya jadwal`}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onNavigate?.("monitoring")}
              >
                Buka Monitoring Servis
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden border-border/70 gap-3 py-4 shadow-sm sm:gap-4 sm:py-5 lg:col-span-5 xl:col-span-4">
          <CardHeader className="flex flex-row items-start gap-2.5 space-y-0 pb-2 sm:gap-3">
            <CardHeaderBadge icon={<FileText className="h-4 w-4" />} />
            <div>
              <CardTitle>Sisa Kiriman (SKR)</CardTitle>
              <CardDescription>Dokumen yang belum tuntas.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {skrError ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                Gagal memuat data SKR.
              </p>
            ) : analytics.skrDocs === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                Belum ada data sisa kiriman.
              </p>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Dokumen</p>
                    <p className="mt-1 text-xl font-semibold leading-none tabular-nums sm:text-2xl">
                      {formatNumber(analytics.skrDocs)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-border bg-muted/30"
                  >
                    {formatNumber(analytics.skrStores)} toko
                  </Badge>
                </div>

                <dl className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Qty baris</dt>
                    <dd className="font-mono tabular-nums">
                      {formatNumber(analytics.skrQty)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Nilai</dt>
                    <dd
                      className="font-mono tabular-nums"
                      title={formatRupiah(analytics.skrNilai)}
                    >
                      {compactRupiah(analytics.skrNilai)}
                    </dd>
                  </div>
                </dl>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-auto w-full justify-between text-muted-foreground hover:text-foreground"
                  onClick={() => onNavigate?.("skr")}
                >
                  Buka SKR
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PERINGKAT BIAYA PER UNIT — 6 bulan (Top 5 / Bottom 5).
          Diletakkan setelah panel tindakan supaya hal yang butuh
          keputusan tidak terkubur di bawah grafik referensi. */}
      <Card className="overflow-hidden border-border/70 gap-3 py-4 shadow-sm sm:gap-4 sm:py-5">
        <CardHeader className="flex flex-row items-start justify-between gap-2.5 space-y-0 pb-2 sm:gap-4">
          <div className="flex items-start gap-3">
            <CardHeaderBadge icon={<BarChart3 className="h-4 w-4" />} />
            <div>
              <CardTitle>Peringkat Biaya Unit</CardTitle>
              <CardDescription>
                6 bulan terakhir · top 5 & bottom 5
              </CardDescription>
            </div>
          </div>
          {analytics.top5[0] && (
            <Badge
              variant="outline"
              title={`Paling boros: ${analytics.top5[0].label}`}
              className="hidden shrink-0 items-center gap-1.5 border-primary/25 bg-primary/10 sm:inline-flex"
            >
              <Truck className="h-3 w-3" />
              {analytics.top5[0].label}
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums">
                {compactRupiah(analytics.top5[0].totalCost)}
              </span>
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={<Skeleton className="h-[130px] w-full rounded-md sm:h-[150px] lg:h-[130px]" />}
          >
            <LazyUnitCostRankingChart
              top5={analytics.top5}
              bottom5={analytics.bottom5}
            />
          </Suspense>
        </CardContent>
      </Card>

    </div>
  );
}

export const DashboardView = memo(DashboardViewImpl);

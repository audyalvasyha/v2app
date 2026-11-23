"use client";

import React, { memo, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeatherBanner } from "@/components/organisms/weather-banner";
import { supabase } from "@/utils/supabase";
import {
  compactRupiah,
  formatNumber,
  formatRupiah,
  startOfZonedDay,
  APP_TIMEZONE,
} from "@/lib/format";
import {
  evaluateServiceStatus,
  remainingDaysLabel,
  remainingKmLabel,
  type ServiceScheduleStatus,
} from "@/lib/service-status";
import {
  durationMinutesFromTimestamps,
  elapsedHoursSince,
  formatDuration,
  isOutboundLate,
  outboundStatus,
} from "@/lib/outbound-status";
import {
  isEscalated,
  readLocalTasks,
  sortTasks,
  ticketAgeDays,
  type Task,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";
import type { View } from "@/components/templates/dashboard-layout";
import { AlertTriangle, ArrowRight, CheckCircle2, MessageSquareText, Wrench } from "lucide-react";

interface DashboardViewProps {
  equipments: any[];
  histories: any[];
  serviceLogs: any[];
  outbounds: any[];
  skrDetails: any[];
  skrError?: string | null;
  outboundError?: string | null;
  isLoading: boolean;
  onNavigate?: (view: View) => void;
}

const DAY_MS = 86_400_000;

/**
 * Dashboard ini sengaja menjawab tiga pertanyaan operasional:
 * 1. Armada siap tidak?
 * 2. Apa yang perlu ditindak hari ini?
 * 3. Pengiriman dan sisa kiriman aman tidak?
 *
 * Tren biaya tiga bulan tetap ringkas di bagian bawah; grafik dan peringkat
 * detail lainnya tetap ada di menu Analisa.
 */
const MaintenanceCostTrendChart = dynamic(
  () =>
    import("@/components/molecules/charts").then(
      (m) => m.MaintenanceCostTrendChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <div className="space-y-1.5 text-right">
            <Skeleton className="ml-auto h-2.5 w-20" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-[360px] w-full rounded-lg sm:h-[400px]" />
      </div>
    ),
  },
);

function DashboardHeader({ onNavigate }: { onNavigate?: (view: View) => void }) {
  const today = useMemo(() => new Date(), []);
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Dashboard
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Operasional hari ini ·{" "}
          {today.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: APP_TIMEZONE,
          })}
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 bg-card sm:w-auto"
          onClick={() => onNavigate?.("tugas")}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          Papan komplain
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 bg-card sm:w-auto"
          onClick={() => onNavigate?.("monitoring")}
        >
          <Wrench className="h-3.5 w-3.5" />
          Servis
        </Button>
      </div>
    </header>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:gap-4" role="status" aria-busy="true">
      <div className="rounded-xl border bg-card px-4 py-3">
        <Skeleton className="h-4 w-28" />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <Skeleton className="h-5 w-36" />
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-4 h-16 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <div className="space-y-1.5 text-right">
            <Skeleton className="ml-auto h-2.5 w-20" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        </div>
        <Skeleton className="mt-3 h-[360px] w-full rounded-lg sm:h-[400px]" />
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2.5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function MetricCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warning" | "success";
}) {
  return (
    <div className="bg-card px-3 py-2.5 sm:px-4 sm:py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate text-[17px] font-semibold leading-tight tabular-nums sm:text-lg",
          tone === "danger"
            ? "text-destructive"
            : tone === "warning"
              ? "text-amber-700 dark:text-amber-400"
              : tone === "success"
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-foreground",
        )}
      >
        {value}
      </dd>
      {hint && <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function FleetStatusCard({
  total,
  available,
  inUse,
  maintenance,
  other,
}: {
  total: number;
  available: number;
  inUse: number;
  maintenance: number;
  other: number;
}) {
  return (
    <Card className="h-full overflow-hidden gap-0 py-0 shadow-none">
      <SectionHeader
        title="Armada hari ini"
        description="Status unit saat ini, bukan hasil filter."
        action={
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatNumber(total)} unit
          </span>
        }
      />
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <MetricCell label="Total" value={formatNumber(total)} />
        <MetricCell
          label="Tersedia"
          value={formatNumber(available)}
          tone="success"
          hint={total > 0 ? `${Math.round((available / total) * 100)}% armada` : undefined}
        />
        <MetricCell
          label="Dipakai"
          value={formatNumber(inUse)}
          tone="warning"
          hint="sedang beroperasi"
        />
        <MetricCell
          label="Maintenance"
          value={formatNumber(maintenance)}
          tone={maintenance > 0 ? "danger" : undefined}
          hint="tidak siap jalan"
        />
      </dl>
      {other > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {formatNumber(other)} unit berstatus lain / belum diketahui.
        </p>
      )}
    </Card>
  );
}

function AttentionRow({
  label,
  count,
  detail,
  onClick,
  loading,
}: {
  label: string;
  count: number;
  detail: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 bg-card px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            count > 0 ? "font-semibold text-destructive" : "text-muted-foreground",
          )}
        >
          {loading ? "…" : formatNumber(count)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </button>
  );
}

interface UrgentUnit {
  equipment: any;
  status: ServiceScheduleStatus;
}

function AttentionCard({
  overdue,
  warning,
  withoutLog,
  urgent,
  lateTrips,
  openTasks,
  escalatedCount,
  oldestTaskDays,
  tasksLoading,
  tasksUnavailable,
  onNavigate,
}: {
  overdue: number;
  warning: number;
  withoutLog: number;
  urgent: UrgentUnit[];
  lateTrips: { row: any; hours: number }[];
  openTasks: Task[];
  escalatedCount: number;
  oldestTaskDays: number | null;
  tasksLoading: boolean;
  tasksUnavailable: boolean;
  onNavigate?: (view: View) => void;
}) {
  const serviceCount = overdue + warning + withoutLog;
  const total = serviceCount + openTasks.length + lateTrips.length;
  const serviceParts = [
    overdue > 0 ? `${formatNumber(overdue)} terlewat` : null,
    warning > 0 ? `${formatNumber(warning)} segera` : null,
    withoutLog > 0 ? `${formatNumber(withoutLog)} tanpa jadwal` : null,
  ].filter(Boolean);
  const serviceDetail =
    serviceParts.length > 0 ? serviceParts.join(" · ") : "Semua unit dalam jadwal";
  const complaintDetail = tasksLoading
    ? "Memuat komplain…"
    : tasksUnavailable
      ? "Papan komplain belum tersambung"
      : openTasks.length > 0
        ? `${formatNumber(escalatedCount)} eskalasi${oldestTaskDays != null ? ` · tertua ${Math.floor(oldestTaskDays)} hari` : ""}`
        : "Tidak ada komplain terbuka";
  const lateDetail =
    lateTrips.length > 0
      ? `${formatNumber(lateTrips.length)} trip > 24 jam${lateTrips[0]?.row?.no_polisi ? ` · ${lateTrips[0].row.no_polisi}` : ""}`
      : "Semua trip sudah kembali";

  return (
    <Card className="flex h-full flex-col overflow-hidden gap-0 py-0 shadow-none">
      <SectionHeader
        title="Perlu tindakan"
        description="Hal yang paling mendesak hari ini."
        action={
          <Badge
            variant="outline"
            className={cn(
              "font-mono tabular-nums",
              total > 0
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            )}
          >
            {total > 0 ? <AlertTriangle /> : <CheckCircle2 />}
            {total > 0 ? `${formatNumber(total)} item` : "Aman"}
          </Badge>
        }
      />

      <div className="grid gap-px bg-border sm:grid-cols-3">
        <AttentionRow
          label="Servis"
          count={serviceCount}
          detail={serviceDetail}
          onClick={() => onNavigate?.("monitoring")}
        />
        <AttentionRow
          label="Komplain"
          count={openTasks.length}
          detail={complaintDetail}
          loading={tasksLoading}
          onClick={() => onNavigate?.("tugas")}
        />
        <AttentionRow
          label="Pengiriman"
          count={lateTrips.length}
          detail={lateDetail}
          onClick={() => onNavigate?.("pengiriman")}
        />
      </div>

      <div className="mt-auto border-t px-4 py-2.5">
        {urgent.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted-foreground">
              Prioritas servis
            </p>
            <div className="mt-1.5 grid gap-1 sm:grid-cols-3">
              {urgent.slice(0, 3).map(({ equipment, status }) => (
                <button
                  key={String(equipment.id ?? equipment.equipment_id)}
                  type="button"
                  onClick={() => onNavigate?.("monitoring")}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        status.id === "overdue" ? "bg-destructive" : "bg-amber-500",
                      )}
                    />
                    <span className="truncate text-xs font-medium">
                      {equipment.equipment_id}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {equipment.license_plate || "—"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-right text-[11px] tabular-nums sm:text-xs",
                      status.id === "overdue"
                        ? "text-destructive"
                        : "text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {remainingDaysLabel(status.remainingDays)}
                    {status.remainingKm != null && (
                      <span className="hidden sm:inline">
                        {" · "}{remainingKmLabel(status.remainingKm)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <p className={cn("text-[11px] text-muted-foreground", urgent.length > 0 && "mt-2")}>
          {serviceCount > 0 ? "Buka menu untuk melihat seluruh unit." : "Tidak ada unit yang perlu servis mendesak."}
        </p>
      </div>
    </Card>
  );
}

function DeliveryTodayCard({
  waiting,
  running,
  completedToday,
  late,
  averageDuration,
  longestDuration,
  onNavigate,
}: {
  waiting: number;
  running: number;
  completedToday: number;
  late: number;
  averageDuration: number | null;
  longestDuration: number | null;
  onNavigate?: (view: View) => void;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden gap-0 py-0 shadow-none">
      <SectionHeader
        title="Pengiriman hari ini"
        description="Antrean dan trip yang sedang berjalan."
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => onNavigate?.("pengiriman")}
          >
            Buka
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <MetricCell label="Menunggu" value={formatNumber(waiting)} />
        <MetricCell
          label="Berjalan"
          value={formatNumber(running)}
          tone={running > 0 ? "warning" : undefined}
        />
        <MetricCell
          label="Selesai hari ini"
          value={formatNumber(completedToday)}
          tone={completedToday > 0 ? "success" : undefined}
        />
        <MetricCell
          label="Terlambat"
          value={formatNumber(late)}
          tone={late > 0 ? "danger" : undefined}
          hint="> 24 jam"
        />
      </dl>
      <div className="mt-auto border-t px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Rata-rata 30 hari{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatDuration(averageDuration)}
            </span>
          </span>
          <span>
            Terlama 30 hari{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatDuration(longestDuration)}
            </span>
          </span>
        </div>
      </div>
    </Card>
  );
}

function SkrCard({
  docs,
  qty,
  value,
  stores,
  oldestDays,
  error,
  onNavigate,
}: {
  docs: number;
  qty: number;
  value: number;
  stores: number;
  oldestDays: number | null;
  error?: string | null;
  onNavigate?: (view: View) => void;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden gap-0 py-0 shadow-none">
      <SectionHeader
        title="Sisa kiriman"
        description="Dokumen SKR yang belum tuntas."
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => onNavigate?.("skr")}
          >
            Buka
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />
      {error && docs === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground">
          Data SKR belum bisa dimuat.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-px bg-border">
            <MetricCell label="Dokumen" value={formatNumber(docs)} />
            <MetricCell label="Qty" value={formatNumber(qty)} />
            <div className="bg-card px-3 py-2.5 sm:px-4 sm:py-3">
              <dt className="text-xs text-muted-foreground">Nilai</dt>
              <dd
                className="mt-1 truncate text-[17px] font-semibold leading-tight tabular-nums sm:text-lg"
                title={formatRupiah(value)}
              >
                {compactRupiah(value)}
              </dd>
            </div>
          </dl>
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              <span className="font-mono tabular-nums text-foreground">
                {formatNumber(stores)}
              </span>{" "}
              toko
            </span>
            <span>
              Dokumen tertua{" "}
              <span className="font-mono tabular-nums text-foreground">
                {oldestDays != null ? `${formatNumber(oldestDays)} hari` : "—"}
              </span>
            </span>
          </div>
          {error && (
            <p className="border-t px-4 py-1.5 text-[11px] text-muted-foreground">
              Data mungkin tertunda.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function CostCard({
  cost30,
  averageEntry30,
  costPerUnit30,
  entries30,
  delta30,
  onNavigate,
}: {
  cost30: number;
  averageEntry30: number;
  costPerUnit30: number;
  entries30: number;
  delta30: number | null;
  onNavigate?: (view: View) => void;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden gap-0 py-0 shadow-none">
      <SectionHeader
        title="Biaya perbaikan"
        description="30 hari terakhir."
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => onNavigate?.("maintenance")}
          >
            Riwayat
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        <MetricCell
          label="Total"
          value={compactRupiah(cost30)}
          hint={delta30 != null ? `${delta30 > 0 ? "+" : delta30 < 0 ? "−" : ""}${Math.abs(delta30).toFixed(1)}% vs 30 hari lalu` : undefined}
          tone={delta30 != null ? (delta30 > 0 ? "danger" : delta30 < 0 ? "success" : undefined) : undefined}
        />
        <MetricCell
          label="Entri"
          value={formatNumber(entries30)}
          hint="maintenance"
        />
        <MetricCell
          label="Rata-rata"
          value={compactRupiah(averageEntry30)}
          hint="per entri"
        />
      </dl>
      <div className="mt-auto flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>Biaya per unit armada</span>
        <span className="font-mono tabular-nums text-foreground">
          {compactRupiah(costPerUnit30)}
        </span>
      </div>
    </Card>
  );
}

function DashboardViewImpl(props: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-3 pb-2 sm:gap-4">
      <DashboardHeader onNavigate={props.onNavigate} />
      {props.isLoading ? (
        <DashboardSkeleton />
      ) : (
        <DashboardContent {...props} />
      )}
      <WeatherBanner onOpenDetail={() => props.onNavigate?.("weather")} />
    </div>
  );
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
}: DashboardViewProps) {
  const today = useMemo(() => new Date(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksUnavailable, setTasksUnavailable] = useState(false);

  // Komplain adalah sinyal harian. Query-nya kecil dan hanya hidup saat
  // Dashboard terbuka; bila tabel belum dibuat, pakai mode lokal yang sama
  // dengan Complaint Board.
  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    supabase
      .from("tasks")
      .select("id,title,status,priority,customer_no,license_plate,delivery_no,freight_order,created_at")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          const localTasks = readLocalTasks();
          setTasks(localTasks);
          setTasksUnavailable(localTasks.length === 0);
        } else {
          setTasks((data ?? []) as Task[]);
          setTasksUnavailable(false);
        }
        setTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const analytics = useMemo(() => {
    const todayStart = startOfZonedDay(today);
    const cutoff30 = todayStart - 30 * DAY_MS;
    const cutoff60 = todayStart - 60 * DAY_MS;

    let total = 0;
    let available = 0;
    let inUse = 0;
    let maintenance = 0;
    let other = 0;

    for (const eq of equipments) {
      total += 1;
      const status = String(eq.status ?? "").trim().toLowerCase();
      if (status === "available") available += 1;
      else if (status === "in use") inUse += 1;
      else if (status === "maintenance") maintenance += 1;
      else other += 1;
    }

    const latestLogByUnit = new Map<string, any>();
    for (const log of serviceLogs) {
      const key = String(log.equipment_id ?? "").trim();
      if (!key) continue;
      const existing = latestLogByUnit.get(key);
      if (
        !existing ||
        new Date(log.service_date ?? 0).getTime() >
          new Date(existing.service_date ?? 0).getTime()
      ) {
        latestLogByUnit.set(key, log);
      }
    }

    let overdue = 0;
    let warning = 0;
    let withoutLog = 0;
    const urgent: UrgentUnit[] = [];
    for (const eq of equipments) {
      const status = evaluateServiceStatus(
        eq,
        latestLogByUnit.get(String(eq.equipment_id ?? "").trim()) ?? null,
        today,
      );
      if (status.id === "overdue") overdue += 1;
      else if (status.id === "warning") warning += 1;
      else if (status.id === "none") withoutLog += 1;
      if (status.id === "overdue" || status.id === "warning") {
        urgent.push({ equipment: eq, status });
      }
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

    let waiting = 0;
    let running = 0;
    let completedToday = 0;
    let late = 0;
    let completed30 = 0;
    let duration30Total = 0;
    let longest30 = 0;
    const lateTrips: { row: any; hours: number }[] = [];

    for (const row of outbounds) {
      const info = outboundStatus(row.jam_out, row.jam_in);
      if (info.status === "menunggu") waiting += 1;
      if (info.status === "berjalan") running += 1;
      if (isOutboundLate(row.jam_out, row.jam_in)) {
        late += 1;
        lateTrips.push({
          row,
          hours: elapsedHoursSince(row.jam_out) ?? 0,
        });
      }
      if (row.jam_in) {
        const duration = durationMinutesFromTimestamps(row.jam_out, row.jam_in);
        if (duration != null) {
          const inDay = startOfZonedDay(row.jam_in);
          if (inDay === todayStart) completedToday += 1;
          if (inDay >= cutoff30) {
            completed30 += 1;
            duration30Total += duration;
            if (duration > longest30) longest30 = duration;
          }
        }
      }
    }
    lateTrips.sort((a, b) => b.hours - a.hours);

    let cost30 = 0;
    let costPrev30 = 0;
    let entries30 = 0;
    for (const history of histories) {
      const time = new Date(history.tanggal).getTime();
      if (Number.isNaN(time)) continue;
      const cost = Number(history.jumlah_harga) || 0;
      if (time >= cutoff30) {
        cost30 += cost;
        entries30 += 1;
      } else if (time >= cutoff60) {
        costPrev30 += cost;
      }
    }

    let skrQty = 0;
    let skrNilai = 0;
    let skrOldest: number | null = null;
    const skrStores = new Set<string>();
    for (const row of skrDetails) {
      skrQty += Number(row.qty) || 0;
      skrNilai += Number(row.nilai) || 0;
      if (row.customer_id != null && String(row.customer_id).trim()) {
        skrStores.add(String(row.customer_id).trim());
      }
      const podDay = startOfZonedDay(row.pod_d);
      if (podDay > 0 && (skrOldest == null || podDay < skrOldest)) {
        skrOldest = podDay;
      }
    }

    return {
      total,
      available,
      inUse,
      maintenance,
      other,
      overdue,
      warning,
      withoutLog,
      urgent,
      waiting,
      running,
      completedToday,
      late,
      lateTrips,
      averageDuration30: completed30 > 0 ? duration30Total / completed30 : null,
      longestDuration30: longest30 > 0 ? longest30 : null,
      cost30,
      entries30,
      averageEntry30: entries30 > 0 ? cost30 / entries30 : 0,
      costPerUnit30: total > 0 ? cost30 / total : 0,
      delta30:
        costPrev30 > 0 ? ((cost30 - costPrev30) / costPrev30) * 100 : null,
      skrDocs: skrDetails.length,
      skrQty,
      skrNilai,
      skrStores: skrStores.size,
      skrOldestDays:
        skrOldest != null ? Math.max(0, Math.floor((todayStart - skrOldest) / DAY_MS)) : null,
    };
  }, [equipments, histories, serviceLogs, outbounds, skrDetails, today]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done").sort(sortTasks),
    [tasks],
  );
  const escalatedCount = useMemo(
    () => openTasks.filter((task) => isEscalated(task)).length,
    [openTasks],
  );
  const oldestTaskDays = useMemo(
    () =>
      openTasks.length > 0
        ? Math.max(...openTasks.map((task) => ticketAgeDays(task)))
        : null,
    [openTasks],
  );

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <FleetStatusCard
        total={analytics.total}
        available={analytics.available}
        inUse={analytics.inUse}
        maintenance={analytics.maintenance}
        other={analytics.other}
      />

      <AttentionCard
        overdue={analytics.overdue}
        warning={analytics.warning}
        withoutLog={analytics.withoutLog}
        urgent={analytics.urgent}
        lateTrips={analytics.lateTrips}
        openTasks={openTasks}
        escalatedCount={escalatedCount}
        oldestTaskDays={oldestTaskDays}
        tasksLoading={tasksLoading}
        tasksUnavailable={tasksUnavailable}
        onNavigate={onNavigate}
      />

      <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="min-w-0">
          <DeliveryTodayCard
            waiting={analytics.waiting}
            running={analytics.running}
            completedToday={analytics.completedToday}
            late={analytics.late}
            averageDuration={analytics.averageDuration30}
            longestDuration={analytics.longestDuration30}
            onNavigate={onNavigate}
          />
        </div>
        <div className="min-w-0">
          <SkrCard
            docs={analytics.skrDocs}
            qty={analytics.skrQty}
            value={analytics.skrNilai}
            stores={analytics.skrStores}
            oldestDays={analytics.skrOldestDays}
            error={skrError}
            onNavigate={onNavigate}
          />
        </div>
        <div className="min-w-0">
          <CostCard
            cost30={analytics.cost30}
            averageEntry30={analytics.averageEntry30}
            costPerUnit30={analytics.costPerUnit30}
            entries30={analytics.entries30}
            delta30={analytics.delta30}
            onNavigate={onNavigate}
          />
        </div>
      </div>

      <Card className="shrink-0 gap-0 py-0 shadow-none">
        <div className="min-h-[460px] p-4 sm:p-5">
          <MaintenanceCostTrendChart histories={histories} />
        </div>
      </Card>

      {outboundError && (
        <p className="text-xs text-muted-foreground">
          Data pengiriman belum bisa dimuat.
        </p>
      )}
    </div>
  );
}

export const DashboardView = memo(DashboardViewImpl);

import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton per bentuk halaman.
 *
 * Satu skeleton generik tidak cukup: toolbar, jumlah kolom, kartu ringkasan,
 * panel peta, dan papan kanban tiap menu berbeda. Komponen di bawah meniru
 * kerangka menu aslinya supaya isi tidak melompat saat data selesai dimuat.
 */

function LoadingLabel({ text = "Memuat data…" }: { text?: string }) {
  return <span className="sr-only">{text}</span>
}

/** Baris chip filter + select yang dipakai hampir semua menu tabel. */
function FilterBarSkeleton({
  chips = 5,
  selectWidths = ["180px", "112px"],
}: {
  chips?: number
  selectWidths?: string[]
}) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: chips }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-7 rounded-md"
            style={{ width: i === 0 ? 64 : 76 }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="hidden h-3 w-8 sm:block" />
        {selectWidths.map((width, i) => (
          <Skeleton
            key={i}
            className="h-8 rounded-md"
            style={{ width }}
          />
        ))}
      </div>
    </div>
  )
}

function TableHeaderSkeleton({ columns }: { columns: string[] }) {
  return (
    <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
      {columns.map((width, i) => (
        <Skeleton
          key={i}
          className="h-3 shrink-0"
          style={{ width, marginLeft: i === columns.length - 2 ? "auto" : undefined }}
        />
      ))}
    </div>
  )
}

/** Equipment: filter status, dua select, tabel unit dengan riwayat biaya. */
export function EquipmentPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat daftar equipment…" />
      <FilterBarSkeleton chips={5} selectWidths={["190px", "112px"]} />
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <TableHeaderSkeleton columns={["16px", "90px", "96px", "80px", "120px", "72px"]} />
        <div className="divide-y divide-border/60">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-4 shrink-0" />
              <div className="w-[26%] min-w-28 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32 max-w-full" />
              </div>
              <div className="hidden w-[16%] min-w-24 space-y-1.5 md:block">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="ml-auto space-y-1.5 text-right">
                <Skeleton className="ml-auto h-3.5 w-16" />
                <Skeleton className="ml-auto h-3 w-24" />
              </div>
              <Skeleton className="hidden h-8 w-28 shrink-0 rounded-md lg:block" />
              <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Histories: chip rentang, urutan, jumlah baris, tabel berkelompok bulan. */
export function MaintenancePageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat riwayat maintenance…" />
      <FilterBarSkeleton chips={4} selectWidths={["170px", "112px"]} />
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <TableHeaderSkeleton columns={["20px", "72px", "72px", "110px", "64px"]} />
        <div className="divide-y divide-border/60">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              {(i === 0 || i === 4) && (
                <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              )}
              <div className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-3 w-4 shrink-0" />
                <Skeleton className="h-3.5 w-20 shrink-0" />
                <Skeleton className="h-3.5 w-20 shrink-0" />
                <Skeleton className="h-3.5 w-[34%] min-w-28" />
                <Skeleton className="ml-auto h-3.5 w-20 shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Monitoring servis: chip status, select urutan, panel daftar unit. */
export function MonitoringPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat monitoring servis…" />
      <FilterBarSkeleton chips={5} selectWidths={["180px"]} />
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <TableHeaderSkeleton columns={["36px", "76px", "64px", "88px", "140px", "52px"]} />
        <div className="divide-y divide-border/60">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
              <div className="w-[22%] min-w-24 space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="hidden h-6 w-20 shrink-0 rounded-full md:block" />
              <Skeleton className="hidden h-3.5 w-24 shrink-0 lg:block" />
              <div className="min-w-32 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <Skeleton className="ml-auto h-3.5 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Pengiriman: ringkasan ritase, toolbar tanggal, chip status, tabel 8 kolom. */
export function OutboundPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat pengiriman…" />
      <div className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Skeleton className="h-9 w-full max-w-[290px] rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-[150px] rounded-md" />
          <Skeleton className="h-8 w-[112px] rounded-md" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-md" />
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <div className="min-w-[820px]">
          <TableHeaderSkeleton columns={["24px", "96px", "80px", "72px", "72px", "88px", "64px", "64px"]} />
          <div className="divide-y divide-border/60">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-3 w-4 shrink-0" />
                <Skeleton className="h-3.5 w-24 shrink-0" />
                <Skeleton className="h-3.5 w-20 shrink-0" />
                <Skeleton className="h-3.5 w-14 shrink-0" />
                <Skeleton className="h-3.5 w-14 shrink-0" />
                <Skeleton className="h-4 w-20 shrink-0" />
                <Skeleton className="h-3.5 w-14 shrink-0" />
                <Skeleton className="ml-auto h-6 w-16 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** SKR: toolbar tanggal, chip kategori, kartu tren dua panel, lalu detail customer. */
export function SkrPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat data SKR…" />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Skeleton className="h-9 w-full max-w-[290px] rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-md" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="h-7 w-12 rounded-md" />
            <Skeleton className="h-7 w-14 rounded-md" />
          </div>
        </div>
        <div className="grid lg:grid-cols-2">
          <div className="border-b p-4 lg:border-b-0 lg:border-r">
            <div className="grid gap-px overflow-hidden bg-border sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 bg-card px-4 py-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-3 h-[230px] w-full rounded-md" />
          </div>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-[230px] w-full rounded-md" />
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-border/60">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-6 shrink-0" />
              <Skeleton className="h-3.5 w-40 max-w-[35%]" />
              <Skeleton className="ml-auto h-3.5 w-16" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Complaint Board: ringkasan + filter prioritas di atas empat kolom kanban. */
export function BoardPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat papan tugas…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-3 w-36" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-md" />
            ))}
          </div>
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col rounded-xl border border-border/60 bg-background p-2.5">
            <div className="mb-2 flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-4" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: i === 3 ? 2 : 3 }).map((_, j) => (
                <div key={j} className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex items-center justify-between pt-1">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Analisa ban: toolbar ringkas, panel unit bermasalah 1/3, peta 2/3. */
export function BanPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat pemeriksaan ban…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-3 w-64 max-w-full" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="overflow-hidden rounded-xl border bg-card xl:col-span-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
            <div className="flex w-full gap-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-7 flex-1 rounded-md" />
              ))}
            </div>
          </div>
          <div className="divide-y divide-border/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-3">
                <Skeleton className="h-9 w-[3px] shrink-0 rounded-full" />
                <div className="w-28 space-y-1.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="hidden h-3 flex-1 md:block" />
                <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-3 xl:col-span-2"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-56 max-w-full rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <Skeleton className="h-[360px] w-full rounded-lg sm:h-[440px]" />
        </div>
      </div>
    </div>
  )
}

/** Cuaca: bar sumber data, grid 10 lokasi, lalu kartu detail. */
export function WeatherPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat perkiraan cuaca…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-3 w-64 max-w-full" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-[220px] w-full rounded-md" />
        <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Traffic: hero ringkasan, peta 3/4, panel rute 1/4, legenda. */
export function TrafficPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <LoadingLabel text="Memuat lalu lintas…" />
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="space-y-3 lg:col-span-3">
          <Skeleton className="h-[360px] w-full rounded-xl sm:h-[420px]" />
          <div className="flex flex-wrap items-center gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 lg:col-span-1">
          <Skeleton className="mb-3 h-4 w-40" />
          <div className="space-y-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** About: masthead, hero asimetris, daftar spesifikasi, dan grid cakupan. */
export function AboutPageSkeleton() {
  return (
    <div className="mx-auto w-full space-y-8 pb-16" role="status" aria-busy="true">
      <LoadingLabel text="Memuat halaman tentang aplikasi…" />
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-2 w-2" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="grid gap-10 md:grid-cols-12">
        <div className="space-y-4 md:col-span-7">
          <Skeleton className="h-14 w-full max-w-xl" />
          <Skeleton className="h-14 w-4/5 max-w-lg" />
          <Skeleton className="mt-4 h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-11/12 max-w-lg" />
          <Skeleton className="h-4 w-4/5 max-w-md" />
        </div>
        <div className="space-y-3 md:col-span-5">
          <div className="border-y border-border py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-6 py-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-8">
        <Skeleton className="h-3 w-24" />
        <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-px flex-1" />
              </div>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border pt-8">
        <Skeleton className="h-3 w-32" />
        <div className="mt-6 grid gap-8 md:grid-cols-12">
          <div className="flex min-w-0 items-start gap-5 md:col-span-5">
            <Skeleton className="h-24 w-24 shrink-0 rounded-lg md:h-28 md:w-28" />
            <div className="min-w-0 space-y-2 pt-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          </div>
          <div className="min-w-0 space-y-2 md:col-span-4">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="mt-4 h-3 w-2/3" />
          </div>
          <div className="min-w-0 space-y-3 md:col-span-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Dashboard: kepala, cuaca, hero kesiapan, KPI, lalu grid kartu analitik. */
export function DashboardPageSkeleton() {
  return (
    <div className="flex flex-col gap-4 pb-2 lg:gap-5" role="status" aria-busy="true">
      <LoadingLabel text="Memuat dashboard…" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-52" />
          <div className="flex gap-1.5">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        </div>
        <Skeleton className="mt-3 h-10 w-64" />
        <Skeleton className="mt-3 h-14 w-full rounded-lg" />
      </div>
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-9 w-56" />
        <Skeleton className="mt-4 h-2.5 w-full" />
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card px-4 py-3.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-32 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border bg-card p-5 lg:col-span-7 xl:col-span-8">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-2 h-3 w-56" />
          <Skeleton className="mt-4 h-[250px] w-full rounded-md" />
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5 lg:col-span-5 xl:col-span-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border bg-card p-5 lg:col-span-5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-3 h-3 w-56" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 lg:col-span-7">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-3 h-3 w-64" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        <div className="mt-4 grid gap-8 lg:grid-cols-2">
          <Skeleton className="h-[240px] w-full rounded-md" />
          <Skeleton className="h-[240px] w-full rounded-md" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border bg-card p-5 lg:col-span-7 xl:col-span-8">
          <Skeleton className="h-5 w-52" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5 lg:col-span-5 xl:col-span-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
    </div>
  )
}

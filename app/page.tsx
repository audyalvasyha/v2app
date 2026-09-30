"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useTheme } from "@/hooks/use-theme"
import { supabase } from "@/utils/supabase"
import { SearchBar, EquipmentFilters } from "@/components/search-bar"

import { DashboardLayout, type View } from "@/components/templates/dashboard-layout"
import { DashboardView } from "@/components/organisms/dashboard-view" // Import Dashboard Baru
import { EquipmentTable } from "@/components/organisms/equipment-table"
import { MaintenanceTable } from "@/components/organisms/maintenance-table"
import { ServiceMonitoringTable } from "@/components/organisms/service-monitoring-table"
import { AboutView } from "@/components/organisms/about-view"
import { SkrView } from "@/components/organisms/skr-view"
import { OutboundTable } from "@/components/organisms/outbound-table"
import { parseNilai, podDateToIso, type SkrDateBounds } from "@/lib/skr-status"
import { daysInMonth } from "@/lib/skr-analytics"
import { startOfZonedDayMonthsAgo, zonedParts } from "@/lib/format"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"

// Kolom minimal yang benar-benar dipakai UI — payload lebih kecil, query lebih cepat
const EQUIPMENT_COLS = "id,equipment_id,license_plate,description,company_code,construction_year,last_odometer,status"
const HISTORY_COLS = "id,tanggal,equipment_id,license_plate,nama_barang_atau_jasa,jumlah_harga"
const SERVICE_LOG_COLS = "equipment_id,service_date,next_service_date,next_service_odometer,odometer_at_service"
const OUTBOUND_COLS = "freight_order,no_polisi,jam_out,jam_in,created_at"
// View ringkasan hasil parsing di database (lihat README / SQL di bawah).
// Hanya 5 kolom ini yang dibutuhkan dashboard, sehingga payload jauh lebih kecil.
const SKR_VIEW = 'skr_ringkasan'
//_customer_id & delivery_number ikut diambil supaya dashboard bisa
//mengelompokkan sisa kiriman per toko dan menampilkan nomor dokumen
//(join ke tabel customers dilakukan di sisi aplikasi).
const SKR_VIEW_COLS = 'license_no,salesman,pod_reason,skr_base_unit,pod_d,qty,nilai,customer_id,delivery_number'

/**
 * Deteksi error yang membuat view `skr_ringkasan` tidak bisa dipakai, baik
 * karena belum dibuat maupun karena hak aksesnya belum diberikan. Pada kasus
 * tersebut aplikasi turun ke mode cadangan alih-alih menampilkan error.
 */
function isViewUnavailableError(message: string): boolean {
    const m = message.toLowerCase()
    const aboutView = m.includes('skr_ringkasan')
    if (!aboutView && !m.includes('view')) return false
    return (
        m.includes('schema cache') ||
        m.includes('does not exist') ||
        m.includes('permission denied') ||
        m.includes('not authorized') ||
        m.includes('insufficient privilege')
    )
}

const CACHE_KEY = "fleet-cache-v2"

interface FleetCache {
  equipments: any[]
  histories: any[]
  serviceLogs: any[]
}

function readCache(): FleetCache | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      !Array.isArray(parsed?.equipments) ||
      !Array.isArray(parsed?.histories) ||
      !Array.isArray(parsed?.serviceLogs)
    )
      return null
    return {
      equipments: parsed.equipments,
      histories: parsed.histories,
      serviceLogs: parsed.serviceLogs,
    }
  } catch {
    return null
  }
}

function writeCache(equipments: any[], histories: any[], serviceLogs: any[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ equipments, histories, serviceLogs }))
  } catch {
    // Kuota localStorage penuh dsb — cache bersifat opsional, abaikan
  }
}

export default function HomePage() {
  const { theme, toggleTheme } = useTheme()
  // Jadikan 'dashboard' sebagai view default
  const [activeView, setActiveView] = useState<View>('dashboard')

  const [filters, setFilters] = useState<EquipmentFilters>({})
  const [equipments, setEquipments] = useState<any[]>([])
  const [histories, setHistories] = useState<any[]>([])
  const [serviceLogs, setServiceLogs] = useState<any[]>([])
  const [outbounds, setOutbounds] = useState<any[]>([])
  const [skrDetails, setSkrDetails] = useState<any[]>([])
  /** Daftar customer untuk menerjemahkan customer_id → nama toko di menu SKR */
  const [customers, setCustomers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [outboundError, setOutboundError] = useState<string | null>(null)
  const [isOutboundFetching, setIsOutboundFetching] = useState(false)
  const [skrError, setSkrError] = useState<string | null>(null)
  const [isSkrFetching, setIsSkrFetching] = useState(false)
  /** Baris bulan sebelumnya — untuk grafik perbandingan di menu SKR */
  const [skrPrevMonth, setSkrPrevMonth] = useState<any[]>([])
  /** true bila data diambil lewat view (filter tanggal di database) */
  const [skrUsesView, setSkrUsesView] = useState(false)
  /** true bila penyaringan tanggal sudah diterapkan oleh query */
  const [skrDateFiltered, setSkrDateFiltered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRefreshing = useRef(false)

  useKeyboardShortcuts(setActiveView, toggleTheme)

  useEffect(() => {
    // 1. Cache-first: render data terakhir seketika, tanpa menunggu network
    const cached = readCache()
    if (cached) {
      setEquipments(cached.equipments)
      setHistories(cached.histories)
      setServiceLogs(cached.serviceLogs)
      setIsLoading(false)
    }

    // 2. Selalu refresh di background agar data tetap segar (stale-while-revalidate)
    async function fetchData() {
      if (isRefreshing.current) return
      isRefreshing.current = true
      if (!cached) setIsLoading(true)

      try {
        const [eqResponse, histResponse, serviceResponse] = await Promise.all([
          supabase.from('equipment').select(EQUIPMENT_COLS).order('created_at', { ascending: false }),
          supabase.from('maintenance_histories').select(HISTORY_COLS).order('tanggal', { ascending: false }),
          supabase.from('service_logs').select(SERVICE_LOG_COLS).order('service_date', { ascending: false }),
        ])

        if (eqResponse.error) setError(eqResponse.error.message)
        else {
          setError(null)
          setEquipments(eqResponse.data || [])
        }

        if (!histResponse.error) setHistories(histResponse.data || [])
        if (!serviceResponse.error) setServiceLogs(serviceResponse.data || [])

        if (!eqResponse.error && !histResponse.error && !serviceResponse.error) {
          writeCache(eqResponse.data || [], histResponse.data || [], serviceResponse.data || [])
        }
      } catch (fetchError) {
        // Misal env Supabase belum terisi atau jaringan gagal — tampilkan pesan, jangan crash
        setError(fetchError instanceof Error ? fetchError.message : 'Gagal memuat data')
      } finally {
        setIsLoading(false)
        isRefreshing.current = false
      }
    }
    fetchData()
  }, [])

  //_Nama toko untuk menu SKR — hanya id + nama yang diambil, lewat view
  //customers_ringkas supaya telephone_number & nik_salesman tidak ikut
  //terekspos ke kunci anon. Kegagalan fetch ini tidak boleh mengganggu
  //menu lain.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('customers_ringkas')
      .select('customer_id,customer_name')
      .limit(20000)
      .then(({ data, error }) => {
        if (!cancelled && !error) setCustomers(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // armada_outbound di-fetch terpisah sesuai rentang tanggal menu Pengiriman
  // — tanpa ini, seluruh tabel besar ikut termuat setiap kali app dibuka.
  const fetchOutbounds = useCallback(async (from: string, to: string) => {
    // Validasi format YYYY-MM-DD — input date bisa dikosongkan user, dan
    // string kosong akan menghasilkan Invalid Date (NaN → toISOString throw).
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!datePattern.test(from) || !datePattern.test(to)) {
      setOutboundError('Rentang tanggal tidak valid. Pilih tanggal dari dan sampai.')
      return
    }
    // Bila rentang terbalik (dari > sampai), balik otomatis agar hasilnya
    // konsisten alih-alih kosong tanpa penjelasan.
    const [start, end] = from <= to ? [from, to] : [to, from]

    setIsOutboundFetching(true)
    try {
      // Batas akhir dikasih +1 hari (lt) karena jam_out berisi jam.
      const toNext = new Date(`${end}T00:00:00+07:00`)
      toNext.setDate(toNext.getDate() + 1)
      const res = await supabase
        .from('armada_outbound')
        .select(OUTBOUND_COLS)
        .gte('jam_out', `${start}T00:00:00+07:00`)
        .lt('jam_out', toNext.toISOString())
        .order('jam_out', { ascending: false })
      if (res.error) {
        setOutboundError(res.error.message)
      } else {
        setOutboundError(null)
        setOutbounds(res.data || [])
      }
    } catch (e) {
      setOutboundError(e instanceof Error ? e.message : 'Gagal memuat pengiriman')
    } finally {
      setIsOutboundFetching(false)
    }
  }, [])

  // Rentang tanggal menu Pengiriman & SKR — default 30 hari terakhir (WIB).
  const defaultRange = () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
    const start = new Date(`${today}T00:00:00+07:00`)
    start.setDate(start.getDate() - 29)
    return { from: start.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }), to: today }
  }

  const [outboundRange, setOutboundRange] = useState(defaultRange)
  const [skrRange, setSkrRange] = useState(defaultRange)

  const handleOutboundRangeChange = useCallback((from: string, to: string) => {
    setOutboundRange({ from, to })
  }, [])

  const handleSkrRangeChange = useCallback((from: string, to: string) => {
    setSkrRange({ from, to })
  }, [])

  useEffect(() => {
    fetchOutbounds(outboundRange.from, outboundRange.to)
  }, [fetchOutbounds, outboundRange.from, outboundRange.to])

  // Dashboard SKR membaca view `skr_ringkasan` yang mengupah parsing pod_date &
  // skr_value ke database. Bila view belum dibuat, aplikasi otomatis turun ke
  // mode cadangan: baca kolom mentah lalu parsing di sisi browser.
  const fetchSkr = useCallback(async (from: string, to: string) => {
    setIsSkrFetching(true)
    // Tiga bulan kalender terakhir (WIB) — bulan berjalan, bulan sebelumnya,
    // dan dua bulan yang lalu. Grafik bisa membandingkan Sep vs Agu saat
    // bulan berjalan masih kosong (awal bulan, upload POD tertinggal),
    // jadi jendela ketiga harus tersedia tanpa fetch ulang.
    const windows = [0, 1, 2].map((back) => {
      const p = zonedParts(new Date(startOfZonedDayMonthsAgo(back)))!
      const mm = String(p.month).padStart(2, '0')
      return {
        from: `${p.year}-${mm}-01`,
        to: `${p.year}-${mm}-${String(daysInMonth(p.year, p.month)).padStart(2, '0')}`,
      }
    })
    const curFrom = windows[0].from
    const curTo = windows[0].to
    const prevFrom = windows[1].from
    const prevTo = windows[1].to
    const prev2From = windows[2].from
    const prev2To = windows[2].to
    try {
      let query = supabase.from(SKR_VIEW).select(SKR_VIEW_COLS).not('pod_d', 'is', null)
      if (from) query = query.gte('pod_d', from)
      if (to) query = query.lte('pod_d', to)
      const { data, error } = await query.order('pod_d', { ascending: false }).limit(20000)

      if (!error) {
        setSkrError(null)
        setSkrUsesView(true)
        setSkrDateFiltered(true)
        setSkrDetails(data || [])
        // Grafik butuh dua bulan penuh (plus satu jendela cadangan untuk
        // auto-shift awal bulan). Bila rentang filter sudah mencakup ketiga
        // bulan, komponen cukup memakai data yang sama — tandai dengan prev
        // bulan kosong. Kalau tidak, fetch tiga jendela bulan terpisah.
        if (from <= prev2From && to >= curTo) {
          setSkrPrevMonth([])
        } else {
          const [curRes, prevRes, prev2Res] = await Promise.all([
            supabase.from(SKR_VIEW).select(SKR_VIEW_COLS).not('pod_d', 'is', null).gte('pod_d', curFrom).lte('pod_d', curTo).limit(20000),
            supabase.from(SKR_VIEW).select(SKR_VIEW_COLS).not('pod_d', 'is', null).gte('pod_d', prevFrom).lte('pod_d', prevTo).limit(20000),
            supabase.from(SKR_VIEW).select(SKR_VIEW_COLS).not('pod_d', 'is', null).gte('pod_d', prev2From).lte('pod_d', prev2To).limit(20000),
          ])
          setSkrPrevMonth([
            ...(curRes.error ? [] : curRes.data || []),
            ...(prevRes.error ? [] : prevRes.data || []),
            ...(prev2Res.error ? [] : prev2Res.data || []),
          ])
        }
        return
      }

      // View belum tersedia → mode cadangan, parsing di sisi aplikasi.
      if (isViewUnavailableError(error.message)) {
        const { data: raw, error: rawError } = await supabase
          .from('skr_detail')
          .select('license_no,salesman,pod_reason,skr_base_unit,pod_date,skr_sales_unit,skr_value,customer_id,delivery_number')
          .limit(20000)
        if (rawError) {
          setSkrError(rawError.message)
          return
        }
        setSkrError(null)
        setSkrUsesView(false)
        setSkrDateFiltered(false)
        const mapped = (raw || []).map((row) => ({
          license_no: row.license_no,
          salesman: row.salesman,
          pod_reason: row.pod_reason,
          skr_base_unit: row.skr_base_unit,
          customer_id: row.customer_id,
          delivery_number: row.delivery_number,
          pod_d: podDateToIso(row.pod_date),
          qty: Number(row.skr_sales_unit ?? 0) || 0,
          nilai: parseNilai(row.skr_value),
        }))
        setSkrDetails(mapped)
        // Mode cadangan memuat seluruh baris — slice per bulan dilakukan di
        // komponen memakai batas tanggal yang sama.
        setSkrPrevMonth(mapped)
        return
      }

      setSkrError(error.message)
    } catch (e) {
      setSkrError(e instanceof Error ? e.message : 'Gagal memuat data SKR')
    } finally {
      setIsSkrFetching(false)
    }
  }, [])

  // Rentang tanggal yang benar-benar ada di data — untuk umpan balik ke user
  // saat rentang pilihannya tidak membuahkan hasil. Ambil dengan dua query kecil.
  const [skrBounds, setSkrBounds] = useState<SkrDateBounds>({
    minIso: null,
    maxIso: null,
  })

  const fetchSkrBounds = useCallback(async () => {
    try {
      const opts = { select: 'pod_d', not: ['pod_d', 'is', null] } as const
      const [minRes, maxRes] = await Promise.all([
        supabase.from(SKR_VIEW).select(opts.select).not(...opts.not).order('pod_d', { ascending: true }).limit(1),
        supabase.from(SKR_VIEW).select(opts.select).not(...opts.not).order('pod_d', { ascending: false }).limit(1),
      ])

      // View belum ada → hitung batas dari data yang sudah dimuat
      if (minRes.error || maxRes.error) {
        let minIso: string | null = null
        let maxIso: string | null = null
        for (const row of skrDetails) {
          const iso = row.pod_d
          if (!iso) continue
          if (minIso == null || iso < minIso) minIso = iso
          if (maxIso == null || iso > maxIso) maxIso = iso
        }
        setSkrBounds({ minIso, maxIso })
        return
      }

      setSkrBounds((prev) => ({
        ...prev,
        minIso: minRes.data?.[0]?.pod_d ?? null,
        maxIso: maxRes.data?.[0]?.pod_d ?? null,
      }))
    } catch {
      // Gagal mengambil batas rentang tidak kritis — abaikan
    }
    //_skrDetails sengaja jadi dependensi: pada mode cadangan batas dihitung
    //dari baris yang sudah dimuat, jadi harus ikut berubah saat data berganti.
  }, [skrDetails])

  //_Batas hanya perlu diambil ulang saat mode cadangan; pada mode view
  //dua query kecil di atas cukup dijalankan sekali.
  const skrBoundsFetched = useRef(false)
  useEffect(() => {
    if (skrBoundsFetched.current && skrUsesView) return
    skrBoundsFetched.current = true
    fetchSkrBounds()
  }, [fetchSkrBounds, skrUsesView])

  useEffect(() => {
    fetchSkr(skrRange.from, skrRange.to)
  }, [fetchSkr, skrRange.from, skrRange.to])
  const equipmentByPlate = useMemo(() => {
    const map = new Map<string, { equipment_id?: string; description?: string }>()
    for (const eq of equipments) {
      if (eq.license_plate) {
        map.set(String(eq.license_plate), {
          equipment_id: eq.equipment_id,
          description: eq.description,
        })
      }
    }
    return map
  }, [equipments])

  //_customer_id di skr_detail bigint sedangkan customers.customer_id TEXT —
  //join lewat normalisasi string ke peta id → nama toko.
  const customerById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) {
      if (c.customer_id != null) map.set(String(c.customer_id).trim(), String(c.customer_name ?? ''))
    }
    return map
  }, [customers])

  // Baris SKR sudah difilter tanggal oleh query bila view aktif. Pada mode
  // cadangan (view belum ada) penyaringan tetap dilakukan di sini.
  const filteredSkr = useMemo(() => {
    if (skrDateFiltered) return skrDetails
    if (!skrRange.from && !skrRange.to) return skrDetails
    return skrDetails.filter((row) => {
      const iso = row.pod_d
      if (!iso) return false
      if (skrRange.from && iso < skrRange.from) return false
      if (skrRange.to && iso > skrRange.to) return false
      return true
    })
  }, [skrDetails, skrDateFiltered, skrRange.from, skrRange.to])

  // Filter & turunannya di-memoize agar tidak dihitung ulang pada setiap render
  const searchLower = filters.search?.toLowerCase() ?? ""

  const filteredEquipments = useMemo(() => {
    return equipments.filter((item) => {
      const matchesSearch = searchLower
        ? (item.equipment_id?.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower) ||
          item.license_plate?.toLowerCase().includes(searchLower))
        : true;
      const matchesStatus = filters.status ? item.status === filters.status : true;
      return matchesSearch && matchesStatus;
    })
  }, [equipments, searchLower, filters.status])

  const availableCount = useMemo(
    () => filteredEquipments.filter(item => item.status === 'Available').length,
    [filteredEquipments]
  );

  const filteredGlobalHistories = useMemo(() => {
    if (!searchLower) return histories;
    return histories.filter((item) =>
      item.nama_barang_atau_jasa?.toLowerCase().includes(searchLower) ||
      item.license_plate?.toLowerCase().includes(searchLower) ||
      item.equipment_id?.toLowerCase().includes(searchLower)
    );
  }, [histories, searchLower])

  const handleViewChange = useCallback((view: View) => {
    setActiveView(view)
    setFilters({}) // Reset filter saat pindah menu
  }, [])

  const handleSearchFilterChange = useCallback((newFilters: EquipmentFilters) => {
    setFilters(newFilters)
  }, [])

  // Konfigurasi Header Dinamis
  const headerInfo: Record<View, { title: string; desc: string }> = {
    dashboard: { title: 'Dashboard', desc: 'Ringkasan metrik dan status operasional armada.' },
    equipment: { title: 'Daftar Equipment', desc: 'Kelola data aset dan pantau riwayat pemeliharaan secara spesifik.' },
    maintenance: { title: 'Semua Riwayat Maintenance', desc: 'Cari riwayat perbaikan menyeluruh berdasarkan plat nombor atau nama barang.' },
    monitoring: { title: 'Monitoring Status Servis', desc: 'Pantau jadwal servis unit berdasarkan tanggal dan odometer.' },
    about: { title: 'Tentang Aplikasi', desc: 'Kisah di balik pengembangan Fleet Management System v2.' },
    skr: { title: 'SKR', desc: 'Ringkasan sisa kiriman per armada dan sales, beserta bobot nilai serta alasan POD.' },
    pengiriman: { title: 'Pengiriman', desc: 'Pantau armada outbound: nomor polisi, jam keluar, jam kembali, dan durasi tempuh.' },
  }

  return (
    <DashboardLayout
      theme={theme}
      onToggleTheme={toggleTheme}
      activeView={activeView}
      onViewChange={handleViewChange}
      equipmentCounts={{ total: filteredEquipments.length, available: availableCount }}
    >
      <div className="container mx-auto p-6 flex flex-col space-y-4">

        {/* Header Dinamis */}
        {activeView !== 'about' && (
          <div className="shrink-0">
            <h1 className="text-2xl font-bold tracking-tight">
              {headerInfo[activeView].title}
            </h1>
            <p className="text-muted-foreground mb-4">
              {headerInfo[activeView].desc}
            </p>

            {/* Sembunyikan SearchBar di mode Dashboard & menu Ekspedisi yang belum ada datanya */}
            {activeView !== 'dashboard' && activeView !== 'skr' && activeView !== 'pengiriman' && (
              <SearchBar
                filters={filters}
                onFiltersChange={handleSearchFilterChange}
                activeView={activeView}
              />
            )}
          </div>
        )}

        {/* Render Konten Sesuai View */}
        {activeView === 'dashboard' && (
          // Kita berikan data asli (equipments & histories) agar kalkulasi dashboard mencakup semua data tanpa terpengaruh search bar
          <DashboardView
            equipments={equipments}
            histories={histories}
            serviceLogs={serviceLogs}
            isLoading={isLoading}
            onNavigate={handleViewChange}
          />
        )}

        {activeView === 'equipment' && (
          <EquipmentTable
            equipments={filteredEquipments}
            histories={histories}
            isLoading={isLoading}
            error={error}
            statusFilter={filters.status || 'all'}
            onStatusFilterChange={(next) =>
              setFilters((prev) => ({
                ...prev,
                status: next === 'all' ? undefined : next,
              }))
            }
          />
        )}

        {activeView === 'maintenance' && (
          <MaintenanceTable
            histories={filteredGlobalHistories}
            isLoading={isLoading}
          />
        )}

        {activeView === 'monitoring' && (
          <ServiceMonitoringTable
            equipments={filteredEquipments}
            serviceLogs={serviceLogs}
            isLoading={isLoading}
            statusFilter={filters.serviceStatus || 'all'}
            onStatusFilterChange={(next) =>
              setFilters((prev) => ({
                ...prev,
                serviceStatus: next === 'all' ? undefined : next,
              }))
            }
          />
        )}

        {activeView === 'skr' && (
          <SkrView
            details={filteredSkr}
            prevMonthRows={skrPrevMonth}
            equipmentByPlate={equipmentByPlate}
            customerById={customerById}
            isLoading={isLoading && skrError == null}
            error={skrError}
            dateFrom={skrRange.from}
            dateTo={skrRange.to}
            onDateRangeChange={handleSkrRangeChange}
            totalRows={skrDetails.length}
            bounds={skrBounds}
            usingView={skrUsesView}
          />
        )}

        {activeView === 'pengiriman' && (
          <OutboundTable
            outbounds={outbounds}
            isLoading={isLoading && outboundError == null}
            error={outboundError}
            dateFrom={outboundRange.from}
            dateTo={outboundRange.to}
            onDateRangeChange={handleOutboundRangeChange}
            isFetching={isOutboundFetching}
          />
        )}

        {activeView === 'about' && (
          <AboutView />
        )}

      </div>
    </DashboardLayout>
  )
}

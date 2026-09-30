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
import { ComingSoonView } from "@/components/organisms/coming-soon-view"
import { OutboundTable } from "@/components/organisms/outbound-table"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"

// Kolom minimal yang benar-benar dipakai UI — payload lebih kecil, query lebih cepat
const EQUIPMENT_COLS = "id,equipment_id,license_plate,description,company_code,construction_year,last_odometer,status"
const HISTORY_COLS = "id,tanggal,equipment_id,license_plate,nama_barang_atau_jasa,jumlah_harga"
const SERVICE_LOG_COLS = "equipment_id,service_date,next_service_date,next_service_odometer,odometer_at_service"
const OUTBOUND_COLS = "freight_order,no_polisi,jam_out,jam_in,created_at"

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
  const [isLoading, setIsLoading] = useState(true)
  const [outboundError, setOutboundError] = useState<string | null>(null)
  const [isOutboundFetching, setIsOutboundFetching] = useState(false)
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

  // Rentang tanggal menu Pengiriman — default 30 hari terakhir (WIB).
  const [outboundRange, setOutboundRange] = useState(() => {
    const nowParts = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
    const today = nowParts
    const from = new Date(`${today}T00:00:00+07:00`)
    from.setDate(from.getDate() - 29)
    const fromParts = from.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
    return { from: fromParts, to: today }
  })

  const handleOutboundRangeChange = useCallback((from: string, to: string) => {
    setOutboundRange({ from, to })
  }, [])

  useEffect(() => {
    fetchOutbounds(outboundRange.from, outboundRange.to)
  }, [fetchOutbounds, outboundRange.from, outboundRange.to])

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
    skr: { title: 'SKR', desc: 'Surat Keterangan Result — modul ekspedisi yang sedang disiapkan.' },
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
          <ComingSoonView title="SKR" />
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

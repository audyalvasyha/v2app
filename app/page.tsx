"use client"

import React, { useState, useEffect } from "react"
import { useTheme } from "@/hooks/use-theme"
import { supabase } from "@/utils/supabase"
import { SearchBar, EquipmentFilters } from "@/components/search-bar"

import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { DashboardView } from "@/components/organisms/dashboard-view" // Import Dashboard Baru
import { EquipmentTable } from "@/components/organisms/equipment-table"
import { MaintenanceTable } from "@/components/organisms/maintenance-table"
import { ServiceMonitoringTable } from "@/components/organisms/service-monitoring-table"
import { AboutView } from "@/components/organisms/about-view"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"

const ITEMS_PER_PAGE = 15

export default function HomePage() {
  const { theme, toggleTheme } = useTheme()
  // Jadikan 'dashboard' sebagai view default
  const [activeView, setActiveView] = useState<'dashboard' | 'equipment' | 'maintenance' | 'monitoring' | 'about'>('dashboard')

  const [filters, setFilters] = useState<EquipmentFilters>({})
  const [equipments, setEquipments] = useState<any[]>([])
  const [histories, setHistories] = useState<any[]>([])
  const [serviceLogs, setServiceLogs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [maintPage, setMaintPage] = useState(1)
  useKeyboardShortcuts(setActiveView, toggleTheme)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      const [eqResponse, histResponse, serviceResponse] = await Promise.all([
        supabase.from('equipment').select('*').order('created_at', { ascending: false }),
        supabase.from('maintenance_histories').select('*').order('tanggal', { ascending: false }),
        supabase.from('service_logs').select('*').order('service_date', { ascending: false })
      ])

      if (eqResponse.error) setError(eqResponse.error.message)
      else setEquipments(eqResponse.data || [])

      if (!histResponse.error) setHistories(histResponse.data || [])
      if (!serviceResponse.error) setServiceLogs(serviceResponse.data || [])

      setIsLoading(false)
    }
    fetchData()
  }, [])

  // Filter Data
  const filteredEquipments = equipments.filter((item) => {
    const matchesSearch = filters.search
      ? (item.equipment_id?.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.license_plate?.toLowerCase().includes(filters.search.toLowerCase()))
      : true;
    const matchesStatus = filters.status ? item.status === filters.status : true;
    return matchesSearch && matchesStatus;
  })

  const availableCount = filteredEquipments.filter(item => item.status === 'Available').length;

  const filteredGlobalHistories = histories.filter((item) => {
    if (!filters.search) return true;
    const query = filters.search.toLowerCase();
    return (
      item.nama_barang_atau_jasa?.toLowerCase().includes(query) ||
      item.license_plate?.toLowerCase().includes(query) ||
      item.equipment_id?.toLowerCase().includes(query)
    );
  })

  const totalMaintPages = Math.ceil(filteredGlobalHistories.length / ITEMS_PER_PAGE) || 1
  const paginatedGlobalHistories = filteredGlobalHistories.slice((maintPage - 1) * ITEMS_PER_PAGE, maintPage * ITEMS_PER_PAGE)

  const handleViewChange = (view: 'dashboard' | 'equipment' | 'maintenance' | 'monitoring') => {
    setActiveView(view)
    setFilters({}) // Reset filter saat pindah menu
    setMaintPage(1)
  }

  const handleSearchFilterChange = (newFilters: EquipmentFilters) => {
    setFilters(newFilters)
    setMaintPage(1)
  }

  // Konfigurasi Header Dinamis
  const headerInfo = {
    dashboard: { title: 'Dashboard', desc: 'Ringkasan metrik dan status operasional armada.' },
    equipment: { title: 'Daftar Equipment', desc: 'Kelola data aset dan pantau riwayat pemeliharaan secara spesifik.' },
    maintenance: { title: 'Semua Riwayat Maintenance', desc: 'Cari riwayat perbaikan menyeluruh berdasarkan plat nombor atau nama barang.' },
    monitoring: { title: 'Monitoring Status Servis', desc: 'Pantau jadwal servis unit berdasarkan tanggal dan odometer.' },
    about: { title: 'Tentang Aplikasi', desc: 'Kisah di balik pengembangan Fleet Management System v2.' } // Tambahan baru
  }

  return (
    <DashboardLayout
      theme={theme}
      onToggleTheme={toggleTheme}
      activeView={activeView}
      onViewChange={handleViewChange}
      equipmentCounts={{ total: filteredEquipments.length, available: availableCount }}
    >
      <div className="container mx-auto p-6 flex flex-col h-full space-y-4">

        {/* Header Dinamis */}
        {activeView !== 'about' && (
          <div className="shrink-0">
            <h1 className="text-2xl font-bold tracking-tight">
              {headerInfo[activeView].title}
            </h1>
            <p className="text-muted-foreground mb-4">
              {headerInfo[activeView].desc}
            </p>

            {/* Sembunyikan SearchBar di mode Dashboard agar lebih rapi */}
            {activeView !== 'dashboard' && (
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
          />
        )}

        {activeView === 'equipment' && (
          <EquipmentTable
            equipments={filteredEquipments}
            histories={histories}
            isLoading={isLoading}
            error={error}
          />
        )}

        {activeView === 'maintenance' && (
          <MaintenanceTable
            histories={paginatedGlobalHistories}
            isLoading={isLoading}
            currentPage={maintPage}
            totalPages={totalMaintPages}
            onPageChange={setMaintPage}
          />
        )}

        {activeView === 'monitoring' && (
          <ServiceMonitoringTable
            equipments={filteredEquipments}
            serviceLogs={serviceLogs}
            isLoading={isLoading}
            statusFilter={filters.serviceStatus || 'all'} // Kirim state filter
          />
        )}

        {activeView === 'about' && (
          <AboutView />
        )}

      </div>
    </DashboardLayout>
  )
}
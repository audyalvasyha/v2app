"use client"

import type React from "react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, X, Filter } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface EquipmentFilters {
  search?: string
  status?: string
  serviceStatus?: string;
}

interface SearchBarProps {
  filters: EquipmentFilters;
  onFiltersChange: (filters: EquipmentFilters) => void;
  activeView?: 'dashboard' | 'equipment' | 'maintenance' | 'monitoring';
}

export function SearchBar({ filters, onFiltersChange, activeView }: SearchBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search || "")

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onFiltersChange({ ...filters, search: localSearch })
  }

  const clearFilters = () => {
    setLocalSearch("")
    onFiltersChange({})
  }

  // Cek apakah ada filter apa pun yang sedang aktif
  const hasActiveFilters = !!(filters.search || filters.status || filters.serviceStatus)

  // Fungsi helper untuk menerjemahkan value status servis ke teks yang rapi di badge
  const getServiceStatusLabel = (val: string) => {
    switch (val) {
      case 'safe': return 'Aman';
      case 'warning': return 'Segera Servis';
      case 'overdue': return 'Terlewat (Overdue)';
      case 'none': return 'Belum Ada Data';
      default: return val;
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Cari equipment... (ID, deskripsi, plat nomor)"
            className="pl-10"
          />
        </div>
        <Button type="submit" className="gap-2">
          Search
        </Button>

        {/* Tampilkan tombol Filter HANYA jika bukan di dashboard atau maintenance (karena maintenance pakai search saja) */}
        {(activeView === 'equipment' || activeView === 'monitoring') && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 bg-transparent">
                <Filter className="h-4 w-4" />
                Filters
                {(filters.status || filters.serviceStatus) && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-[#f97316] text-white"
                  >
                    !
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">

                {/* HANYA MUNCUL DI VIEW EQUIPMENT */}
                {activeView === 'equipment' && (
                  <div className="space-y-2">
                    <Label>Status Equipment</Label>
                    <Select
                      value={filters.status || "all"}
                      onValueChange={(value) =>
                        onFiltersChange({ ...filters, status: value === "all" ? undefined : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Semua Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Status</SelectItem>
                        <SelectItem value="Available">Available</SelectItem>
                        <SelectItem value="In Use">In Use</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* HANYA MUNCUL DI VIEW MONITORING */}
                {activeView === 'monitoring' && (
                  <div className="space-y-2">
                    <Label>Status Servis</Label>
                    <Select
                      value={filters.serviceStatus || "all"}
                      onValueChange={(value) =>
                        onFiltersChange({ ...filters, serviceStatus: value === "all" ? undefined : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Semua Status Servis" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Status Servis</SelectItem>
                        <SelectItem value="safe">Aman</SelectItem>
                        <SelectItem value="warning">Segera Servis</SelectItem>
                        <SelectItem value="overdue">Terlewat (Overdue)</SelectItem>
                        <SelectItem value="none">Belum Ada Data</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(filters.status || filters.serviceStatus) && (
                  <Button variant="outline" onClick={() => onFiltersChange({ ...filters, status: undefined, serviceStatus: undefined })} className="w-full gap-2 bg-transparent mt-2">
                    <X className="h-4 w-4" />
                    Reset Dropdown Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </form>

      {/* MENAMPILKAN BADGE FILTER YANG AKTIF */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <button
                onClick={() => {
                  setLocalSearch("")
                  onFiltersChange({ ...filters, search: undefined })
                }}
                className="hover:text-destructive ml-1"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.status && (
            <Badge variant="secondary" className="gap-1">
              Status: {filters.status}
              <button
                onClick={() => onFiltersChange({ ...filters, status: undefined })}
                className="hover:text-destructive ml-1"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.serviceStatus && (
            <Badge variant="secondary" className="gap-1">
              Servis: {getServiceStatusLabel(filters.serviceStatus)}
              <button
                onClick={() => onFiltersChange({ ...filters, serviceStatus: undefined })}
                className="hover:text-destructive ml-1"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground">
              Clear All
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
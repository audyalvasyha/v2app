import React, { useState, Fragment } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination"

interface EquipmentTableProps {
  equipments: any[];
  histories: any[];
  isLoading: boolean;
  error: string | null;
}

const ITEMS_PER_PAGE = 15;

export function EquipmentTable({ equipments, histories, isLoading, error }: EquipmentTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [historyPages, setHistoryPages] = useState<Record<string, number>>({})

  const toggleRow = (id: string) => setExpandedRowId((prev) => (prev === id ? null : id))
  
  const handleHistoryPageChange = (equipmentId: string, newPage: number) => {
    setHistoryPages((prev) => ({ ...prev, [equipmentId]: newPage }))
  }

  return (
    <Table>
      <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
        <TableRow>
          <TableHead className="w-[50px]"></TableHead> 
          <TableHead>Equipment ID</TableHead>
          <TableHead>Plat Nomor</TableHead>
          <TableHead>Deskripsi</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Tahun</TableHead>
          <TableHead>Odometer</TableHead>
          <TableHead className="text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow><TableCell colSpan={8} className="text-center h-32">Memuat...</TableCell></TableRow>
        ) : error ? (
          <TableRow><TableCell colSpan={8} className="text-center h-32 text-destructive">{error}</TableCell></TableRow>
        ) : equipments.length > 0 ? (
          equipments.map((item) => {
            const isExpanded = expandedRowId === item.id
            const itemHistories = histories.filter(h => h.equipment_id === item.equipment_id)
            
            const currentSubPage = historyPages[item.id] || 1
            const totalSubPages = Math.ceil(itemHistories.length / ITEMS_PER_PAGE) || 1
            const startSubIndex = (currentSubPage - 1) * ITEMS_PER_PAGE
            const paginatedSubHistories = itemHistories.slice(startSubIndex, startSubIndex + ITEMS_PER_PAGE)

            return (
              <Fragment key={item.id}>
                <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleRow(item.id)}>
                  <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{item.equipment_id}</TableCell>
                  <TableCell className="whitespace-nowrap">{item.license_plate || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={item.description || ''}>{item.description || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{item.company_code || '-'}</TableCell>
                  <TableCell>{item.construction_year || '-'}</TableCell>
                  <TableCell>{item.last_odometer || 0}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.status === 'Available' ? 'default' : 'secondary'}>{item.status}</Badge>
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={8} className="p-0 border-b-2">
                      <div className="p-4 pl-14 shadow-inner">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold text-sm text-muted-foreground">Riwayat Pemeliharaan Unit Ini</h4>
                          <span className="text-xs text-muted-foreground">Total: {itemHistories.length} riwayat</span>
                        </div>
                        
                        {itemHistories.length > 0 ? (
                          <div className="space-y-4">
                            <div className="rounded border bg-background overflow-hidden">
                              <Table>
                                <TableHeader className="bg-muted/50">
                                  <TableRow>
                                    <TableHead className="h-8 py-1 text-xs whitespace-nowrap">Tanggal</TableHead>
                                    <TableHead className="h-8 py-1 text-xs">Barang/Jasa</TableHead>
                                    <TableHead className="h-8 py-1 text-xs text-right whitespace-nowrap">Harga</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {paginatedSubHistories.map(hist => (
                                    <TableRow key={hist.id}>
                                      <TableCell className="py-2 text-xs whitespace-nowrap">{new Date(hist.tanggal).toLocaleDateString('id-ID')}</TableCell>
                                      <TableCell className="py-2 text-xs max-w-[250px] truncate" title={hist.nama_barang_atau_jasa}>{hist.nama_barang_atau_jasa}</TableCell>
                                      <TableCell className="py-2 text-xs text-right whitespace-nowrap">Rp {Number(hist.jumlah_harga).toLocaleString('id-ID')}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            
                            {/* Paginasi Sub-tabel menggunakan shadcn */}
                            {totalSubPages > 1 && (
                              <Pagination className="mx-0 w-auto justify-end">
                                <PaginationContent>
                                  <PaginationItem>
                                    <PaginationPrevious 
                                      href="#" 
                                      size="sm"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        if (currentSubPage > 1) handleHistoryPageChange(item.id, currentSubPage - 1);
                                      }}
                                      className={currentSubPage <= 1 ? "pointer-events-none opacity-50" : ""}
                                    />
                                  </PaginationItem>
                                  
                                  <PaginationItem className="flex items-center gap-2 px-2">
                                    <input
                                      type="number"
                                      min={1}
                                      max={totalSubPages}
                                      value={currentSubPage}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val)) {
                                          handleHistoryPageChange(item.id, Math.min(Math.max(1, val), totalSubPages));
                                        }
                                      }}
                                      className="w-12 h-8 text-center text-xs rounded-md border border-input bg-background"
                                    />
                                    <span className="text-xs text-muted-foreground">dari {totalSubPages}</span>
                                  </PaginationItem>

                                  <PaginationItem>
                                    <PaginationNext 
                                      href="#" 
                                      size="sm"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        if (currentSubPage < totalSubPages) handleHistoryPageChange(item.id, currentSubPage + 1);
                                      }}
                                      className={currentSubPage >= totalSubPages ? "pointer-events-none opacity-50" : ""}
                                    />
                                  </PaginationItem>
                                </PaginationContent>
                              </Pagination>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Tidak ada riwayat pemeliharaan.</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })
        ) : (
          <TableRow><TableCell colSpan={8} className="text-center h-32">Data tidak ditemui.</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  )
}
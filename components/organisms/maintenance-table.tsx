import React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination"

interface MaintenanceTableProps {
  histories: any[];
  isLoading: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function MaintenanceTable({ 
  histories, 
  isLoading,
  currentPage,
  totalPages,
  onPageChange
}: MaintenanceTableProps) {
  return (
    <div className="flex flex-col h-full w-full">
      <div className="rounded-md border flex-1 overflow-auto bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
            <TableRow>
              <TableHead className="whitespace-nowrap">Tanggal</TableHead>
              <TableHead className="whitespace-nowrap">Equipment ID</TableHead>
              <TableHead className="whitespace-nowrap">Plat Nombor</TableHead>
              <TableHead>Barang/Jasa</TableHead>
              <TableHead className="text-right whitespace-nowrap">Harga (Rp)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center h-32">Memuat data...</TableCell></TableRow>
            ) : histories.length > 0 ? (
              histories.map((hist) => (
                <TableRow key={hist.id}>
                  <TableCell className="whitespace-nowrap">{new Date(hist.tanggal).toLocaleDateString('id-ID')}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{hist.equipment_id}</TableCell>
                  <TableCell className="whitespace-nowrap">{hist.license_plate || '-'}</TableCell>
                  <TableCell className="max-w-[300px] truncate" title={hist.nama_barang_atau_jasa}>{hist.nama_barang_atau_jasa}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{Number(hist.jumlah_harga).toLocaleString('id-ID')}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={5} className="text-center h-32">Tidak ada riwayat ditemui.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Menggunakan komponen Pagination UI Anda dengan modifikasi input */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-end pt-4">
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) onPageChange(currentPage - 1);
                  }}
                  className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              
              <PaginationItem className="flex items-center gap-2 px-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">Halaman</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      onPageChange(Math.min(Math.max(1, val), totalPages));
                    }
                  }}
                  className="w-16 h-8 text-center text-sm rounded-md border border-input bg-background"
                />
                <span className="text-sm text-muted-foreground">dari {totalPages}</span>
              </PaginationItem>

              <PaginationItem>
                <PaginationNext 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages) onPageChange(currentPage + 1);
                  }}
                  className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}
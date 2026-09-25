import React from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationInputProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  layout?: "default" | "minimal"; // default untuk maintenance utama, minimal untuk sub-tabel
}

export function PaginationInput({ 
  currentPage, 
  totalPages, 
  onPageChange,
  layout = "default" 
}: PaginationInputProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center ${layout === 'default' ? 'gap-2 text-sm' : 'justify-end gap-2 text-sm'}`}>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => onPageChange(currentPage - 1)} 
        disabled={currentPage <= 1} 
        className={layout === 'minimal' ? 'h-8 w-8 p-0' : ''}
      >
        <ChevronLeft className={`h-4 w-4 ${layout === 'default' ? 'mr-1' : ''}`} />
        {layout === 'default' && "Sebelumnya"}
      </Button>
      
      <div className="flex items-center gap-2">
        {layout === 'default' && <span className="text-muted-foreground">Halaman</span>}
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
          className={`${layout === 'default' ? 'w-16' : 'w-12'} h-8 text-center rounded-md border border-input bg-background`}
        />
        <span className="text-muted-foreground">dari {totalPages}</span>
      </div>

      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => onPageChange(currentPage + 1)} 
        disabled={currentPage >= totalPages} 
        className={layout === 'minimal' ? 'h-8 w-8 p-0' : ''}
      >
        {layout === 'default' && "Selanjutnya"}
        <ChevronRight className={`h-4 w-4 ${layout === 'default' ? 'ml-1' : ''}`} />
      </Button>
    </div>
  )
}
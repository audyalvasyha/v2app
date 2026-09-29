"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  FileJson,
  FileSpreadsheet,
  Lock,
} from "lucide-react"

/**
 * Fitur ekspor/impor data armada masih dalam pengerjaan, jadi seluruh aksi
 * dinonaktifkan. Sakelar di bawah dinyalakan ketika handler-nya sudah siap:
 * data yang diambil harus mengikuti kolom minimal yang sama seperti di app/page.tsx.
 */
const FEATURE_ENABLED = false

const DATASETS: { table: string; label: string; desc: string }[] = [
    {
        table: "equipment",
        label: "Inventaris Unit",
        desc: "Kode unit, nomor plat, deskripsi, kode perusahaan, tahun pembuatan, odometer terakhir, dan status.",
    },
    {
        table: "maintenance_histories",
        label: "Riwayat Perbaikan",
        desc: "Tanggal perbaikan, unit, item/perbaikan yang dilakukan, serta biaya dalam rupiah.",
    },
    {
        table: "service_logs",
        label: "Log Servis",
        desc: "Tanggal servis terakhir, jatuh tempo servis berikutnya, dan target odometer servis.",
    },
]

const IMPORT_PLACEHOLDER = `{
  "equipment": [ ... ],
  "maintenance_histories": [ ... ],
  "service_logs": [ ... ]
}`

export function ExportImportDialog() {
    const [open, setOpen] = useState(false)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-transparent">
                    <ArrowDownToLine className="h-4 w-4" />
                    Export / Import
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <DialogTitle>Export &amp; Import Data Armada</DialogTitle>
                        <Badge variant="outline" className="shrink-0 gap-1 border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            <Lock className="h-3 w-3" />
                            Segera hadir
                        </Badge>
                    </div>
                    <DialogDescription>
                        Cadangkan data inventaris unit, riwayat perbaikan, dan log servis ke berkas
                        JSON — atau pulihkan kembali dari cadangan sebelumnya.
                    </DialogDescription>
                </DialogHeader>

                <Alert className="border-amber-300/50 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="text-amber-800 dark:text-amber-300">
                        Fitur ini belum aktif. <span className="font-medium">Unduh</span> dan{" "}
                        <span className="font-medium">Impor</span>{" "}
                        sedang disiapkan — seluruh tombol di bawah sengaja dinonaktifkan agar tidak
                        terjadi ekspor atau perubahan data yang tidak disengaja.
                    </AlertDescription>
                </Alert>

                <Tabs defaultValue="export" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="export" className="gap-2">
                            <ArrowDownToLine className="h-3.5 w-3.5" />
                            Export
                        </TabsTrigger>
                        <TabsTrigger value="import" className="gap-2">
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                            Import
                        </TabsTrigger>
                    </TabsList>

                    {/* ---------- Export ---------- */}
                    <TabsContent value="export" className="space-y-5">
                        <div className="space-y-3">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                Cakupan Data
                            </div>
                            <ul className="divide-y divide-border border-y border-border">
                                {DATASETS.map((dataset) => (
                                    <li key={dataset.table} className="flex items-start gap-4 py-3">
                                        <Database
                                            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                                            aria-hidden="true"
                                        />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-baseline gap-x-2">
                                                <span className="text-sm font-medium">{dataset.label}</span>
                                                <code className="font-mono text-[11px] text-muted-foreground">
                                                    {dataset.table}
                                                </code>
                                            </div>
                                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                {dataset.desc}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <Label>Format Berkas</Label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <Button variant="outline" disabled className="justify-start gap-2">
                                    <FileJson className="h-4 w-4" />
                                    JSON
                                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                        strukturnya
                                    </span>
                                </Button>
                                <Button variant="outline" disabled className="justify-start gap-2">
                                    <FileSpreadsheet className="h-4 w-4" />
                                    CSV
                                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                        per tabel
                                    </span>
                                </Button>
                            </div>
                        </div>

                        <Button disabled={!FEATURE_ENABLED} className="w-full gap-2">
                            <ArrowDownToLine className="h-4 w-4" />
                            Unduh Cadangan Armada
                        </Button>

                        <p className="font-mono text-[11px] text-muted-foreground">
                            fleet-backup-YYYY-MM-DD.json
                        </p>
                    </TabsContent>

                    {/* ---------- Import ---------- */}
                    <TabsContent value="import" className="space-y-5">
                        <Alert variant="destructive" className="bg-destructive/10">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                Impor akan memvalidasi berkas terlebih dahulu, lalu menambahkan atau
                                memperbarui baris yang kodenya sudah ada. Ekspor cadangan lebih dulu
                                sebelum melakukan impor.
                            </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                            <Label>Dari Berkas</Label>
                            <Button variant="outline" disabled className="w-full justify-start gap-2">
                                <ArrowUpFromLine className="h-4 w-4" />
                                Pilih Berkas JSON
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Maksimal 10 MB. Berkas divalidasi terhadap struktur tabel di atas.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="fleet-import-text">Atau Tempel JSON</Label>
                            <Textarea
                                id="fleet-import-text"
                                disabled
                                placeholder={IMPORT_PLACEHOLDER}
                                rows={8}
                                className="font-mono text-xs"
                            />
                        </div>

                        <Button disabled={!FEATURE_ENABLED} className="w-full gap-2">
                            Validasi &amp; Impor
                        </Button>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

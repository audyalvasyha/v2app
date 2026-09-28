import React, { memo, useMemo, lazy, Suspense } from "react"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Wrench, Truck, CircleDollarSign } from "lucide-react"

// Chart biaya di-lazy-load sebagai komponen utuh (chunk terpisah dari bundle dashboard).
// Import dinamis per-named-export dari recharts (CJS) tidak reliable di Turbopack,
// jadi yang di-lazy adalah file komponennya, bukan simbol recharts-nya.
const LazyCostChart = lazy(() => import("@/components/organisms/cost-chart"))
const LazyUnitCostRankingChart = lazy(
    () => import("@/components/organisms/unit-cost-ranking-chart"),
)

interface DashboardViewProps {
    equipments: any[];
    histories: any[];
    serviceLogs: any[];
    isLoading: boolean;
}

function DashboardViewImpl({ equipments, histories, serviceLogs, isLoading }: DashboardViewProps) {

    if (isLoading) {
        return <DashboardSkeleton />
    }

    return <DashboardContent equipments={equipments} histories={histories} serviceLogs={serviceLogs} />
}

// Skeleton dengan bentuk yang sama persis seperti konten — layout tidak "lompat" saat data siap
function DashboardSkeleton() {
    return (
        <div className="flex flex-col gap-6 pb-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-4 w-4 rounded-full" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-20" />
                            <Skeleton className="h-3 w-36 mt-2" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-3 w-60 mt-1" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[250px] w-full rounded-md" />
                </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <Skeleton className="h-5 w-56" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-8 w-full" />
                        ))}
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <Skeleton className="h-5 w-52" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <Skeleton className="h-6 w-32" />
                                <Skeleton className="h-5 w-16" />
                            </div>
                        ))}
                        <Skeleton className="h-3 w-full mt-4" />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function DashboardContent({ equipments, histories, serviceLogs }: {
    equipments: any[];
    histories: any[];
    serviceLogs: any[];
}) {
    const today = useMemo(() => new Date(), []);

    // Semua kalkulasi berat di-memoize — tidak dihitung ulang pada tiap render/filter
    const metrics = useMemo(() => {
        const totalEquipment = equipments.length;
        const availableEquipment = equipments.filter(eq => eq.status === 'Available').length;
        const maintenanceEquipment = totalEquipment - availableEquipment;
        const availabilityRate = totalEquipment > 0 ? (availableEquipment / totalEquipment) * 100 : 0;
        const totalCost = histories.reduce((sum, hist) => sum + (Number(hist.jumlah_harga) || 0), 0);

        // Index service log terbaru per unit sekali saja, bukan scan ulang per equipment
        const latestLogByUnit = new Map<string, any>();
        for (const log of serviceLogs) {
            const existing = latestLogByUnit.get(log.equipment_id);
            if (!existing || new Date(log.service_date).getTime() > new Date(existing.service_date).getTime()) {
                latestLogByUnit.set(log.equipment_id, log);
            }
        }

        let overdueCount = 0;
        for (const eq of equipments) {
            const latestLog = latestLogByUnit.get(eq.equipment_id);
            if (latestLog) {
                const nextDate = latestLog.next_service_date ? new Date(latestLog.next_service_date) : null;
                const nextOdo = latestLog.next_service_odometer;
                const currentOdo = eq.last_odometer || 0;

                if ((nextOdo && currentOdo >= nextOdo) || (nextDate && nextDate < today)) {
                    overdueCount++;
                }
            }
        }

        return { totalEquipment, availableEquipment, maintenanceEquipment, availabilityRate, totalCost, overdueCount };
    }, [equipments, histories, serviceLogs, today]);

    // 2. Kalkulasi Data Grafik (3 Bulan Terakhir, Gabung Tanggal)
    const chartData = useMemo(() => {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(today.getMonth() - 3);

        const groupedCosts = histories
            .filter(h => new Date(h.tanggal) >= threeMonthsAgo)
            .reduce((acc, curr) => {
                // Ambil YYYY-MM-DD saja agar tanggal yang sama tergabung
                const dateStr = new Date(curr.tanggal).toISOString().split('T')[0];
                acc[dateStr] = (acc[dateStr] || 0) + Number(curr.jumlah_harga || 0);
                return acc;
            }, {} as Record<string, number>);

        // Ubah ke array dan urutkan dari yang terlama ke terbaru
        return Object.keys(groupedCosts)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
            .map(date => ({
                date,
                displayDate: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                cost: groupedCosts[date]
            }));
    }, [histories, today]);

    // 3. Riwayat Terbaru (5 Terakhir)
    const recentHistories = useMemo(() => [...histories]
        .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
        .slice(0, 5), [histories]);

    // 4. Peringkat biaya per unit (6 bulan terakhir, akumulasi jumlah_harga)
    //    Dipisah dari grafik Tren yang sudah ada — tidak mengubah chartData.
    const ranking6M = useMemo(() => {
        const sixMonthsAgo = new Date(today)
        sixMonthsAgo.setMonth(today.getMonth() - 6)
        const byUnit = new Map<string, { totalCost: number; count: number }>()
        for (const h of histories) {
            const d = new Date(h.tanggal)
            if (Number.isNaN(d.getTime()) || d < sixMonthsAgo) continue
            const key = String(h.equipment_id ?? "").trim()
            if (!key) continue
            const prev = byUnit.get(key)
            const cost = Number(h.jumlah_harga) || 0
            if (prev) {
                prev.totalCost += cost
                prev.count += 1
            } else {
                byUnit.set(key, { totalCost: cost, count: 1 })
            }
        }
        const entries = Array.from(byUnit.entries()).map(([equipment_id, v]) => ({
            equipment_id,
            totalCost: v.totalCost,
            count: v.count,
        }))
        entries.sort((a, b) => b.totalCost - a.totalCost)
        return {
            top5: entries.slice(0, 5),
            bottom5: [...entries].sort((a, b) => a.totalCost - b.totalCost).slice(0, 5),
        }
    }, [histories, today])

    return (
        <div className="flex flex-col gap-6 pb-4">

            {/* KARTU METRIK */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
                        <Truck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.totalEquipment}</div>
                        <p className="text-xs text-muted-foreground">Unit terdaftar di sistem</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Kesiapan Unit (Available)</CardTitle>
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.availableEquipment}</div>
                        <Progress value={metrics.availabilityRate} className="mt-2 h-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {metrics.availabilityRate.toFixed(0)}% dari total unit siap digunakan
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Biaya Perbaikan</CardTitle>
                        <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Rp {metrics.totalCost.toLocaleString('id-ID')}</div>
                        <p className="text-xs text-muted-foreground">Berdasarkan seluruh riwayat</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Servis Terlewat</CardTitle>
                        <AlertTriangle className={`h-4 w-4 ${metrics.overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.overdueCount}</div>
                        <p className="text-xs text-muted-foreground">Unit membutuhkan servis segera</p>
                    </CardContent>
                </Card>
            </div>

            {/* GRAFIK BIAYA — jangan diubah sesuai permintaan user */}
            <Card>
                <CardHeader>
                    <CardTitle>Tren Biaya Perbaikan</CardTitle>
                    <CardDescription>Total biaya harian dalam 3 bulan terakhir</CardDescription>
                </CardHeader>
                <CardContent>
                    {chartData.length > 0 ? (
                        <Suspense fallback={<Skeleton className="h-[250px] w-full rounded-md" />}>
                            <LazyCostChart data={chartData} />
                        </Suspense>
                    ) : (
                        <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm border-dashed border rounded-md">
                            Belum ada data pengeluaran dalam 3 bulan terakhir.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* PERINGKAT BIAYA PER UNIT — 6 bulan (Top 5 / Bottom 5) — tambahan, tidak menggantikan Tren */}
            <Card>
                <CardHeader>
                    <CardTitle>Peringkat Biaya Unit (6 Bulan)</CardTitle>
                    <CardDescription>
                        Perbandingan akumulasi biaya perbaikan per unit. Top 5 paling boros dan Bottom 5 paling hemat dalam 6 bulan terakhir.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<Skeleton className="h-[264px] w-full rounded-md" />}>
                        <LazyUnitCostRankingChart top5={ranking6M.top5} bottom5={ranking6M.bottom5} />
                    </Suspense>
                </CardContent>
            </Card>

            {/* TABEL & STATUS BAWAH */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Riwayat Maintenance Terbaru</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Barang/Jasa</TableHead>
                                    <TableHead className="text-right">Biaya</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentHistories.length > 0 ? (
                                    recentHistories.map((hist) => (
                                        <TableRow key={hist.id}>
                                            <TableCell className="text-xs whitespace-nowrap">{new Date(hist.tanggal).toLocaleDateString('id-ID')}</TableCell>
                                            <TableCell className="font-medium text-xs">{hist.equipment_id}</TableCell>
                                            <TableCell className="text-xs max-w-[150px] truncate" title={hist.nama_barang_atau_jasa}>{hist.nama_barang_atau_jasa}</TableCell>
                                            <TableCell className="text-xs text-right whitespace-nowrap">Rp {Number(hist.jumlah_harga).toLocaleString('id-ID')}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="text-center text-xs">Belum ada riwayat.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Distribusi Status Equipment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-green-600 border-current bg-transparent">Available</Badge>
                            </div>
                            <span className="font-medium">{metrics.availableEquipment} Unit</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-muted-foreground border-current bg-transparent">In Maintenance / Other</Badge>
                            </div>
                            <span className="font-medium">{metrics.maintenanceEquipment} Unit</span>
                        </div>

                        <div className="pt-4 border-t">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-muted-foreground">Kapasitas Operasional</span>
                                <span className="font-medium">{metrics.availabilityRate.toFixed(1)}%</span>
                            </div>
                            <Progress value={metrics.availabilityRate} className="h-3" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export const DashboardView = memo(DashboardViewImpl)

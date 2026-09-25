import React from "react"
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
import { AlertTriangle, Wrench, Truck, CircleDollarSign } from "lucide-react"

// Import komponen Chart dari shadcn dan recharts
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts"

interface DashboardViewProps {
    equipments: any[];
    histories: any[];
    serviceLogs: any[];
    isLoading: boolean;
}

// Konfigurasi warna untuk grafik shadcn
const chartConfig = {
    cost: {
        label: "Total Biaya",
        color: "hsl(var(--primary))",
    }
}

export function DashboardView({ equipments, histories, serviceLogs, isLoading }: DashboardViewProps) {

    if (isLoading) {
        return <div className="flex items-center justify-center h-64 text-muted-foreground">Memuat dashboard...</div>
    }

    const today = new Date();

    // 1. Kalkulasi Metrik Utama
    const totalEquipment = equipments.length;
    const availableEquipment = equipments.filter(eq => eq.status === 'Available').length;
    const maintenanceEquipment = totalEquipment - availableEquipment;
    const availabilityRate = totalEquipment > 0 ? (availableEquipment / totalEquipment) * 100 : 0;
    const totalCost = histories.reduce((sum, hist) => sum + (Number(hist.jumlah_harga) || 0), 0);

    let overdueCount = 0;
    equipments.forEach(eq => {
        const latestLog = serviceLogs
            .filter(log => log.equipment_id === eq.equipment_id)
            .sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime())[0];

        if (latestLog) {
            const nextDate = latestLog.next_service_date ? new Date(latestLog.next_service_date) : null;
            const nextOdo = latestLog.next_service_odometer;
            const currentOdo = eq.last_odometer || 0;

            if ((nextOdo && currentOdo >= nextOdo) || (nextDate && nextDate < today)) {
                overdueCount++;
            }
        }
    });

    // 2. Kalkulasi Data Grafik (3 Bulan Terakhir, Gabung Tanggal)
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
    const chartData = Object.keys(groupedCosts)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        .map(date => ({
            date,
            displayDate: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
            cost: groupedCosts[date]
        }));

    // 3. Riwayat Terbaru (5 Terakhir)
    const recentHistories = [...histories]
        .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
        .slice(0, 5);

    return (
        <div className="flex flex-col gap-6 overflow-auto pb-4 pr-2">

            {/* KARTU METRIK */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
                        <Truck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalEquipment}</div>
                        <p className="text-xs text-muted-foreground">Unit terdaftar di sistem</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Kesiapan Unit (Available)</CardTitle>
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{availableEquipment}</div>
                        <Progress value={availabilityRate} className="mt-2 h-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {availabilityRate.toFixed(0)}% dari total unit siap digunakan
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Biaya Perbaikan</CardTitle>
                        <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Rp {totalCost.toLocaleString('id-ID')}</div>
                        <p className="text-xs text-muted-foreground">Berdasarkan seluruh riwayat</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Servis Terlewat</CardTitle>
                        <AlertTriangle className={`h-4 w-4 ${overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{overdueCount}</div>
                        <p className="text-xs text-muted-foreground">Unit membutuhkan servis segera</p>
                    </CardContent>
                </Card>
            </div>

            {/* GRAFIK BIAYA */}
            <Card>
                <CardHeader>
                    <CardTitle>Tren Biaya Perbaikan</CardTitle>
                    <CardDescription>Total biaya harian dalam 3 bulan terakhir</CardDescription>
                </CardHeader>
                <CardContent>
                    {chartData.length > 0 ? (
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="displayDate"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    className="text-xs"
                                />
                                <YAxis
                                    tickFormatter={(val) => `Rp ${val / 1000}k`}
                                    tickLine={false}
                                    axisLine={false}
                                    width={80}
                                    className="text-xs"
                                />
                                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                                {/* type="monotone" adalah kunci untuk membuat garis menjadi bergelombang/halus */}
                                <Line
                                    type="monotone"
                                    dataKey="cost"
                                    stroke="#FF3C00"
                                    strokeWidth={3}
                                    dot={{ r: 3, fill: "#FF3C00", strokeWidth: 0 }}
                                    activeDot={{ r: 6, fill: "#ea580c", stroke: "white", strokeWidth: 2 }}
                                />
                            </LineChart>
                        </ChartContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm border-dashed border rounded-md">
                            Belum ada data pengeluaran dalam 3 bulan terakhir.
                        </div>
                    )}
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
                            <span className="font-medium">{availableEquipment} Unit</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-muted-foreground border-current bg-transparent">In Maintenance / Other</Badge>
                            </div>
                            <span className="font-medium">{maintenanceEquipment} Unit</span>
                        </div>

                        <div className="pt-4 border-t">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-muted-foreground">Kapasitas Operasional</span>
                                <span className="font-medium">{availabilityRate.toFixed(1)}%</span>
                            </div>
                            <Progress value={availabilityRate} className="h-3" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
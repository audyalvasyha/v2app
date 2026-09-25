import React from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface ServiceMonitoringTableProps {
    equipments: any[];
    serviceLogs: any[];
    isLoading: boolean;
    statusFilter: string; // Tambahkan prop ini
}

export function ServiceMonitoringTable({ equipments, serviceLogs, isLoading, statusFilter }: ServiceMonitoringTableProps) {
    // Fungsi untuk mengecek status dan menghitung progres
    const getServiceStatus = (equipment: any, latestLog: any) => {
        if (!latestLog) return {
            label: "Belum Ada Data",
            customClass: "border-muted-foreground text-muted-foreground bg-transparent",
            progress: 0,
            barColor: "bg-muted"
        };

        const today = new Date();
        const nextDate = latestLog.next_service_date ? new Date(latestLog.next_service_date) : null;
        const nextOdo = latestLog.next_service_odometer;
        const prevOdo = latestLog.odometer_at_service || 0;
        const currentOdo = equipment.last_odometer || 0;

        let isOverdue = false;
        let isWarning = false;
        let progress = 0;

        // Kalkulasi Progres Odometer (0 - 100%)
        if (nextOdo && nextOdo > prevOdo) {
            if (currentOdo >= nextOdo) {
                progress = 100;
                isOverdue = true;
            } else if (currentOdo > prevOdo) {
                progress = ((currentOdo - prevOdo) / (nextOdo - prevOdo)) * 100;
            }

            // Warning jika sisa kurang dari 500 km
            if (nextOdo - currentOdo <= 1000 && currentOdo < nextOdo) isWarning = true;
        }

        // Cek Peringatan berdasarkan Tanggal
        if (nextDate) {
            const diffTime = nextDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) isOverdue = true;
            else if (diffDays <= 14 && diffDays >= 0) isWarning = true; // Sisa < 14 Hari
        }

        // Return format styling Outline transparan
        if (isOverdue) return {
            label: "Terlewat (Overdue)",
            customClass: "text-destructive border-current bg-transparent hover:bg-destructive/10",
            progress,
            barColor: "bg-destructive"
        };
        if (isWarning) return {
            label: "Segera Servis",
            customClass: "text-yellow-600 dark:text-yellow-500 border-current bg-transparent hover:bg-yellow-500/10",
            progress,
            barColor: "bg-yellow-500"
        };
        return {
            label: "Aman",
            customClass: "text-green-600 dark:text-green-500 border-current bg-transparent hover:bg-green-500/10",
            progress,
            barColor: "bg-green-500"
        };
    }
    const processedData = equipments.map(item => {
        const unitLogs = serviceLogs
            .filter(log => log.equipment_id === item.equipment_id)
            .sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime());

        const latestLog = unitLogs[0];
        const status = getServiceStatus(item, latestLog);

        return { item, latestLog, status };
    });
    const filteredProcessedData = processedData.filter(({ status }) => {
        if (statusFilter === "all" || !statusFilter) return true;
        return status.id === statusFilter;
    });

    return (
        <div className="rounded-md border flex-1 overflow-auto bg-card">
            <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                        <TableHead>Equipment ID</TableHead>
                        <TableHead>Plat Nomor</TableHead>
                        <TableHead className="w-[250px]">Odometer (Progres)</TableHead>
                        <TableHead>Tgl Servis Berikutnya</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-32">Memuat data monitoring...</TableCell></TableRow>
                    ) : equipments.length > 0 ? (
                        equipments.map((item) => {
                            const unitLogs = serviceLogs
                                .filter(log => log.equipment_id === item.equipment_id)
                                .sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime());

                            const latestLog = unitLogs[0];
                            const status = getServiceStatus(item, latestLog);

                            return (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium whitespace-nowrap">{item.equipment_id}</TableCell>
                                    <TableCell className="whitespace-nowrap">{item.license_plate || '-'}</TableCell>

                                    {/* Bagian Progress Bar */}
                                    <TableCell>
                                        {latestLog?.next_service_odometer ? (
                                            <div className="flex flex-col gap-1.5 w-full pr-4">
                                                <div className="flex justify-between text-xs font-medium">
                                                    <span>{item.last_odometer || 0} km</span>
                                                    <span className="text-muted-foreground">{latestLog.next_service_odometer} km</span>
                                                </div>
                                                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${status.barColor}`}
                                                        style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        {latestLog?.next_service_date
                                            ? new Date(latestLog.next_service_date).toLocaleDateString('id-ID', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            })
                                            : '-'}
                                    </TableCell>

                                    {/* Bagian Badge Interaktif */}
                                    <TableCell className="text-center">
                                        <Badge variant="outline" className={`border whitespace-nowrap ${status.customClass}`}>
                                            {status.label}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                    ) : (
                        <TableRow><TableCell colSpan={5} className="text-center h-32">Data tidak ditemui.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
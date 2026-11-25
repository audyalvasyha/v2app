"use client"

import React, { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

import {
    summarizeComplaintsByPlate,
    type ComplaintDisplayStatus,
    type ComplaintPlateGroup,
} from "@/lib/complaint-summary"
import { formatDateShort, formatDateTimeWIB, formatNumber } from "@/lib/format"
import {
    normalizeTaskStatus,
    shortUser,
    statusLabel,
    ticketAgeLabel,
    ticketAgeLevel,
    type Task,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

const STATUS_META: Record<
    ComplaintDisplayStatus,
    { label: string; text: string; dot: string; border: string }
> = {
    todo: {
        label: "Baru",
        text: "text-foreground",
        dot: "bg-foreground/45",
        border: "border-foreground/20",
    },
    progress: {
        label: "Diproses",
        text: "text-amber-700 dark:text-amber-400",
        dot: "bg-amber-500",
        border: "border-amber-500/40",
    },
    done: {
        label: "Selesai",
        text: "text-emerald-700 dark:text-emerald-400",
        dot: "bg-emerald-500",
        border: "border-emerald-500/45",
    },
}

const STATUS_ORDER: ComplaintDisplayStatus[] = ["todo", "progress", "done"]

/** Daftar nopol dibatasi supaya register tetap pendek dan cepat dipindai. */
const PLATE_PAGE_SIZE = 8

function actorName(
    email: string | null | undefined,
    userNames: Record<string, string>,
): string | null {
    const normalized = (email ?? "").trim().toLowerCase()
    if (!normalized) return null
    return userNames[normalized] || shortUser(normalized)
}

interface TaskStage {
    status: ComplaintDisplayStatus
    at: string | null | undefined
    email: string | null | undefined
    action: string
}

/**
 * Bikin node tahap dari data atribusi yang tersimpan. Aplikasi belum punya
 * tabel event terpisah, tetapi created/followed_up/resolved sudah mencatat
 * siapa dan kapan di setiap tahap.
 */
function taskStages(task: Task): TaskStage[] {
    const status = normalizeTaskStatus(task.status) as ComplaintDisplayStatus
    const reached = STATUS_ORDER.indexOf(status)
    const stages: TaskStage[] = [
        {
            status: "todo",
            at: task.created_at,
            email: task.created_by,
            action: "mencatat komplain",
        },
    ]
    // Tetap tampilkan tahap lama walau komplain sudah dikembalikan ke
    // status sebelumnya; jejak atribusinya masih tersimpan.
    if (reached >= 1 || task.followed_up_at || task.followed_up_by) {
        stages.push({
            status: "progress",
            at: task.followed_up_at,
            email: task.followed_up_by,
            action: "memulai tindak lanjut",
        })
    }
    if (reached >= 2 || task.resolved_at || task.resolved_by) {
        stages.push({
            status: "done",
            at: task.resolved_at,
            email: task.resolved_by,
            action: "menyelesaikan komplain",
        })
    }
    return stages
}

function TaskStageHistory({
    task,
    userNames,
}: {
    task: Task
    userNames: Record<string, string>
}) {
    const stages = taskStages(task)
    return (
        <ol className="mt-2 border-t border-border/60 pt-2">
            {stages.map((stage, index) => {
                const meta = STATUS_META[stage.status]
                const name = actorName(stage.email, userNames)
                const isLast = index === stages.length - 1
                return (
                    <li
                        key={stage.status}
                        className="relative flex gap-2.5 pb-2.5 last:pb-0"
                    >
                        <span className="relative flex w-2 shrink-0 justify-center self-stretch">
                            <span
                                aria-hidden
                                className={cn(
                                    "absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full",
                                    meta.dot,
                                )}
                            />
                            {!isLast && (
                                <span
                                    aria-hidden
                                    className="absolute bottom-0 left-1/2 top-3 w-px -translate-x-1/2 bg-border"
                                />
                            )}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span
                                    className={cn(
                                        "text-[8px] font-semibold uppercase tracking-[0.14em]",
                                        meta.text,
                                    )}
                                >
                                    {meta.label}
                                </span>
                                {stage.at && (
                                    <span className="font-mono text-[9px] leading-tight text-muted-foreground">
                                        {formatDateTimeWIB(stage.at)}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                                {name ? (
                                    <>
                                        <span className="font-medium text-foreground">
                                            {name}
                                        </span>{" "}
                                        {stage.action}
                                    </>
                                ) : (
                                    "Pelaku tidak tercatat"
                                )}
                            </p>
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}

function RegisterMetric({
    label,
    value,
    detail,
    tone,
}: {
    label: string
    value: number
    detail: string
    tone?: string
}) {
    return (
        <div className="flex min-w-0 flex-col px-3 py-3 lg:flex-row lg:items-start lg:justify-between lg:gap-3 lg:px-4 lg:py-3.5">
            <dt className="min-w-0">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    {label}
                </span>
                <span className="mt-1 hidden text-[10px] leading-tight text-muted-foreground/80 sm:block">
                    {detail}
                </span>
            </dt>
            <dd
                className={cn(
                    "mt-1 shrink-0 font-mono text-xl font-semibold leading-none tabular-nums lg:mt-0",
                    tone,
                )}
            >
                {formatNumber(value)}
            </dd>
        </div>
    )
}

function ReviewDetail({
    group,
    userNames,
    onBack,
    onOpenTask,
}: {
    group: ComplaintPlateGroup
    userNames: Record<string, string>
    onBack: () => void
    onOpenTask: (task: Task) => void
}) {
    return (
        <div className="min-w-0">
            <button
                type="button"
                onClick={onBack}
                className="group inline-flex min-h-11 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-9"
            >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                Kembali ke Review
            </button>

            <header className="mt-4 border-b-2 border-foreground/20 pb-5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Berkas nopol
                    </p>
                    {group.repeated && (
                        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-700 dark:text-rose-400">
                            Berulang
                        </span>
                    )}
                </div>
                <div className="mt-2 min-w-0">
                    <h2 className="min-w-0 break-words font-mono text-4xl font-semibold leading-none tracking-[-0.07em] [overflow-wrap:anywhere] sm:text-6xl">
                        {group.plate}
                    </h2>
                </div>
            </header>

            <dl className="grid grid-cols-3 divide-x divide-border/70 border-b border-border/70">
                {STATUS_ORDER.map((status) => (
                    <div key={status} className="min-w-0 px-3 py-3 sm:px-4">
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {STATUS_META[status].label}
                        </dt>
                        <dd
                            className={cn(
                                "mt-1 font-mono text-2xl font-semibold leading-none tabular-nums",
                                STATUS_META[status].text,
                            )}
                        >
                            {formatNumber(group.statuses[status])}
                        </dd>
                    </div>
                ))}
            </dl>

            <div className="grid gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <section className="order-2 min-w-0 lg:order-1">
                    <div className="flex items-baseline justify-between gap-3 border-b border-foreground/15 pb-2">
                        <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em]">
                            Riwayat komplain
                        </h3>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                            {formatNumber(group.tasks.length)} entri
                        </span>
                    </div>

                    <ol className="ml-1 mt-3 border-l border-border/80">
                        {group.tasks.map((task) => {
                            const status = normalizeTaskStatus(
                                task.status,
                            ) as ComplaintDisplayStatus
                            const meta = STATUS_META[status]
                            const ageLevel = ticketAgeLevel(task)
                            return (
                                <li key={task.id} className="relative pb-5 pl-4 last:pb-0">
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ring-2 ring-background",
                                            meta.dot,
                                        )}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onOpenTask(task)}
                                        className="group w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                    >
                                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            <span
                                                className={cn(
                                                    "text-[9px] font-semibold uppercase tracking-[0.15em]",
                                                    meta.text,
                                                )}
                                            >
                                                {statusLabel(task.status)}
                                            </span>
                                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                                {formatDateShort(task.created_at)}
                                            </span>
                                            {status !== "done" && (
                                                <span
                                                    className={cn(
                                                        "text-[9px] font-semibold uppercase tracking-[0.12em]",
                                                        ageLevel === "overdue"
                                                            ? "text-rose-700 dark:text-rose-400"
                                                            : ageLevel === "attention"
                                                              ? "text-amber-700 dark:text-amber-400"
                                                              : "text-muted-foreground",
                                                    )}
                                                >
                                                    {ticketAgeLabel(task)}
                                                </span>
                                            )}
                                        </span>

                                        <span
                                            className={cn(
                                                "mt-1 block break-words text-sm font-medium leading-snug [overflow-wrap:anywhere] group-hover:underline group-hover:decoration-border group-hover:underline-offset-4",
                                                status === "done" && "text-muted-foreground",
                                            )}
                                        >
                                            {task.title}
                                        </span>

                                        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
                                            {task.sales_name && (
                                                <span className="min-w-0 truncate">
                                                    Sales {task.sales_name}
                                                </span>
                                            )}
                                            {task.delivery_no && (
                                                <span className="min-w-0 truncate">
                                                    DO {task.delivery_no}
                                                </span>
                                            )}
                                            {task.freight_order && (
                                                <span className="min-w-0 truncate">
                                                    FO {task.freight_order}
                                                </span>
                                            )}
                                        </span>
                                    </button>

                                    <TaskStageHistory task={task} userNames={userNames} />

                                    <div className={cn("mt-2 border-l-2 pl-3", meta.border)}>
                                        <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            Catatan tindakan
                                        </p>
                                        {task.description ? (
                                            <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                                                {task.description}
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                                Belum ada catatan tindakan.
                                            </p>
                                        )}
                                        {status === "done" && (
                                            <p
                                                className={cn(
                                                    "mt-1.5 text-[10px] leading-relaxed",
                                                    task.resolution_attachment_path
                                                        ? "text-emerald-700 dark:text-emerald-400"
                                                        : "text-muted-foreground/70",
                                                )}
                                            >
                                                {task.resolution_attachment_path
                                                    ? "Dokumentasi penyelesaian tersedia."
                                                    : "Dokumentasi penyelesaian tidak tercatat."}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                </section>

                <aside className="order-1 min-w-0 space-y-6 lg:order-2 lg:border-l lg:border-border/70 lg:pl-5">
                    <section>
                        <div className="flex items-baseline justify-between gap-3 border-b border-foreground/15 pb-2">
                            <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em]">
                                Sales terkait
                            </h3>
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                {formatNumber(group.sales.length)} nama
                            </span>
                        </div>
                        {group.sales.length > 0 ? (
                            <ul className="divide-y divide-border/70">
                                {group.sales.map((sales) => (
                                    <li
                                        key={sales.name}
                                        className="flex items-baseline justify-between gap-3 py-2"
                                    >
                                        <span className="min-w-0 truncate text-sm">
                                            {sales.name}
                                        </span>
                                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                                            {formatNumber(sales.count)} komplain
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="pt-2 text-xs text-muted-foreground">
                                Nama sales tidak tercatat di komplain nopol ini.
                            </p>
                        )}
                    </section>

                    <p className="border-t border-border/70 pt-3 text-[10px] leading-relaxed text-muted-foreground">
                        Klik satu komplain untuk membuka form tindakan. Status Selesai tetap wajib
                        dilengkapi dokumentasi penyelesaian.
                    </p>
                </aside>
            </div>
        </div>
    )
}

/**
 * Review komplain per nopol.
 *
 * Halaman pertama sengaja hanya menampilkan daftar nopol. Detail komplain
 * dibuka sebagai halaman kedua supaya riwayat, sales, dan tindakan punya
 * ruang penuh tanpa dialog bertumpuk.
 */
export function ComplaintPlateSummary({
    tasks,
    visibleTasks,
    selectedKey,
    userNames,
    onSelectPlate,
    onBack,
    onOpenTask,
}: {
    tasks: Task[]
    visibleTasks: Task[]
    selectedKey: string | null
    userNames: Record<string, string>
    onSelectPlate: (key: string) => void
    onBack: () => void
    onOpenTask: (task: Task) => void
}) {
    const fullSummary = useMemo(() => summarizeComplaintsByPlate(tasks), [tasks])
    const listSummary = useMemo(
        () => summarizeComplaintsByPlate(visibleTasks),
        [visibleTasks],
    )
    const [page, setPage] = useState(1)
    const pageCount = Math.max(1, Math.ceil(listSummary.groups.length / PLATE_PAGE_SIZE))
    const currentPage = Math.min(Math.max(1, page), pageCount)
    const pageStart = (currentPage - 1) * PLATE_PAGE_SIZE
    const pageGroups = listSummary.groups.slice(pageStart, pageStart + PLATE_PAGE_SIZE)
    const pageEnd = Math.min(pageStart + PLATE_PAGE_SIZE, listSummary.groups.length)
    const selected = selectedKey
        ? fullSummary.groups.find((group) => group.key === selectedKey) ?? null
        : null

    // Filter/pencarian baru selalu mulai dari halaman pertama; saat data
    // menyusut, halaman aktif dijepit agar tidak menunjuk halaman kosong.
    useEffect(() => {
        setPage(1)
    }, [visibleTasks])

    useEffect(() => {
        setPage((prev) => Math.min(prev, pageCount))
    }, [pageCount])

    if (selected) {
        return (
            <ReviewDetail
                group={selected}
                userNames={userNames}
                onBack={onBack}
                onOpenTask={onOpenTask}
            />
        )
    }

    return (
        <div className="min-w-0">
            <section className="border-y border-border/70 border-t-2 border-t-foreground/55 bg-card/70">
                <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
                    <div className="px-4 py-5 sm:px-6 sm:py-6">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Complaint register
                            <span aria-hidden className="mx-2 text-muted-foreground/40">
                                /
                            </span>
                            {formatNumber(listSummary.plateCount)} nopol
                        </p>

                        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                            <span className="font-mono text-[3.75rem] font-semibold leading-[0.78] tracking-[-0.09em] tabular-nums sm:text-[5.25rem]">
                                {formatNumber(listSummary.complaintCount)}
                            </span>
                            <div className="min-w-0 pb-1">
                                <p className="text-sm font-medium">komplain pada nopol</p>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    {formatNumber(listSummary.openCount)} belum selesai
                                    <span aria-hidden className="mx-1.5 text-muted-foreground/40">
                                        ·
                                    </span>
                                    {formatNumber(listSummary.repeatedPlateCount)} nopol berulang
                                </p>
                            </div>
                        </div>

                    </div>

                    <dl className="grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 lg:block lg:divide-x-0 lg:divide-y lg:border-l lg:border-t-0">
                        <RegisterMetric
                            label="Aktif"
                            value={listSummary.openCount}
                            detail="belum selesai"
                            tone={
                                listSummary.openCount > 0
                                    ? "text-amber-700 dark:text-amber-400"
                                    : undefined
                            }
                        />
                        <RegisterMetric
                            label="Berulang"
                            value={listSummary.repeatedPlateCount}
                            detail="2 komplain atau lebih"
                            tone={
                                listSummary.repeatedPlateCount > 0
                                    ? "text-rose-700 dark:text-rose-400"
                                    : undefined
                            }
                        />
                        <RegisterMetric
                            label="Tanpa nopol"
                            value={listSummary.withoutPlateCount}
                            detail="perlu dilengkapi"
                        />
                    </dl>
                </div>
            </section>

            <div className="mt-5">
                <div className="flex items-end justify-between gap-3 border-b-2 border-foreground/20 pb-2">
                    <div className="flex min-w-0 items-baseline gap-3">
                        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                            Daftar nopol
                        </h2>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                            {formatNumber(listSummary.groups.length)} nopol
                        </span>
                    </div>
                    <p className="hidden text-[9px] uppercase tracking-[0.12em] text-muted-foreground sm:block">
                        Pilih untuk membuka berkas
                    </p>
                </div>

                {listSummary.groups.length === 0 ? (
                    <div className="border-b border-border/70 py-10">
                        <p className="text-sm font-medium">Tidak ada nopol pada filter ini.</p>
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                            Ubah pencarian atau filter prioritas. Nopol juga harus diisi saat
                            komplain dibuat supaya masuk register.
                        </p>
                    </div>
                ) : (
                    <ul
                        className={cn(
                            "divide-y divide-border/70",
                            listSummary.groups.length <= PLATE_PAGE_SIZE && "border-b border-border/70",
                        )}
                    >
                        {pageGroups.map((group) => (
                            <li key={group.key}>
                                <button
                                    type="button"
                                    onClick={() => onSelectPlate(group.key)}
                                    aria-label={`Buka detail komplain nopol ${group.plate}, ${group.total} total komplain, ${group.open} aktif`}
                                    className="group flex w-full min-w-0 items-center justify-between gap-3 px-3 py-3.5 text-left transition-colors hover:bg-card focus-visible:bg-card focus-visible:outline-none"
                                >
                                    <span className="min-w-0 font-mono text-[15px] font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
                                        {group.plate}
                                    </span>
                                    <span className="flex shrink-0 items-center divide-x divide-border/70">
                                        <span className="pr-3 text-right">
                                            <span className="block text-[8px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                                                Total
                                            </span>
                                            <span className="mt-0.5 block font-mono text-xs font-semibold leading-none tabular-nums">
                                                {formatNumber(group.total)}
                                            </span>
                                        </span>
                                        <span className="pl-3 text-right">
                                            <span className="block text-[8px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                                                Aktif
                                            </span>
                                            <span
                                                className={cn(
                                                    "mt-0.5 block font-mono text-xs font-semibold leading-none tabular-nums",
                                                    group.open > 0
                                                        ? "text-amber-700 dark:text-amber-400"
                                                        : "text-muted-foreground",
                                                )}
                                            >
                                                {formatNumber(group.open)}
                                            </span>
                                        </span>
                                    </span>
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {listSummary.groups.length > PLATE_PAGE_SIZE && (
                    <nav
                        aria-label="Navigasi halaman daftar nopol"
                        className="flex flex-wrap items-center justify-between gap-2 border-y border-border/70 px-3 py-2.5"
                    >
                        <p className="text-[10px] tabular-nums text-muted-foreground">
                            {formatNumber(pageStart + 1)}–{formatNumber(pageEnd)} dari{" "}
                            {formatNumber(listSummary.groups.length)} nopol
                        </p>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon-sm"
                                className="h-9 w-9 bg-card sm:h-8 sm:w-8"
                                aria-label="Halaman nopol sebelumnya"
                                disabled={currentPage <= 1}
                                onClick={() => setPage(Math.max(1, currentPage - 1))}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="min-w-10 text-center text-[11px] tabular-nums text-muted-foreground">
                                {currentPage}/{pageCount}
                            </span>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                className="h-9 w-9 bg-card sm:h-8 sm:w-8"
                                aria-label="Halaman nopol berikutnya"
                                disabled={currentPage >= pageCount}
                                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </nav>
                )}

                {listSummary.withoutPlateCount > 0 && (
                    <p className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
                        <span
                            aria-hidden
                            className="mt-[5px] h-1 w-1 shrink-0 bg-foreground/40"
                        />
                        {formatNumber(listSummary.withoutPlateCount)} komplain belum punya nopol
                        dan tidak masuk register. Lengkapi nopolnya agar ikut terpantau.
                    </p>
                )}
            </div>
        </div>
    )
}

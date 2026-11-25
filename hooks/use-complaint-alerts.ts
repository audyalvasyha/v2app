"use client"

import { useEffect, useState } from "react"

import {
    isMissingTaskTable,
    readLocalTasks,
    TASKS_CHANGED_EVENT,
    type Task,
} from "@/lib/tasks"
import { supabase } from "@/utils/supabase"

export type ComplaintAlertTask = Pick<
    Task,
    "id" | "title" | "status" | "created_at" | "license_plate" | "delivery_no"
>

const TASK_ALERT_COLS = "id,title,status,created_at,license_plate,delivery_no"

function toAlertTask(task: Task): ComplaintAlertTask {
    return {
        id: task.id,
        title: task.title,
        status: task.status,
        created_at: task.created_at,
        license_plate: task.license_plate,
        delivery_no: task.delivery_no,
    }
}

/**
 * Data ringan untuk tab Komplain di lonceng.
 *
 * Papan komplain memuat datanya sendiri saat menu dibuka, sedangkan lonceng
 * hidup di semua menu. Hook ini sengaja hanya mengambil tiket yang belum
 * selesai dan kolom yang dipakai alert, lalu memuat ulang saat papan
 * menyimpan perubahan lewat `TASKS_CHANGED_EVENT`. Kalau tabel `tasks` belum
 * dibuat, data lokal browser tetap dipakai supaya lonceng tidak kosong.
 */
export function useComplaintAlerts(): ComplaintAlertTask[] {
    const [tasks, setTasks] = useState<ComplaintAlertTask[]>([])

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                const { data, error } = await supabase
                    .from("tasks")
                    .select(TASK_ALERT_COLS)
                    .neq("status", "done")

                if (cancelled) return
                if (error) {
                    if (isMissingTaskTable(error.message)) {
                        setTasks(
                            readLocalTasks()
                                .filter((task) => task.status !== "done")
                                .map(toAlertTask),
                        )
                    }
                    // Error jaringan/RLS: pertahankan data terakhir, jangan
                    // mengosongkan lonceng karena satu fetch gagal.
                    return
                }

                setTasks(((data ?? []) as Task[]).map(toAlertTask))
            } catch {
                // Lonceng bersifat pelengkap; kegagalan fetch tidak boleh
                // mengganggu dashboard.
            }
        }

        void load()
        const refresh = () => void load()
        window.addEventListener(TASKS_CHANGED_EVENT, refresh)
        window.addEventListener("focus", refresh)
        return () => {
            cancelled = true
            window.removeEventListener(TASKS_CHANGED_EVENT, refresh)
            window.removeEventListener("focus", refresh)
        }
    }, [])

    return tasks
}

export function dedupSkrRows<T extends {
    delivery_number: string
    pod_date: string
    skr_base_unit: string
    skr_sales_unit: number
    skr_value: string
}>(rows: T[]): { deduped: T[]; dupes: number } {
    const seen = new Map<string, T>()
    const keyOf = (r: T) =>
        [
            (r.delivery_number ?? "").trim(),
            (r.pod_date ?? "").trim(),
            (r.skr_base_unit ?? "").trim(),
            String(r.skr_sales_unit ?? ""),
            (r.skr_value ?? "").trim(),
        ].join("\u0001")
    for (const r of rows) seen.set(keyOf(r), r)
    return { deduped: [...seen.values()], dupes: rows.length - seen.size }
}

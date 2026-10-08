/**
 * Manager route Route Monitoring v3.
 * Pakai:
 *   node scripts/manage-routes.mjs list              → daftar route terdaftar
 *   node scripts/manage-routes.mjs delete <routeId>  → hapus satu route
 *   node scripts/manage-routes.mjs setup             → buat rute yang belum ada (idempoten)
 * Tidak pernah mencetak key.
 */
const key = process.env.TOMTOM_API_KEY
if (!key) {
    console.log("NO_KEY")
    process.exit(0)
}

const BASE = "https://api.tomtom.com/routemonitoring/3/routes"

async function listRoutes() {
    const url = new URL(BASE)
    url.searchParams.set("key", key)
    const res = await fetch(url)
    if (!res.ok) {
        console.log("LIST_FAIL", res.status, (await res.text()).slice(0, 200))
        return []
    }
    return res.json()
}

async function deleteRoute(id) {
    const url = new URL(`${BASE}/${id}`)
    url.searchParams.set("key", key)
    const res = await fetch(url, { method: "DELETE" })
    console.log(`DELETE ${id}: HTTP ${res.status}`)
}

async function createRoute(name, pathPoints) {
    const url = new URL(BASE)
    url.searchParams.set("key", key)
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pathPoints }),
    })
    const body = await res.text()
    if (!res.ok) return { ok: false, status: res.status, body: body.slice(0, 120) }
    const d = JSON.parse(body)
    return { ok: true, routeId: d.routeId, length: d.routeLength, status: d.routeStatus }
}

/**
 * 20 rute — nama & titik dari WEATHER_LOCATIONS (lib/weather.ts).
 * Tiap daerah = 1 rute pendek (dua titik berdekatan di sekitar pusat daerah)
 * supaya selalu jatuh di jalan yang tersambung — mengukur traffic di area itu.
 */
const ROUTES = [
    { name: "Bagan Batu", lat: 1.704, lon: 100.53 },
    { name: "Bagansiapiapi", lat: 2.107, lon: 100.979 },
    { name: "Kec. Bagan Sinembah", lat: 1.67841, lon: 100.46275 },
    { name: "Kec. Bagansiniapi", lat: 1.86, lon: 100.62 },
    { name: "Kec. Balaian Jaya", lat: 1.69047, lon: 100.54387 },
    { name: "Kec. Bangko", lat: 1.77813, lon: 100.95218 },
    { name: "Kec. Bangko Pusako", lat: 1.76, lon: 101.03 },
    { name: "Kec. Batu Hampar", lat: 1.63, lon: 100.36 },
    { name: "Kec. Kubu", lat: 2.08571, lon: 100.65309 },
    { name: "Kec. Kubu Babu", lat: 2.135, lon: 100.735 },
    { name: "Kec. Pasir Limau Kapas", lat: 2.47177, lon: 100.31652 },
    { name: "Kec. Pekaitan", lat: 2.01014, lon: 100.82299 },
    { name: "Kec. Pujud", lat: 1.43393, lon: 100.64714 },
    { name: "Kec. Rantau Kopar", lat: 1.37668, lon: 101.03045 },
    { name: "Kec. Rimba Melintang", lat: 1.74277, lon: 101.01177 },
    { name: "Kec. Simpang Kanan", lat: 1.85477, lon: 100.29938 },
    { name: "Kec. Sinaboi", lat: 2.28, lon: 101.03 },
    { name: "Kec. Tanah Putih", lat: 1.4803, lon: 100.8572 },
    { name: "Kec. Tanah Putih Tanjung Melawan", lat: 1.68585, lon: 101.05418 },
    { name: "Kec. Tanjung Medan", lat: 1.43602, lon: 100.56378 },
]

const cmd = process.argv[2] ?? "list"

if (cmd === "list") {
    const routes = await listRoutes()
    console.log(`jumlah route: ${routes.length}`)
    for (const r of routes) {
        console.log(`- #${r.routeId} "${r.routeName}" status=${r.routeStatus} len=${r.routeLength}m`)
    }
} else if (cmd === "delete") {
    const id = Number(process.argv[3])
    if (!id) { console.log("pakai: delete <routeId>"); process.exit(1) }
    await deleteRoute(id)
} else if (cmd === "delete-name") {
    const name = process.argv[3]
    const routes = await listRoutes()
    for (const r of routes.filter((r) => r.routeName === name)) await deleteRoute(r.routeId)
} else if (cmd === "setup") {
    const existing = await listRoutes()
    const existingNames = new Set(existing.map((r) => r.routeName))
    console.log(`route terdaftar: ${existing.length}`)

    let ok = 0
    let fail = 0
    for (const r of ROUTES) {
        if (existingNames.has(r.name)) {
            console.log(`- "${r.name}" sudah ada, skip`)
            ok++
            continue
        }
        const res = await createRoute(r.name, [
            { latitude: r.lat, longitude: r.lon },
            { latitude: Number((r.lat + 0.008).toFixed(5)), longitude: Number((r.lon + 0.006).toFixed(5)) },
        ])
        if (res.ok) {
            console.log(`+ "${r.name}" → #${res.routeId} (${res.length}m, ${res.status})`)
            ok++
        } else {
            console.log(`x "${r.name}" → HTTP ${res.status}: ${res.body}`)
            fail++
        }
        // jeda kecil agar tidak menabrak rate limit
        await new Promise((r2) => setTimeout(r2, 300))
    }
    console.log(`\nselesai: ok=${ok} fail=${fail}`)
}

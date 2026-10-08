/**
 * Cek detail satu route Route Monitoring v3.
 * Pakai: node scripts/check-routemonitoring.mjs <routeId>
 * Tidak pernah mencetak key.
 */
const key = process.env.TOMTOM_API_KEY
if (!key) {
    console.log("NO_KEY")
    process.exit(0)
}

const id = process.argv[2] ?? "316182"
const url = new URL(`https://api.tomtom.com/routemonitoring/3/routes/${id}/details`)
url.searchParams.set("key", key)

const res = await fetch(url)
console.log("HTTP", res.status)
const body = await res.text()
if (res.ok) {
    // print compact JSON
    try {
        console.log(JSON.stringify(JSON.parse(body), null, 1).slice(0, 1200))
    } catch {
        console.log(body.slice(0, 600))
    }
} else {
    console.log(body.slice(0, 300))
}

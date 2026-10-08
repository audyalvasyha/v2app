/**
 * Probe schema create-route Route Monitoring v3 — iterasi bertahap.
 * Tidak pernah mencetak key.
 */
const key = process.env.TOMTOM_API_KEY
if (!key) {
    console.log("NO_KEY")
    process.exit(0)
}

async function probe(label, payload) {
    const url = new URL("https://api.tomtom.com/routemonitoring/3/routes")
    url.searchParams.set("key", key)
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    })
    const body = await res.text()
    console.log(`--- ${label}: HTTP ${res.status}`)
    console.log(body.slice(0, 500))
}

// Step 4: dua titik dekat di jalan yang sama dekat pool Bagan Batu
await probe("nearby-points", {
    name: "PROBE-DELETE-ME",
    pathPoints: [
        { latitude: 1.704, longitude: 100.53 },
        { latitude: 1.712, longitude: 100.542 },
    ],
})

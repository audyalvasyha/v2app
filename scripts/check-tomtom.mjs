/**
 * Cek TomTom API key — coba beberapa endpoint untuk diagnosis permission.
 * Pakai: node scripts/check-tomtom.mjs
 * Hanya mencetak status HTTP + ringkasan, tidak pernah mencetak key.
 */
const key = process.env.TOMTOM_API_KEY
if (!key) {
    console.log("NO_KEY")
    process.exit(0)
}

const tests = [
    {
        label: "Search Geocoding (Maps product)",
        url: new URL(`https://api.tomtom.com/search/2/geocode/Bagan%20Batu.json?key=${key}&limit=1`),
    },
    {
        label: "Map Tile (Maps product)",
        url: new URL(`https://api.tomtom.com/map/1/tile/basic/main/0/0/0.png?key=${key}`),
    },
    {
        label: "Traffic Flow v4 (traffic product)",
        url: new URL(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${key}&point=1.70400,100.53000`),
    },
]

for (const t of tests) {
    try {
        const res = await fetch(t.url)
        console.log(`--- ${t.label}: HTTP ${res.status}`)
        if (!res.ok) {
            const body = await res.text().catch(() => "")
            console.log("   " + body.slice(0, 160))
        }
    } catch (e) {
        console.log(`--- ${t.label}: FETCH_ERR ${e.message}`)
    }
}

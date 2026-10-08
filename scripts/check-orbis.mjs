/**
 * Cek TomTom Orbis Maps v2 — Traffic Incident Details.
 * Pakai: node scripts/check-orbis.mjs
 * Hanya mencetak status HTTP + ringkasan, tidak pernah mencetak key.
 *
 * Spec: https://docs.tomtom.com/assets/openapi/traffic-orbis-v2.yml
 * GET /maps/orbis/traffic/incidents/details?bbox=...&apiVersion=2
 * Header wajib: TomTom-Api-Version: 2, Attributes: incidents(...)
 */
const key = process.env.TOMTOM_API_KEY
if (!key) {
    console.log("NO_KEY")
    process.exit(0)
}

// Bounding box seluruh Rokan Hilir (longgar): pool Bagan Batu s/d Bagansiapiapi & sekitarnya
const bbox = "100.20,1.30,101.15,2.55"

const url = new URL("https://api.tomtom.com/maps/orbis/traffic/incidents/details")
url.searchParams.set("key", key)
url.searchParams.set("bbox", bbox)
url.searchParams.set("apiVersion", "2")
url.searchParams.set("timeValidity", "present")
url.searchParams.set("language", "en-GB")

const res = await fetch(url, {
    headers: {
        "TomTom-Api-Version": "2",
        // Attributes wajib sesuai spec — minta ringkasan properti incident
        Attributes:
            "incidents(type,geometry(type,coordinates),properties(iconCategory,startTime,endTime,roadNumbers,magnitudeOfDelay))",
        Accept: "application/json",
    },
})

console.log("HTTP", res.status)
const body = await res.text()
if (res.ok) {
    try {
        const d = JSON.parse(body)
        const incidents = d.incidents ?? []
        console.log(`jumlah incident (Rokan Hilir): ${incidents.length}`)
        for (const inc of incidents.slice(0, 5)) {
            const p = inc.properties ?? {}
            console.log(
                `- type=${inc.type ?? "?"} icon=${p.iconCategory ?? "?"} magnitude=${p.magnitudeOfDelay ?? "?"} road=${(p.roadNumbers ?? []).join(",") || "-"}`,
            )
        }
    } catch {
        console.log(body.slice(0, 300))
    }
} else {
    console.log(body.slice(0, 300))
}

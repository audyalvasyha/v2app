/**
 * Logika perkiraan cuaca untuk dashboard fleet.
 *
 * Sumber data: Open-Meteo (https://open-meteo.com) — gratis, tanpa API key,
 * mendukung CORS sehingga bisa di-fetch langsung dari browser (tanpa backend).
 * Semua perhitungan murni dipisah di sini agar bisa dites `vitest` tanpa jaringan.
 *
 * - `WEATHER_LOCATIONS`: seluruh kecamatan Kabupaten Rokan Hilir (sesuai daftar
 *   operasional) ditambah dua kota utama — pool Bagan Batu dan ibu kota
 *   Bagansiapiapi. Titik berlabel [perkiraan] tidak punya koordinat resmi di
 *   GeoNames/Wikipedia; grid model Open-Meteo ~11 km, jadi sel cuaca yang
 *   dihasilkan tetap tepat selama titiknya dekat pusat kecamatan.
 * - Urutan array PENTING: respons Open-Meteo multi-lokasi berupa array yang
 *   urutannya sama persis dengan urutan koordinat pada query (terverifikasi).
 *   `parseWeatherPayload` mencocokkan berdasarkan INDEKS, bukan koordinat.
 * - Kode cuaca mengikuti standar WMO (0 cerah … 99 badai es).
 * - Waktu dari API sudah zona `Asia/Jakarta` (parameter `timezone`), jadi
 *   pembandingan jam cukup dengan string ISO lokal.
 */

export interface WeatherLocationDef {
    id: string
    name: string
    note: string
    latitude: number
    longitude: number
}

export const WEATHER_LOCATIONS: WeatherLocationDef[] = [
    // Dua kota utama operasional
    { id: "bagan-batu", name: "Bagan Batu", note: "Pool utama & workshop · [koordinat dari Google Maps: https://www.google.com/maps/place/PT+PDR+Wings+Bagan+Batu/@1.6696448,100.4473387,18.37z/data=!4m6!3m5!1s0x302cd100474030f5:0xa4406c224b2d0974!8m2!3d1.6689167!4d100.447755!16s%2Fg%2F11yxjd4sgn?entry=ttu&g_ep=EgoyMDI2MTAwNi4wIKXMDSoASAFQAw%3D%3D]", latitude: 1.6689167, longitude: 100.447755 },
    { id: "bagansiapiapi", name: "Bagansiapiapi", note: "Ibu kota kabupaten · pesisir", latitude: 2.107, longitude: 100.979 }, // [perkiraan]
    // 18 kecamatan (urutan mengikuti daftar operasional)
    { id: "kec-bagan-sinembah", name: "Kec. Bagan Sinembah", note: "Rokan Hilir", latitude: 1.67841, longitude: 100.46275 },
    { id: "kec-bagan-sinembah-raya", name: "Kec. Bagan Sinembah Raya", note: "Rokan Hilir", latitude: 1.837, longitude: 100.501 }, // geocode OSM
    { id: "kec-balaian-jaya", name: "Kec. Balai Jaya", note: "Rokan Hilir", latitude: 1.69047, longitude: 100.54387 },
    { id: "kec-bangko", name: "Kec. Bangko", note: "Rokan Hilir", latitude: 1.77813, longitude: 100.95218 },
    { id: "kec-bangko-pusako", name: "Kec. Bangko Pusako", note: "Rokan Hilir", latitude: 1.76, longitude: 101.03 }, // [perkiraan]
    { id: "kec-batu-hampar", name: "Kec. Batu Hampar", note: "Rokan Hilir", latitude: 1.63, longitude: 100.36 }, // [perkiraan]
    { id: "kec-kubu", name: "Kec. Kubu", note: "Rokan Hilir", latitude: 2.08571, longitude: 100.65309 },
    { id: "kec-kubu-babu", name: "Kec. Kubu Babussalam", note: "Rokan Hilir", latitude: 2.135, longitude: 100.735 }, // [perkiraan]
    { id: "kec-pasir-limau-kapas", name: "Kec. Pasir Limau Kapas", note: "Pesisir utara · Rokan Hilir", latitude: 2.47177, longitude: 100.31652 },
    { id: "kec-pekaitan", name: "Kec. Pekaitan", note: "Rokan Hilir", latitude: 2.01014, longitude: 100.82299 },
    { id: "kec-pujud", name: "Kec. Pujud", note: "Rokan Hilir", latitude: 1.43393, longitude: 100.64714 },
    { id: "kec-rantau-kopar", name: "Kec. Rantau Kopar", note: "Rokan Hilir", latitude: 1.37668, longitude: 101.03045 },
    { id: "kec-rimba-melintang", name: "Kec. Rimba Melintang", note: "Rokan Hilir", latitude: 1.74277, longitude: 101.01177 },
    { id: "kec-simpang-kanan", name: "Kec. Simpang Kanan", note: "Rokan Hilir", latitude: 1.85477, longitude: 100.29938 },
    { id: "kec-sinaboi", name: "Kec. Sinaboi", note: "Pesisir utara · Rokan Hilir", latitude: 2.28, longitude: 101.03 },
    { id: "kec-tanah-putih", name: "Kec. Tanah Putih", note: "Rokan Hilir", latitude: 1.4803, longitude: 100.8572 },
    { id: "kec-tanah-putih-tanjung-melawan", name: "Kec. Tanah Putih Tanjung Melawan", note: "Rokan Hilir", latitude: 1.68585, longitude: 101.05418 },
    { id: "kec-tanjung-medan", name: "Kec. Tanjung Medan", note: "Rokan Hilir", latitude: 1.43602, longitude: 100.56378 },
]

const LOCATION_API_BASE = "https://api.open-meteo.com/v1/forecast"

/** URL fetch gabungan untuk semua lokasi (satu request, respons array). */
export function weatherApiUrl(): string {
    const lats = WEATHER_LOCATIONS.map((l) => l.latitude).join(",")
    const lons = WEATHER_LOCATIONS.map((l) => l.longitude).join(",")
    const params = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
        hourly: "precipitation_probability,precipitation,weather_code",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max",
        timezone: "Asia/Jakarta",
        forecast_days: "7",
        // Payload: 24 jam × ~20 lokasi ≈ 45 KB — 168 jam penuh ± 5× lipatnya.
        forecast_hours: "24",
    })
    return `${LOCATION_API_BASE}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Kode cuaca WMO → deskripsi + kelompok (dipakai memilih ikon & warna)
// ---------------------------------------------------------------------------

export type WeatherGroup = "clear" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm"

export interface WeatherDescriptor {
    label: string
    group: WeatherGroup
}

/** Deskripsi Indonesia untuk kode WMO; kode tak dikenal jatuh ke "Berawan". */
export function describeWeatherCode(code: number | null | undefined): WeatherDescriptor {
    // Null/undefined TIDAK boleh lewat Number() — Number(null) === 0 yang
    // kebaca kode "0/Cerah" padahal artinya data tidak tersedia.
    if (code == null) return { label: "—", group: "cloud" }
    const c = Number(code)
    if (!Number.isFinite(c)) return { label: "—", group: "cloud" }
    if (c === 0) return { label: "Cerah", group: "clear" }
    if (c === 1) return { label: "Cerah Berawan", group: "clear" }
    if (c === 2) return { label: "Berawan", group: "cloud" }
    if (c === 3) return { label: "Mendung", group: "cloud" }
    if (c === 45 || c === 48) return { label: "Berkabut", group: "fog" }
    if (c >= 51 && c <= 55) return { label: "Gerimis", group: "drizzle" }
    if (c === 56 || c === 57) return { label: "Gerimis Beku", group: "drizzle" }
    if (c === 61) return { label: "Hujan Ringan", group: "rain" }
    if (c === 63) return { label: "Hujan Sedang", group: "rain" }
    if (c === 65) return { label: "Hujan Lebat", group: "rain" }
    if (c === 66 || c === 67) return { label: "Hujan Beku", group: "rain" }
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { label: "Salju", group: "snow" }
    if (c === 80) return { label: "Hujan Lokal Ringan", group: "rain" }
    if (c === 81) return { label: "Hujan Lokal", group: "rain" }
    if (c === 82) return { label: "Hujan Lokal Lebat", group: "rain" }
    if (c === 95) return { label: "Badai Petir", group: "storm" }
    if (c === 96 || c === 99) return { label: "Badai Petir + Es", group: "storm" }
    return { label: "Berawan", group: "cloud" }
}

// ---------------------------------------------------------------------------
// Parsing payload Open-Meteo
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

export interface CurrentWeather {
    time: string | null
    temperature: number | null
    apparent: number | null
    humidity: number | null
    precipitation: number | null
    code: number | null
    wind: number | null
    gusts: number | null
}

export interface HourForecast {
    /** ISO lokal Asia/Jakarta, mis. "2026-10-08T14:00" */
    time: string
    precipitationProbability: number | null
    precipitation: number | null
    code: number | null
}

export interface DayForecast {
    /** Tanggal lokal "YYYY-MM-DD" */
    date: string
    code: number | null
    tMax: number | null
    tMin: number | null
    rainSum: number | null
    precipProbMax: number | null
    windMax: number | null
    gustMax: number | null
}

export interface LocationWeather {
    def: WeatherLocationDef
    current: CurrentWeather
    hourly: HourForecast[]
    daily: DayForecast[]
}

/** Dua-duanya ISO lokal Asia/Jakarta — string compare aman. */
export function next24Hours(
    hourly: { time?: unknown[]; precipitation_probability?: unknown[]; precipitation?: unknown[]; weather_code?: unknown[] } | null | undefined,
    currentLocalIso: string | null | undefined,
): HourForecast[] {
    if (!currentLocalIso || !hourly || !Array.isArray(hourly.time)) return []
    const start = `${currentLocalIso.slice(0, 13)}:00`
    const times = hourly.time as unknown[]
    // Cari jam pertama >= sekarang; bila semua sudah lewat (tab tidak
    // di-refresh seharian) jatuh ke jam pertama yang tersedia.
    let idx = times.findIndex((t) => String(t) >= start)
    if (idx < 0) idx = 0
    const out: HourForecast[] = []
    for (let i = idx; i < Math.min(idx + 24, times.length); i++) {
        out.push({
            time: String(times[i]),
            precipitationProbability: toNum((hourly.precipitation_probability as unknown[] | undefined)?.[i]),
            precipitation: toNum((hourly.precipitation as unknown[] | undefined)?.[i]),
            code: toNum((hourly.weather_code as unknown[] | undefined)?.[i]),
        })
    }
    return out
}

/**
 * Parse respons Open-Meteo multi-lokasi. Respons adalah array dengan urutan
 * SAMA PERSIS seperti urutan koordinat pada query (terverifikasi langsung ke
 * API) — jadi pencocokan dilakukan per indeks. Entri yang rusak atau berlebih
 * dilewati; lebih baik kurang lokasi daripada data salah tempat.
 */
export function parseWeatherPayload(raw: unknown): LocationWeather[] {
    if (!Array.isArray(raw)) return []
    const out: LocationWeather[] = []
    const n = Math.min(raw.length, WEATHER_LOCATIONS.length)
    for (let i = 0; i < n; i++) {
        const e = raw[i] as {
            current?: Record<string, unknown>
            hourly?: Record<string, unknown>
            daily?: Record<string, unknown>
        } | null
        if (!e || typeof e !== "object") continue
        const def = WEATHER_LOCATIONS[i]

        const cur = e.current ?? {}
        const current: CurrentWeather = {
            time: typeof cur.time === "string" ? cur.time : null,
            temperature: toNum(cur.temperature_2m),
            apparent: toNum(cur.apparent_temperature),
            humidity: toNum(cur.relative_humidity_2m),
            precipitation: toNum(cur.precipitation),
            code: toNum(cur.weather_code),
            wind: toNum(cur.wind_speed_10m),
            gusts: toNum(cur.wind_gusts_10m),
        }

        const hourly = next24Hours(e.hourly as Parameters<typeof next24Hours>[0], current.time)

        const d = e.daily ?? {}
        const dTimes = Array.isArray(d.time) ? (d.time as unknown[]) : []
        const daily: DayForecast[] = dTimes.map((date, di) => ({
            date: String(date),
            code: toNum((d.weather_code as unknown[] | undefined)?.[di]),
            tMax: toNum((d.temperature_2m_max as unknown[] | undefined)?.[di]),
            tMin: toNum((d.temperature_2m_min as unknown[] | undefined)?.[di]),
            rainSum: toNum((d.precipitation_sum as unknown[] | undefined)?.[di]),
            precipProbMax: toNum((d.precipitation_probability_max as unknown[] | undefined)?.[di]),
            windMax: toNum((d.wind_speed_10m_max as unknown[] | undefined)?.[di]),
            gustMax: toNum((d.wind_gusts_10m_max as unknown[] | undefined)?.[di]),
        }))

        out.push({ def, current, hourly, daily })
    }
    return out
}

// ---------------------------------------------------------------------------
// Ringkasan "hari ini" per lokasi & agregat wilayah (dipakai banner dashboard)
// ---------------------------------------------------------------------------

export interface TodayOutlook {
    /** Peluang hujan tertinggi sisa jam hari ini (%). */
    maxProb: number | null
    /** Perkiraan total hujan hari ini (mm) — sisa jam, fallback agregat harian. */
    rainSum: number | null
}

/** Outlook hari ini: sisa jam dari hourly; bila kosong, pakai agregat harian. */
export function todayOutlook(loc: LocationWeather): TodayOutlook {
    const day = loc.current.time?.slice(0, 10) ?? loc.daily[0]?.date ?? null
    if (!day) return { maxProb: null, rainSum: null }
    let maxProb: number | null = null
    let rainSum: number | null = null
    let hasRain = false
    for (const h of loc.hourly) {
        if (!h.time.startsWith(day)) continue
        if (h.precipitationProbability != null) maxProb = Math.max(maxProb ?? -1, h.precipitationProbability)
        if (h.precipitation != null) {
            rainSum = (rainSum ?? 0) + h.precipitation
            hasRain = true
        }
    }
    const d0 = loc.daily[0]
    if (maxProb == null && d0?.precipProbMax != null) maxProb = d0.precipProbMax
    if (!hasRain && d0?.rainSum != null) rainSum = d0.rainSum
    return { maxProb, rainSum }
}

// ---------------------------------------------------------------------------
// Penilaian risiko perjalanan (fokus operasional: hujan & angin)
// ---------------------------------------------------------------------------

export type RiskLevel = "aman" | "waspada" | "tinggi"

export interface TravelRisk {
    level: RiskLevel
    reason: string
}

const HEAVY_CODES = new Set([65, 82, 95, 96, 99])

/** Cari nilai maksimum probability/precipitation dalam beberapa jam ke depan. */
function windowMax(hours: HourForecast[], windowCount: number): { prob: number; precip: number } {
    let prob = 0
    let precip = 0
    for (const h of hours.slice(0, windowCount)) {
        prob = Math.max(prob, h.precipitationProbability ?? 0)
        precip = Math.max(precip, h.precipitation ?? 0)
    }
    return { prob, precip }
}

/**
 * Risiko perjalanan 12 jam ke depan untuk satu lokasi:
 * - `tinggi`: hujan lebat berlangsung / diprediksi, atau badai petir.
 * - `waspada`: gerimis/hujan ringan, peluang hujan menengah, atau angin kencang.
 * - `aman`: sisanya.
 */
export function assessTravelRisk(current: CurrentWeather, hours: HourForecast[]): TravelRisk {
    const curCode = current.code ?? null
    const curRain = current.precipitation ?? 0
    const w12 = windowMax(hours, 12)

    const heavyNow = (curCode != null && HEAVY_CODES.has(curCode)) || curRain >= 2.5
    if (heavyNow) {
        const d = describeWeatherCode(curCode)
        return { level: "tinggi", reason: `${d.label} berlangsung sekarang (${curRain.toFixed(1)} mm/jam)` }
    }
    if (w12.prob >= 70 || w12.precip >= 5) {
        return { level: "tinggi", reason: `Potensi hujan lebat 12 jam ke depan (puncak ${Math.round(w12.prob)}% / ${w12.precip.toFixed(1)} mm)` }
    }

    const lightNow = (curCode != null && (describeWeatherCode(curCode).group === "drizzle" || describeWeatherCode(curCode).group === "rain")) || curRain > 0
    if (lightNow) {
        const d = describeWeatherCode(curCode)
        return { level: "waspada", reason: `${d.label} saat ini — jalan bisa licin` }
    }
    if (w12.prob >= 50 || w12.precip >= 1) {
        return { level: "waspada", reason: `Peluang hujan menengah 12 jam ke depan (puncak ${Math.round(w12.prob)}%)` }
    }
    const gustNow = current.gusts ?? 0
    if (gustNow >= 35) {
        return { level: "waspada", reason: `Angin kencang (hembusan hingga ${Math.round(gustNow)} km/jam)` }
    }
    return { level: "aman", reason: "Kondisi aman untuk perjalanan" }
}

/** Ringkasan wilayah untuk banner dashboard: risiko terburuk + hitungan. */
export interface RegionSummary {
    worst: TravelRisk | null
    worstLocation: WeatherLocationDef | null
    /** Jumlah lokasi berstatus waspada atau tinggi. */
    alertCount: number
    totalLocations: number
}

export function regionWeatherSummary(locations: LocationWeather[]): RegionSummary {
    const RANK: Record<RiskLevel, number> = { aman: 0, waspada: 1, tinggi: 2 }
    let worst: TravelRisk | null = null
    let worstLocation: WeatherLocationDef | null = null
    let alertCount = 0
    for (const loc of locations) {
        const risk = assessTravelRisk(loc.current, loc.hourly)
        if (risk.level !== "aman") alertCount += 1
        if (!worst || RANK[risk.level] > RANK[worst.level]) {
            worst = risk
            worstLocation = loc.def
        }
    }
    return { worst, worstLocation, alertCount, totalLocations: locations.length }
}

/** Format jam lokal dari ISO "2026-10-08T14:00" → "14.00" (gaya Indonesia). */
export function hourLabel(iso: string): string {
    const hh = iso.slice(11, 13)
    return hh ? `${hh}.00` : "—"
}

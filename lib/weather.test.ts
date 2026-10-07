import { describe, it, expect } from "vitest"
import {
    WEATHER_LOCATIONS,
    weatherApiUrl,
    describeWeatherCode,
    next24Hours,
    parseWeatherPayload,
    assessTravelRisk,
    regionWeatherSummary,
    todayOutlook,
    hourLabel,
    type CurrentWeather,
    type LocationWeather,
} from "@/lib/weather"

describe("daftar lokasi", () => {
    it("berisi 2 kota + 18 kecamatan Rokan Hilir", () => {
        expect(WEATHER_LOCATIONS).toHaveLength(20)
        expect(WEATHER_LOCATIONS[0].name).toBe("Bagan Batu")
        expect(WEATHER_LOCATIONS[1].name).toBe("Bagansiapiapi")
        const kec = WEATHER_LOCATIONS.filter((l) => l.id.startsWith("kec-"))
        expect(kec).toHaveLength(18)
    })

    it("semua id unik dan koordinat wajar (Riau area)", () => {
        const ids = new Set(WEATHER_LOCATIONS.map((l) => l.id))
        expect(ids.size).toBe(WEATHER_LOCATIONS.length)
        for (const l of WEATHER_LOCATIONS) {
            expect(l.latitude).toBeGreaterThan(-1)
            expect(l.latitude).toBeLessThan(4)
            expect(l.longitude).toBeGreaterThan(99)
            expect(l.longitude).toBeLessThan(103)
        }
    })
})

describe("weatherApiUrl", () => {
    it("memuat semua lokasi dan parameter penting", () => {
        const url = weatherApiUrl()
        expect(url).toContain("api.open-meteo.com")
        expect(url).toContain("2.28")
        expect(url).toContain("timezone=Asia%2FJakarta")
        expect(url).toContain("forecast_days=7")
        expect(url).toContain("forecast_hours=24")
        expect(url).toContain("precipitation_probability")
        // 20 koordinat (URLSearchParams meng-encode koma sebagai %2C)
        expect(url.split("latitude=")[1].split("&")[0].split("%2C")).toHaveLength(20)
    })
})

describe("describeWeatherCode - kode WMO ke label Indonesia", () => {
    it("mengenali kelompok utama", () => {
        expect(describeWeatherCode(0)).toEqual({ label: "Cerah", group: "clear" })
        expect(describeWeatherCode(3)).toEqual({ label: "Mendung", group: "cloud" })
        expect(describeWeatherCode(45)).toEqual({ label: "Berkabut", group: "fog" })
        expect(describeWeatherCode(53)).toEqual({ label: "Gerimis", group: "drizzle" })
        expect(describeWeatherCode(65)).toEqual({ label: "Hujan Lebat", group: "rain" })
        expect(describeWeatherCode(95)).toEqual({ label: "Badai Petir", group: "storm" })
    })

    it("kode tidak dikenal atau kosong tidak crash dan tidak jadi 'Cerah'", () => {
        expect(describeWeatherCode(1234).group).toBe("cloud")
        expect(describeWeatherCode(null).label).toBe("—")
        expect(describeWeatherCode(undefined).label).toBe("—")
    })
})

describe("next24Hours - slice jam dari waktu saat ini", () => {
    const hourly = {
        time: [
            "2026-10-07T00:00",
            "2026-10-07T06:00",
            "2026-10-07T12:00",
            "2026-10-07T18:00",
            "2026-10-08T00:00",
            "2026-10-08T06:00",
        ],
        precipitation_probability: [10, 20, 30, 40, 50, 60],
        precipitation: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
        weather_code: [0, 1, 2, 61, 63, 65],
    }

    it("memulai dari jam saat ini, maksimal 24 entri", () => {
        const out = next24Hours(hourly, "2026-10-07T12:30")
        expect(out).toHaveLength(4) // 12:00, 18:00, 00:00, 06:00
        expect(out[0].time).toBe("2026-10-07T12:00")
        expect(out[0].precipitationProbability).toBe(30)
        expect(out[3].code).toBe(65)
    })

    it("membatasi 24 jam saat data panjang", () => {
        const times: string[] = []
        const prob: number[] = []
        for (let d = 1; d <= 7; d++) {
            for (let h = 0; h < 24; h++) {
                times.push(`2026-10-0${d}T${String(h).padStart(2, "0")}:00`)
                prob.push(h)
            }
        }
        const out = next24Hours({ time: times, precipitation_probability: prob }, "2026-10-02T10:00")
        expect(out).toHaveLength(24)
        expect(out[0].time).toBe("2026-10-02T10:00")
        expect(out[23].time).toBe("2026-10-03T09:00")
    })

    it("hourly kosong → array kosong; waktu lewat semua → jam pertama tersedia", () => {
        expect(next24Hours(null, "2026-10-07T12:00")).toEqual([])
        expect(next24Hours({ time: [] }, "2026-10-07T12:00")).toEqual([])
        expect(next24Hours(hourly, null)).toEqual([])
        const out = next24Hours(hourly, "1999-01-01T00:00")
        expect(out).toHaveLength(6)
        expect(out[0].time).toBe("2026-10-07T00:00")
    })
})

// Builder payload contoh sesuai bentuk Open-Meteo multi-lokasi.
function sampleEntry(overrides: {
    current?: Record<string, unknown>
    hourly?: Record<string, unknown>
    daily?: Record<string, unknown>
} = {}) {
    return {
        latitude: 0,
        longitude: 0,
        current: {
            time: "2026-10-07T21:30",
            temperature_2m: 27.4,
            relative_humidity_2m: 86,
            apparent_temperature: 33.8,
            precipitation: 0,
            weather_code: 2,
            wind_speed_10m: 1.2,
            wind_gusts_10m: 1.8,
            ...overrides.current,
        },
        hourly: {
            time: ["2026-10-07T21:00", "2026-10-07T22:00", "2026-10-07T23:00", "2026-10-08T00:00"],
            precipitation_probability: [55, 65, 70, 40],
            precipitation: [0.2, 0.5, 1.2, 0],
            weather_code: [51, 61, 63, 2],
            ...overrides.hourly,
        },
        daily: {
            time: ["2026-10-07", "2026-10-08"],
            weather_code: [2, 95],
            temperature_2m_max: [33, 32],
            temperature_2m_min: [24, 24],
            precipitation_sum: [1.9, 12],
            precipitation_probability_max: [70, 90],
            wind_speed_10m_max: [12, 20],
            wind_gusts_10m_max: [18, 30],
            ...overrides.daily,
        },
    }
}

describe("parseWeatherPayload - pencocokan per-indeks dengan WEATHER_LOCATIONS", () => {
    it("entri ke-i dipetakan ke lokasi ke-i (urutan kontrak API)", () => {
        // Buat payload dengan current.temperature berbeda per entri untuk
        // membuktikan urutan, bukan pencocokan koordinat.
        const raw = WEATHER_LOCATIONS.map((_, i) =>
            sampleEntry({ current: { temperature_2m: 20 + i } }),
        )
        const parsed = parseWeatherPayload(raw)
        expect(parsed).toHaveLength(20)
        expect(parsed[0].def.name).toBe("Bagan Batu")
        expect(parsed[0].current.temperature).toBe(20)
        expect(parsed[19].def.name).toBe("Kec. Tanjung Medan")
        expect(parsed[19].current.temperature).toBe(39)
    })

    it("payload pendek → hanya entri valid yang dipetakan", () => {
        const parsed = parseWeatherPayload([sampleEntry(), sampleEntry()])
        expect(parsed).toHaveLength(2)
        expect(parsed[0].def.id).toBe("bagan-batu")
        expect(parsed[1].def.id).toBe("bagansiapiapi")
    })

    it("entri rusak di tengah dilewati tanpa merusak indeks lokasi lain", () => {
        const raw: unknown[] = WEATHER_LOCATIONS.map(() => sampleEntry())
        raw[5] = null // kec-bangko (indeks 5) rusak
        const parsed = parseWeatherPayload(raw)
        expect(parsed.find((p) => p.def.id === "kec-bangko")).toBeUndefined()
        // Tetangganya tetap ada dan tetap di posisinya
        expect(parsed.find((p) => p.def.id === "kec-bagansiniapi")).toBeDefined()
        expect(parsed.find((p) => p.def.id === "kec-bangko-pusako")).toBeDefined()
    })

    it("payload bukan array / kosong → array kosong", () => {
        expect(parseWeatherPayload(null)).toEqual([])
        expect(parseWeatherPayload({})).toEqual([])
        expect(parseWeatherPayload([])).toEqual([])
    })

    it("hourly dipotong 24 jam mulai jam current", () => {
        const parsed = parseWeatherPayload([sampleEntry()])
        expect(parsed[0].hourly.length).toBeGreaterThan(0)
        expect(parsed[0].hourly[0].time).toBe("2026-10-07T21:00")
        expect(parsed[0].hourly[0].precipitationProbability).toBe(55)
    })

    it("daily dipetakan lengkap", () => {
        const parsed = parseWeatherPayload([sampleEntry()])
        expect(parsed[0].daily).toHaveLength(2)
        expect(parsed[0].daily[1].code).toBe(95)
        expect(parsed[0].daily[1].rainSum).toBe(12)
    })
})

describe("todayOutlook - ringkasan hari ini", () => {
    it("menghitung dari sisa jam hari ini", () => {
        const loc = parseWeatherPayload([sampleEntry()])[0]
        const out = todayOutlook(loc)
        // Sisa jam 2026-10-07: prob 55,65,70 → max 70; hujan 0.2+0.5+1.2 = 1.9
        expect(out.maxProb).toBe(70)
        expect(out.rainSum).toBeCloseTo(1.9)
    })

    it("fallback ke agregat harian bila hourly kosong", () => {
        const loc = parseWeatherPayload([
            sampleEntry({ hourly: { time: [], precipitation_probability: [], precipitation: [], weather_code: [] } }),
        ])[0]
        const out = todayOutlook(loc)
        expect(out.maxProb).toBe(70)
        expect(out.rainSum).toBeCloseTo(1.9)
    })

    it("lokasi tanpa data → null", () => {
        const empty: LocationWeather = {
            def: WEATHER_LOCATIONS[0],
            current: {
                time: null, temperature: null, apparent: null, humidity: null,
                precipitation: null, code: null, wind: null, gusts: null,
            },
            hourly: [],
            daily: [],
        }
        const out = todayOutlook(empty)
        expect(out.maxProb).toBeNull()
        expect(out.rainSum).toBeNull()
    })
})

describe("assessTravelRisk - penilaian risiko perjalanan", () => {
    const baseCurrent: CurrentWeather = {
        time: "2026-10-07T21:30",
        temperature: 27, apparent: 31, humidity: 85,
        precipitation: 0, code: 0, wind: 5, gusts: 8,
    }

    const hours = (probs: number[], precips: number[] = [], codes: number[] = []): Parameters<typeof assessTravelRisk>[1] =>
        probs.map((p, i) => ({
            time: `2026-10-07T${String(i).padStart(2, "0")}:00`,
            precipitationProbability: p,
            precipitation: precips[i] ?? 0,
            code: codes[i] ?? null,
        }))

    it("kondisi cerah → aman", () => {
        expect(assessTravelRisk(baseCurrent, hours([10, 15, 20])).level).toBe("aman")
    })

    it("hujan lebat berlangsung → tinggi", () => {
        const r = assessTravelRisk({ ...baseCurrent, code: 65, precipitation: 3.1 }, [])
        expect(r.level).toBe("tinggi")
        expect(r.reason).toContain("Hujan Lebat")
    })

    it("badai petir di kode current → tinggi", () => {
        expect(assessTravelRisk({ ...baseCurrent, code: 95 }, []).level).toBe("tinggi")
    })

    it("potensi hujan lebat 12 jam ke depan → tinggi", () => {
        const r = assessTravelRisk(baseCurrent, hours([40, 80, 85], [0, 1, 6.2]))
        expect(r.level).toBe("tinggi")
        expect(r.reason).toContain("12 jam")
    })

    it("gerimis saat ini → waspada", () => {
        expect(assessTravelRisk({ ...baseCurrent, code: 51, precipitation: 0.2 }, []).level).toBe("waspada")
    })

    it("peluang hujan menengah ke depan → waspada", () => {
        expect(assessTravelRisk(baseCurrent, hours([10, 55, 45])).level).toBe("waspada")
    })

    it("angin kencang → waspada", () => {
        const r = assessTravelRisk({ ...baseCurrent, gusts: 40 }, [])
        expect(r.level).toBe("waspada")
        expect(r.reason).toContain("Angin")
    })

    it("hujan lebat berlangsung menang atas penilaian lain", () => {
        const r = assessTravelRisk({ ...baseCurrent, code: 95, precipitation: 5 }, hours([90], [10]))
        expect(r.level).toBe("tinggi")
        expect(r.reason).toContain("berlangsung")
    })
})

describe("regionWeatherSummary - ringkasan wilayah", () => {
    // Payload dasar yang AMAN: hourly peluang rendah supaya tingkat risiko
    // murni ditentukan override per tes (default sampleEntry memang hujan).
    const safeEntry = () =>
        sampleEntry({
            current: { weather_code: 0, precipitation: 0 },
            hourly: {
                time: ["2026-10-07T21:00", "2026-10-07T22:00", "2026-10-07T23:00", "2026-10-08T00:00"],
                precipitation_probability: [5, 10, 8, 5],
                precipitation: [0, 0, 0, 0],
                weather_code: [0, 0, 0, 0],
            },
            daily: { precipitation_probability_max: [10, 10] },
        })

    it("menghitung risiko terburuk & jumlah lokasi bermasalah", () => {
        const raw = WEATHER_LOCATIONS.map((_, i) =>
            sampleEntry({
                current: { weather_code: i === 2 ? 95 : i === 5 ? 51 : 0, precipitation: 0 },
                hourly: {
                    time: ["2026-10-07T21:00", "2026-10-07T22:00", "2026-10-07T23:00", "2026-10-08T00:00"],
                    precipitation_probability: [5, 10, 8, 5],
                    precipitation: [0, 0, 0, 0],
                    weather_code: [i === 2 ? 95 : i === 5 ? 51 : 0, 0, 0, 0],
                },
                daily: { precipitation_probability_max: [10, 10] },
            }),
        )
        const parsed = parseWeatherPayload(raw)
        const sum = regionWeatherSummary(parsed)
        expect(sum.totalLocations).toBe(20)
        expect(sum.worst?.level).toBe("tinggi")
        // Indeks 2 = kec-bagan-sinembah (kode 95)
        expect(sum.worstLocation?.id).toBe("kec-bagan-sinembah")
        // 1 tinggi (indeks 2) + 1 waspada (indeks 5)
        expect(sum.alertCount).toBe(2)
    })

    it("semua aman → worst aman, alert 0", () => {
        const parsed = parseWeatherPayload(WEATHER_LOCATIONS.map(() => safeEntry()))
        const sum = regionWeatherSummary(parsed)
        expect(sum.worst?.level).toBe("aman")
        expect(sum.alertCount).toBe(0)
    })

    it("array kosong → worst null", () => {
        const sum = regionWeatherSummary([])
        expect(sum.worst).toBeNull()
        expect(sum.worstLocation).toBeNull()
        expect(sum.alertCount).toBe(0)
        expect(sum.totalLocations).toBe(0)
    })
})

describe("hourLabel", () => {
    it("menampilkan jam gaya Indonesia", () => {
        expect(hourLabel("2026-10-08T14:00")).toBe("14.00")
        expect(hourLabel("2026-10-08T05:00")).toBe("05.00")
        expect(hourLabel("x")).toBe("—")
    })
})

import { describe, it, expect } from "vitest"

/**
 * BUKAN pengganti tsc — verifikasi jalur import/runtime.
 * Semua modul cuaca di-import supaya kalau ada kesalahan sintaks, export
 * hilang, atau siklus impor, test ini gagal sebelum mencapai browser.
 * (tsc scoped terbukti jalan di pass A1: EXIT 0.)
 */
describe("modul cuaca bisa dimuat utuh", () => {
    it("chart, view, banner, dan lib semuanya ter-import", async () => {
        const chart = await import("./weather-chart")
        const view = await import("./weather-view")
        const banner = await import("./weather-banner")
        const display = await import("./weather-display")
        const lib = await import("@/lib/weather")
        const hook = await import("@/hooks/use-weather")

        expect(chart.WeatherChart).toBeDefined()
        expect(view.WeatherView).toBeDefined()
        expect(banner.WeatherBanner).toBeDefined()
        expect(display.WeatherEmoji).toBeDefined()
        expect(display.RISK_TONE).toBeDefined()
        expect(lib.WEATHER_LOCATIONS).toHaveLength(20)
        expect(hook.useWeather).toBeDefined()
    })
})

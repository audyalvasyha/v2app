/**
 * Konfigurasi TomTom Traffic API.
 *
 * API key dibaca dari environment (TOMTOM_API_KEY) — tidak pernah di-hardcode
 * agar tidak ikut ke bundle browser. Helper ini hanya dipakai di sisi server
 * (route handler / server component), sama seperti pola env di file lain.
 */

export const TOMTOM_BASE_URL =
    "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"

export const TOMTOM_API_KEY_ENV = "TOMTOM_API_KEY"

/** True kalau key sudah diset di environment (tanpa membaca nilainya). */
export function hasTomTomKey(): boolean {
    return Boolean(process.env.TOMTOM_API_KEY)
}

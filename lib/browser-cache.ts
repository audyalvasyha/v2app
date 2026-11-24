/**
 * Cache browser yang memuat data operasional atau percakapan user.
 *
 * Preferensi tema/sidebar sengaja tidak ikut dihapus karena tidak sensitif.
 * Dipakai saat logout eksplisit DAN saat sesi hilang/kedaluwarsa dari tab lain;
 * tanpa jalur kedua, data lama tetap bisa dibaca di perangkat bersama setelah
 * AuthGate kembali menampilkan halaman login.
 */
const SENSITIVE_CACHE_KEYS = [
    "fleet-cache-v2",
    "fleet-tasks-v1",
    "midaa.ai-chat.v1",
    "analisa-brief-cache-v1",
    "weather-cache-v1",
] as const

export function clearSensitiveBrowserCache(): void {
    if (typeof window === "undefined") return
    try {
        for (const key of SENSITIVE_CACHE_KEYS) {
            window.localStorage.removeItem(key)
        }
    } catch {
        // localStorage bisa diblokir (mode privat/kebijakan browser).
    }
}

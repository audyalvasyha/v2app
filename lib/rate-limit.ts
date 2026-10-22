/**
 * Rate limit fixed-window, in-memory, per IP — untuk endpoint GLOBAL yang
 * tidak punya sesi user yang bisa jadi kuncinya (peta traffic, proxy tile
 * TomTom, historis traffic).
 *
 * Kenapa dibutuhkan: `/api/traffic*` publik dan setiap tile proxy = satu
 * panggilan upstream TomTom (dibayar per kuota). Tanpa lapisan ini, satu
 * script bisa memangkas habis kuota hari-an TomTom dan mematikan overlay
 * traffic + sisa fitur yang menggunakannya.
 *
 * Kunci: IP dari `x-forwarded-for` (Vercel/Next set ini untuk setiap
 * request masuk). In-memory per instance serverless: tidak sempurna, tapi
 * cukup mematikan abuse sederhana dan tidak butuh state eksternal.
 */

interface WindowRecord {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowRecord>();
/** Peta dibuang saat menumpuk agar tidak jadi kebocoran memori. */
const MAX_TRACKED = 5000;

/** Ambil identitas klien: IP pertama di chain XFF (dipakai terakhir). */
export function clientIpOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * True bila IP ini masih boleh lewat di jendela `limit`/`windowMs`.
 * Panggil SEBELUM pekerjaan upstream supaya request yang ditolak tidak
 * memakan kuota. Bila window kedaluwarsa, hitungan mulai dari satu.
 */
export function withinIpLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const rec = windows.get(key);
  if (!rec || rec.resetAt <= now) {
    if (windows.size > MAX_TRACKED) windows.clear();
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= limit;
}

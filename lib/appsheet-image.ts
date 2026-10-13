/**
 * Pemanggil URL proxy AppSheet — satu-satunya tempat alamat gambar dibangun.
 *
 * Arsitektur gambar korporat (disepakati, ikuti di setiap fitur baru):
 *   AppSheet upload foto → file tersimpan di Google Drive korporat →
 *   hanya path relatif (mis. "tire_check_details_Images/foto123.jpg")
 *   di database Supabase karena izin Drive korporat tidak bisa diakses
 *   frontend langsung → frontend merakit URL proxy AppSheet
 *   (`/template/gettablefileurl`) yang membuka file itu secara publik
 *   (fitur "Require Image and File URL Signing" dimatikan di AppSheet).
 *
 * Format URL wajib:
 *   https://www.appsheet.com/template/gettablefileurl
 *     ?appName=<NamaApp-AppId>
 *     &tableName=<NamaTabel>
 *     &fileName=<encodeURIComponent(path)>
 */

/** Nama + ID AppSheet app-nya (env publik: tersedia di browser client). */
const APP_NAME = process.env.NEXT_PUBLIC_APPSHEET_APP_NAME ?? ""

/**
 * Supabase menyimpan salah satu dari:
 *   - URL http(s) utuh  → dipakai apa adanya (kompatibel data lama).
 *   - Path AppSheet     → dibungkus URL proxy gettablefileurl.
 *   - kosong            → null (UI menampilkan placeholder, bukan error).
 *
 * tableName diturunkan dari konvensi folder AppSheet:
 *   "tire_check_details_Images/foto123.jpg" → tableName "tire_check_details".
 * Path di luar pola "_Images/" memakai fallback param `defaultTable`.
 */
export function appsheetFileUrl(
    path: unknown,
    defaultTable = "tire_check_details",
): string | null {
    const p = String(path ?? "").trim()
    if (!p) return null
    if (/^https?:\/\//i.test(p)) return p
    if (!APP_NAME) return null // konfigurasi belum diisi → UI pakai placeholder

    const match = /^([A-Za-z0-9_]+)_Images\//i.exec(p)
    const tableName = match ? match[1] : defaultTable
    const fileName = encodeURIComponent(p)

    return (
        "https://www.appsheet.com/template/gettablefileurl" +
        `?appName=${encodeURIComponent(APP_NAME)}` +
        `&tableName=${encodeURIComponent(tableName)}` +
        `&fileName=${fileName}`
    )
}

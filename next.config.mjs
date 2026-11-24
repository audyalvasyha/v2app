/** @type {import('next').NextConfig} */
const nextConfig = {
  // Jangan bocorkan versi framework di header respons.
  poweredByHeader: false,
  // Preview Freebuff dibuka lewat domain proxy acak. Tanpa ini Next.js
  // memblokir aset dev/HMR dari domain tersebut sehingga preview bisa kosong
  // atau tidak ikut ter-update. Pengaturan ini hanya berlaku saat `next dev`.
  allowedDevOrigins: ['*.daytonaproxy01.net', '*.daytonaproxy.net'],
  // Header pertahanan dasar. CSP tidak dipasang di sini karena aplikasi
  // memakai inline style dari Leaflet/Tailwind; header di bawah aman untuk
  // semua halaman dan tidak mengubah perilaku UI.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Preview Freebuff dirender di dalam iframe. `DENY` membuat panel
          // preview kosong walau server membalas 200, jadi header itu hanya
          // dipasang di produksi. Build produksi tetap menolak framing.
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'X-Frame-Options', value: 'DENY' }]
            : []),
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
  // Whitelist domain proxy gambar AppSheet (Drive korporat) untuk next/image.
  // Format wajib: /template/gettablefileurl?appName=...&tableName=...&fileName=...
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'www.appsheet.com', pathname: '/template/**' },
    ],
  },
  // Type checking tetap ON saat build. Sebelumnya di-ignore karena sisa
  // template bawaan; sekarang codebase bersih (tsc --noEmit hijau), jadi
  // error type harus menggagalkan build daripada lolos diam-diam ke produksi.
  typescript: {
    ignoreBuildErrors: false,
  },
  // recharts/lucide punya banyak modul kecil; tanpa ini Next.js menyatukan
  // seluruhnya ke tiap route yang memakainya. Hanya paket yang di bundle
  // browser, jadi tidak ada risikonya ke API route.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "sonner"],
  },
}

export default nextConfig
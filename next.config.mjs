/** @type {import('next').NextConfig} */
const nextConfig = {
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
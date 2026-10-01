// Boundary tunggal untuk seluruh grafik recharts.
//
// Sebelumnya tiap grafik di-import sendiri (React.lazy / import statis), dan
// Turbopack membuat salinan recharts sendiri untuk masing-masing — library
// 389 KB raw terisi 3× di output build. Dengan semua grafik keluar dari modul
// ini dan dimuat lewat dynamic() yang sama persis, bundler cukup membuat satu
// chunk: user yang membuka beberapa tab cukup mengunduh satu salinan recharts.

export { default as CostChart } from "@/components/organisms/cost-chart"
export { default as UnitCostRankingChart } from "@/components/organisms/unit-cost-ranking-chart"
export { SkrMonthChart } from "@/components/molecules/skr-month-chart"
"use client";

import React from "react";
import { Button } from "../ui/button";
import { Disc3, ArrowRight } from "lucide-react";

/**
 * Pemberitahuan Coming Soon untuk menu Analisa Ban.
 *
  Dibongkar dari `components/organisms/ban-analysis.tsx` — saat ini menu
  ini masih dalam pengembangan. Komponen ini bersih dan berdiri sendiri, jadi
  isi peta ban bisa dipasang kembali di sini tanpa mengubah panggilan
  `BanAnalysis` di `app/page.tsx`.
 */
export function ComingSoon() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-10 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Disc3 className="h-7 w-7 text-primary" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Coming Soon</h1>

        <p className="mt-3 text-muted-foreground">
          Menu Analisa Ban masih dalam pengembangan. Kembalilah nanti untuk
          melihat peta ban yang bisa dipilih berdasarkan nopol.
        </p>

        <Button className="mt-6 ml-auto gap-2">
          Lihat Peta Ban <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

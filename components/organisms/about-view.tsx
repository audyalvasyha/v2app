import React from "react";
import Image from "next/image";
import { ArrowUpRight, Mail, Instagram } from "lucide-react";
import {
  ABOUT_CAPABILITIES,
  ABOUT_PROCESS_NOTE,
  ABOUT_PROFILE,
  ABOUT_SKILLS,
  ABOUT_SPECS,
  ABOUT_SUMMARY,
  ABOUT_VERSION,
} from "@/lib/about";

/** Teks dengan penanda *...* dirender sebagai italic tanpa memecah sumber data. */
function renderEmphasis(text: string): React.ReactNode {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith("*") && part.endsWith("*") ? (
      <i key={i}>{part.slice(1, -1)}</i>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function AboutView() {
  return (
    <div className="mx-auto w-full overflow-x-clip pb-16">
      {/* Label halaman sudah pindah ke breadcrumb; masthead menyisakan versi. */}
      <div className="flex items-center justify-end border-b border-border pb-4">
        <span className="font-mono text-[11px] tabular-nums uppercase tracking-[0.28em] text-muted-foreground">
          {ABOUT_VERSION}
        </span>
      </div>

      {/* Hero asimetris: narasi di kiri, lembar spesifikasi di kanan */}
      <div className="mt-12 grid gap-12 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-7">
          <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl">
            Transport
            <br />
            <span className="text-muted-foreground/50">Management System</span>
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-8 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
            {ABOUT_SUMMARY}
          </p>
        </div>

        <div className="md:col-span-5 md:pt-2">
          <dl className="border-y border-border divide-y divide-border">
            {ABOUT_SPECS.map((spec) => (
              <div
                key={spec.label}
                className="flex items-baseline justify-between gap-6 py-3"
              >
                <dt className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {spec.label}
                </dt>
                <dd className="min-w-0 break-words text-right text-sm text-foreground/90">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Cakupan: nomor indeks + judul, bukan kartu berikon */}
      <div className="mt-20 border-t border-border pt-10">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Cakupan
        </div>
        <div className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
          {ABOUT_CAPABILITIES.map((item) => (
            <div key={item.index} className="group">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-primary">
                  {item.index}
                </span>
                <span
                  className="h-px flex-1 bg-border transition-colors duration-300 group-hover:bg-primary/60"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mt-4 text-lg font-medium tracking-tight">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Profil: potret, narasi, dan rel kontak */}
      <div className="mt-20 border-t border-border pt-10">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Dikembangkan Oleh
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-12">
          <div className="flex min-w-0 items-start gap-5 md:col-span-5">
            <Image
              src="/IMG_20260929_045219.jpg"
              alt={ABOUT_PROFILE.name}
              width={112}
              height={112}
              sizes="(min-width: 768px) 112px, 96px"
              className="h-24 w-24 shrink-0 rounded-lg border border-border object-cover grayscale transition duration-500 hover:grayscale-0 md:h-28 md:w-28"
            />
            <div className="min-w-0 pt-1">
              <h2 className="text-xl font-semibold tracking-tight">
                {ABOUT_PROFILE.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {ABOUT_PROFILE.role}
              </p>
            </div>
          </div>

          <div className="min-w-0 md:col-span-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {renderEmphasis(ABOUT_PROFILE.bio)}
            </p>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
              {ABOUT_SKILLS.join(" / ")}
            </p>
          </div>

          <div className="min-w-0 md:col-span-3">
            <div className="flex flex-col divide-y divide-border border-y border-border">
              <a
                href={`mailto:${ABOUT_PROFILE.email}`}
                className="group flex items-center justify-between gap-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </a>
              <a
                href={ABOUT_PROFILE.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Instagram className="h-3.5 w-3.5" />
                  Instagram
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Catatan proses: kolaborasi bersama asisten AI, ditulis sebagai anotasi */}
      <div className="mt-16 grid gap-4 border-t border-border pt-6 md:grid-cols-12">
        <div className="md:col-span-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            <span className="h-1.5 w-1.5 bg-primary" aria-hidden="true" />
            Catatan Proses
          </div>
        </div>
        <div className="md:col-span-9">
          <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {renderEmphasis(ABOUT_PROCESS_NOTE)}
          </p>
        </div>
      </div>
    </div>
  );
}

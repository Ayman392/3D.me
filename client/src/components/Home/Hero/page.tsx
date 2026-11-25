"use client";

import Link from "next/link";
import { ArrowRight, Box } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATS = [
  { label: "GRID", value: "256³" },
  { label: "VERTS", value: "42,169" },
  { label: "TRIS", value: "84,160" },
  { label: "TIME", value: "30.35s" },
];

const BAR_HEIGHTS = [8, 14, 6, 12, 16, 9, 13, 7];

// The three orthogonal slices of the triplane: XY, YZ, XZ.
const PLANES = ["rotateY(0deg)", "rotateY(90deg)", "rotateX(90deg)"];

const GRID_LINES = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, currentColor 14%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, currentColor 14%, transparent) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
};

const CSS = `
@keyframes hero3d-spin {
  from { transform: rotateX(-24deg) rotateY(0deg); }
  to   { transform: rotateX(-24deg) rotateY(360deg); }
}
.hero3d-spin { animation: hero3d-spin 24s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .hero3d-spin { animation: none; transform: rotateX(-24deg) rotateY(35deg); }
}
`;

function TriplaneScene() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative size-[min(78vw,26rem)] lg:size-[22rem] xl:size-[26rem]"
      style={{ perspective: "1400px" }}
    >
      <div
        className="hero3d-spin absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
      >
        {PLANES.map((transform) => (
          <div
            key={transform}
            className="absolute inset-[12%] border border-[#ff6b2c]/60 bg-[#ff6b2c]/[0.04]"
            style={{ transform, ...GRID_LINES }}
          />
        ))}

        {/* Orbit rings */}
        <div
          className="absolute inset-0 rounded-full border border-foreground/25"
          style={{ transform: "rotateX(75deg)" }}
        />
        <div
          className="absolute inset-0 rounded-full border border-foreground/25"
          style={{ transform: "rotateY(75deg)" }}
        />
        <div className="absolute inset-[6%] rounded-full border border-dashed border-[#2433c9]/50" />

        {/* Center point */}
        <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6b2c] shadow-[0_0_24px_6px_#ff6b2c80]" />
      </div>
    </div>
  );
}

export interface HeroProps {
  className?: string;
}

export default function Hero({ className }: HeroProps) {
  return (
    <section
      aria-label="3d.me — local 2D to 3D GLB engine"
      className={cn(
        "relative h-full w-full overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <style>{CSS}</style>

      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[44rem] -translate-x-1/2 rounded-full opacity-15 blur-3xl dark:opacity-25"
        style={{
          background:
            "radial-gradient(circle, #ff6b2c 0%, #2433c9 55%, transparent 75%)",
        }}
      />

      {/* Mobile: scene faded behind the text */}
      <div className="absolute inset-0 flex items-center justify-center opacity-30 lg:hidden">
        <TriplaneScene />
      </div>

      {/* Corner frame accents */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 size-8 border-l-2 border-t-2 border-foreground/30 lg:size-12" />
      <div className="pointer-events-none absolute right-3 top-3 z-20 size-8 border-r-2 border-t-2 border-foreground/30 lg:size-12" />
      <div className="pointer-events-none absolute bottom-12 left-3 z-20 size-8 border-b-2 border-l-2 border-foreground/30 lg:size-12" />
      <div className="pointer-events-none absolute bottom-12 right-3 z-20 size-8 border-b-2 border-r-2 border-foreground/30 lg:size-12" />

      {/* Content: centered column, pushed down below the floating navbar */}
      <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl items-center px-6 pb-16 pt-32 lg:px-0 lg:pt-36">
        <div className="grid w-full items-center gap-8 lg:grid-cols-2">
          <div className="max-w-lg">
            <div className="mb-3 flex items-center gap-2 opacity-60">
              <div className="h-px w-8 bg-foreground" />
              <span className="font-mono text-[10px] tracking-wider">001</span>
              <div className="h-px flex-1 bg-foreground" />
            </div>

            <Badge
              variant="outline"
              className="mb-4 gap-1.5 font-mono text-[10px] tracking-wider"
            >
              <span className="size-1.5 rounded-full bg-[#ff6b2c]" />
              LOCAL 2D → 3D GLB ENGINE
            </Badge>

            <h1
              className="mb-3 font-mono text-3xl font-bold leading-tight lg:mb-4 lg:text-4xl xl:text-5xl"
              style={{ letterSpacing: "0.04em" }}
            >
              2D TO <span className="text-[#ff6b2c]">3D</span>
              <span className="mt-1 block opacity-90">IN 30 SECONDS</span>
            </h1>

            <div className="mb-3 hidden gap-1 opacity-40 lg:flex">
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="size-0.5 rounded-full bg-foreground" />
              ))}
            </div>

            <p className="mb-6 font-mono text-xs leading-relaxed text-muted-foreground lg:text-base">
              Turn a single image into a textured .GLB model on your own
              machine. No cloud queues, no credits, no uploads.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/convert"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-foreground bg-[#ff6b2c] px-6 text-sm font-bold text-white shadow-[0_4px_0_var(--foreground)] transition-[translate,box-shadow] duration-150 hover:-translate-y-px hover:bg-[#ff7a42] active:translate-y-1 active:shadow-none"
              >
                Start Converting
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-foreground bg-background px-6 text-sm font-bold text-foreground shadow-[0_4px_0_#ff6b2c] transition-[translate,box-shadow] duration-150 hover:-translate-y-px active:translate-y-1 active:shadow-none"
              >
                <Box className="size-4" />
                Open Studio
              </Link>
            </div>

            <div className="mt-6 hidden items-center gap-2 opacity-40 lg:flex">
              <span className="font-mono text-[9px]">∞</span>
              <div className="h-px flex-1 bg-foreground" />
              <span className="font-mono text-[9px]">
                TRIPLANE · MARCHING CUBES
              </span>
            </div>
          </div>

          {/* Desktop: scene beside the text */}
          <div className="hidden items-center justify-center lg:flex">
            <TriplaneScene />
          </div>
        </div>
      </div>

      {/* Bottom status strip */}
      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-foreground/20 bg-background/60 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2 font-mono text-[8px] text-muted-foreground lg:px-8 lg:py-3 lg:text-[9px]">
          <div className="flex items-center gap-3 lg:gap-6">
            <span className="hidden lg:inline">PIPELINE.ACTIVE</span>
            <div className="hidden gap-1 lg:flex">
              {BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-foreground/30"
                  style={{ height: h }}
                />
              ))}
            </div>
            {STATS.map((s) => (
              <span key={s.label} className="hidden sm:inline">
                {s.label}: <span className="text-foreground">{s.value}</span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <span className="hidden lg:inline">◐ APPLE SILICON · MPS</span>
            <div className="flex gap-1">
              <div className="size-1 animate-pulse rounded-full bg-[#ff6b2c]" />
              <div
                className="size-1 animate-pulse rounded-full bg-[#ff6b2c]/60"
                style={{ animationDelay: "0.2s" }}
              />
              <div
                className="size-1 animate-pulse rounded-full bg-[#ff6b2c]/30"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
            <span>GLB · PBR</span>
          </div>
        </div>
      </div>
    </section>
  );
}

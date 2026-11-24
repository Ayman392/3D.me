"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Box, Cpu, Sparkles, Upload } from "lucide-react";
import { DoodleButton } from "@/components/ui/doodle-button";

type ShowcaseMode = "image-to-3d" | "local-engine";

const MODE_CONTENT: Record<
  ShowcaseMode,
  {
    pillLabel: string;
    heading: string;
    description: string;
    ctaText: string;
    ctaHref: string;
    badge: string;
    statsLabel: string;
  }
> = {
  "image-to-3d": {
    pillLabel: "Image to 3D",
    heading: "Local Image-to-3D",
    description:
      "Upload a PNG, JPG, or WEBP up to 25 MB and reconstruct a textured binary .GLB model locally in around 30 seconds with zero cloud lock-in.",
    ctaText: "Start Creating",
    ctaHref: "/convert",
    badge: "PNG / JPG / WEBP · MAX 25 MB",
    statsLabel: "256³ Marching Cubes · PBR Mesh",
  },
  "local-engine": {
    pillLabel: "Local MPS Engine",
    heading: "Apple Silicon Accelerated",
    description:
      "Run triplane synthesis and Marching Cubes mesh extraction on local hardware via PyTorch MPS and Three.js with interactive orbit, zoom, and wireframe inspection.",
    ctaText: "Explore Pipeline",
    ctaHref: "/about",
    badge: "PYTORCH MPS · THREE.JS VIEWPORT",
    statsLabel: "~30s Local Synthesis · .GLB Export",
  },
};

export default function ShowcaseSection() {
  const [mode, setMode] = useState<ShowcaseMode>("image-to-3d");
  const current = MODE_CONTENT[mode];

  return (
    <section className="relative w-full px-4 py-16 sm:px-6 lg:px-8">
      {/* Top Mode Switcher Pills */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {(["image-to-3d", "local-engine"] as const).map((key) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
                active
                  ? "bg-[var(--brand,#ff6b2c)] text-white shadow-[0_3px_0_var(--foreground)]"
                  : "bg-card text-foreground hover:-translate-y-0.5"
              }`}
            >
              {key === "image-to-3d" ? (
                <Sparkles className="size-3.5 text-[#ffd23f]" />
              ) : (
                <Cpu className="size-3.5 text-[#ffd23f]" />
              )}
              {MODE_CONTENT[key].pillLabel}
            </button>
          );
        })}
      </div>

      {/* Main Showcase Card */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.45 }}
        className="mx-auto grid max-w-6xl grid-cols-1 overflow-hidden rounded-3xl border-2 border-foreground bg-card shadow-[0_6px_0_var(--foreground)] lg:grid-cols-12"
      >
        {/* Left Copy & CTA Column */}
        <div className="flex flex-col justify-between p-6 sm:p-10 lg:col-span-5">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/30 bg-[#2433c9]/15 px-3 py-1 text-[11px] font-semibold tracking-wider text-[#2433c9] dark:text-[#ffd23f]">
              {current.badge}
            </span>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {current.heading}
            </h2>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {current.description}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <DoodleButton href={current.ctaHref} variant="solid" size="md">
              {current.ctaText} →
            </DoodleButton>
            <DoodleButton href="/convert" variant="outline" size="md">
              Try Demo
            </DoodleButton>
          </div>
        </div>

        {/* Right Interactive Studio Window */}
        <div className="border-t-2 border-foreground bg-zinc-950 p-4 text-white sm:p-6 lg:col-span-7 lg:border-l-2 lg:border-t-0">
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#11131a]">
            {/* Window Top Bar */}
            <div className="flex items-center justify-between border-b border-white/10 bg-black/60 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[#ff6b2c]" />
                <span className="size-2.5 rounded-full bg-[#ffd23f]" />
                <span className="size-2.5 rounded-full bg-[#2433c9]" />
              </div>
              <span className="rounded-md bg-white/5 px-3 py-0.5 text-xs text-zinc-300">
                3d.me / studio / {mode}
              </span>
              <span className="text-[11px] font-medium text-[#ffd23f]">
                GLB Ready
              </span>
            </div>

            {/* Studio Content Grid */}
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-12">
              {/* Dropzone / Pipeline Panel */}
              <div className="flex flex-col justify-between rounded-xl border border-dashed border-[#ff6b2c]/60 bg-[#ff6b2c]/10 p-4 sm:col-span-5">
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="mb-3 grid size-11 place-items-center rounded-2xl border border-[#ffd23f]/40 bg-black/60 text-[#ffd23f]">
                    <Upload className="size-5" />
                  </div>
                  <p className="text-xs font-semibold text-white">
                    Drop 2D Image Here
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    PNG, JPG, WEBP · ≤ 25 MB
                  </p>
                </div>

                <div className="space-y-1.5 rounded-lg bg-black/50 p-2.5 text-[11px]">
                  <div className="flex items-center justify-between text-zinc-300">
                    <span>Status</span>
                    <span className="font-semibold text-[#ffd23f]">
                      Queued → .GLB
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>Engine</span>
                    <span>{current.statsLabel}</span>
                  </div>
                </div>
              </div>

              {/* 3D Viewport Preview Card */}
              <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#2433c9]/25 via-[#141722] to-[#ff6b2c]/20 p-4 sm:col-span-7">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold text-zinc-200">
                    <Box className="size-3.5 text-[#ff6b2c]" />
                    Three.js PBR Viewport
                  </span>
                  <span className="rounded-full bg-[#2433c9]/50 px-2.5 py-0.5 text-[10px] font-medium text-[#ffd23f]">
                    Orbit · Wireframe · Grid
                  </span>
                </div>

                {/* Stylized Mesh Centerpiece */}
                <div className="my-auto flex flex-col items-center justify-center py-4 text-center">
                  <div className="grid size-24 place-items-center rounded-3xl border-2 border-[#ff6b2c]/70 bg-black/60 shadow-[0_0_40px_rgba(255,107,44,0.28)]">
                    <Box className="size-11 text-[#ffd23f]" />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-white">
                    Textured Binary .GLB Output
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-300">
                    Local reconstruction with full ownership of your assets
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-zinc-400">
                  <span>~30s reconstruction</span>
                  <span className="font-medium text-[#ff6b2c]">
                    Download .GLB
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

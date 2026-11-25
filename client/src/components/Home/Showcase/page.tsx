"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconSparkles,
  IconCpu,
  IconArrowRight,
  IconLock,
  IconRefresh,
  IconArrowLeft,
  IconPlus,
  IconX,
  IconBox,
} from "@tabler/icons-react";

type ShowcaseTab = "image-to-3d" | "local-engine";

const DASHBOARD_SCREENSHOT_SRC = "/images/studio-dashboard-preview.png";

const TAB_DATA: Record<
  ShowcaseTab,
  {
    badge: string;
    title: string;
    description: string;
    learnMoreHref: string;
    ctaLabel: string;
    ctaHref: string;
    browserUrl: string;
    tabTitle: string;
    imageSrc: string;
    imageAlt: string;
    highlightNote: string;
  }
> = {
  "image-to-3d": {
    badge: "PNG / JPG / WEBP · MAX 25 MB",
    title: "High-Fidelity Image-to-3D",
    description:
      "Upload a photo, sketch, or piece of concept art, and 3D.me turns it into a watertight 3D model you can print, fit-test, or refine further.",
    learnMoreHref: "/dashboard",
    ctaLabel: "Start Creating",
    ctaHref: "/dashboard",
    browserUrl: "3d.me/dashboard",
    tabTitle: "3D.me Studio Workspace",
    imageSrc: DASHBOARD_SCREENSHOT_SRC,
    imageAlt:
      "3D.me Studio Dashboard with Generate Model panel and 3D Viewport",
    highlightNote: "HD Model & Smart Mesh ready",
  },
  "local-engine": {
    badge: "BUILD123D · TRIPOSR · ZERO CLOUD LOCK-IN",
    title: "Local CAD & Fit-Test Engine",
    description:
      "Run parametric CAD generation, printer caliper calibration, and 15 mm fit-test joint slices locally with full ownership of your .GLB and .STL assets.",
    learnMoreHref: "/cad",
    ctaLabel: "Launch CAD Studio",
    ctaHref: "/dashboard",
    browserUrl: "3d.me/dashboard?tool=cad",
    tabTitle: "3D.me CAD & Fit-Test Pipeline",
    imageSrc: DASHBOARD_SCREENSHOT_SRC,
    imageAlt: "3D.me Studio Dashboard CAD and Fit-Test pipeline",
    highlightNote: "CAD Fit-Test & Smart Mesh pipeline ready",
  },
};

export function ShowcaseSection() {
  const [activeTab, setActiveTab] = useState<ShowcaseTab>("image-to-3d");
  const [imgError, setImgError] = useState(false);
  const current = TAB_DATA[activeTab];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
      {/* Top Pill Switcher */}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab("image-to-3d");
            setImgError(false);
          }}
          className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "image-to-3d"
              ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_3px_0_var(--foreground)]"
              : "border-border bg-card text-muted-foreground hover:border-foreground/60 hover:text-foreground"
          }`}
        >
          <IconSparkles size={15} stroke={2.2} />
          <span>Image to 3D</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("local-engine");
            setImgError(false);
          }}
          className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "local-engine"
              ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_3px_0_var(--foreground)]"
              : "border-border bg-card text-muted-foreground hover:border-foreground/60 hover:text-foreground"
          }`}
        >
          <IconCpu size={15} stroke={2.2} />
          <span>Local MPS & CAD Engine</span>
        </button>
      </div>

      {/* Main Meshy-style Split Showcase Card */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#121214] shadow-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-10 h-80 w-80 rounded-full bg-[var(--brand,#ff6b2c)]/15 blur-3xl"
        />

        <div className="grid grid-cols-1 items-stretch lg:grid-cols-12">
          {/* Left Column: Editorial Copy & Pill CTA */}
          <div className="flex flex-col justify-between p-8 sm:p-10 lg:col-span-5 lg:py-14 lg:pl-12 lg:pr-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
                className="space-y-5"
              >
                <span className="inline-block rounded-full border border-[var(--brand,#ff6b2c)]/35 bg-[var(--brand,#ff6b2c)]/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--brand,#ff6b2c)]">
                  {current.badge}
                </span>

                <h2 className="text-3xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-4xl">
                  {current.title}
                </h2>

                <p className="text-sm leading-relaxed text-zinc-400 sm:text-[15px]">
                  {current.description}
                </p>

                <div>
                  <Link
                    href={current.learnMoreHref}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-200 transition-colors hover:text-[var(--brand,#ff6b2c)]"
                  >
                    <span>Learn more</span>
                    <IconArrowRight size={15} stroke={2.2} />
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-10 pt-4">
              <Link href={current.ctaHref}>
                <motion.span
                  whileHover={{ y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.98, y: 1 }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-white/90 bg-[var(--brand,#ff6b2c)] px-7 py-3.5 text-sm font-black text-white shadow-[0_4px_0_rgba(255,255,255,0.85)] transition-colors hover:bg-[#ff7a42] sm:w-auto sm:min-w-[230px]"
                >
                  <span>{current.ctaLabel}</span>
                  <IconArrowRight size={17} stroke={2.4} />
                </motion.span>
              </Link>
            </div>
          </div>

          {/* Right Column: Bleed-Right & Bleed-Bottom Browser Frame */}
          <div className="flex flex-col justify-end pt-4 pl-6 sm:pl-10 lg:col-span-7 lg:pt-10 lg:pl-4">
            <div className="flex flex-1 flex-col overflow-hidden rounded-tl-2xl border-t border-l border-white/15 bg-[#1b1b1f] shadow-[0_20px_60px_rgba(0,0,0,0.75)]">
              {/* Browser Top Tab Bar */}
              <div className="flex items-center gap-3 border-b border-white/10 bg-[#232328] px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>

                <div className="ml-2 flex items-center gap-2 rounded-t-lg bg-[#161619] px-3 py-1 text-[11px] font-medium text-zinc-200">
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--brand,#ff6b2c)] text-[8px] font-black text-white">
                    3d
                  </span>
                  <span className="max-w-[160px] truncate">
                    {current.tabTitle}
                  </span>
                  <IconX size={11} className="text-zinc-500" />
                </div>

                <IconPlus size={13} className="text-zinc-500" />
              </div>

              {/* Browser Address Bar */}
              <div className="flex items-center gap-3 border-b border-white/10 bg-[#18181b] px-4 py-2 text-zinc-500">
                <div className="flex items-center gap-2">
                  <IconArrowLeft size={13} />
                  <IconArrowRight size={13} />
                  <IconRefresh size={13} />
                </div>

                <div className="flex flex-1 items-center justify-between rounded-md bg-[#101012] px-3 py-1 font-mono text-[11px] text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <IconLock size={11} className="text-zinc-500" />
                    <span>{current.browserUrl}</span>
                  </span>
                  <span className="hidden text-[10px] text-[var(--brand,#ff6b2c)] sm:inline">
                    {current.highlightNote}
                  </span>
                </div>
              </div>

              {/* Screenshot / Fallback Preview */}
              <div className="relative flex-1 bg-[#0c0a09]">
                {!imgError ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={current.imageSrc}
                    alt={current.imageAlt}
                    onError={() => setImgError(true)}
                    className="block h-full w-full object-cover object-left-top"
                  />
                ) : (
                  <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center text-xs text-zinc-400">
                    <IconBox
                      size={28}
                      className="text-[var(--brand,#ff6b2c)]"
                    />
                    <p className="font-mono text-zinc-200">
                      Save screenshot to{" "}
                      <code className="text-[var(--brand,#ff6b2c)]">
                        public/images/studio-dashboard-preview.png
                      </code>
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Or update <code>DASHBOARD_SCREENSHOT_SRC</code> to match
                      your image filename.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

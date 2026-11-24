"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Check, Sparkles } from "lucide-react";
import { DoodleButton } from "@/components/ui/doodle-button";
import { cn } from "@/lib/utils";

export interface HowItWorksStep {
  step: string;
  title?: string;
  content: string;
  image: string;
}

interface HowItWorksProps {
  features?: HowItWorksStep[];
  className?: string;
  title?: string;
  subtitle?: string;
  autoPlayInterval?: number;
  imageHeight?: string;
}

const DEFAULT_3DME_STEPS: HowItWorksStep[] = [
  {
    step: "Step 1",
    title: "Upload 2D Image & Validate",
    content:
      "Drop a PNG, JPG, or WEBP file (up to 25 MB) to stage it locally with zero cloud uploads or recurring credit fees.",
    image:
      "https://cdn.21st.dev/assets/mirror/05/051f9e565b5b0b221384d9c27a0760febc3fb48d190c046adfda579f3614c958.jpg",
  },
  {
    step: "Step 2",
    title: "Segment & Normalize Subject",
    content:
      "Isolate the primary object from its background, center and scale it to 85%, and frame it on a neutral canvas.",
    image:
      "https://cdn.21st.dev/assets/mirror/a1/a12509688be6c9d3b2cb26d2ea1cfce48b8a8dbf2653e17be8a3fc31bd69f162.jpg",
  },
  {
    step: "Step 3",
    title: "Triplane & 256³ Marching Cubes",
    content:
      "Encode spatial features, synthesize XY/XZ/YZ triplanes, and extract a clean mesh with sampled PBR surface colors in ~30 seconds.",
    image:
      "https://cdn.21st.dev/assets/mirror/87/87d4f60a4465d19d14b8acefa46275df4ccd767ccea6d7f234ea5bad99cfec56.jpg",
  },
  {
    step: "Step 4",
    title: "Inspect & Export Binary .GLB",
    content:
      "Orbit, zoom, toggle wireframe or ground grid in the Three.js viewer, and download a validated binary .GLB asset.",
    image:
      "https://cdn.21st.dev/assets/mirror/06/0610989e0675a12c02d35aa5464e2644bf77913214b748b73a894808d2d79877.jpg",
  },
];

export default function HowItWorksSection({
  features = DEFAULT_3DME_STEPS,
  className,
  title = "How 3d.me Works",
  subtitle = "From a single 2D image to a validated binary .GLB model in about 30 seconds on local hardware.",
  autoPlayInterval = 4000,
  imageHeight = "h-[240px] sm:h-[340px] lg:h-[420px]",
}: HowItWorksProps) {
  const [currentFeature, setCurrentFeature] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (features.length === 0) return;

    const tickMs = 100;
    const stepIncrement = (tickMs / autoPlayInterval) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev + stepIncrement >= 100) {
          return 100;
        }
        return prev + stepIncrement;
      });
    }, tickMs);

    return () => clearInterval(timer);
  }, [features.length, autoPlayInterval]);

  useEffect(() => {
    if (progress < 100 || features.length === 0) return;

    const advanceTimer = setTimeout(() => {
      setCurrentFeature((curr) => (curr + 1) % features.length);
      setProgress(0);
    }, 0);

    return () => clearTimeout(advanceTimer);
  }, [progress, features.length]);

  const handleSelectStep = (index: number) => {
    setCurrentFeature(index);
    setProgress(0);
  };

  return (
    <section
      id="how-it-works"
      className={cn("w-full px-4 py-14 sm:px-6 md:py-20 lg:px-8", className)}
    >
      <div className="mx-auto w-full max-w-7xl">
        {/* Section Header */}
        <div className="mb-10 flex flex-col items-center text-center md:mb-14">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3.5 py-1 text-xs font-semibold shadow-[0_3px_0_var(--foreground)]">
            <Sparkles className="size-3.5 text-[var(--brand,#ff6b2c)]" />
            <span className="text-[#2433c9] dark:text-[#ffd23f]">
              LOCAL RECONSTRUCTION PIPELINE
            </span>
          </span>

          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {title}
          </h2>

          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base md:text-lg">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:items-center md:gap-10">
          {/* Step List */}
          <div className="order-2 space-y-4 md:order-1">
            {features.map((feature, index) => {
              const isActive = index === currentFeature;
              const isCompleted = index < currentFeature;

              return (
                <motion.button
                  key={feature.step}
                  type="button"
                  onClick={() => handleSelectStep(index)}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: isActive ? 1 : 0.65 }}
                  transition={{ duration: 0.35 }}
                  className={cn(
                    "flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition-all sm:gap-5 sm:p-5",
                    isActive
                      ? "border-foreground bg-card shadow-[0_4px_0_var(--foreground)]"
                      : "border-border bg-card/50 hover:border-foreground/60",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground text-sm font-bold transition-transform sm:size-10",
                      isActive
                        ? "scale-105 bg-[var(--brand,#ff6b2c)] text-white"
                        : isCompleted
                          ? "bg-[#ffd23f] text-zinc-950"
                          : "bg-muted text-foreground",
                    )}
                  >
                    {isCompleted ? (
                      <Check className="size-4 stroke-[3]" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--brand,#ff6b2c)]">
                        {feature.step}
                      </span>
                      {isActive && (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {Math.round(progress)}%
                        </span>
                      )}
                    </div>

                    <h3 className="mt-0.5 text-lg font-semibold text-foreground sm:text-xl">
                      {feature.title || feature.step}
                    </h3>

                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm md:text-base">
                      {feature.content}
                    </p>

                    {isActive && (
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-[var(--brand,#ff6b2c)] transition-[width] duration-100 ease-linear"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}

            <div className="pt-2">
              <DoodleButton href="/convert" variant="solid" size="md">
                Try Image-to-3D →
              </DoodleButton>
            </div>
          </div>

          {/* Animated Step Visual Card */}
          <div
            className={cn(
              "relative order-1 w-full overflow-hidden rounded-3xl border-2 border-foreground bg-card shadow-[0_6px_0_var(--foreground)] md:order-2",
              imageHeight,
            )}
          >
            <AnimatePresence mode="wait">
              {features.map(
                (feature, index) =>
                  index === currentFeature && (
                    <motion.div
                      key={feature.step}
                      className="absolute inset-0 h-full w-full overflow-hidden"
                      initial={{ y: 60, opacity: 0, scale: 0.97 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: -60, opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.45, ease: "easeInOut" }}
                    >
                      <Image
                        src={feature.image}
                        alt={feature.title || feature.step}
                        unoptimized
                        fill
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/60 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                        <span className="inline-block rounded-full border border-foreground/30 bg-card/90 px-3 py-0.5 text-xs font-semibold text-foreground backdrop-blur-xs">
                          {feature.step} · {feature.title}
                        </span>
                      </div>
                    </motion.div>
                  ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

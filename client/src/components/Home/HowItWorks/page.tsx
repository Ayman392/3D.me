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
      "Drop PNG, JPG, or WEBP (≤25 MB) to stage locally with zero cloud uploads or credit fees.",
    image: "/images/step-1.png",
  },
  {
    step: "Step 2",
    title: "Segment & Normalize Subject",
    content:
      "Isolate the primary object from background, scale to 85%, and frame on a neutral canvas.",
    image: "/images/step-2.png",
  },
  {
    step: "Step 3",
    title: "Triplane & 256³ Marching Cubes",
    content:
      "Synthesize XY/XZ/YZ triplanes and extract a clean mesh with PBR colors in ~30 seconds.",
    image: "/images/step-3.png",
  },
  {
    step: "Step 4",
    title: "Inspect & Export Binary .GLB",
    content:
      "Orbit, toggle wireframe or grid in Three.js, and download a validated binary .GLB asset.",
    image: "/images/step-4.png",
  },
];

export default function HowItWorksSection({
  features = DEFAULT_3DME_STEPS,
  className,
  title = "How 3d.me Works",
  subtitle = "From a single 2D image to a validated binary .GLB model in about 30 seconds on local hardware.",
  autoPlayInterval = 4000,
  imageHeight = "h-[260px] sm:h-[340px] lg:h-[420px]",
}: HowItWorksProps) {
  const [currentFeature, setCurrentFeature] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (features.length <= 1) return;

    const tickMs = 100;
    const stepIncrement = (tickMs / autoPlayInterval) * 100;
    let shouldAdvance = false;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev + stepIncrement >= 100) {
          shouldAdvance = true;
          return 0;
        }
        shouldAdvance = false;
        return prev + stepIncrement;
      });

      if (shouldAdvance) {
        shouldAdvance = false;
        setCurrentFeature((curr) => (curr + 1) % features.length);
      }
    }, tickMs);

    return () => clearInterval(timer);
  }, [features.length, autoPlayInterval]);

  const handleSelectStep = (index: number) => {
    setCurrentFeature(index);
    setProgress(0);
  };

  const activeFeature = features[currentFeature] ?? features[0];

  return (
    <section
      id="how-it-works"
      className={cn("w-full px-4 py-12 sm:px-6 md:py-16 lg:px-8", className)}
    >
      <div className="mx-auto w-full max-w-7xl">
        {/* Section Header */}
        <div className="mb-8 flex flex-col items-center text-center md:mb-12">
          <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3.5 py-1 text-xs font-semibold shadow-[0_3px_0_var(--foreground)]">
            <Sparkles className="size-3.5 text-[var(--brand,#ff6b2c)]" />
            <span className="text-[#2433c9] dark:text-[#ffd23f]">
              LOCAL RECONSTRUCTION PIPELINE
            </span>
          </span>

          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {title}
          </h2>

          <p className="mt-2.5 max-w-2xl text-xs text-muted-foreground sm:text-sm md:text-base">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-6 md:grid md:grid-cols-12 md:items-center md:gap-8">
          {/* Step List */}
          <div className="order-2 space-y-2.5 md:order-1 md:col-span-6">
            {features.map((feature, index) => {
              const isActive = index === currentFeature;
              const isCompleted = index < currentFeature;

              return (
                <motion.button
                  key={feature.step}
                  type="button"
                  onClick={() => handleSelectStep(index)}
                  initial={false}
                  animate={{ opacity: isActive ? 1 : 0.72 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    "flex w-full items-start gap-3.5 rounded-2xl border-2 px-4 py-3 text-left transition-all",
                    isActive
                      ? "border-foreground bg-card shadow-[0_4px_0_var(--foreground)]"
                      : "border-border bg-card/50 hover:border-foreground/60",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-foreground text-xs font-bold transition-transform sm:size-9",
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand,#ff6b2c)]">
                        {feature.step}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {Math.round(progress)}%
                        </span>
                      )}
                    </div>

                    <h3 className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">
                      {feature.title || feature.step}
                    </h3>

                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {feature.content}
                    </p>

                    {isActive && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
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
              "relative order-1 w-full overflow-hidden rounded-3xl border-2 border-foreground bg-zinc-950 shadow-[0_6px_0_var(--foreground)] md:order-2 md:col-span-6",
              imageHeight,
            )}
          >
            <AnimatePresence mode="wait">
              {activeFeature && (
                <motion.div
                  key={activeFeature.step}
                  className="absolute inset-0 h-full w-full overflow-hidden"
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <Image
                    src={activeFeature.image}
                    alt={activeFeature.title || activeFeature.step}
                    unoptimized
                    fill
                    className="h-full w-full object-cover object-center"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <span className="inline-block rounded-full border border-white/20 bg-zinc-950/85 px-3 py-1 text-xs font-semibold text-white backdrop-blur-xs">
                      {activeFeature.step} · {activeFeature.title}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

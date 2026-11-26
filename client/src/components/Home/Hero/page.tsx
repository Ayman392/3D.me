"use client";

import * as React from "react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pt-6 pb-16 md:pt-10 md:pb-24">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[32px] border border-white/85 bg-white/55 p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_28px_70px_-20px_rgba(0,40,90,0.34)] backdrop-blur-xl sm:p-3 dark:border-white/15 dark:bg-[#0A1228]/55 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_28px_70px_-20px_rgba(0,0,0,0.75)]">
          <div className="relative aspect-video max-h-[78vh] w-full overflow-hidden rounded-[24px] ring-1 ring-inset ring-white/40 dark:ring-white/10">
            <video
              src="/videos/hero-3d-motion.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;

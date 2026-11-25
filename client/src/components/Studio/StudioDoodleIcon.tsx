"use client";

import React from "react";
import { motion } from "framer-motion";
import type { IconProps } from "@tabler/icons-react";

type IconTone = "brand" | "sky" | "amber" | "neutral";

interface StudioDoodleIconProps {
  icon: React.ComponentType<IconProps>;
  tone?: IconTone;
  isActive?: boolean;
  isSpinning?: boolean;
  size?: number;
  className?: string;
}

const TONE_CLASSES: Record<IconTone, string> = {
  brand:
    "border-foreground/80 bg-[var(--brand,#ff6b2c)]/18 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)]",
  sky: "border-foreground/80 bg-sky-400/20 text-sky-500 shadow-[0_2px_0_var(--foreground)]",
  amber:
    "border-foreground/80 bg-amber-400/25 text-amber-500 shadow-[0_2px_0_var(--foreground)]",
  neutral: "border-border bg-secondary/80 text-foreground/85",
};

export function StudioDoodleIcon({
  icon: Icon,
  tone = "brand",
  isActive = false,
  isSpinning = false,
  size = 16,
  className = "",
}: StudioDoodleIconProps) {
  return (
    <motion.span
      initial={false}
      animate={
        isSpinning
          ? { rotate: 360 }
          : isActive
            ? { scale: 1.08, y: -1 }
            : { scale: 1, y: 0 }
      }
      transition={
        isSpinning
          ? { repeat: Infinity, duration: 1.3, ease: "linear" }
          : { type: "spring", stiffness: 420, damping: 22 }
      }
      whileHover={{
        scale: 1.14,
        rotate: isSpinning ? undefined : -5,
        y: -1.5,
      }}
      whileTap={{
        scale: 0.9,
        y: 1,
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-1.5 transition-colors ${
        isActive
          ? TONE_CLASSES[tone]
          : `${TONE_CLASSES.neutral} group-hover:${TONE_CLASSES[tone]}`
      } ${className}`}
    >
      <Icon size={size} stroke={2.1} className="shrink-0" />
    </motion.span>
  );
}

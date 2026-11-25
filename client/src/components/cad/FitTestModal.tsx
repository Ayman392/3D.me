"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  IconX,
  IconScissors,
  IconDownload,
  IconClock,
  IconShieldCheck,
} from "@tabler/icons-react";

export interface FitTestSliceItem {
  id: string;
  name: string;
  path: string;
  download_url: string;
  description?: string;
}

interface FitTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  slices?: FitTestSliceItem[];
  projectName?: string;
}

export default function FitTestModal({
  isOpen,
  onClose,
  slices = [],
  projectName = "Design",
}: FitTestModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm font-mono">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 26 }}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border-2 border-foreground/85 bg-card text-card-foreground shadow-[0_6px_0_var(--foreground)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2.5">
            <motion.span
              whileHover={{ rotate: -18, scale: 1.12 }}
              transition={{ type: "spring", stiffness: 420, damping: 20 }}
              className="inline-flex items-center justify-center rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-1.5 text-white shadow-[0_2px_0_var(--foreground)]"
            >
              <IconScissors size={15} stroke={2.1} />
            </motion.span>
            <h3 className="text-sm font-bold text-foreground">
              Targeted Fit-Test Slices
            </h3>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            aria-label="Close fit-test modal"
            className="rounded-lg border border-border bg-secondary/60 p-1 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <IconX size={16} stroke={2.1} />
          </motion.button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-2.5 border-b border-border bg-[var(--brand,#ff6b2c)]/10 p-3.5 text-xs text-foreground">
          <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-foreground/80 bg-card p-1 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)]">
            <IconClock size={15} stroke={2.1} />
          </span>
          <div>
            <span className="font-bold text-foreground">
              Save hours of 3D printing time:
            </span>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              These lightweight 15 mm ring slices isolate critical interfaces
              (display pocket, lip joint, mounting bosses). Print in ~10 minutes
              to verify caliper fit before committing to a 4-hour print!
            </p>
          </div>
        </div>

        {/* Slice List */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {slices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/60 py-8 text-center text-xs text-muted-foreground">
              No critical interface slices generated yet.
            </div>
          ) : (
            slices.map((slice) => (
              <div
                key={slice.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/70 p-3 transition-colors hover:border-[var(--brand,#ff6b2c)]/60"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-bold text-foreground">
                      {slice.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      15 mm slice
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {slice.description ||
                      "Tests mating clearance, wall rigidity and snap tolerance."}
                  </p>
                </div>

                <motion.a
                  href={slice.download_url}
                  download={`${projectName}_fit_test_${slice.id}.stl`}
                  whileHover={{ y: -1.5 }}
                  whileTap={{ scale: 0.95, y: 1 }}
                  className="group flex shrink-0 items-center gap-1.5 rounded-full border-2 border-foreground bg-[var(--brand,#ff6b2c)] px-3 py-1.5 text-xs font-black text-white shadow-[0_2px_0_var(--foreground)] transition active:shadow-none"
                >
                  <motion.span
                    whileHover={{ y: 1.5 }}
                    className="inline-flex items-center"
                  >
                    <IconDownload size={14} stroke={2.2} />
                  </motion.span>
                  <span>Download STL</span>
                </motion.a>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-background/70 p-3.5 text-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
            <IconShieldCheck size={16} stroke={2.1} className="shrink-0" />
            <span>Watertight STL ready for PrusaSlicer / Bambu Studio</span>
          </div>
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="rounded-full border-2 border-foreground/80 bg-card px-3.5 py-1 text-xs font-bold text-foreground shadow-[0_2px_0_var(--foreground)] transition hover:border-foreground"
          >
            Done
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

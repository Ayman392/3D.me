"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  IconCircleCheck,
  IconAlertTriangle,
  IconAlertCircle,
  IconInfoCircle,
  IconTool,
  IconRotateClockwise,
  IconDownload,
  IconScissors,
  IconChevronDown,
  IconChevronUp,
  IconLayersSubtract,
  IconShieldCheck,
  IconPackage,
  type IconProps,
} from "@tabler/icons-react";

export interface RightPanelValidationIssue {
  level: "error" | "warn" | "info";
  part?: string;
  code?: string;
  msg: string;
}

export interface RightPanelOverhangRec {
  best_orientation?: [number, number, number];
  rotation_euler_deg?: [number, number, number];
  steep_overhang_area_share?: number;
  notes?: string;
}

export interface RightPanelIteration {
  iteration: number;
  prompt: string;
  issues: RightPanelValidationIssue[];
  diff_summary?: string;
  duration_seconds: number;
  timestamp?: string;
}

interface DesignModeRightPanelProps {
  validation: {
    valid: boolean;
    errors: RightPanelValidationIssue[];
    warnings: RightPanelValidationIssue[];
    infos: RightPanelValidationIssue[];
  };
  overhangs: Record<string, RightPanelOverhangRec>;
  iterations: RightPanelIteration[];
  onFixIssue: (issue: RightPanelValidationIssue) => void;
  onRotateForBestPrint: (partName: string) => void;
  onExport: () => void;
  onOpenFitTest: () => void;
  isExporting?: boolean;
}

function RightDoodleBadge({
  icon: Icon,
  isActive = false,
  size = 14,
  rotateOnHover = -6,
}: {
  icon: React.ComponentType<IconProps>;
  isActive?: boolean;
  size?: number;
  rotateOnHover?: number;
}) {
  return (
    <motion.span
      whileHover={{ scale: 1.14, rotate: rotateOnHover, y: -1 }}
      whileTap={{ scale: 0.92 }}
      animate={isActive ? { scale: 1.06 } : { scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border-2 p-1 transition-colors ${
        isActive
          ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
          : "border-foreground/75 bg-card text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
      }`}
    >
      <Icon size={size} stroke={2.1} className="shrink-0" />
    </motion.span>
  );
}

export default function DesignModeRightPanel({
  validation,
  overhangs,
  iterations,
  onFixIssue,
  onRotateForBestPrint,
  onExport,
  onOpenFitTest,
  isExporting,
}: DesignModeRightPanelProps) {
  const [activeTab, setActiveTab] = useState<"export" | "checks">("export");
  const [expandedIssueIdx, setExpandedIssueIdx] = useState<number | null>(null);
  const [expandedIterationIdx, setExpandedIterationIdx] = useState<
    number | null
  >(null);

  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const infos = validation?.infos || [];
  const allIssues = [...errors, ...warnings, ...infos];
  const hasErrors = errors.length > 0;

  return (
    <div className="flex h-full flex-col justify-between space-y-4 bg-card p-4 font-sans text-xs text-card-foreground transition-colors">
      <div className="space-y-4">
        {/* Segmented Tab Switcher */}
        <div className="grid grid-cols-2 gap-1.5 rounded-full border-2 border-foreground/80 bg-secondary/70 p-1 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("export")}
            className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 font-bold transition-all ${
              activeTab === "export"
                ? "bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconPackage
              size={14}
              stroke={2.2}
              className={
                activeTab === "export"
                  ? "text-white"
                  : "text-[var(--brand,#ff6b2c)]"
              }
            />
            <span>Export & Print</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checks")}
            className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 font-bold transition-all ${
              activeTab === "checks"
                ? "bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconShieldCheck
              size={14}
              stroke={2.2}
              className={
                activeTab === "checks"
                  ? "text-white"
                  : hasErrors
                    ? "text-destructive"
                    : "text-emerald-500"
              }
            />
            <span>Checks</span>
            {allIssues.length > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[9px] font-black ${
                  hasErrors
                    ? "border border-destructive/50 bg-destructive/20 text-destructive"
                    : "border border-border bg-card text-foreground"
                }`}
              >
                {allIssues.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: EXPORT & MANUFACTURING */}
        {activeTab === "export" && (
          <div className="space-y-4">
            {/* Feasibility Summary Banner */}
            <div
              className={`flex items-center justify-between rounded-xl border p-3 font-mono text-xs ${
                hasErrors
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
              }`}
            >
              <div className="flex items-center gap-2">
                {hasErrors ? (
                  <IconAlertCircle
                    size={16}
                    stroke={2.1}
                    className="shrink-0"
                  />
                ) : (
                  <IconCircleCheck
                    size={16}
                    stroke={2.1}
                    className="shrink-0"
                  />
                )}
                <span className="font-bold">
                  {hasErrors
                    ? `${errors.length} Physical Errors Detected`
                    : "Print-Ready & Watertight"}
                </span>
              </div>
              {hasErrors && (
                <button
                  type="button"
                  onClick={() => setActiveTab("checks")}
                  className="text-[10px] font-black uppercase underline"
                >
                  View
                </button>
              )}
            </div>

            {/* Overhangs & Bed Orientation */}
            <div className="space-y-2.5 rounded-xl border border-border bg-background/70 p-3">
              <div className="group flex items-center justify-between border-b border-border pb-2">
                <span className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
                  <RightDoodleBadge
                    icon={IconLayersSubtract}
                    size={14}
                    rotateOnHover={-8}
                  />
                  <span>Bed Orientation</span>
                </span>
              </div>

              {Object.keys(overhangs).length === 0 ? (
                <div className="py-1 font-mono text-[11px] text-muted-foreground">
                  Orientation analysis will show automatically when model is
                  built.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(overhangs).map(([partName, rec]) => (
                    <div
                      key={partName}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-2 font-mono text-xs"
                    >
                      <div className="min-w-0">
                        <span className="block truncate font-bold text-foreground">
                          {partName}
                        </span>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {rec.notes || "Optimal bed adhesion"}
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => onRotateForBestPrint(partName)}
                        className="flex shrink-0 items-center gap-1 rounded-lg border-2 border-foreground/75 bg-secondary px-2 py-1 text-[10px] font-bold text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors hover:border-foreground hover:bg-[var(--brand,#ff6b2c)] hover:text-white"
                        title="Rotate preview to recommended print orientation"
                      >
                        <IconRotateClockwise size={12} stroke={2.2} />
                        <span>Rotate</span>
                      </motion.button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fit-Test Fast Joint Slicer */}
            <div className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
              <div className="group flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
                  <RightDoodleBadge
                    icon={IconScissors}
                    size={14}
                    rotateOnHover={-15}
                  />
                  <span>Fit Test Joint Slice</span>
                </span>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Slices a 15mm section around mating joints and screw holes for a
                quick 10-minute test print before committing to the full body.
              </p>
              <motion.button
                type="button"
                whileHover={{ y: -1.5 }}
                whileTap={{ scale: 0.98, y: 1 }}
                onClick={onOpenFitTest}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-foreground/80 bg-card px-3 py-1.5 font-mono text-xs font-bold text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors hover:border-foreground hover:bg-[var(--brand,#ff6b2c)]/12"
              >
                <IconScissors size={14} stroke={2.2} />
                <span>Generate Fit-Test Slice</span>
              </motion.button>
            </div>
          </div>
        )}

        {/* TAB 2: FEASIBILITY CHECKS & REVISION HISTORY */}
        {activeTab === "checks" && (
          <div className="space-y-4">
            {/* Feasibility Issues */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-border pb-1 font-mono text-xs">
                <span className="font-bold text-foreground">
                  Validation Checks
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {allIssues.length} total
                </span>
              </div>

              {allIssues.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 font-mono text-xs text-emerald-500">
                  <IconCircleCheck
                    size={16}
                    stroke={2.1}
                    className="shrink-0"
                  />
                  <span>All checks passed. Watertight and collision-free.</span>
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {allIssues.map((issue, idx) => {
                    const isExpanded = expandedIssueIdx === idx;
                    const isError = issue.level === "error";
                    const isWarn = issue.level === "warn";

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-2.5 font-mono text-xs transition-colors ${
                          isError
                            ? "border-destructive/50 bg-destructive/10"
                            : isWarn
                              ? "border-amber-500/40 bg-amber-500/10"
                              : "border-border bg-background/70"
                        }`}
                      >
                        <div
                          onClick={() =>
                            setExpandedIssueIdx(isExpanded ? null : idx)
                          }
                          className="flex cursor-pointer items-start justify-between gap-2"
                        >
                          <div className="flex items-start gap-1.5">
                            {isError ? (
                              <IconAlertCircle
                                size={15}
                                stroke={2.1}
                                className="mt-0.5 shrink-0 text-destructive"
                              />
                            ) : isWarn ? (
                              <IconAlertTriangle
                                size={15}
                                stroke={2.1}
                                className="mt-0.5 shrink-0 text-amber-500"
                              />
                            ) : (
                              <IconInfoCircle
                                size={15}
                                stroke={2.1}
                                className="mt-0.5 shrink-0 text-sky-500"
                              />
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                {issue.part && (
                                  <span className="font-bold text-foreground">
                                    [{issue.part}]
                                  </span>
                                )}
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                    isError
                                      ? "bg-destructive/20 text-destructive"
                                      : isWarn
                                        ? "bg-amber-500/20 text-amber-500"
                                        : "bg-sky-500/20 text-sky-500"
                                  }`}
                                >
                                  {issue.level}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                {issue.msg}
                              </p>
                            </div>
                          </div>
                          {isExpanded ? (
                            <IconChevronUp
                              size={15}
                              stroke={2.1}
                              className="shrink-0 text-[var(--brand,#ff6b2c)]"
                            />
                          ) : (
                            <IconChevronDown
                              size={15}
                              stroke={2.1}
                              className="shrink-0 text-[var(--brand,#ff6b2c)]"
                            />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="mt-2 space-y-2 border-t border-border pt-2 text-[10px]">
                            <motion.button
                              type="button"
                              whileHover={{ y: -1 }}
                              whileTap={{ scale: 0.98, y: 1 }}
                              onClick={() => onFixIssue(issue)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-[var(--brand,#ff6b2c)] py-1.5 font-mono text-xs font-black text-white shadow-[0_2px_0_var(--foreground)] transition active:shadow-none"
                            >
                              <IconTool size={13} stroke={2.2} />
                              <span>Auto-Fix with Agent</span>
                            </motion.button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Iteration History */}
            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-border pb-1">
                <span className="font-bold text-foreground">
                  Iteration History
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {iterations.length} revisions
                </span>
              </div>

              {iterations.length === 0 ? (
                <div className="py-1 text-[11px] text-muted-foreground">
                  No revisions recorded yet.
                </div>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {iterations.map((it, idx) => {
                    const isExpanded = expandedIterationIdx === idx;
                    return (
                      <div
                        key={idx}
                        className="space-y-1 rounded-xl border border-border bg-background/70 p-2"
                      >
                        <div
                          onClick={() =>
                            setExpandedIterationIdx(isExpanded ? null : idx)
                          }
                          className="flex cursor-pointer items-center justify-between text-xs"
                        >
                          <span className="font-black text-[var(--brand,#ff6b2c)]">
                            Rev #{it.iteration}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {it.issues.length === 0
                              ? "Clean ✓"
                              : `${it.issues.length} issues`}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border pt-1 text-[10px] text-muted-foreground">
                            <span className="font-bold text-foreground">
                              Prompt:{" "}
                            </span>
                            {it.prompt}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Primary Export Action Bar */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="group relative">
          <motion.button
            type="button"
            whileHover={!hasErrors && !isExporting ? { y: -1.5 } : {}}
            whileTap={!hasErrors && !isExporting ? { scale: 0.98, y: 1 } : {}}
            onClick={onExport}
            disabled={hasErrors || isExporting}
            className={`flex w-full items-center justify-center gap-2 rounded-full border-2 px-4 py-2.5 font-mono text-xs font-black transition-all ${
              hasErrors
                ? "cursor-not-allowed border-border bg-secondary text-muted-foreground"
                : "cursor-pointer border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_3px_0_var(--foreground)] active:shadow-none"
            }`}
          >
            <span
              className={`inline-flex items-center justify-center rounded-full border p-1 ${
                hasErrors
                  ? "border-border bg-card text-muted-foreground"
                  : "border-foreground bg-card text-[var(--brand,#ff6b2c)]"
              }`}
            >
              <IconDownload size={13} stroke={2.2} />
            </span>
            <span>Export CAD Package (ZIP)</span>
          </motion.button>

          {hasErrors && (
            <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-xl border border-destructive/60 bg-destructive/95 p-2 text-center font-mono text-[10px] text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
              Resolve {errors.length} error-level feasibility checks before
              export.
            </div>
          )}
        </div>

        {hasErrors && (
          <p className="text-center font-mono text-[10px] text-destructive">
            Deterministic checks require 0 errors before export.
          </p>
        )}
      </div>
    </div>
  );
}

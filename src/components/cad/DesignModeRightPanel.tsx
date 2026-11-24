"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Wrench,
  RotateCw,
  History,
  Download,
  Scissors,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Check,
  Package,
} from "lucide-react";

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
  const [expandedIterationIdx, setExpandedIterationIdx] = useState<number | null>(null);

  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const infos = validation?.infos || [];
  const allIssues = [...errors, ...warnings, ...infos];
  const hasErrors = errors.length > 0;

  return (
    <div className="p-4 space-y-4 font-sans text-xs flex flex-col h-full justify-between">
      <div className="space-y-4">
        {/* Segmented Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-graphite-950 border border-graphite-800 rounded-lg text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("export")}
            className={`py-1.5 px-2 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "export"
                ? "bg-graphite-800 text-white border border-graphite-700 shadow-sm"
                : "text-graphite-400 hover:text-white"
            }`}
          >
            <Package className="w-3.5 h-3.5 text-forge" />
            <span>Export &amp; Print</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checks")}
            className={`py-1.5 px-2 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "checks"
                ? "bg-graphite-800 text-white border border-graphite-700 shadow-sm"
                : "text-graphite-400 hover:text-white"
            }`}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${hasErrors ? "text-red-400" : "text-emerald-400"}`} />
            <span>Checks</span>
            {allIssues.length > 0 && (
              <span
                className={`text-[9px] px-1 rounded font-bold ${
                  hasErrors ? "bg-red-950 text-red-400 border border-red-800" : "bg-graphite-850 text-graphite-400"
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
              className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono ${
                hasErrors
                  ? "bg-red-950/25 border-red-800/60 text-red-300"
                  : "bg-emerald-950/25 border-emerald-800/60 text-emerald-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {hasErrors ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span className="font-medium">
                  {hasErrors ? `${errors.length} Physical Errors Detected` : "Print-Ready & Watertight"}
                </span>
              </div>
              {hasErrors && (
                <button
                  type="button"
                  onClick={() => setActiveTab("checks")}
                  className="text-[10px] uppercase font-bold text-red-400 underline"
                >
                  View
                </button>
              )}
            </div>

            {/* Overhangs & Bed Orientation */}
            <div className="p-3 bg-graphite-950 border border-graphite-800 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-graphite-850">
                <span className="text-xs font-mono font-semibold text-graphite-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-forge" />
                  <span>Bed Orientation</span>
                </span>
              </div>

              {Object.keys(overhangs).length === 0 ? (
                <div className="text-[11px] text-graphite-500 py-1 font-mono">
                  Orientation analysis will show automatically when model is built.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(overhangs).map(([partName, rec]) => (
                    <div
                      key={partName}
                      className="p-2 rounded bg-graphite-900 border border-graphite-800 flex items-center justify-between gap-2 text-xs font-mono"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-white truncate block">{partName}</span>
                        <div className="text-[10px] text-graphite-400 truncate">
                          {rec.notes || "Optimal bed adhesion"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRotateForBestPrint(partName)}
                        className="px-2 py-1 bg-graphite-800 hover:bg-graphite-750 text-forge font-semibold rounded text-[10px] flex items-center gap-1 transition-colors border border-graphite-750 shrink-0"
                        title="Rotate preview to recommended print orientation"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Rotate</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fit-Test Fast Joint Slicer */}
            <div className="p-3 bg-graphite-950 border border-graphite-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-graphite-200 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-forge" />
                  <span>Fit Test Joint Slice</span>
                </span>
              </div>
              <p className="text-[10px] text-graphite-400 leading-snug">
                Slices a 15mm section around mating joints and screw holes for a quick 10-minute test print before committing to the full body.
              </p>
              <button
                type="button"
                onClick={onOpenFitTest}
                className="w-full py-1.5 px-3 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-forge font-mono font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Generate Fit-Test Slice</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: FEASIBILITY CHECKS & REVISION HISTORY */}
        {activeTab === "checks" && (
          <div className="space-y-4">
            {/* Feasibility Issues */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-graphite-800 font-mono text-xs">
                <span className="font-semibold text-graphite-200">Validation Checks</span>
                <span className="text-[10px] text-graphite-400">{allIssues.length} total</span>
              </div>

              {allIssues.length === 0 ? (
                <div className="p-3 bg-graphite-950 border border-emerald-800/40 rounded-lg flex items-center gap-2.5 text-emerald-400 font-mono text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>All checks passed. Watertight and collision-free.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {allIssues.map((issue, idx) => {
                    const isExpanded = expandedIssueIdx === idx;
                    const isError = issue.level === "error";
                    const isWarn = issue.level === "warn";

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded border transition-colors font-mono text-xs ${
                          isError
                            ? "bg-red-950/20 border-red-800/60"
                            : isWarn
                            ? "bg-amber-950/20 border-amber-800/60"
                            : "bg-graphite-950 border-graphite-800"
                        }`}
                      >
                        <div
                          onClick={() => setExpandedIssueIdx(isExpanded ? null : idx)}
                          className="flex items-start justify-between cursor-pointer gap-2"
                        >
                          <div className="flex items-start gap-1.5">
                            {isError ? (
                              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                            ) : isWarn ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            ) : (
                              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                {issue.part && <span className="font-bold text-white">[{issue.part}]</span>}
                                <span className={`text-[9px] uppercase font-bold px-1 rounded ${
                                  isError ? "bg-red-900/50 text-red-300" : isWarn ? "bg-amber-900/50 text-amber-300" : "bg-blue-900/50 text-blue-300"
                                }`}>
                                  {issue.level}
                                </span>
                              </div>
                              <p className="text-[11px] text-graphite-300 mt-0.5 leading-snug">
                                {issue.msg}
                              </p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-graphite-500" /> : <ChevronDown className="w-3.5 h-3.5 text-graphite-500" />}
                        </div>

                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-graphite-800 text-[10px] space-y-2">
                            <button
                              type="button"
                              onClick={() => onFixIssue(issue)}
                              className="w-full py-1.5 bg-forge hover:bg-forge-hover text-graphite-950 font-bold rounded text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
                            >
                              <Wrench className="w-3 h-3" />
                              <span>Auto-Fix with Agent</span>
                            </button>
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
              <div className="flex items-center justify-between pb-1 border-b border-graphite-800">
                <span className="font-semibold text-graphite-200">Iteration History</span>
                <span className="text-[10px] text-graphite-500">{iterations.length} revisions</span>
              </div>

              {iterations.length === 0 ? (
                <div className="text-[11px] text-graphite-500 py-1">No revisions recorded yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {iterations.map((it, idx) => {
                    const isExpanded = expandedIterationIdx === idx;
                    return (
                      <div key={idx} className="p-2 bg-graphite-950 border border-graphite-800 rounded space-y-1">
                        <div
                          onClick={() => setExpandedIterationIdx(isExpanded ? null : idx)}
                          className="flex items-center justify-between cursor-pointer text-xs"
                        >
                          <span className="font-bold text-forge">Rev #{it.iteration}</span>
                          <span className="text-[10px] text-graphite-400">
                            {it.issues.length === 0 ? "Clean ✓" : `${it.issues.length} issues`}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="pt-1 border-t border-graphite-800 text-[10px] text-graphite-400">
                            <span className="text-graphite-300 font-semibold">Prompt: </span>
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

      {/* Primary Export Action Bar (Pinned cleanly at the bottom) */}
      <div className="pt-3 border-t border-graphite-800 space-y-2">
        <div className="relative group">
          <button
            type="button"
            onClick={onExport}
            disabled={hasErrors || isExporting}
            className={`w-full py-2.5 px-4 rounded-lg font-mono font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] ${
              hasErrors
                ? "bg-graphite-800 text-graphite-500 border border-graphite-750 cursor-not-allowed"
                : "bg-forge hover:bg-forge-hover text-graphite-950 cursor-pointer"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CAD Package (ZIP)</span>
          </button>

          {hasErrors && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-red-950 border border-red-700 text-red-200 text-[10px] font-mono rounded shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-30 text-center">
              Resolve {errors.length} error-level feasibility checks before export.
            </div>
          )}
        </div>

        {hasErrors && (
          <p className="text-[10px] font-mono text-red-400/90 text-center">
            * Deterministic checks require 0 errors before export.
          </p>
        )}
      </div>
    </div>
  );
}

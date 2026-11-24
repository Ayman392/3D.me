"use client";

import React from "react";
import { X, Scissors, Download, Clock, CheckCircle, ShieldCheck } from "lucide-react";

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
  slices: FitTestSliceItem[];
  projectName?: string;
}

export default function FitTestModal({
  isOpen,
  onClose,
  slices,
  projectName = "Design",
}: FitTestModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150 font-mono">
      <div className="w-full max-w-xl bg-graphite-900 border border-graphite-750 rounded-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-graphite-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-forge" />
            <h3 className="text-sm font-semibold text-white">Targeted Fit-Test Slices</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-graphite-400 hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="p-3.5 bg-forge/10 border-b border-forge/20 text-xs text-graphite-200 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-forge shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">Save hours of 3D printing time:</span>
            <p className="text-[11px] text-graphite-400 mt-0.5">
              These lightweight 15 mm ring slices isolate critical interfaces (display pocket, lip joint, mounting bosses). Print in ~10 minutes to verify caliper fit before committing to a 4-hour print!
            </p>
          </div>
        </div>

        {/* Slice List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {slices.length === 0 ? (
            <div className="text-center py-8 text-xs text-graphite-500">
              No critical interface slices generated.
            </div>
          ) : (
            slices.map((slice) => (
              <div
                key={slice.id}
                className="p-3 bg-graphite-950 border border-graphite-800 rounded hover:border-graphite-700 transition-colors flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-graphite-100">{slice.name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-graphite-850 border border-graphite-750 text-graphite-400 text-[10px]">
                      15 mm slice
                    </span>
                  </div>
                  <p className="text-[10px] text-graphite-400">
                    {slice.description || "Tests mating clearance, wall rigidity and snap tolerance."}
                  </p>
                </div>

                <a
                  href={slice.download_url}
                  download={`${projectName}_fit_test_${slice.id}.stl`}
                  className="px-3 py-1.5 bg-forge hover:bg-forge-hover text-graphite-950 font-bold rounded text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download STL</span>
                </a>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-graphite-800 bg-graphite-950 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Watertight STL ready for PrusaSlicer / Bambu Studio</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-graphite-800 hover:bg-graphite-750 text-graphite-200 rounded text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useRef, useState } from "react";
import {
  Camera,
  Upload,
  Plus,
  Trash2,
  Box,
  Check,
  Loader2,
  Ruler,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

const QUICK_CAD_TEMPLATES = [
  {
    label: "Pi 4 Case",
    prompt: "enclosure for raspberry pi 4 with snap lid and vents",
  },
  { label: "ESP32 Box", prompt: "case for esp32 with screw lid" },
  {
    label: "L-Bracket",
    prompt: "heavy duty L-bracket 50x50x30mm with M4 mounting holes and gusset",
  },
  { label: "Cable Clip", prompt: "cable clip for 6mm cable" },
  {
    label: "D-Shaft Knob",
    prompt: "control knob 25mm diameter with 6mm D-shaft",
  },
  { label: "Snap Clip", prompt: "snap fit cantilever clip 25mm length" },
  {
    label: "Wall Hook",
    prompt: "heavy duty wall hook with countersunk screw hole",
  },
  { label: "Pin Hinge", prompt: "two leaf pin hinge with 3mm pin" },
];

export interface MissingMeasurementItem {
  key: string;
  label: string;
  hint: string;
}

export interface DesignComponentItem {
  id: string;
  name: string;
  size: [number, number, number];
  anchor: string;
  source: "measured" | "approximate" | "datasheet";
}

interface DesignModeLeftPanelProps {
  prompt: string;
  onChangePrompt: (val: string) => void;
  referencePhotoUrl: string | null;
  onPhotoSelected: (file: File) => void;
  onRemovePhoto: () => void;
  detectedFeatures: Array<{ key: string; label: string; detected: boolean }>;
  onToggleFeature: (featureLabel: string) => void;
  components: DesignComponentItem[];
  onAddComponent: () => void;
  onRemoveComponent: (id: string) => void;
  onChangeAnchor: (id: string, anchor: string) => void;
  missingMeasurements: MissingMeasurementItem[];
  missingValues: Record<string, number>;
  onSetMissingValue: (key: string, val: number) => void;
  onSubmitMissingMeasurements: () => void;
  onGenerateDesign: () => void;
  isDesigning: boolean;
  designProgressText: string;
}

export default function DesignModeLeftPanel({
  prompt,
  onChangePrompt,
  referencePhotoUrl,
  onPhotoSelected,
  onRemovePhoto,
  detectedFeatures,
  onToggleFeature,
  components,
  onAddComponent,
  onRemoveComponent,
  missingMeasurements,
  missingValues,
  onSetMissingValue,
  onSubmitMissingMeasurements,
  onGenerateDesign,
  isDesigning,
  designProgressText,
}: DesignModeLeftPanelProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isPhotoOpen, setIsPhotoOpen] = useState(Boolean(referencePhotoUrl));
  const [isComponentsOpen, setIsComponentsOpen] = useState(
    components.length > 0,
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onPhotoSelected(e.target.files[0]);
      setIsPhotoOpen(true);
    }
  };

  const hasMissing = missingMeasurements.length > 0;

  return (
    <div className="p-4 space-y-4 font-sans text-xs">
      {/* 1. Primary Design Prompt & Presets (Immediate Focus) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase tracking-wider text-graphite-300 font-semibold flex items-center gap-1.5 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-forge" />
            <span>Design Specification</span>
          </label>
          <span className="text-[10px] text-graphite-500 font-mono">
            Build123d
          </span>
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => onChangePrompt(e.target.value)}
            disabled={isDesigning}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (!isDesigning && prompt.trim()) onGenerateDesign();
              }
            }}
            placeholder="Describe what you want to build (e.g. raspberry pi 4 case with snap lid, or L-bracket 50x50mm with M4 holes)..."
            className="w-full bg-graphite-950 border border-graphite-750 focus:border-forge rounded-lg p-3 text-white placeholder-graphite-500 text-xs font-mono outline-none transition-colors resize-none leading-relaxed shadow-inner"
          />
        </div>

        {/* Parametric Preset Chips */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase text-graphite-500 font-mono tracking-wider">
              Quick Templates
            </span>
            <span className="text-[10px] text-graphite-600 font-mono">
              1-click exact CAD
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CAD_TEMPLATES.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onChangePrompt(item.prompt)}
                disabled={isDesigning}
                className="px-2 py-1 rounded bg-graphite-950 hover:bg-graphite-850 border border-graphite-800 hover:border-forge/40 text-[11px] font-mono text-graphite-300 hover:text-white transition-all active:scale-[0.98]"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Action Button (Right at the top for immediate access) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onGenerateDesign}
            disabled={isDesigning || !prompt.trim()}
            className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] ${
              isDesigning || !prompt.trim()
                ? "bg-graphite-800 text-graphite-500 border border-graphite-750 cursor-not-allowed"
                : "bg-forge hover:bg-forge-hover text-graphite-950 cursor-pointer"
            }`}
          >
            {isDesigning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-graphite-950" />
                <span className="truncate">
                  {designProgressText || "Synthesizing CAD Solid..."}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate 3D CAD Design</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Missing Caliper Dimensions (Highlighted when required) */}
      {hasMissing && (
        <div className="p-3 bg-amber-950/20 border border-amber-600/40 rounded-lg space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-mono font-semibold text-amber-400">
            <div className="flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5" />
              <span>Caliper Dimensions Needed</span>
            </div>
            <span className="text-[10px] text-amber-500 uppercase">
              Required
            </span>
          </div>

          <div className="space-y-2">
            {missingMeasurements.map((m) => (
              <div
                key={m.key}
                className="p-2 bg-graphite-950 border border-amber-700/40 rounded flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-graphite-200 block truncate">
                    {m.label}
                  </span>
                  {m.hint && (
                    <p className="text-[10px] text-graphite-500 truncate">
                      {m.hint}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="mm"
                    value={
                      missingValues[m.key] !== undefined
                        ? missingValues[m.key]
                        : ""
                    }
                    onChange={(e) =>
                      onSetMissingValue(m.key, parseFloat(e.target.value) || 0)
                    }
                    className="w-16 bg-graphite-900 border border-graphite-700 focus:border-amber-400 rounded px-1.5 py-0.5 text-white text-right text-xs font-mono outline-none"
                  />
                  <span className="text-[10px] font-mono text-graphite-500">
                    mm
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onSubmitMissingMeasurements}
            disabled={isDesigning}
            className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-graphite-950 font-bold rounded text-xs font-mono flex items-center justify-center gap-1.5 transition-colors shadow"
          >
            {isDesigning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Confirm Dimensions &amp; Rebuild</span>
          </button>
        </div>
      )}

      {/* 3. Reference Photo & Features (Collapsible Accordion) */}
      <div className="border border-graphite-800 rounded-lg overflow-hidden bg-graphite-950/40 transition-colors">
        <button
          type="button"
          onClick={() => setIsPhotoOpen(!isPhotoOpen)}
          className="w-full px-3 py-2.5 flex items-center justify-between text-xs font-mono text-graphite-300 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <Camera className="w-3.5 h-3.5 text-forge" />
            <span className="font-medium">Reference Photo</span>
            {referencePhotoUrl ? (
              <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-[10px] text-emerald-400 font-mono">
                Loaded ✓
              </span>
            ) : (
              <span className="text-[10px] text-graphite-500 font-mono">
                (Optional)
              </span>
            )}
          </div>
          {isPhotoOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-graphite-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-graphite-500" />
          )}
        </button>

        {isPhotoOpen && (
          <div className="p-3 pt-0 border-t border-graphite-850 space-y-3 mt-1">
            {referencePhotoUrl ? (
              <div className="flex items-center gap-3 pt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referencePhotoUrl}
                  alt="Reference"
                  className="w-14 h-14 object-cover rounded-md border"
                />
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                      Active Photo
                    </span>
                    <button
                      type="button"
                      onClick={onRemovePhoto}
                      className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-[10px] text-graphite-400 leading-tight">
                    Vision features extracted below. Click chips to pin them to
                    your prompt.
                  </p>
                </div>
              </div>
            ) : (
              <div
                onClick={() => photoInputRef.current?.click()}
                className="mt-2 p-3 border border-dashed border-graphite-750 hover:border-forge/60 rounded-lg cursor-pointer transition-colors flex flex-col items-center justify-center text-center group"
              >
                <Upload className="w-4 h-4 text-graphite-500 group-hover:text-forge mb-1 transition-colors" />
                <span className="text-xs font-semibold text-graphite-300 group-hover:text-white">
                  Drop reference photo
                </span>
                <span className="text-[10px] text-graphite-500 mt-0.5">
                  Helps detect screw bosses, ports &amp; shapes
                </span>
              </div>
            )}

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Detected Feature Chips */}
            {detectedFeatures && detectedFeatures.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-graphite-500 block uppercase font-mono tracking-wider">
                  Detected Features
                </span>
                <div className="flex flex-wrap gap-1">
                  {detectedFeatures.map((feat) => (
                    <button
                      key={feat.key}
                      type="button"
                      onClick={() => onToggleFeature(feat.label)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-1 border ${
                        feat.detected
                          ? "bg-forge/15 border-forge/60 text-forge font-medium"
                          : "bg-graphite-900 border-graphite-800 text-graphite-400 hover:text-white hover:border-graphite-700"
                      }`}
                    >
                      <span>{feat.detected ? "✓" : "+"}</span>
                      <span>{feat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Internal Components to Enclose (Collapsible Accordion) */}
      <div className="border border-graphite-800 rounded-lg overflow-hidden bg-graphite-950/40 transition-colors">
        <button
          type="button"
          onClick={() => setIsComponentsOpen(!isComponentsOpen)}
          className="w-full px-3 py-2.5 flex items-center justify-between text-xs font-mono text-graphite-300 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <Box className="w-3.5 h-3.5 text-forge" />
            <span className="font-medium">Internal Components</span>
            <span className="px-1.5 py-0.2 rounded bg-graphite-800 text-[10px] text-graphite-400 font-mono">
              {components.length}
            </span>
          </div>
          {isComponentsOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-graphite-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-graphite-500" />
          )}
        </button>

        {isComponentsOpen && (
          <div className="p-3 pt-0 border-t border-graphite-850 space-y-2.5 mt-1">
            <div className="flex items-center justify-between pt-2">
              <span className="text-[10px] text-graphite-500 font-mono uppercase tracking-wider">
                Mounted Boards &amp; Hardware
              </span>
              <button
                type="button"
                onClick={onAddComponent}
                className="text-[11px] font-mono text-forge hover:text-white flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add Component</span>
              </button>
            </div>

            {components.length === 0 ? (
              <div className="text-center py-3 text-[11px] text-graphite-500 font-mono">
                No components added. Add SBCs or displays to generate custom
                internal standoffs.
              </div>
            ) : (
              <div className="space-y-2">
                {components.map((c) => (
                  <div
                    key={c.id}
                    className="p-2 rounded bg-graphite-900 border border-graphite-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-white">{c.name}</span>
                        <span className="text-[9px] px-1 rounded bg-graphite-800 text-graphite-400">
                          {c.source}
                        </span>
                      </div>
                      <div className="text-[10px] text-graphite-500 mt-0.5">
                        {c.size[0]} × {c.size[1]} × {c.size[2]} mm
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveComponent(c.id)}
                      className="p-1 text-graphite-500 hover:text-red-400 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

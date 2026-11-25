"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  IconCamera,
  IconCloudUpload,
  IconPlus,
  IconTrash,
  IconCube3dSphere,
  IconCheck,
  IconLoader2,
  IconRulerMeasure,
  IconChevronDown,
  IconChevronUp,
  IconSparkles,
  type IconProps,
} from "@tabler/icons-react";

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

function PanelDoodleBadge({
  icon: Icon,
  size = 14,
  rotateOnHover = -6,
}: {
  icon: React.ComponentType<IconProps>;
  size?: number;
  rotateOnHover?: number;
}) {
  return (
    <motion.span
      whileHover={{ scale: 1.14, rotate: rotateOnHover, y: -1 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-foreground/80 bg-card p-1 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)] group-hover:text-white"
    >
      <Icon size={size} stroke={2.1} className="shrink-0" />
    </motion.span>
  );
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
    <div className="space-y-4 bg-card p-4 font-sans text-xs text-card-foreground transition-colors">
      {/* 1. Primary Design Prompt & Presets */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="group flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-foreground">
            <PanelDoodleBadge
              icon={IconSparkles}
              size={14}
              rotateOnHover={12}
            />
            <span>Design Specification</span>
          </label>
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
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
            className="w-full resize-none rounded-xl border border-border bg-background/85 p-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--brand,#ff6b2c)]"
          />
        </div>

        {/* Parametric Preset Chips */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Templates
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
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
                className="rounded-lg border border-border bg-secondary/50 px-2 py-1 font-mono text-[11px] font-medium text-foreground transition-all hover:border-[var(--brand,#ff6b2c)] hover:bg-[var(--brand,#ff6b2c)]/12 active:scale-[0.98] disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Doodle Pill Action Button */}
        <div className="pt-1">
          <motion.button
            type="button"
            whileHover={!isDesigning && prompt.trim() ? { y: -1.5 } : {}}
            whileTap={
              !isDesigning && prompt.trim() ? { scale: 0.98, y: 1 } : {}
            }
            onClick={onGenerateDesign}
            disabled={isDesigning || !prompt.trim()}
            className={`flex w-full items-center justify-center gap-2 rounded-full border-2 px-4 py-2.5 font-mono text-xs font-black transition-all ${
              isDesigning || !prompt.trim()
                ? "cursor-not-allowed border-border bg-secondary text-muted-foreground"
                : "cursor-pointer border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_3px_0_var(--foreground)] active:shadow-none"
            }`}
          >
            {isDesigning ? (
              <>
                <IconLoader2 size={15} stroke={2.2} className="animate-spin" />
                <span className="truncate">
                  {designProgressText || "Synthesizing CAD Solid..."}
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center justify-center rounded-full border border-foreground bg-card p-1 text-[var(--brand,#ff6b2c)]">
                  <IconSparkles size={13} stroke={2.2} />
                </span>
                <span>Generate 3D CAD Design</span>
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* 2. Missing Caliper Dimensions */}
      {hasMissing && (
        <div className="space-y-2.5 rounded-xl border-2 border-foreground/80 bg-[var(--brand,#ff6b2c)]/10 p-3 shadow-[0_2px_0_var(--foreground)]">
          <div className="flex items-center justify-between font-mono text-xs font-bold text-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-1 text-white">
                <IconRulerMeasure size={14} stroke={2.1} />
              </span>
              <span>Caliper Dimensions Needed</span>
            </div>
            <span className="rounded-full bg-[var(--brand,#ff6b2c)]/20 px-2 py-0.5 text-[10px] font-black uppercase text-[var(--brand,#ff6b2c)]">
              Required
            </span>
          </div>

          <div className="space-y-2">
            {missingMeasurements.map((m) => (
              <div
                key={m.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/85 p-2"
              >
                <div className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-foreground">
                    {m.label}
                  </span>
                  {m.hint && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {m.hint}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
                    className="w-16 rounded-md border border-border bg-card px-1.5 py-0.5 text-right font-mono text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    mm
                  </span>
                </div>
              </div>
            ))}
          </div>

          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98, y: 1 }}
            onClick={onSubmitMissingMeasurements}
            disabled={isDesigning}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-[var(--brand,#ff6b2c)] py-1.5 font-mono text-xs font-black text-white shadow-[0_2px_0_var(--foreground)] transition active:shadow-none disabled:opacity-50"
          >
            {isDesigning ? (
              <IconLoader2 size={14} stroke={2.2} className="animate-spin" />
            ) : (
              <IconCheck size={14} stroke={2.3} />
            )}
            <span>Confirm Dimensions & Rebuild</span>
          </motion.button>
        </div>
      )}

      {/* 3. Reference Photo & Features */}
      <div className="overflow-hidden rounded-xl border border-border bg-background/60 transition-colors">
        <button
          type="button"
          onClick={() => setIsPhotoOpen(!isPhotoOpen)}
          className="group flex w-full items-center justify-between px-3 py-2.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary/50"
        >
          <div className="flex items-center gap-2">
            <PanelDoodleBadge icon={IconCamera} size={14} rotateOnHover={-8} />
            <span className="font-bold">Reference Photo</span>
            {referencePhotoUrl ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-500">
                Loaded ✓
              </span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">
                (Optional)
              </span>
            )}
          </div>
          {isPhotoOpen ? (
            <IconChevronUp
              size={15}
              stroke={2.1}
              className="text-[var(--brand,#ff6b2c)]"
            />
          ) : (
            <IconChevronDown
              size={15}
              stroke={2.1}
              className="text-[var(--brand,#ff6b2c)]"
            />
          )}
        </button>

        {isPhotoOpen && (
          <div className="mt-1 space-y-3 border-t border-border p-3 pt-2">
            {referencePhotoUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referencePhotoUrl}
                  alt="Reference"
                  className="h-14 w-14 rounded-lg border border-border object-cover"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-emerald-500">
                      Active Photo
                    </span>
                    <button
                      type="button"
                      onClick={onRemovePhoto}
                      className="font-mono text-[10px] font-semibold text-destructive transition-colors hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-[10px] leading-tight text-muted-foreground">
                    Vision features extracted below. Click chips to pin them to
                    your prompt.
                  </p>
                </div>
              </div>
            ) : (
              <div
                onClick={() => photoInputRef.current?.click()}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-3 text-center transition-colors hover:border-[var(--brand,#ff6b2c)] hover:bg-[var(--brand,#ff6b2c)]/[0.06]"
              >
                <motion.span
                  whileHover={{ scale: 1.14, y: -2 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                  className="mb-1.5 inline-flex items-center justify-center rounded-xl border-2 border-foreground/80 bg-card p-1.5 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)] group-hover:text-white"
                >
                  <IconCloudUpload size={16} stroke={2.1} />
                </motion.span>
                <span className="text-xs font-bold text-foreground">
                  Drop reference photo
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  Helps detect screw bosses, ports & shapes
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
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Detected Features
                </span>
                <div className="flex flex-wrap gap-1">
                  {detectedFeatures.map((feat) => (
                    <button
                      key={feat.key}
                      type="button"
                      onClick={() => onToggleFeature(feat.label)}
                      className={`flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                        feat.detected
                          ? "border-[var(--brand,#ff6b2c)] bg-[var(--brand,#ff6b2c)]/15 font-bold text-[var(--brand,#ff6b2c)]"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/50 hover:text-foreground"
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

      {/* 4. Internal Components to Enclose */}
      <div className="overflow-hidden rounded-xl border border-border bg-background/60 transition-colors">
        <button
          type="button"
          onClick={() => setIsComponentsOpen(!isComponentsOpen)}
          className="group flex w-full items-center justify-between px-3 py-2.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary/50"
        >
          <div className="flex items-center gap-2">
            <PanelDoodleBadge
              icon={IconCube3dSphere}
              size={14}
              rotateOnHover={12}
            />
            <span className="font-bold">Internal Components</span>
            <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] font-bold text-foreground">
              {components.length}
            </span>
          </div>
          {isComponentsOpen ? (
            <IconChevronUp
              size={15}
              stroke={2.1}
              className="text-[var(--brand,#ff6b2c)]"
            />
          ) : (
            <IconChevronDown
              size={15}
              stroke={2.1}
              className="text-[var(--brand,#ff6b2c)]"
            />
          )}
        </button>

        {isComponentsOpen && (
          <div className="mt-1 space-y-2.5 border-t border-border p-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mounted Boards & Hardware
              </span>
              <button
                type="button"
                onClick={onAddComponent}
                className="flex items-center gap-1 font-mono text-[11px] font-bold text-[var(--brand,#ff6b2c)] transition-colors hover:underline"
              >
                <IconPlus size={13} stroke={2.3} />
                <span>Add Component</span>
              </button>
            </div>

            {components.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 py-3 px-2 text-center font-mono text-[11px] text-muted-foreground">
                No components added. Add SBCs or displays to generate custom
                internal standoffs.
              </div>
            ) : (
              <div className="space-y-2">
                {components.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-2 font-mono text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground">
                          {c.name}
                        </span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                          {c.source}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {c.size[0]} × {c.size[1]} × {c.size[2]} mm
                      </div>
                    </div>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onRemoveComponent(c.id)}
                      aria-label={`Remove ${c.name}`}
                      className="rounded-lg border border-border bg-background/70 p-1 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    >
                      <IconTrash size={14} stroke={2.1} />
                    </motion.button>
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

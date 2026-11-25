"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  IconPlus,
  IconCloudUpload,
  IconSparkles,
  IconChevronRight,
  IconChevronUp,
  IconPhotoSpark,
  IconTypography,
  IconLayersSubtract,
  IconWand,
  IconX,
  IconCpu,
  IconRulerMeasure,
  IconScissors,
  type IconProps,
} from "@tabler/icons-react";
import type { StudioToolId } from "./StudioToolRail";

export type GenerationMode = "hd" | "smart";
export type QualityTier = "Draft" | "Standard" | "High";

export interface GeneratorPanelProps {
  activeTool: StudioToolId;
  generationMode: GenerationMode;
  onChangeGenerationMode: (mode: GenerationMode) => void;
  quality: QualityTier;
  onChangeQuality: (q: QualityTier) => void;
  prompt: string;
  onChangePrompt: (val: string) => void;
  uploadedPreviewUrl: string | null;
  uploadedFileName: string | null;
  onFileUpload: (file: File) => void;
  onClearUpload: () => void;
  generateInParts: boolean;
  onToggleGenerateInParts: (v: boolean) => void;
  highResTexture: boolean;
  onToggleHighResTexture: (v: boolean) => void;
  isPrivate: boolean;
  onTogglePrivate: (v: boolean) => void;
  aiModel: string;
  onChangeAiModel: (m: string) => void;
  creditCost: number;
  isGenerating: boolean;
  onGenerate: () => void;
  onOpenCadSettings?: () => void;
  onOpenFitTest?: () => void;
}

const INPUT_TABS: Array<{
  id: "image" | "text" | "multiview" | "refine";
  icon: React.ComponentType<IconProps>;
  label: string;
}> = [
  { id: "image", icon: IconPhotoSpark, label: "Image" },
  { id: "multiview", icon: IconLayersSubtract, label: "Multi" },
  { id: "text", icon: IconTypography, label: "Text" },
  { id: "refine", icon: IconWand, label: "Prompt" },
];

export function GeneratorPanel({
  activeTool,
  generationMode,
  onChangeGenerationMode,
  quality,
  onChangeQuality,
  prompt,
  onChangePrompt,
  uploadedPreviewUrl,
  uploadedFileName,
  onFileUpload,
  onClearUpload,
  generateInParts,
  onToggleGenerateInParts,
  highResTexture,
  onToggleHighResTexture,
  isPrivate,
  onTogglePrivate,
  aiModel,
  onChangeAiModel,
  isGenerating,
  onGenerate,
  onOpenCadSettings,
  onOpenFitTest,
}: GeneratorPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inputTab, setInputTab] = useState<
    "image" | "text" | "multiview" | "refine"
  >("image");
  const [isDragging, setIsDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onFileUpload(file);
    }
  };

  return (
    <section className="flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-2xl border border-border bg-card p-3.5 text-card-foreground transition-colors">
      <div className="space-y-3.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.span
              whileHover={{ rotate: 90, scale: 1.12 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="inline-flex items-center justify-center rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-1 text-white shadow-[0_2px_0_var(--foreground)]"
            >
              <IconPlus size={14} stroke={2.3} />
            </motion.span>
            <h2 className="text-sm font-bold tracking-tight">
              {activeTool === "cad" ? "CAD & Precision Fit" : "Generate Model"}
            </h2>
          </div>
          <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
            {quality}
          </span>
        </div>

        {/* CAD Quick Actions when CAD tool is selected */}
        {activeTool === "cad" && (onOpenCadSettings || onOpenFitTest) && (
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-secondary/40 p-2">
            {onOpenCadSettings && (
              <button
                type="button"
                onClick={onOpenCadSettings}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-bold text-foreground transition hover:border-[var(--brand,#ff6b2c)]"
              >
                <IconRulerMeasure
                  size={13}
                  stroke={2.1}
                  className="text-[var(--brand,#ff6b2c)]"
                />
                <span>Calibration</span>
              </button>
            )}
            {onOpenFitTest && (
              <button
                type="button"
                onClick={onOpenFitTest}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-bold text-foreground transition hover:border-[var(--brand,#ff6b2c)]"
              >
                <IconScissors
                  size={13}
                  stroke={2.1}
                  className="text-[var(--brand,#ff6b2c)]"
                />
                <span>Fit Slices</span>
              </button>
            )}
          </div>
        )}

        {/* Mode Segmented Switch */}
        <div className="grid grid-cols-2 gap-1.5 rounded-full border-2 border-foreground/80 bg-secondary/70 p-1">
          <button
            type="button"
            onClick={() => onChangeGenerationMode("hd")}
            className={`rounded-full py-1.5 text-xs font-bold transition ${
              generationMode === "hd"
                ? "bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            HD Model
          </button>
          <button
            type="button"
            onClick={() => onChangeGenerationMode("smart")}
            className={`flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-bold transition ${
              generationMode === "smart"
                ? "bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Smart Mesh</span>
            <motion.span
              animate={
                generationMode === "smart" ? { rotate: [0, 15, -15, 0] } : {}
              }
              transition={{ duration: 0.5 }}
              className="inline-flex items-center"
            >
              <IconSparkles size={13} stroke={2.2} className="text-amber-300" />
            </motion.span>
          </button>
        </div>

        {/* Input Mode Strip + Dropzone */}
        <div className="space-y-2.5 rounded-2xl border-2 border-foreground/75 bg-[var(--brand,#ff6b2c)]/[0.05] p-2.5">
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-background/80 p-1">
            {INPUT_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = inputTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  title={tab.label}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setInputTab(tab.id)}
                  className="group flex items-center justify-center rounded-lg py-1"
                >
                  <motion.span
                    animate={
                      active ? { scale: 1.08, y: -0.5 } : { scale: 1, y: 0 }
                    }
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className={`inline-flex items-center justify-center rounded-xl border-2 p-1 transition-colors ${
                      active
                        ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                        : "border-foreground/75 bg-card text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
                    }`}
                  >
                    <Icon size={14} stroke={2.1} />
                  </motion.span>
                </motion.button>
              );
            })}
          </div>

          {inputTab === "text" ? (
            <textarea
              value={prompt}
              onChange={(e) => onChangePrompt(e.target.value)}
              rows={5}
              placeholder="Describe your 3D object, enclosure, or prop..."
              className="w-full resize-none rounded-xl border border-border bg-background/85 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[var(--brand,#ff6b2c)] focus:outline-none"
            />
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() =>
                !uploadedPreviewUrl && fileInputRef.current?.click()
              }
              className={`group relative flex h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center transition ${
                isDragging
                  ? "border-[var(--brand,#ff6b2c)] bg-[var(--brand,#ff6b2c)]/15"
                  : "border-border bg-muted/40 hover:border-[var(--brand,#ff6b2c)]/70"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileUpload(file);
                }}
              />

              {uploadedPreviewUrl ? (
                <div className="relative flex h-full w-full items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedPreviewUrl}
                    alt={uploadedFileName || "Uploaded preview"}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearUpload();
                    }}
                    className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-card text-foreground shadow-[0_2px_0_var(--foreground)] hover:text-destructive"
                  >
                    <IconX size={13} stroke={2.2} />
                  </motion.button>
                </div>
              ) : (
                <>
                  <motion.span
                    whileHover={{ scale: 1.14, y: -2 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className="mb-2 inline-flex items-center justify-center rounded-2xl border-2 border-foreground/80 bg-card p-2 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)] group-hover:text-white"
                  >
                    <IconCloudUpload size={18} stroke={2.1} />
                  </motion.span>
                  <p className="text-xs font-bold text-foreground">Upload</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Drag & drop or click to choose image
                  </p>
                </>
              )}

              <motion.button
                type="button"
                whileHover={{ y: -1.5 }}
                whileTap={{ scale: 0.96 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setInputTab("text");
                }}
                className="mt-2.5 inline-flex items-center gap-1 rounded-full border-2 border-foreground/80 bg-card px-3 py-1 text-[11px] font-bold text-foreground shadow-[0_2px_0_var(--foreground)] transition hover:border-foreground"
              >
                <IconSparkles
                  size={12}
                  stroke={2.2}
                  className="text-[var(--brand,#ff6b2c)]"
                />
                <span>Generate Image for 3D</span>
                <IconChevronRight
                  size={13}
                  stroke={2.2}
                  className="text-[var(--brand,#ff6b2c)]"
                />
              </motion.button>
            </div>
          )}
        </div>

        {/* General Settings */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground">
            General Settings
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary"
          >
            <span>Geometry & Texture</span>
            {settingsOpen ? (
              <IconChevronUp
                size={15}
                stroke={2.1}
                className="text-[var(--brand,#ff6b2c)]"
              />
            ) : (
              <IconChevronRight
                size={15}
                stroke={2.1}
                className="text-[var(--brand,#ff6b2c)]"
              />
            )}
          </button>

          {settingsOpen && (
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-background/60 p-1">
              {(["Draft", "Standard", "High"] as QualityTier[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onChangeQuality(tier)}
                  className={`rounded-lg py-1 text-[11px] font-bold transition ${
                    quality === tier
                      ? "bg-[var(--brand,#ff6b2c)] text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Studio Options */}
        <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/30 p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-[var(--brand,#ff6b2c)]">
              Studio Options
            </span>
            <span className="rounded-full bg-[var(--brand,#ff6b2c)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--brand,#ff6b2c)]">
              Pro Ready
            </span>
          </div>

          <label className="flex cursor-pointer items-center justify-between py-0.5 text-xs font-medium text-foreground">
            <span>Generate in Parts</span>
            <input
              type="checkbox"
              checked={generateInParts}
              onChange={(e) => onToggleGenerateInParts(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--brand,#ff6b2c)]"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between py-0.5 text-xs font-medium text-foreground">
            <span>High-Res PBR Texture</span>
            <input
              type="checkbox"
              checked={highResTexture}
              onChange={(e) => onToggleHighResTexture(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--brand,#ff6b2c)]"
            />
          </label>

          <div className="flex items-center justify-between border-t border-border/60 pt-1 text-xs">
            <span className="text-muted-foreground">Privacy</span>
            <button
              type="button"
              onClick={() => onTogglePrivate(!isPrivate)}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-foreground hover:border-[var(--brand,#ff6b2c)]"
            >
              {isPrivate ? "Private" : "Public"}
            </button>
          </div>
        </div>

        {/* AI Model Selector */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground">
            AI Model
          </p>
          <div className="group flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <motion.span
                whileHover={{ scale: 1.12, rotate: -6 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="inline-flex items-center justify-center rounded-xl border-2 border-foreground/75 bg-card p-1.5 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)] group-hover:text-white"
              >
                <IconCpu size={15} stroke={2.1} />
              </motion.span>
              <div>
                <p className="text-xs font-bold text-foreground">{aiModel}</p>
                <p className="text-[10px] text-muted-foreground">
                  Balanced geometry & topology
                </p>
              </div>
            </div>
            <select
              aria-label="Select AI Model"
              value={aiModel}
              onChange={(e) => onChangeAiModel(e.target.value)}
              className="rounded-lg border border-border bg-card px-1.5 py-1 text-[11px] font-semibold text-foreground focus:border-[var(--brand,#ff6b2c)] focus:outline-none"
            >
              <option value="3DMe-v3.1-Pro">v3.1 Pro</option>
              <option value="3DMe-Fast-Mesh">Fast Mesh</option>
              <option value="CAD-Precision-v2">CAD v2</option>
            </select>
          </div>
        </div>

        {/* Doodle Pill Generate CTA without credit number */}
        <motion.button
          type="button"
          disabled={isGenerating}
          whileHover={{ y: -1.5 }}
          whileTap={{ scale: 0.98, y: 1 }}
          onClick={onGenerate}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-full border-2 border-foreground bg-[var(--brand,#ff6b2c)] px-4 py-2.5 text-xs font-black text-white shadow-[0_3px_0_var(--foreground)] transition active:shadow-none disabled:opacity-60"
        >
          <motion.span
            animate={isGenerating ? { rotate: 360 } : { rotate: 0 }}
            transition={
              isGenerating
                ? { repeat: Infinity, duration: 1.3, ease: "linear" }
                : { duration: 0.2 }
            }
            className="inline-flex items-center justify-center rounded-full border border-foreground bg-card p-1 text-[var(--brand,#ff6b2c)]"
          >
            <IconSparkles size={13} stroke={2.2} />
          </motion.span>
          <span>{isGenerating ? "Generating..." : "Generate"}</span>
        </motion.button>
      </div>
    </section>
  );
}

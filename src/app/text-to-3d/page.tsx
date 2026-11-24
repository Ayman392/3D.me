"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/layout/AppSidebar";
import ModelViewer from "@/components/viewer/ModelViewer";
import {
  Sparkles,
  RefreshCw,
  Box,
  Layers,
  Ruler,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Download,
  Check,
  CheckCircle2,
  Wrench,
  Printer,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Plus,
} from "lucide-react";

interface PrintReport {
  watertight: boolean;
  manifold: boolean;
  volume_mm3: number;
  bbox_mm: { x: number; y: number; z: number };
  min_wall_mm: number;
  overhang_percent: number;
  triangle_count: number;
  status: "pass" | "warn" | "fail";
  reasons: string[];
}

interface CandidateDetail {
  index: number;
  url: string;
  score: {
    single_object: boolean;
    fully_visible: boolean;
    background_clean: boolean;
    has_thin_or_floating_parts: boolean;
    printability_score: number;
    evaluated_by?: string;
  };
  printability_score: number;
}

interface Text3DJob {
  job_id: string;
  status: "candidates_ready" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  prompt: string;
  style?: string | null;
  formatted_prompt: string;
  seed: number;
  candidates: string[];
  candidate_details?: CandidateDetail[];
  top_3_indices?: number[];
  recommended_index?: number;
  selected_candidate?: number | null;
  glb_url?: string | null;
  stl_url?: string | null;
  three_mf_url?: string | null;
  download_url?: string | null;
  quality_mode?: "Preview" | "Final";
  printer_type?: "single" | "multi" | "full";
  print_report?: PrintReport | null;
  slicer_info?: { slicer: string; raw_output: string } | null;
  file_size?: number | null;
  vertex_count?: number | null;
  face_count?: number | null;
  generation_time?: number | null;
  error?: string | null;
  warning?: string;
}

const STYLE_OPTIONS = [
  { id: "robot", label: "Robot" },
  { id: "toy", label: "Toy" },
  { id: "product", label: "Product" },
  { id: "prop", label: "Prop" },
] as const;

const QUICK_PROMPTS = [
  { label: "Desktop Robot", prompt: "cute friendly desktop robot with rounded shell, cat ears, and square display face", style: "robot" },
  { label: "Vinyl Figurine", prompt: "cute stylized vinyl fox toy figurine with smooth rounded body", style: "toy" },
  { label: "Retro Radio", prompt: "portable retro radio with large brass dials, speaker grille, and antenna", style: "product" },
  { label: "Ceramic Mug", prompt: "modern matte ceramic mug with geometric faceted handle and thick rim", style: "product" },
];

export default function TextTo3DPage() {
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string>("robot");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGeneratingCandidates, setIsGeneratingCandidates] = useState(false);
  const [isSynthesizing3D, setIsSynthesizing3D] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [currentJob, setCurrentJob] = useState<Text3DJob | null>(null);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Print & Reconstruction Settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [qualityMode, setQualityMode] = useState<"Preview" | "Final">("Final");
  const [printerType, setPrinterType] = useState<"single" | "multi" | "full">("single");
  const [numColors, setNumColors] = useState<number>(4);
  const [targetHeightMm, setTargetHeightMm] = useState<string>("100");
  const [flatBaseCut, setFlatBaseCut] = useState<boolean>(true);

  const router = useRouter();
  const [modelMode, setModelMode] = useState<"decorative" | "functional">("decorative");
  const [routedSuggestion, setRoutedSuggestion] = useState<{ mode: "functional" | "decorative"; reason: string } | null>(null);
  const classifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Active view tab when model is completed: 'model' | 'prompt'
  const [activeSideTab, setActiveSideTab] = useState<"model" | "prompt">("prompt");

  useEffect(() => {
    if (classifyTimeoutRef.current) {
      clearTimeout(classifyTimeoutRef.current);
    }
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.length < 4) {
      setRoutedSuggestion(null);
      return;
    }
    classifyTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/engine/route/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.mode) {
            setRoutedSuggestion(data);
          }
        }
      } catch (err) {
        console.warn("Intent classification skipped:", err);
      }
    }, 350);

    return () => {
      if (classifyTimeoutRef.current) {
        clearTimeout(classifyTimeoutRef.current);
      }
    };
  }, [prompt]);

  useEffect(() => {
    if (currentJob?.status === "completed") {
      setActiveSideTab("model");
    }
  }, [currentJob?.status]);

  // Enhance prompt using local Ollama qwen2.5-coder:7b
  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    setIsEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/engine/text3d/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: selectedStyle || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to enhance prompt.");
      }
      const data = await res.json();
      if (data.enhanced_prompt) {
        setPrompt(data.enhanced_prompt);
      }
    } catch (err: any) {
      setError(err.message || "Failed to enhance prompt.");
    } finally {
      setIsEnhancing(false);
    }
  };

  // Generate 4 candidate images using sd-turbo
  const handleGenerateCandidates = async () => {
    if (!prompt.trim()) {
      setError("Please enter a text prompt to generate candidates.");
      return;
    }
    setIsGeneratingCandidates(true);
    setError(null);
    setCurrentJob(null);
    setActiveSideTab("prompt");

    try {
      const res = await fetch("/api/engine/text3d/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: selectedStyle || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to start candidate generation.");
      }

      const jobData: Text3DJob = await res.json();
      setCurrentJob(jobData);

      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/engine/text3d/jobs/${jobData.job_id}`);
          if (!pollRes.ok) return;

          const updatedJob: Text3DJob = await pollRes.json();
          setCurrentJob(updatedJob);

          if (updatedJob.status === "candidates_ready") {
            clearInterval(pollInterval);
            setIsGeneratingCandidates(false);
            if (updatedJob.top_3_indices && updatedJob.top_3_indices.length > 0) {
              setSelectedCandidateIdx(updatedJob.top_3_indices[0]);
            }
          } else if (updatedJob.status === "failed") {
            clearInterval(pollInterval);
            setIsGeneratingCandidates(false);
            setError(updatedJob.error || "Failed to generate candidate images.");
          }
        } catch (pollErr) {
          console.error("Polling error for candidates:", pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setIsGeneratingCandidates(false);
      setError(err.message || "Failed to communicate with local diffusion engine.");
    }
  };

  // Select candidate image and run TripoSR reconstruction with printprep
  const handleGenerate3DFromCandidate = async () => {
    if (!currentJob) return;
    setIsSynthesizing3D(true);
    setError(null);

    try {
      const height = parseFloat(targetHeightMm) || 100.0;
      const res = await fetch(`/api/engine/text3d/jobs/${currentJob.job_id}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_index: selectedCandidateIdx,
          quality: qualityMode,
          height_mm: height,
          printer_type: printerType,
          n_colors: numColors,
          flat_base_cut: flatBaseCut,
          taubin_iterations: qualityMode === "Final" ? 2 : 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to start 3D reconstruction.");
      }

      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/engine/text3d/jobs/${currentJob.job_id}`);
          if (!pollRes.ok) return;

          const updatedJob: Text3DJob = await pollRes.json();
          setCurrentJob(updatedJob);

          if (updatedJob.status === "completed") {
            clearInterval(pollInterval);
            setIsSynthesizing3D(false);
            setActiveSideTab("model");

            // Save to local offline history
            try {
              const localRecord = {
                id: updatedJob.job_id,
                name: `Text3D: ${prompt.slice(0, 24)}`,
                source_type: "text3d",
                source_image_preview: `/api/engine${updatedJob.candidates[selectedCandidateIdx]}`,
                glb_url: `/api/engine${updatedJob.glb_url}`,
                stl_url: updatedJob.stl_url ? `/api/engine${updatedJob.stl_url}` : null,
                three_mf_url: updatedJob.three_mf_url ? `/api/engine${updatedJob.three_mf_url}` : null,
                status: "completed",
                file_size: updatedJob.file_size,
                vertex_count: updatedJob.vertex_count,
                face_count: updatedJob.face_count,
                print_report: updatedJob.print_report,
                created_at: new Date().toISOString(),
              };
              const existing = JSON.parse(localStorage.getItem("3dme_history") || "[]");
              existing.unshift(localRecord);
              localStorage.setItem("3dme_history", JSON.stringify(existing.slice(0, 50)));
            } catch (storageErr) {
              console.warn("Local storage write notice:", storageErr);
            }
          } else if (updatedJob.status === "failed") {
            clearInterval(pollInterval);
            setIsSynthesizing3D(false);
            setError(updatedJob.error || "3D reconstruction failed.");
          }
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setIsSynthesizing3D(false);
      setError(err.message || "Failed to dispatch 3D reconstruction task.");
    }
  };

  // Quality gate auto-repair
  const handleAutoRepair = async () => {
    if (!currentJob) return;
    setIsRepairing(true);
    setError(null);
    try {
      const res = await fetch(`/api/engine/text3d/jobs/${currentJob.job_id}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          height_mm: parseFloat(targetHeightMm) || 100.0,
          printer_type: printerType,
          n_colors: numColors,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Auto-repair request failed.");
      }

      const data = await res.json();
      setCurrentJob((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          print_report: data.print_report,
          vertex_count: data.vertex_count,
          face_count: data.face_count,
        };
      });
    } catch (err: any) {
      setError(err.message || "Auto-repair failed.");
    } finally {
      setIsRepairing(false);
    }
  };

  const handleDownload = (format: "glb" | "stl" | "3mf") => {
    if (!currentJob) return;
    const url = `/api/engine/text3d/jobs/${currentJob.job_id}/export/${format}`;
    const filename = `3dme_${prompt.slice(0, 16).replace(/\s+/g, "_")}.${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setCurrentJob(null);
    setPrompt("");
    setError(null);
    setActiveSideTab("prompt");
  };

  const topIndices = currentJob?.top_3_indices && currentJob.top_3_indices.length > 0
    ? currentJob.top_3_indices
    : [0, 1, 2];

  const report = currentJob?.print_report;
  const isModelCompleted = currentJob?.status === "completed" && !!currentJob.glb_url;

  return (
    <div className="flex h-screen w-screen bg-graphite-950 text-graphite-100 overflow-hidden font-sans">
      <AppSidebar />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Minimal Top Header */}
        <header className="h-12 px-5 border-b border-graphite-800 flex items-center justify-between shrink-0 bg-graphite-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-semibold text-graphite-200 uppercase tracking-wider">
              Text to 3D
            </span>
            <span className="text-graphite-700">/</span>
            <span className="text-xs text-graphite-400 font-mono truncate max-w-md">
              {prompt || "New Model"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isModelCompleted && (
              <div className="flex items-center gap-1.5 mr-2">
                <button
                  type="button"
                  onClick={() => handleDownload("stl")}
                  className="px-2.5 py-1 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 hover:text-white text-xs font-mono flex items-center gap-1 transition-colors"
                  title="Download standard 3D print binary STL"
                >
                  <Download className="w-3 h-3 text-forge" />
                  <span>STL</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload("3mf")}
                  className="px-2.5 py-1 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 hover:text-white text-xs font-mono flex items-center gap-1 transition-colors"
                  title="Download multi-material / multi-color 3MF"
                >
                  <Download className="w-3 h-3 text-forge" />
                  <span>3MF</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload("glb")}
                  className="px-2.5 py-1 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 hover:text-white text-xs font-mono flex items-center gap-1 transition-colors"
                  title="Download full-color GLTF binary"
                >
                  <Download className="w-3 h-3 text-forge" />
                  <span>GLB</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded hover:bg-graphite-800 text-graphite-400 hover:text-graphite-200 text-xs font-mono flex items-center gap-1 transition-colors"
              title="Start a new model"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Dock Panel: Sleek 360px Width */}
          <div className="w-[360px] border-r border-graphite-800 bg-graphite-900/40 flex flex-col justify-between overflow-y-auto shrink-0">
            <div className="p-4 space-y-4">
              {/* Segmented View Switcher when model is completed */}
              {isModelCompleted && (
                <div className="grid grid-cols-2 p-0.5 rounded-lg bg-graphite-950 border border-graphite-800 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setActiveSideTab("model")}
                    className={`py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                      activeSideTab === "model"
                        ? "bg-graphite-800 text-white font-medium shadow-sm"
                        : "text-graphite-400 hover:text-graphite-200"
                    }`}
                  >
                    <Box className="w-3.5 h-3.5 text-forge" />
                    <span>Print Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSideTab("prompt")}
                    className={`py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                      activeSideTab === "prompt"
                        ? "bg-graphite-800 text-white font-medium shadow-sm"
                        : "text-graphite-400 hover:text-graphite-200"
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Edit Prompt</span>
                  </button>
                </div>
              )}

              {/* TAB 1: PROMPT & CANDIDATE FLOW */}
              {(!isModelCompleted || activeSideTab === "prompt") && (
                <div className="space-y-4">
                  {/* Mode Selector (Functional CAD vs Decorative Neural) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase text-graphite-500 tracking-wider">
                      <span>Model Mode</span>
                      {routedSuggestion && (
                        <span className="text-forge normal-case font-normal">
                          Detected: {routedSuggestion.mode}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-graphite-950 border border-graphite-800 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setModelMode("decorative")}
                        className={`py-1.5 px-2 rounded text-xs font-mono transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                          modelMode === "decorative"
                            ? "bg-graphite-800 text-white font-medium shadow-sm border border-graphite-700"
                            : "text-graphite-400 hover:text-graphite-200"
                        }`}
                      >
                        <Box className="w-3.5 h-3.5 text-forge" />
                        <span>Decorative</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModelMode("functional");
                          router.push(`/cad?prompt=${encodeURIComponent(prompt)}`);
                        }}
                        className={`py-1.5 px-2 rounded text-xs font-mono transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                          modelMode === "functional"
                            ? "bg-forge text-graphite-950 font-medium shadow-sm"
                            : "text-graphite-400 hover:text-graphite-200"
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Functional (CAD)</span>
                      </button>
                    </div>
                  </div>

                  {/* Intent Routing Recommendation Banner */}
                  {routedSuggestion && routedSuggestion.mode === "functional" && (
                    <div className="p-3 bg-graphite-950 border border-forge/40 rounded-lg text-xs font-mono space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-forge tracking-wide flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Functional Part Detected</span>
                        </span>
                        <span className="text-[10px] text-graphite-500 font-mono">B-Rep CAD</span>
                      </div>
                      <p className="text-[11px] text-graphite-300 leading-snug">
                        {routedSuggestion.reason || "Neural meshes are organic and lack exact dimensions. For enclosures, brackets, clips, and replacement parts with caliper accuracy, switch to Parametric CAD."}
                      </p>
                      <button
                        type="button"
                        onClick={() => router.push(`/cad?prompt=${encodeURIComponent(prompt)}`)}
                        className="w-full py-2 bg-forge hover:bg-forge-hover text-graphite-950 font-semibold rounded text-xs font-mono transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <span>Open in Parametric CAD Studio</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}

                  {/* Prompt Textarea */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-graphite-400 font-medium uppercase tracking-wide">
                        Prompt
                      </span>
                      <button
                        type="button"
                        disabled={isEnhancing || !prompt.trim()}
                        onClick={handleEnhancePrompt}
                        className="text-forge hover:text-forge-hover disabled:opacity-40 flex items-center gap-1 transition-colors"
                        title="Enhance prompt with AI"
                      >
                        {isEnhancing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>Enhance</span>
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        rows={3}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            if (!isGeneratingCandidates && prompt.trim()) {
                              handleGenerateCandidates();
                            }
                          }
                        }}
                        placeholder="Describe what you want to create..."
                        className="w-full bg-graphite-950 border border-graphite-750 focus:border-forge rounded-lg p-3 text-xs font-mono text-white placeholder-graphite-500 outline-none resize-none transition-colors leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Style Preset Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-graphite-500 tracking-wider">
                      Style
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {STYLE_OPTIONS.map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => setSelectedStyle(selectedStyle === style.id ? "" : style.id)}
                          className={`py-1.5 px-2 rounded-md border text-center transition-all text-xs font-mono active:scale-[0.98] ${
                            selectedStyle === style.id
                              ? "bg-forge/15 border-forge text-forge font-medium shadow-sm"
                              : "bg-graphite-950 border-graphite-800 text-graphite-400 hover:text-graphite-200 hover:border-graphite-700"
                          }`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Collapsible Print Configuration */}
                  <div className="border border-graphite-800 rounded-lg overflow-hidden bg-graphite-950/60">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      className="w-full px-3 py-2 flex items-center justify-between text-xs font-mono text-graphite-400 hover:text-graphite-200 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-forge" />
                        <span>Print & Quality Settings</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-graphite-500 font-mono">
                        <span>{qualityMode} · {printerType} · {targetHeightMm}mm</span>
                        {showAdvancedSettings ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </button>

                    {showAdvancedSettings && (
                      <div className="p-3 pt-0 border-t border-graphite-850 space-y-3 mt-2 text-xs font-mono">
                        {/* Quality Tier */}
                        <div className="flex items-center justify-between">
                          <span className="text-graphite-400">Resolution</span>
                          <div className="flex items-center rounded bg-graphite-900 border border-graphite-800 p-0.5">
                            <button
                              type="button"
                              onClick={() => setQualityMode("Preview")}
                              className={`px-2 py-0.5 rounded text-[11px] ${
                                qualityMode === "Preview"
                                  ? "bg-graphite-800 text-white font-medium"
                                  : "text-graphite-500 hover:text-graphite-300"
                              }`}
                            >
                              Draft (128³)
                            </button>
                            <button
                              type="button"
                              onClick={() => setQualityMode("Final")}
                              className={`px-2 py-0.5 rounded text-[11px] ${
                                qualityMode === "Final"
                                  ? "bg-forge text-graphite-950 font-semibold"
                                  : "text-graphite-500 hover:text-graphite-300"
                              }`}
                            >
                              Final (256³)
                            </button>
                          </div>
                        </div>

                        {/* Printer Type */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-graphite-400">Printer Target</span>
                            <span className="text-[10px] text-graphite-500 capitalize">{printerType}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {(["single", "multi", "full"] as const).map((pt) => (
                              <button
                                key={pt}
                                type="button"
                                onClick={() => setPrinterType(pt)}
                                className={`py-1 rounded border text-center text-[10px] font-mono transition-colors ${
                                  printerType === pt
                                    ? "bg-forge/15 border-forge text-forge font-medium"
                                    : "bg-graphite-900 border-graphite-800 text-graphite-400 hover:text-graphite-200"
                                }`}
                              >
                                {pt === "multi" ? "Multi (AMS)" : pt === "single" ? "Single" : "Full Color"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Filament Count if Multi */}
                        {printerType === "multi" && (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-graphite-400">Filament Slots</span>
                            <div className="flex items-center gap-1">
                              {[2, 3, 4].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setNumColors(c)}
                                  className={`w-6 h-5 rounded text-[10px] font-mono ${
                                    numColors === c
                                      ? "bg-forge text-graphite-950 font-bold"
                                      : "bg-graphite-900 text-graphite-400 border border-graphite-800"
                                  }`}
                                >
                                  {c}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Target Height & Flat Bed Cut */}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-graphite-400">Target Height</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="10"
                              max="400"
                              step="5"
                              value={targetHeightMm}
                              onChange={(e) => setTargetHeightMm(e.target.value)}
                              className="w-16 bg-graphite-900 border border-graphite-800 rounded px-1.5 py-0.5 text-right text-xs font-mono text-white outline-none focus:border-forge"
                            />
                            <span className="text-graphite-500 text-[10px]">mm</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-graphite-400">Flat Base Cut</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={flatBaseCut}
                              onChange={(e) => setFlatBaseCut(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-7 h-4 bg-graphite-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-forge" />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Primary Action Button: Generate 4 Candidates */}
                  {(!currentJob || !currentJob.candidates || currentJob.candidates.length === 0) && (
                    <button
                      type="button"
                      disabled={isGeneratingCandidates || !prompt.trim()}
                      onClick={handleGenerateCandidates}
                      className="w-full h-10 bg-forge hover:bg-forge-hover disabled:bg-graphite-800 disabled:text-graphite-600 text-graphite-950 font-medium rounded-lg text-xs font-mono transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isGeneratingCandidates ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating 4 Views...</span>
                        </>
                      ) : (
                        <>
                          <Layers className="w-3.5 h-3.5" />
                          <span>Generate Candidates</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Candidate Generation Progress */}
                  {isGeneratingCandidates && (
                    <div className="p-3 bg-graphite-950 border border-graphite-800 rounded-lg space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-graphite-300 flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 text-forge animate-spin" />
                          <span>{currentJob?.message || "Generating 4 candidates..."}</span>
                        </span>
                        <span className="text-forge font-semibold">{currentJob?.progress || 10}%</span>
                      </div>
                      <div className="w-full bg-graphite-850 rounded-full h-1 overflow-hidden">
                        <div
                          className="bg-forge h-full transition-all duration-300"
                          style={{ width: `${currentJob?.progress || 10}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Notification */}
                  {error && (
                    <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-200 text-xs font-mono flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Candidate Selection Gallery */}
                  {currentJob && currentJob.candidates && currentJob.candidates.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-graphite-800">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-graphite-300 font-medium uppercase tracking-wide">
                          Select Candidate View
                        </span>
                        <button
                          type="button"
                          disabled={isGeneratingCandidates || isSynthesizing3D}
                          onClick={handleGenerateCandidates}
                          className="text-graphite-500 hover:text-white flex items-center gap-1 text-[11px] transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Regenerate</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {topIndices.map((idx, rankIdx) => {
                          const candUrl = currentJob.candidates[idx];
                          const detail = currentJob.candidate_details?.find((d) => d.index === idx);
                          const score = detail?.printability_score ?? 8.0;
                          const isSelected = selectedCandidateIdx === idx;

                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedCandidateIdx(idx)}
                              className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                                isSelected
                                  ? "border-forge ring-2 ring-forge/30 shadow-md scale-[1.02]"
                                  : "border-graphite-800 hover:border-graphite-600 opacity-80 hover:opacity-100"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/engine${candUrl}`}
                                alt={`Candidate ${idx + 1}`}
                                className="w-full h-full object-cover bg-white"
                              />
                              <div className="absolute top-1 left-1 px-1 py-0.2 rounded bg-graphite-950/80 text-white font-mono text-[9px] border border-graphite-700">
                                #{rankIdx + 1}
                              </div>
                              <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-graphite-950/90 text-forge font-mono text-[9px] font-bold border border-forge/30">
                                {score.toFixed(1)}
                              </div>
                              {isSelected && (
                                <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-forge text-graphite-950 flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Build 3D Button */}
                      <button
                        type="button"
                        disabled={isSynthesizing3D}
                        onClick={handleGenerate3DFromCandidate}
                        className="w-full h-10 bg-forge hover:bg-forge-hover disabled:bg-graphite-800 disabled:text-graphite-600 text-graphite-950 font-medium rounded-lg text-xs font-mono transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm mt-2"
                      >
                        {isSynthesizing3D ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Building 3D Mesh...</span>
                          </>
                        ) : (
                          <>
                            <Box className="w-3.5 h-3.5" />
                            <span>Build 3D ({qualityMode} Mode)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* 3D Reconstruction Progress */}
                  {isSynthesizing3D && currentJob && (
                    <div className="p-3 bg-graphite-950 border border-graphite-800 rounded-lg space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-graphite-300 flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 text-forge animate-spin" />
                          <span>{currentJob.message}</span>
                        </span>
                        <span className="text-forge font-semibold">{currentJob.progress}%</span>
                      </div>
                      <div className="w-full bg-graphite-850 rounded-full h-1 overflow-hidden">
                        <div
                          className="bg-forge h-full transition-all duration-300"
                          style={{ width: `${currentJob.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: COMPLETED MODEL QUALITY GATE & EXPORT */}
              {isModelCompleted && activeSideTab === "model" && report && (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-3 rounded-lg border flex items-center justify-between ${
                    report.status === "pass"
                      ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                      : report.status === "warn"
                      ? "bg-amber-950/30 border-amber-800/60 text-amber-300"
                      : "bg-red-950/30 border-red-800/60 text-red-300"
                  }`}>
                    <div className="flex items-center gap-2 text-xs font-mono font-medium">
                      {report.status === "pass" ? (
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                      )}
                      <span>
                        {report.status === "pass" ? "Print-Ready Geometry" : "Print Warnings Detected"}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-graphite-950 border border-current">
                      {report.status}
                    </span>
                  </div>

                  {/* Compact Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2 rounded bg-graphite-950 border border-graphite-800 flex flex-col justify-between">
                      <span className="text-[10px] text-graphite-500 uppercase">Watertight</span>
                      <span className={`font-semibold mt-0.5 ${report.watertight ? "text-emerald-400" : "text-red-400"}`}>
                        {report.watertight ? "Yes (0 holes)" : "No"}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-graphite-950 border border-graphite-800 flex flex-col justify-between">
                      <span className="text-[10px] text-graphite-500 uppercase">2-Manifold</span>
                      <span className={`font-semibold mt-0.5 ${report.manifold ? "text-emerald-400" : "text-red-400"}`}>
                        {report.manifold ? "Yes (Valid)" : "No"}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-graphite-950 border border-graphite-800 flex flex-col justify-between">
                      <span className="text-[10px] text-graphite-500 uppercase">Est. Min Wall</span>
                      <span className={`font-semibold mt-0.5 ${report.min_wall_mm >= 0.8 ? "text-graphite-200" : "text-amber-400"}`}>
                        ~{report.min_wall_mm.toFixed(2)} mm
                      </span>
                    </div>

                    <div className="p-2 rounded bg-graphite-950 border border-graphite-800 flex flex-col justify-between">
                      <span className="text-[10px] text-graphite-500 uppercase">Overhang &gt;45°</span>
                      <span className={`font-semibold mt-0.5 ${report.overhang_percent <= 35 ? "text-graphite-200" : "text-amber-400"}`}>
                        {report.overhang_percent}%
                      </span>
                    </div>

                    {/* Bounding Box & Volume Card */}
                    <div className="p-2 rounded bg-graphite-950 border border-graphite-800 col-span-2 space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-graphite-500 uppercase">Bounding Box</span>
                        <span className="text-forge font-semibold">
                          {report.bbox_mm.x} × {report.bbox_mm.y} × {report.bbox_mm.z} mm
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-graphite-500 uppercase">Volume</span>
                        <span className="text-graphite-300">
                          {(report.volume_mm3 / 1000).toFixed(1)} cm³
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-graphite-500 uppercase">Triangles</span>
                        <span className="text-graphite-300">
                          {report.triangle_count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pre-flight Warnings List */}
                  {report.status !== "pass" && report.reasons && report.reasons.length > 0 && (
                    <div className="p-2.5 bg-amber-950/20 border border-amber-800/40 rounded text-[11px] font-mono text-amber-200 space-y-1">
                      <div className="flex items-center gap-1 font-semibold text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Slicer Advice:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-graphite-400 text-[10px]">
                        {report.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Auto-Repair Button */}
                  <button
                    type="button"
                    disabled={isRepairing}
                    onClick={handleAutoRepair}
                    className="w-full h-9 bg-graphite-900 hover:bg-graphite-850 text-forge border border-forge/30 hover:border-forge rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    {isRepairing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wrench className="w-3.5 h-3.5" />
                    )}
                    <span>Auto-Repair Geometry</span>
                  </button>

                  {/* Production Exports */}
                  <div className="space-y-1.5 pt-2 border-t border-graphite-800">
                    <span className="text-[10px] font-mono uppercase text-graphite-500 block">
                      Production Exports
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownload("stl")}
                        className="h-8 bg-graphite-900 hover:bg-graphite-850 border border-graphite-800 hover:border-graphite-700 text-graphite-200 hover:text-white rounded text-xs font-mono flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
                      >
                        <Download className="w-3 h-3 text-forge" />
                        <span>STL</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload("3mf")}
                        className="h-8 bg-graphite-900 hover:bg-graphite-850 border border-graphite-800 hover:border-graphite-700 text-graphite-200 hover:text-white rounded text-xs font-mono flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
                      >
                        <Download className="w-3 h-3 text-forge" />
                        <span>3MF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload("glb")}
                        className="h-8 bg-graphite-900 hover:bg-graphite-850 border border-graphite-800 hover:border-graphite-700 text-graphite-200 hover:text-white rounded text-xs font-mono flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
                      >
                        <Download className="w-3 h-3 text-forge" />
                        <span>GLB</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Main Panel: Clean Hero DCC 3D Viewport */}
          <div className="flex-1 h-full bg-graphite-950 flex flex-col relative overflow-hidden">
            {isModelCompleted && currentJob?.glb_url ? (
              <div className="relative w-full h-full flex flex-col">
                <ModelViewer
                  glbUrl={`/api/engine${currentJob.glb_url}`}
                  modelName={`text3d_${prompt.slice(0, 16).replace(/\s+/g, "_")}.glb`}
                  generationTime={currentJob.generation_time || 0}
                  fileSize={currentJob.file_size || 0}
                  vertexCount={currentJob.vertex_count || 0}
                  faceCount={currentJob.face_count || 0}
                  onDownload={() => handleDownload("glb")}
                />
              </div>
            ) : isSynthesizing3D ? (
              /* Synthesizing 3D Loader View */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-xl bg-graphite-900 border border-graphite-800 flex items-center justify-center shadow-lg">
                  <Loader2 className="w-7 h-7 text-forge animate-spin" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-mono text-sm text-graphite-200 font-medium">
                    Synthesizing & Print-Prepping Mesh
                  </h3>
                  <p className="font-mono text-xs text-graphite-500 max-w-sm">
                    {currentJob?.message || "Reconstructing 3D geometry and verifying manifold mesh..."}
                  </p>
                </div>
                <div className="text-[10px] font-mono text-forge bg-forge/10 px-3 py-1 rounded-full border border-forge/20">
                  {currentJob?.progress || 40}% Complete
                </div>
              </div>
            ) : currentJob && currentJob.candidates && currentJob.candidates.length > 0 ? (
              /* High-Res Candidate View Preview */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-5 select-none">
                <div className="relative w-72 h-72 rounded-2xl overflow-hidden border border-graphite-750 shadow-2xl bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/engine${currentJob.candidates[selectedCandidateIdx]}`}
                    alt="Selected Candidate Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-graphite-950/85 text-white font-mono text-xs border border-graphite-700">
                    Candidate #{selectedCandidateIdx + 1}
                  </div>
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="font-mono text-sm font-semibold text-graphite-200">
                    Candidate #{selectedCandidateIdx + 1} Selected
                  </h3>
                  <p className="font-mono text-xs text-graphite-400">
                    Click <span className="text-forge font-medium">Build 3D</span> to reconstruct geometry and run manifold print-prep.
                  </p>
                </div>
              </div>
            ) : (
              /* Minimal Inspiring Empty State with 1-Click Quick Prompts */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 select-none max-w-lg mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-graphite-900 border border-graphite-800 flex items-center justify-center text-graphite-500 shadow-md">
                  <Box className="w-7 h-7 text-forge" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="font-mono text-sm font-semibold text-graphite-200 tracking-wide">
                    3d.me Print Studio
                  </h2>
                  <p className="font-mono text-xs text-graphite-400 leading-relaxed">
                    Design and export clean, print-ready 3D models.
                  </p>
                </div>

                {/* Quick-start inspiration chips */}
                <div className="w-full space-y-2 pt-2">
                  <span className="text-[10px] font-mono uppercase text-graphite-500 tracking-wider block">
                    Quick Start Ideas
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-left">
                    {QUICK_PROMPTS.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setPrompt(item.prompt);
                          setSelectedStyle(item.style);
                        }}
                        className="p-2.5 rounded-lg bg-graphite-900/80 hover:bg-graphite-850 border border-graphite-800 hover:border-forge/40 transition-all group"
                      >
                        <div className="text-xs font-mono text-graphite-300 group-hover:text-forge font-medium truncate">
                          {item.label}
                        </div>
                        <div className="text-[10px] font-mono text-graphite-500 line-clamp-1 mt-0.5">
                          {item.prompt}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import ModelViewer from "@/components/viewer/ModelViewer";
import { useAuth } from "@/context/AuthContext";
import { createClient, isSupabaseConfigured } from "@/utils/supabase/client";
import {
  UploadCloud,
  FileImage,
  RefreshCw,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Download,
  Info,
  Maximize2,
  Box,
  Cpu,
  Ruler,
  Scissors,
  Wrench,
  FileText,
  Check,
  Zap,
} from "lucide-react";

interface ImageMetadata {
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  previewUrl: string;
}

interface GenerationResult {
  jobId: string;
  glbUrl: string;
  generationTime: number;
  fileSize: number;
  vertexCount: number;
  faceCount: number;
  quality: string;
}

interface ScaledModelInfo {
  scaledModelId: string;
  glbUrl: string;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
  axis: string;
  targetLengthMm: number;
  warning: string;
}

interface ScanStats {
  vertices: number;
  triangles: number;
  bounding_box: [number, number, number];
  watertight: boolean;
  loose_components: number;
}

interface ScanData {
  id: string;
  name: string;
  tag: string;
  glb_url: string;
  download_url: string;
  file_size: number;
  stats: ScanStats;
  units_suspected: string;
  suggested_scale_factor: number;
  unit_hint?: string | null;
  warning: string;
}

interface CleanedScanData {
  cleaned_id: string;
  glb_url: string;
  stl_url: string;
  obj_url: string;
  download_url: string;
  file_size: number;
  before_stats: ScanStats;
  after_stats: ScanStats;
  changes: string[];
  warning: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  // Dashboard mode: "image" or "scan"
  const [dashboardMode, setDashboardMode] = useState<"image" | "scan">("image");

  // Image -> 3D State
  const [imageMeta, setImageMeta] = useState<ImageMetadata | null>(null);
  const [quality, setQuality] = useState<"Draft" | "Standard" | "High">("Standard");
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // Real size scaling state (Image mode)
  const [scaleAxis, setScaleAxis] = useState<"x" | "y" | "z">("x");
  const [targetLength, setTargetLength] = useState<string>("75.0");
  const [isScaling, setIsScaling] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [scaledResult, setScaledResult] = useState<ScaledModelInfo | null>(null);
  const [activeModelView, setActiveModelView] = useState<"original" | "scaled">("original");

  // Scan Import & Cleanup State
  const [importedScan, setImportedScan] = useState<ScanData | null>(null);
  const [cleanedScan, setCleanedScan] = useState<CleanedScanData | null>(null);
  const [scanViewerMode, setScanViewerMode] = useState<"before" | "after" | "scaled">("before");
  const [isUploadingScan, setIsUploadingScan] = useState(false);
  const [isCleaningScan, setIsCleaningScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanDragging, setIsScanDragging] = useState(false);

  // Scan cleanup options
  const [removeFloating, setRemoveFloating] = useState(true);
  const [floatingThreshold, setFloatingThreshold] = useState(5.0);
  const [fillHoles, setFillHoles] = useState(false);
  const [centerAndGround, setCenterAndGround] = useState(true);
  const [decimate, setDecimate] = useState(false);
  const [targetTriangles, setTargetTriangles] = useState<number>(5000);
  const [unitsConfirmed, setUnitsConfirmed] = useState(false);

  // Scan scale
  const [scanScaleAxis, setScanScaleAxis] = useState<"x" | "y" | "z">("x");
  const [scanTargetLength, setScanTargetLength] = useState<string>("50.0");
  const [isScalingScan, setIsScalingScan] = useState(false);
  const [scaledScanResult, setScaledScanResult] = useState<ScaledModelInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (file: File) => {
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setErrorMessage("Unsupported file type. Please upload a PNG, JPG, JPEG, or WEBP image.");
      return;
    }

    setErrorMessage(null);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageMeta({
        file,
        name: file.name,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        previewUrl: objectUrl,
      });
    };
    img.onerror = () => {
      setErrorMessage("Could not parse image file. Please choose another image.");
    };
    img.src = objectUrl;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Scan file selection & drop handling
  const handleScanSelection = async (file: File) => {
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const validExts = [".glb", ".gltf", ".obj", ".stl"];
    if (!validExts.includes(ext)) {
      setScanError(`Unsupported file format '${ext}'. Allowed: .glb, .gltf, .obj, .stl`);
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setScanError(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 100 MB limit.`);
      return;
    }

    setScanError(null);
    setIsUploadingScan(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/engine/models/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to import 3D scan.");
      }

      const data = await res.json();
      const scanData: ScanData = {
        id: data.id,
        name: data.name,
        tag: data.tag,
        glb_url: `/api/engine${data.glb_url}`,
        download_url: `/api/engine${data.download_url}`,
        file_size: data.file_size,
        stats: data.stats,
        units_suspected: data.units_suspected,
        suggested_scale_factor: data.suggested_scale_factor,
        unit_hint: data.unit_hint,
        warning: data.warning,
      };

      setImportedScan(scanData);
      setCleanedScan(null);
      setScaledScanResult(null);
      setScanViewerMode("before");
      setUnitsConfirmed(data.units_suspected === "millimeters");
      // Default decimate target to 50%
      setTargetTriangles(Math.max(500, Math.floor(data.stats.triangles * 0.5)));

      // Save to local offline history
      const localRecord = {
        id: scanData.id,
        name: scanData.name.replace(/\.[^/.]+$/, ""),
        source_type: "scan",
        glb_url: scanData.glb_url,
        status: "completed",
        file_size: scanData.file_size,
        vertex_count: scanData.stats.vertices,
        face_count: scanData.stats.triangles,
        created_at: new Date().toISOString(),
      };
      const existingHistory = JSON.parse(
        localStorage.getItem("3dme_history") || localStorage.getItem("meshforge_history") || "[]"
      );
      existingHistory.unshift(localRecord);
      localStorage.setItem("3dme_history", JSON.stringify(existingHistory.slice(0, 50)));
    } catch (err: any) {
      setScanError(err.message || "Failed to import 3D file.");
    } finally {
      setIsUploadingScan(false);
    }
  };

  const handleScanDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsScanDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleScanSelection(e.dataTransfer.files[0]);
    }
  };

  // Apply cleanup operations on a copy of the mesh
  const handleApplyCleanup = async () => {
    if (!importedScan) return;

    setIsCleaningScan(true);
    setScanError(null);

    try {
      const res = await fetch(`/api/engine/models/${importedScan.id}/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remove_floating: removeFloating,
          floating_threshold_pct: floatingThreshold,
          fill_holes: fillHoles,
          center_and_ground: centerAndGround,
          decimate: decimate,
          target_triangles: decimate ? targetTriangles : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Cleanup failed.");
      }

      const data = await res.json();
      setCleanedScan({
        cleaned_id: data.cleaned_id,
        glb_url: `/api/engine${data.glb_url}`,
        stl_url: `/api/engine${data.stl_url}`,
        obj_url: `/api/engine${data.obj_url}`,
        download_url: `/api/engine${data.download_url}`,
        file_size: data.file_size,
        before_stats: data.before_stats,
        after_stats: data.after_stats,
        changes: data.changes,
        warning: data.warning,
      });
      setScanViewerMode("after");
    } catch (err: any) {
      setScanError(err.message || "Failed to clean scan mesh.");
    } finally {
      setIsCleaningScan(false);
    }
  };

  // Confirm suspected units conversion (e.g. meters -> mm via 1000x or micrometers -> mm via 0.001x)
  const handleConfirmUnitsScale = async () => {
    if (!importedScan) return;

    setIsScalingScan(true);
    setScanError(null);

    try {
      const activeModelId = cleanedScan ? cleanedScan.cleaned_id : importedScan.id;
      const res = await fetch("/api/engine/models/scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: activeModelId,
          scale_factor: importedScan.suggested_scale_factor,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to scale units.");
      }

      const data = await res.json();
      setScaledScanResult({
        scaledModelId: data.scaled_model_id,
        glbUrl: `/api/engine${data.glb_url}`,
        dimensions: data.dimensions,
        scaleFactor: data.scale_factor,
        axis: data.axis,
        targetLengthMm: data.target_length_mm,
        warning: data.warning,
      });
      setScanViewerMode("scaled");
      setUnitsConfirmed(true);
    } catch (err: any) {
      setScanError(err.message || "Failed to scale units.");
    } finally {
      setIsScalingScan(false);
    }
  };

  // Scale scan by measured axis and real millimeter size
  const handleScaleScanByAxis = async () => {
    if (!importedScan) return;
    const len = parseFloat(scanTargetLength);
    if (isNaN(len) || len <= 0) {
      setScanError("Please enter a target length greater than 0 mm.");
      return;
    }

    setIsScalingScan(true);
    setScanError(null);

    try {
      const activeModelId = cleanedScan ? cleanedScan.cleaned_id : importedScan.id;
      const res = await fetch("/api/engine/models/scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: activeModelId,
          axis: scanScaleAxis,
          target_length_mm: len,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to scale model.");
      }

      const data = await res.json();
      setScaledScanResult({
        scaledModelId: data.scaled_model_id,
        glbUrl: `/api/engine${data.glb_url}`,
        dimensions: data.dimensions,
        scaleFactor: data.scale_factor,
        axis: data.axis,
        targetLengthMm: data.target_length_mm,
        warning: data.warning,
      });
      setScanViewerMode("scaled");
    } catch (err: any) {
      setScanError(err.message || "Failed to scale model to real size.");
    } finally {
      setIsScalingScan(false);
    }
  };

  const handleDownloadFormat = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const startGeneration = async () => {
    if (!imageMeta) return;

    setIsGenerating(true);
    setProgress(5);
    setStatusMessage("Sending image to 3D engine...");
    setErrorMessage(null);
    setGenerationResult(null);
    setScaledResult(null);
    setActiveModelView("original");
    setScaleError(null);

    try {
      const formData = new FormData();
      formData.append("file", imageMeta.file);
      formData.append("quality", quality);

      const response = await fetch("/api/engine/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to start 3D generation.");
      }

      const jobData = await response.json();
      const jobId = jobData.job_id;

      // Poll job status until completed or failed
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/engine/jobs/${jobId}`);
          if (!res.ok) return;

          const job = await res.json();
          setProgress(job.progress || 10);
          setStatusMessage(job.message || "Generating 3D mesh...");

          if (job.status === "completed") {
            clearInterval(pollInterval);
            const fullGlbUrl = `/api/engine${job.glb_url}`;

            const result: GenerationResult = {
              jobId,
              glbUrl: fullGlbUrl,
              generationTime: job.generation_time || 0,
              fileSize: job.file_size || 0,
              vertexCount: job.vertex_count || 0,
              faceCount: job.face_count || 0,
              quality,
            };

            setGenerationResult(result);
            setIsGenerating(false);

            // Record in Supabase database & storage
            await recordGenerationInSupabase(result, imageMeta);
          } else if (job.status === "failed") {
            clearInterval(pollInterval);
            setIsGenerating(false);
            setErrorMessage(job.error || "3D generation failed.");
          }
        } catch (err: any) {
          console.error("Polling error:", err);
        }
      }, 1000);
    } catch (err: any) {
      setIsGenerating(false);
      setErrorMessage(err.message || "Failed to communicate with 3D engine.");
    }
  };

  const recordGenerationInSupabase = async (
    result: GenerationResult,
    meta: ImageMetadata
  ) => {
    try {
      const glbBlob = await fetch(result.glbUrl).then((r) => r.blob());

      if (isSupabaseConfigured() && user) {
        const supabase = createClient();
        const modelPath = `models/${user.id}/${result.jobId}.glb`;

        const { error: storageError } = await supabase.storage
          .from("models")
          .upload(`${user.id}/${result.jobId}.glb`, glbBlob, {
            contentType: "model/gltf-binary",
            upsert: true,
          });

        if (storageError) {
          console.warn("Storage upload note:", storageError.message);
        }

        const { error: dbError } = await supabase.from("generations").insert({
          id: result.jobId,
          user_id: user.id,
          name: meta.name.replace(/\.[^/.]+$/, ""),
          source_type: "image",
          source_image_path: meta.name,
          model_path: modelPath,
          status: "completed",
          quality: result.quality,
          generation_time: result.generationTime,
          file_size: result.fileSize,
          vertex_count: result.vertexCount,
          face_count: result.faceCount,
        });

        if (dbError) {
          console.warn("DB insert note:", dbError.message);
        }
      }

      const localRecord = {
        id: result.jobId,
        name: meta.name.replace(/\.[^/.]+$/, ""),
        source_type: "image",
        source_image_preview: meta.previewUrl,
        glb_url: result.glbUrl,
        status: "completed",
        quality: result.quality,
        generation_time: result.generationTime,
        file_size: result.fileSize,
        vertex_count: result.vertexCount,
        face_count: result.faceCount,
        created_at: new Date().toISOString(),
      };

      const existingHistory = JSON.parse(
        localStorage.getItem("3dme_history") || localStorage.getItem("meshforge_history") || "[]"
      );
      existingHistory.unshift(localRecord);
      localStorage.setItem("3dme_history", JSON.stringify(existingHistory.slice(0, 50)));
    } catch (err) {
      console.warn("Could not save to Supabase or localStorage:", err);
    }
  };

  const handleDownload = () => {
    if (!generationResult) return;
    const a = document.createElement("a");
    a.href = `/api/engine/download/${generationResult.jobId}`;
    a.download = `${imageMeta?.name.replace(/\.[^/.]+$/, "") || "model"}.glb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleScaleModel = async () => {
    if (!generationResult) return;
    const len = parseFloat(targetLength);
    if (isNaN(len) || len <= 0) {
      setScaleError("Please enter a target length greater than 0 mm.");
      return;
    }
    setIsScaling(true);
    setScaleError(null);
    try {
      const res = await fetch("/api/engine/models/scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: generationResult.jobId,
          axis: scaleAxis,
          target_length_mm: len,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to scale model");
      }
      const data = await res.json();
      setScaledResult({
        scaledModelId: data.scaled_model_id,
        glbUrl: `/api/engine${data.glb_url}`,
        dimensions: data.dimensions,
        scaleFactor: data.scale_factor,
        axis: data.axis,
        targetLengthMm: data.target_length_mm,
        warning: data.warning,
      });
      setActiveModelView("scaled");
    } catch (err: any) {
      setScaleError(err.message || "Failed to scale model to real size.");
    } finally {
      setIsScaling(false);
    }
  };

  const handleDownloadScaled = () => {
    if (!scaledResult) return;
    const a = document.createElement("a");
    a.href = scaledResult.glbUrl;
    a.download = `${imageMeta?.name.replace(/\.[^/.]+$/, "") || "model"}_scaled_${scaledResult.targetLengthMm}mm.glb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resetAll = () => {
    setImageMeta(null);
    setGenerationResult(null);
    setScaledResult(null);
    setActiveModelView("original");
    setScaleError(null);
    setIsGenerating(false);
    setProgress(0);
    setErrorMessage(null);
  };

  return (
    <div className="flex h-screen w-screen bg-graphite-950 text-graphite-100 overflow-hidden font-sans">
      <AppSidebar />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Workspace Top Bar */}
        <header className="h-14 px-6 border-b border-graphite-800 flex items-center justify-between shrink-0 bg-graphite-900/50">
          <div className="flex items-center gap-4">
            <h1 className="font-mono text-sm font-semibold tracking-wide text-graphite-100">
              CREATE 3D
            </h1>
            <span className="text-graphite-600">/</span>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-1 bg-graphite-900 border border-graphite-750 rounded p-0.5">
              <button
                type="button"
                onClick={() => setDashboardMode("image")}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                  dashboardMode === "image"
                    ? "bg-forge text-graphite-950 font-semibold shadow-sm"
                    : "text-graphite-400 hover:text-white"
                }`}
              >
                <FileImage className="w-3.5 h-3.5" />
                <span>Image → 3D</span>
              </button>
              <button
                type="button"
                onClick={() => setDashboardMode("scan")}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                  dashboardMode === "scan"
                    ? "bg-forge text-graphite-950 font-semibold shadow-sm"
                    : "text-graphite-400 hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Import Scan</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
          </div>
        </header>

        {/* Content Area: Split between controls & 3D Viewer */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Controls */}
          <div className="w-[430px] border-r border-graphite-800 bg-graphite-900/40 p-5 flex flex-col justify-between overflow-y-auto shrink-0">
            {dashboardMode === "image" ? (
              /* =================== IMAGE TO 3D MODE =================== */
              <div className="space-y-6">
                {/* Upload Card */}
                <div>
                  <label className="block text-xs font-mono font-medium text-graphite-300 mb-2 uppercase tracking-wide">
                    Input Image
                  </label>

                  {!imageMeta ? (
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                        isDragging
                          ? "border-forge bg-forge/5"
                          : "border-graphite-750 hover:border-graphite-600 bg-graphite-900/60"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileSelection(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="w-10 h-10 rounded-full bg-graphite-800 flex items-center justify-center text-graphite-400 mb-3 border border-graphite-700">
                        <UploadCloud className="w-5 h-5 text-forge" />
                      </div>
                      <p className="text-xs font-medium text-graphite-200 mb-1">
                        Drag and drop your image here
                      </p>
                      <p className="text-[11px] font-mono text-graphite-400 mb-3">
                        PNG, JPG, JPEG, or WEBP (up to 25MB)
                      </p>
                      <button
                        type="button"
                        className="px-3 py-1.5 bg-graphite-800 hover:bg-graphite-750 text-graphite-200 rounded border border-graphite-700 text-xs font-mono transition-colors"
                      >
                        Browse files
                      </button>
                    </div>
                  ) : (
                    <div className="bg-graphite-850 border border-graphite-750 rounded-lg p-3 space-y-3">
                      <div className="relative aspect-square w-full rounded overflow-hidden bg-graphite-950 border border-graphite-800 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageMeta.previewUrl}
                          alt="Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>

                      <div className="space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-graphite-300">
                          <span className="text-graphite-500">File:</span>
                          <span className="truncate max-w-[220px] font-medium text-graphite-200">
                            {imageMeta.name}
                          </span>
                        </div>
                        <div className="flex justify-between text-graphite-300">
                          <span className="text-graphite-500">Dimensions:</span>
                          <span>{imageMeta.width} × {imageMeta.height} px</span>
                        </div>
                        <div className="flex justify-between text-graphite-300">
                          <span className="text-graphite-500">Size:</span>
                          <span>{(imageMeta.size / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-1.5 bg-graphite-800 hover:bg-graphite-750 border border-graphite-700 text-graphite-300 hover:text-white rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Replace Image</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileSelection(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Generation Controls */}
                <div className="space-y-3">
                  <label className="block text-xs font-mono font-medium text-graphite-300 uppercase tracking-wide">
                    Mesh Quality
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Draft", "Standard", "High"] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setQuality(q)}
                        className={`py-2 px-3 rounded text-xs font-mono border text-center transition-colors ${
                          quality === q
                            ? "bg-forge/15 border-forge text-forge font-semibold"
                            : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-graphite-200 hover:border-graphite-600"
                        }`}
                      >
                        <div>{q}</div>
                        <div className="text-[10px] text-graphite-500">
                          {q === "Draft" ? "160 res" : q === "Standard" ? "256 res" : "320 res"}
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] font-mono text-graphite-500">
                    Standard (256 resolution) produces balanced geometric detail.
                  </p>
                </div>

                {/* Error Display */}
                {errorMessage && (
                  <div className="p-3 bg-red-950/60 border border-red-700/50 rounded text-red-200 text-xs font-mono flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Progress Display */}
                {isGenerating && (
                  <div className="p-3 bg-graphite-850 border border-graphite-750 rounded space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-graphite-300 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 text-forge animate-spin" />
                        <span>{statusMessage}</span>
                      </span>
                      <span className="text-forge font-semibold">{progress}%</span>
                    </div>
                    <div className="w-full bg-graphite-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-forge h-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Scale to Real Size Tool */}
                {generationResult && (
                  <div className="p-3 bg-graphite-900 border border-graphite-750 rounded space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-forge">
                        <Ruler className="w-3.5 h-3.5" />
                        <span>Scale to Real Size</span>
                      </div>
                      {scaledResult && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-forge/15 text-forge border border-forge/30">
                          {scaledResult.scaleFactor}x
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] font-mono text-graphite-400">
                      Pick an axis and specify measured real-world millimeters:
                    </p>

                    {/* Axis Selector */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-graphite-500">
                        Target Axis
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["x", "y", "z"] as const).map((ax) => (
                          <button
                            key={ax}
                            type="button"
                            onClick={() => setScaleAxis(ax)}
                            className={`py-1.5 text-xs font-mono rounded border transition-colors ${
                              scaleAxis === ax
                                ? "bg-forge/15 border-forge text-forge font-semibold"
                                : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-white"
                            }`}
                          >
                            {ax.toUpperCase()} Axis
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Length Input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-graphite-500">
                        Measured Length (mm)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          max="1000"
                          value={targetLength}
                          onChange={(e) => setTargetLength(e.target.value)}
                          placeholder="75.0"
                          className="flex-1 bg-graphite-950 border border-graphite-750 focus:border-forge rounded px-2.5 py-1.5 text-xs font-mono text-white outline-none"
                        />
                        <span className="text-xs font-mono text-graphite-500">mm</span>
                      </div>
                    </div>

                    {/* Scale Error */}
                    {scaleError && (
                      <div className="p-2 bg-red-950/60 border border-red-800 rounded text-red-300 text-[11px] font-mono">
                        {scaleError}
                      </div>
                    )}

                    {/* Scale Action Button */}
                    <button
                      type="button"
                      disabled={isScaling || !targetLength}
                      onClick={handleScaleModel}
                      className="w-full py-2 bg-graphite-800 hover:bg-graphite-750 disabled:opacity-50 text-forge border border-forge/40 hover:border-forge rounded text-xs font-mono font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      {isScaling ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Scaling Geometry...</span>
                        </>
                      ) : (
                        <>
                          <Ruler className="w-3.5 h-3.5 text-forge" />
                          <span>Apply Real Size</span>
                        </>
                      )}
                    </button>

                    {/* Scaled Output Summary & Warning */}
                    {scaledResult && (
                      <div className="pt-2 border-t border-graphite-800 space-y-2">
                        <div className="text-[11px] font-mono text-graphite-300 space-y-0.5">
                          <div className="text-graphite-500 text-[10px] uppercase">New Dimensions:</div>
                          <div className="font-semibold text-forge">
                            {scaledResult.dimensions.length} × {scaledResult.dimensions.width} × {scaledResult.dimensions.height} mm
                          </div>
                        </div>

                        {/* Required Disclaimer Warning */}
                        <div className="p-2.5 bg-amber-950/40 border border-amber-700/60 rounded flex items-start gap-2 text-amber-300 text-[11px] font-mono leading-tight">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{scaledResult.warning}</span>
                        </div>

                        {/* Download Scaled Model Button */}
                        <button
                          type="button"
                          onClick={handleDownloadScaled}
                          className="w-full py-2 bg-graphite-850 hover:bg-graphite-800 text-graphite-200 hover:text-white border border-graphite-700 rounded text-xs font-mono flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-forge" />
                          <span>Download Scaled GLB</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* =================== IMPORT SCAN MODE =================== */
              <div className="space-y-5">
                {/* Scan Dropzone / Info Card */}
                <div>
                  <label className="block text-xs font-mono font-medium text-graphite-300 mb-2 uppercase tracking-wide">
                    3D Scan File (.glb, .gltf, .obj, .stl)
                  </label>

                  {!importedScan ? (
                    <div
                      onDrop={handleScanDrop}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsScanDragging(true);
                      }}
                      onDragLeave={() => setIsScanDragging(false)}
                      onClick={() => scanFileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                        isScanDragging
                          ? "border-forge bg-forge/5"
                          : "border-graphite-750 hover:border-graphite-600 bg-graphite-900/60"
                      }`}
                    >
                      <input
                        ref={scanFileInputRef}
                        type="file"
                        accept=".glb,.gltf,.obj,.stl"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleScanSelection(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="w-10 h-10 rounded-full bg-graphite-800 flex items-center justify-center text-graphite-400 mb-3 border border-graphite-700">
                        {isUploadingScan ? (
                          <Loader2 className="w-5 h-5 text-forge animate-spin" />
                        ) : (
                          <UploadCloud className="w-5 h-5 text-forge" />
                        )}
                      </div>
                      <p className="text-xs font-medium text-graphite-200 mb-1">
                        {isUploadingScan ? "Importing & parsing scan..." : "Drag and drop your 3D scan here"}
                      </p>
                      <p className="text-[11px] font-mono text-graphite-400 mb-3">
                        GLB, GLTF, OBJ, or STL (up to 100MB)
                      </p>
                      <button
                        type="button"
                        disabled={isUploadingScan}
                        className="px-3 py-1.5 bg-graphite-800 hover:bg-graphite-750 text-graphite-200 rounded border border-graphite-700 text-xs font-mono transition-colors disabled:opacity-50"
                      >
                        Browse scan files
                      </button>
                    </div>
                  ) : (
                    /* Imported Scan Details Card */
                    <div className="bg-graphite-850 border border-graphite-750 rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate max-w-[240px]">
                          <Box className="w-4 h-4 text-forge shrink-0" />
                          <span className="text-xs font-mono font-medium text-graphite-200 truncate">
                            {importedScan.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-graphite-400">
                          {(importedScan.file_size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>

                      {/* Geometric Stats Table */}
                      <div className="bg-graphite-900 border border-graphite-800 rounded p-2.5 grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-graphite-500 uppercase">Vertices</div>
                          <div className="font-semibold text-graphite-200">
                            {importedScan.stats.vertices.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-graphite-500 uppercase">Triangles</div>
                          <div className="font-semibold text-forge">
                            {importedScan.stats.triangles.toLocaleString()}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-[10px] text-graphite-500 uppercase">Bounding Box (X × Y × Z)</div>
                          <div className="font-mono text-graphite-300 text-[11px]">
                            {importedScan.stats.bounding_box[0]} × {importedScan.stats.bounding_box[1]} × {importedScan.stats.bounding_box[2]} mm
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-graphite-500 uppercase">Watertight</div>
                          <div>
                            {importedScan.stats.watertight ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800">
                                Sealed
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-400 border border-amber-800">
                                Open Mesh
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-graphite-500 uppercase">Components</div>
                          <div className="font-semibold text-graphite-200">
                            {importedScan.stats.loose_components} {importedScan.stats.loose_components === 1 ? "piece" : "pieces"}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => scanFileInputRef.current?.click()}
                        className="w-full py-1.5 bg-graphite-800 hover:bg-graphite-750 border border-graphite-700 text-graphite-300 hover:text-white rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Upload Different Scan</span>
                      </button>
                      <input
                        ref={scanFileInputRef}
                        type="file"
                        accept=".glb,.gltf,.obj,.stl"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleScanSelection(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Error Banner */}
                {scanError && (
                  <div className="p-3 bg-red-950/60 border border-red-700/50 rounded text-red-200 text-xs font-mono flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{scanError}</span>
                  </div>
                )}

                {/* Units Detection Prompt */}
                {importedScan && importedScan.units_suspected !== "millimeters" && !unitsConfirmed && (
                  <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                      <Ruler className="w-4 h-4 text-amber-400" />
                      <span>
                        {importedScan.units_suspected === "meters"
                          ? "Suspected Meters — Scale to mm?"
                          : "Suspected Micrometers — Scale to mm?"}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      {importedScan.unit_hint ||
                        `Real scans often lack unit metadata. Model extent is ${importedScan.stats.bounding_box[0]} mm.`}
                    </p>
                    <button
                      type="button"
                      disabled={isScalingScan}
                      onClick={handleConfirmUnitsScale}
                      className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-graphite-950 font-semibold rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {isScalingScan ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>
                        Convert Units to Millimeters ({importedScan.suggested_scale_factor}x)
                      </span>
                    </button>
                  </div>
                )}

                {/* Required Scans Disclaimer Warning */}
                {importedScan && (
                  <div className="p-3 bg-amber-950/30 border border-amber-700/50 rounded flex items-start gap-2.5 text-amber-300 text-xs font-mono leading-relaxed">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Scans are surface models. Use CAD mode for parts with exact holes and mating surfaces.
                    </span>
                  </div>
                )}

                {/* Cleanup Tools Panel */}
                {importedScan && (
                  <div className="p-3.5 bg-graphite-850 border border-graphite-750 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono font-medium text-forge uppercase tracking-wide">
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Mesh Cleanup Tools</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-graphite-800 text-graphite-400 border border-graphite-700">
                        Safe Copy
                      </span>
                    </div>

                    {/* 1. Remove Small Floating Components */}
                    <div className="space-y-1.5 pt-1 border-t border-graphite-800">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-mono text-graphite-200 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={removeFloating}
                            onChange={(e) => setRemoveFloating(e.target.checked)}
                            className="rounded border-graphite-700 text-forge focus:ring-0 bg-graphite-900"
                          />
                          <span>Remove Small Floating Fragments</span>
                        </span>
                        <span className="text-[10px] font-mono text-graphite-400">
                          {floatingThreshold}% size threshold
                        </span>
                      </label>
                      {removeFloating && (
                        <div className="pl-6 space-y-1">
                          <input
                            type="range"
                            min="0.5"
                            max="25"
                            step="0.5"
                            value={floatingThreshold}
                            onChange={(e) => setFloatingThreshold(parseFloat(e.target.value))}
                            className="w-full accent-forge h-1 bg-graphite-800 rounded cursor-pointer"
                          />
                          <p className="text-[10px] font-mono text-graphite-500">
                            Discards disconnected components with &lt;{floatingThreshold}% of primary mesh faces.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 2. Fill Holes */}
                    <div className="pt-2 border-t border-graphite-800">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-mono text-graphite-200 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={fillHoles}
                            onChange={(e) => setFillHoles(e.target.checked)}
                            className="rounded border-graphite-700 text-forge focus:ring-0 bg-graphite-900"
                          />
                          <span>Fill Small Holes</span>
                        </span>
                        <span className="text-[10px] font-mono text-graphite-500">Auto-cap boundary</span>
                      </label>
                    </div>

                    {/* 3. Center and Ground */}
                    <div className="pt-2 border-t border-graphite-800">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-mono text-graphite-200 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={centerAndGround}
                            onChange={(e) => setCenterAndGround(e.target.checked)}
                            className="rounded border-graphite-700 text-forge focus:ring-0 bg-graphite-900"
                          />
                          <span>Center & Ground (Z=0)</span>
                        </span>
                        <span className="text-[10px] font-mono text-graphite-500">Base on print bed</span>
                      </label>
                    </div>

                    {/* 4. Decimate Mesh */}
                    <div className="space-y-2 pt-2 border-t border-graphite-800">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={decimate}
                            onChange={(e) => setDecimate(e.target.checked)}
                            className="rounded border-graphite-700 text-forge focus:ring-0 bg-graphite-900"
                          />
                          <span className="text-xs font-mono text-graphite-200">Decimate Triangles</span>
                        </label>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-forge/10 text-forge border border-forge/30">
                          fast_simplification
                        </span>
                      </div>

                      {decimate && (
                        <div className="pl-6 space-y-2">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-graphite-400">Target Triangles:</span>
                            <input
                              type="number"
                              min="100"
                              max={importedScan.stats.triangles}
                              step="500"
                              value={targetTriangles}
                              onChange={(e) => setTargetTriangles(Math.max(100, parseInt(e.target.value) || 100))}
                              className="w-28 bg-graphite-950 border border-graphite-750 focus:border-forge rounded px-2 py-0.5 text-xs font-mono text-white text-right outline-none"
                            />
                          </div>
                          <input
                            type="range"
                            min="200"
                            max={importedScan.stats.triangles}
                            step="200"
                            value={targetTriangles}
                            onChange={(e) => setTargetTriangles(parseInt(e.target.value))}
                            className="w-full accent-forge h-1 bg-graphite-800 rounded cursor-pointer"
                          />
                          <div className="text-[11px] font-mono text-forge font-medium flex justify-between">
                            <span>Target: {targetTriangles.toLocaleString()} tris</span>
                            <span>
                              {Math.max(0, Math.round((1 - targetTriangles / importedScan.stats.triangles) * 100))}% reduction
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Apply Cleanup Button */}
                    <button
                      type="button"
                      disabled={isCleaningScan}
                      onClick={handleApplyCleanup}
                      className="w-full py-2.5 bg-forge hover:bg-forge-hover disabled:bg-graphite-800 disabled:text-graphite-600 text-graphite-950 font-semibold rounded text-xs font-mono transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isCleaningScan ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Cleaning Mesh (fast_simplification)...</span>
                        </>
                      ) : (
                        <>
                          <Scissors className="w-4 h-4" />
                          <span>Apply Cleanup</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Cleaned Result Summary & Export */}
                {cleanedScan && (
                  <div className="p-3 bg-graphite-850 border border-emerald-800/60 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Mesh Cleaned Successfully</span>
                      </span>
                      <span className="text-[10px] font-mono text-graphite-400">
                        {(cleanedScan.file_size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>

                    <div className="bg-graphite-900 border border-graphite-800 rounded p-2 text-xs font-mono space-y-1">
                      <div className="flex justify-between text-graphite-400">
                        <span>Original Triangles:</span>
                        <span>{cleanedScan.before_stats.triangles.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-emerald-300 font-semibold">
                        <span>Cleaned Triangles:</span>
                        <span>{cleanedScan.after_stats.triangles.toLocaleString()}</span>
                      </div>
                      {cleanedScan.changes.length > 0 && (
                        <div className="pt-1.5 mt-1 border-t border-graphite-800 space-y-0.5">
                          {cleanedScan.changes.map((ch, idx) => (
                            <div key={idx} className="text-[10px] text-graphite-400 flex items-center gap-1">
                              <span className="text-emerald-500 font-bold">•</span>
                              <span>{ch}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Download Buttons for Cleaned Formats */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-mono uppercase text-graphite-500">
                        Export Cleaned Mesh
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownloadFormat(cleanedScan.glb_url, `${importedScan?.name || "scan"}_cleaned.glb`)}
                          className="py-1.5 bg-graphite-800 hover:bg-graphite-750 text-forge border border-forge/30 hover:border-forge rounded text-xs font-mono font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>GLB</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadFormat(cleanedScan.stl_url, `${importedScan?.name || "scan"}_cleaned.stl`)}
                          className="py-1.5 bg-graphite-800 hover:bg-graphite-750 text-graphite-200 hover:text-white border border-graphite-700 rounded text-xs font-mono flex items-center justify-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>STL</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadFormat(cleanedScan.obj_url, `${importedScan?.name || "scan"}_cleaned.obj`)}
                          className="py-1.5 bg-graphite-800 hover:bg-graphite-750 text-graphite-200 hover:text-white border border-graphite-700 rounded text-xs font-mono flex items-center justify-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>OBJ</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scale to Real Size Tool (for Scan) */}
                {importedScan && (
                  <div className="p-3 bg-graphite-850 border border-graphite-750 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-forge">
                        <Ruler className="w-3.5 h-3.5" />
                        <span>Scale to Real Size</span>
                      </div>
                      {scaledScanResult && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-forge/15 text-forge border border-forge/30">
                          {scaledScanResult.scaleFactor}x
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] font-mono text-graphite-400">
                      Pick axis and enter caliper-measured length in millimeters:
                    </p>

                    <div className="space-y-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["x", "y", "z"] as const).map((ax) => (
                          <button
                            key={ax}
                            type="button"
                            onClick={() => setScanScaleAxis(ax)}
                            className={`py-1.5 text-xs font-mono rounded border transition-colors ${
                              scanScaleAxis === ax
                                ? "bg-forge/15 border-forge text-forge font-semibold"
                                : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-white"
                            }`}
                          >
                            {ax.toUpperCase()} Axis
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="2000"
                        value={scanTargetLength}
                        onChange={(e) => setScanTargetLength(e.target.value)}
                        placeholder="50.0"
                        className="flex-1 bg-graphite-950 border border-graphite-750 focus:border-forge rounded px-2.5 py-1.5 text-xs font-mono text-white outline-none"
                      />
                      <span className="text-xs font-mono text-graphite-500">mm</span>
                      <button
                        type="button"
                        disabled={isScalingScan || !scanTargetLength}
                        onClick={handleScaleScanByAxis}
                        className="px-3 py-1.5 bg-graphite-800 hover:bg-graphite-750 text-forge border border-forge/40 hover:border-forge rounded text-xs font-mono font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isScalingScan ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Ruler className="w-3.5 h-3.5" />
                        )}
                        <span>Scale</span>
                      </button>
                    </div>

                    {scaledScanResult && (
                      <div className="p-2 bg-graphite-900 border border-graphite-800 rounded text-[11px] font-mono space-y-1">
                        <div className="text-graphite-400">Scaled Dimensions:</div>
                        <div className="text-forge font-semibold">
                          {scaledScanResult.dimensions.length} × {scaledScanResult.dimensions.width} × {scaledScanResult.dimensions.height} mm
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions for Image Mode */}
            {dashboardMode === "image" && (
              <div className="pt-4 border-t border-graphite-800">
                <button
                  type="button"
                  disabled={!imageMeta || isGenerating}
                  onClick={startGeneration}
                  className="w-full h-10 bg-forge hover:bg-forge-hover disabled:bg-graphite-800 disabled:text-graphite-600 text-graphite-950 font-medium rounded text-xs font-mono transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-graphite-900" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <Box className="w-4 h-4" />
                      <span>Generate 3D Model</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right Panel: 3D Viewport Workspace */}
          <div className="flex-1 h-full bg-graphite-950 flex flex-col relative overflow-hidden">
            {dashboardMode === "image" ? (
              /* Image -> 3D Viewport */
              generationResult ? (
                <div className="relative w-full h-full flex flex-col">
                  {scaledResult && (
                    <div className="absolute top-12 left-4 z-20 flex items-center gap-1 bg-graphite-900/90 border border-graphite-750 rounded p-1 text-xs font-mono shadow-md">
                      <button
                        type="button"
                        onClick={() => setActiveModelView("original")}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          activeModelView === "original"
                            ? "bg-graphite-800 text-white font-medium"
                            : "text-graphite-400 hover:text-white"
                        }`}
                      >
                        Original
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveModelView("scaled")}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          activeModelView === "scaled"
                            ? "bg-forge text-graphite-950 font-semibold"
                            : "text-graphite-400 hover:text-white"
                        }`}
                      >
                        Scaled ({scaledResult.targetLengthMm}mm)
                      </button>
                    </div>
                  )}
                  <ModelViewer
                    glbUrl={activeModelView === "scaled" && scaledResult ? scaledResult.glbUrl : generationResult.glbUrl}
                    modelName={
                      activeModelView === "scaled" && scaledResult
                        ? `${imageMeta?.name.replace(/\.[^/.]+$/, "")}_scaled.glb`
                        : `${imageMeta?.name.replace(/\.[^/.]+$/, "")}.glb`
                    }
                    generationTime={generationResult.generationTime}
                    fileSize={generationResult.fileSize}
                    vertexCount={generationResult.vertexCount}
                    faceCount={generationResult.faceCount}
                    onDownload={activeModelView === "scaled" ? handleDownloadScaled : handleDownload}
                  />
                </div>
              ) : isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-lg bg-graphite-900 border border-graphite-800 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-forge animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-mono text-sm text-graphite-200 font-medium">
                      Synthesizing 3D Geometry
                    </h3>
                    <p className="font-mono text-xs text-graphite-500 max-w-sm">
                      {statusMessage || "Reconstructing 3D geometry from image..."}
                    </p>
                  </div>
                  <div className="text-[11px] font-mono text-graphite-500 bg-graphite-900 px-3 py-1.5 rounded border border-graphite-800">
                    Progress: {progress}%
                  </div>
                </div>
              ) : (
                /* Empty State (Image Mode) */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 select-none">
                  <div className="w-16 h-16 rounded-xl bg-graphite-900 border border-graphite-800 flex items-center justify-center text-graphite-600">
                    <Box className="w-8 h-8 text-graphite-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-mono text-sm font-semibold text-graphite-300">
                      3D Viewport Ready
                    </h3>
                    <p className="font-mono text-xs text-graphite-500 max-w-sm">
                      Upload an image and click <span className="text-graphite-300 font-medium">Generate 3D Model</span> to create and inspect an interactive 3D model.
                    </p>
                  </div>
                </div>
              )
            ) : (
              /* =================== SCAN 3D VIEWPORT =================== */
              importedScan ? (
                <div className="relative w-full h-full flex flex-col">
                  {/* Before / After / Scaled Toggle Bar */}
                  <div className="absolute top-12 left-4 z-20 flex items-center gap-1 bg-graphite-900/90 border border-graphite-750 rounded p-1 text-xs font-mono shadow-md backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => setScanViewerMode("before")}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        scanViewerMode === "before"
                          ? "bg-graphite-800 text-white font-medium border border-graphite-700"
                          : "text-graphite-400 hover:text-white"
                      }`}
                    >
                      Original ({importedScan.stats.triangles.toLocaleString()} tris)
                    </button>
                    <button
                      type="button"
                      disabled={!cleanedScan}
                      onClick={() => setScanViewerMode("after")}
                      className={`px-2.5 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        scanViewerMode === "after"
                          ? "bg-forge text-graphite-950 font-semibold"
                          : "text-graphite-400 hover:text-white"
                      }`}
                    >
                      Cleaned ({cleanedScan ? `${cleanedScan.after_stats.triangles.toLocaleString()} tris` : "Not cleaned"})
                    </button>
                    {scaledScanResult && (
                      <button
                        type="button"
                        onClick={() => setScanViewerMode("scaled")}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          scanViewerMode === "scaled"
                            ? "bg-amber-500 text-graphite-950 font-semibold"
                            : "text-graphite-400 hover:text-white"
                        }`}
                      >
                        Scaled ({scaledScanResult.targetLengthMm}mm)
                      </button>
                    )}
                  </div>

                  {/* Render ModelViewer */}
                  <ModelViewer
                    glbUrl={
                      scanViewerMode === "scaled" && scaledScanResult
                        ? scaledScanResult.glbUrl
                        : scanViewerMode === "after" && cleanedScan
                        ? cleanedScan.glb_url
                        : importedScan.glb_url
                    }
                    modelName={
                      scanViewerMode === "scaled" && scaledScanResult
                        ? `${importedScan.name.replace(/\.[^/.]+$/, "")}_scaled.glb`
                        : scanViewerMode === "after" && cleanedScan
                        ? `${importedScan.name.replace(/\.[^/.]+$/, "")}_cleaned.glb`
                        : importedScan.name
                    }
                    fileSize={
                      scanViewerMode === "after" && cleanedScan
                        ? cleanedScan.file_size
                        : importedScan.file_size
                    }
                    vertexCount={
                      scanViewerMode === "after" && cleanedScan
                        ? cleanedScan.after_stats.vertices
                        : importedScan.stats.vertices
                    }
                    faceCount={
                      scanViewerMode === "after" && cleanedScan
                        ? cleanedScan.after_stats.triangles
                        : importedScan.stats.triangles
                    }
                    onDownload={() => {
                      if (scanViewerMode === "after" && cleanedScan) {
                        handleDownloadFormat(cleanedScan.glb_url, `${importedScan.name.replace(/\.[^/.]+$/, "")}_cleaned.glb`);
                      } else if (scanViewerMode === "scaled" && scaledScanResult) {
                        handleDownloadFormat(scaledScanResult.glbUrl, `${importedScan.name.replace(/\.[^/.]+$/, "")}_scaled.glb`);
                      } else {
                        handleDownloadFormat(importedScan.download_url, importedScan.name);
                      }
                    }}
                  />
                </div>
              ) : (
                /* Empty State (Scan Mode) */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 select-none">
                  <div className="w-16 h-16 rounded-xl bg-graphite-900 border border-graphite-800 flex items-center justify-center text-graphite-600">
                    <Layers className="w-8 h-8 text-graphite-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-mono text-sm font-semibold text-graphite-300">
                      Scan Viewport Ready
                    </h3>
                    <p className="font-mono text-xs text-graphite-500 max-w-sm">
                      Upload a 3D scan (<span className="text-graphite-300">.glb, .gltf, .obj, .stl</span>) to inspect, clean, decimate, and scale geometry.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono text-graphite-500">
                    <span>● Fast Simplification</span>
                    <span>·</span>
                    <span>● Hole Repair</span>
                    <span>·</span>
                    <span>● Up to 100MB</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

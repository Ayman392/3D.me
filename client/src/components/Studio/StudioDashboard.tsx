"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/utils/supabase/client";
import FitTestModal from "@/components/cad/FitTestModal";
import CadSettingsModal from "@/components/cad/CadSettingsModal";
import { StudioToolRail, type StudioToolId } from "./StudioToolRail";
import {
  GeneratorPanel,
  type GenerationMode,
  type QualityTier,
} from "./GeneratorPanel";
import { ViewportStage } from "./ViewportStage";
import {
  AssetsPropertyDrawer,
  type DrawerTab,
  type StudioAsset,
} from "./AssetsPropertyDrawer";

export interface ActiveModelState {
  id?: string;
  name: string;
  glbUrl: string;
  generationTime?: number;
  fileSize?: number;
  vertexCount?: number;
  faceCount?: number;
}

interface GenerationRow {
  id: string | number;
  prompt: string | null;
  status: string | null;
  glb_path: string | null;
  vertex_count: number | null;
  face_count: number | null;
  created_at: string | null;
}

export function StudioDashboard() {
  const { user, isConfigured, signOut } = useAuth();
  const [activeTool, setActiveTool] = useState<StudioToolId>("model");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("assets");
  const [bannerVisible, setBannerVisible] = useState(true);

  const [generationMode, setGenerationMode] = useState<GenerationMode>("hd");
  const [quality, setQuality] = useState<QualityTier>("Standard");
  const [prompt, setPrompt] = useState("");
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(
    null,
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [generateInParts, setGenerateInParts] = useState(false);
  const [highResTexture, setHighResTexture] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [aiModel, setAiModel] = useState("3DMe-v3.1-Pro");

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<ActiveModelState | null>(null);
  const [seeInside, setSeeInside] = useState(false);
  const [scaleAxis, setScaleAxis] = useState<"x" | "y" | "z">("x");
  const [targetLength, setTargetLength] = useState("75.0");

  const [cadSettingsOpen, setCadSettingsOpen] = useState(false);
  const [fitTestOpen, setFitTestOpen] = useState(false);

  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const loadGenerations = useCallback(async () => {
    if (!isConfigured || !user) return;
    setLoadingAssets(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("generations")
        .select(
          "id, prompt, status, glb_path, vertex_count, face_count, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(24);

      if (!error && data) {
        const rows = data as GenerationRow[];
        const mapped: StudioAsset[] = rows.map((row: GenerationRow) => ({
          id: String(row.id),
          name: row.prompt || `Model ${String(row.id).slice(0, 6)}`,
          status: row.status || "ready",
          glbUrl: row.glb_path || undefined,
          vertexCount: row.vertex_count ?? undefined,
          faceCount: row.face_count ?? undefined,
          createdAt: row.created_at ?? undefined,
        }));
        setAssets(mapped);
      }
    } finally {
      setLoadingAssets(false);
    }
  }, [isConfigured, user]);

  useEffect(() => {
    void loadGenerations();
  }, [loadGenerations]);

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(uploadedPreviewUrl);
      }
    };
  }, [uploadedPreviewUrl]);

  useEffect(() => {
    return () => {
      if (activeModel?.glbUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(activeModel.glbUrl);
      }
    };
  }, [activeModel?.glbUrl]);

  const handleSelectTool = (tool: StudioToolId) => {
    setActiveTool(tool);
    if (tool === "cad") {
      setDrawerTab("property");
      setCadSettingsOpen(true);
    }
  };

  const handleFileUpload = (file: File) => {
    if (uploadedPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setUploadedPreviewUrl(objectUrl);
    setUploadedFileName(file.name);
    setStatusMessage(`Loaded reference: ${file.name}`);
  };

  const handleClearUpload = () => {
    if (uploadedPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    setUploadedPreviewUrl(null);
    setUploadedFileName(null);
  };

  const handleSelectAsset = (asset: StudioAsset) => {
    if (!asset.glbUrl) {
      setStatusMessage(`"${asset.name}" is in status: ${asset.status}`);
      return;
    }
    if (activeModel?.glbUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(activeModel.glbUrl);
    }
    setActiveModel({
      id: asset.id,
      name: asset.name,
      glbUrl: asset.glbUrl,
      vertexCount: asset.vertexCount,
      faceCount: asset.faceCount,
    });
    setStatusMessage(null);
  };

  const handleUploadModelFile = (file: File) => {
    if (activeModel?.glbUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(activeModel.glbUrl);
    }
    const url = URL.createObjectURL(file);
    setActiveModel({
      name: file.name.replace(/\.[^/.]+$/, ""),
      glbUrl: url,
      fileSize: file.size,
    });
    setStatusMessage(`Loaded 3D model: ${file.name}`);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatusMessage(
      `Preparing ${generationMode === "hd" ? "HD Model" : "Smart Mesh"} (${quality}) with ${aiModel}...`,
    );

    try {
      if (isConfigured && user) {
        const supabase = createClient();
        await supabase.from("generations").insert({
          user_id: user.id,
          prompt:
            prompt.trim() ||
            uploadedFileName ||
            `${generationMode.toUpperCase()} Studio Generation`,
          status: "queued",
        });
        await loadGenerations();
      }
      setStatusMessage(
        "Generation job queued. Select or upload a .GLB asset to inspect in the viewport.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const creditCost =
    (generationMode === "hd" ? 45 : 25) +
    (quality === "High" ? 15 : quality === "Standard" ? 10 : 0) +
    (highResTexture ? 15 : 0);

  return (
    <div className="flex h-screen w-screen select-none overflow-hidden bg-background text-foreground transition-colors">
      <StudioToolRail
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        userEmail={user?.email}
        onSignOut={signOut}
      />

      <main className="flex min-w-0 flex-1 gap-2 p-2">
        <GeneratorPanel
          activeTool={activeTool}
          generationMode={generationMode}
          onChangeGenerationMode={setGenerationMode}
          quality={quality}
          onChangeQuality={setQuality}
          prompt={prompt}
          onChangePrompt={setPrompt}
          uploadedPreviewUrl={uploadedPreviewUrl}
          uploadedFileName={uploadedFileName}
          onFileUpload={handleFileUpload}
          onClearUpload={handleClearUpload}
          generateInParts={generateInParts}
          onToggleGenerateInParts={setGenerateInParts}
          highResTexture={highResTexture}
          onToggleHighResTexture={setHighResTexture}
          isPrivate={isPrivate}
          onTogglePrivate={setIsPrivate}
          aiModel={aiModel}
          onChangeAiModel={setAiModel}
          creditCost={creditCost}
          isGenerating={isGenerating}
          onGenerate={() => {
            void handleGenerate();
          }}
          onOpenCadSettings={() => setCadSettingsOpen(true)}
          onOpenFitTest={() => setFitTestOpen(true)}
        />

        <ViewportStage
          bannerVisible={bannerVisible}
          onDismissBanner={() => setBannerVisible(false)}
          activeModel={activeModel}
          statusMessage={statusMessage}
          seeInside={seeInside}
          onToggleSeeInside={() => setSeeInside((prev) => !prev)}
          onResetViewport={() => {
            if (activeModel?.glbUrl?.startsWith("blob:")) {
              URL.revokeObjectURL(activeModel.glbUrl);
            }
            setActiveModel(null);
            setStatusMessage(null);
          }}
          onFocusGenerator={() => setActiveTool("model")}
        />

        <AssetsPropertyDrawer
          drawerTab={drawerTab}
          onChangeDrawerTab={setDrawerTab}
          assets={assets}
          loadingAssets={loadingAssets}
          selectedAssetId={activeModel?.id}
          onSelectAsset={handleSelectAsset}
          onUploadModelFile={handleUploadModelFile}
          activeModel={activeModel}
          scaleAxis={scaleAxis}
          onChangeScaleAxis={setScaleAxis}
          targetLength={targetLength}
          onChangeTargetLength={setTargetLength}
        />
      </main>

      <CadSettingsModal
        isOpen={cadSettingsOpen}
        onClose={() => setCadSettingsOpen(false)}
        onRefreshProfiles={() => {
          void loadGenerations();
        }}
      />

      <FitTestModal
        isOpen={fitTestOpen}
        onClose={() => setFitTestOpen(false)}
        projectName={activeModel?.name}
      />
    </div>
  );
}

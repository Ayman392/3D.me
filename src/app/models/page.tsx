"use client";

import React, { useEffect, useState } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import ModelViewer from "@/components/viewer/ModelViewer";
import { useAuth } from "@/context/AuthContext";
import { createClient, isSupabaseConfigured } from "@/utils/supabase/client";
import {
  FolderKanban,
  Box,
  Eye,
  Download,
  Trash2,
  Calendar,
  Layers,
  X,
  Plus,
} from "lucide-react";
import Link from "next/link";

interface ModelItem {
  id: string;
  name: string;
  source_image_preview?: string;
  glb_url?: string;
  file_size?: number;
  vertex_count?: number;
  face_count?: number;
  created_at: string;
}

export default function ModelsPage() {
  const { user } = useAuth();
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModel, setActiveModel] = useState<ModelItem | null>(null);

  useEffect(() => {
    async function fetchModels() {
      setLoading(true);
      const isSupabaseMode = process.env.NEXT_PUBLIC_STORAGE_MODE === "supabase";
      const localCache = JSON.parse(
        localStorage.getItem("3dme_history") || localStorage.getItem("meshforge_history") || "[]"
      );

      // Opt-in Supabase Mode
      if (isSupabaseMode && isSupabaseConfigured() && user) {
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("generations")
            .select("*")
            .eq("status", "completed")
            .order("created_at", { ascending: false });

          if (!error && data && data.length > 0) {
            const mapped = await Promise.all(
              data.map(async (row) => {
                let glbUrl = `/api/engine/outputs/${row.id}.glb`;
                if (row.model_path) {
                  const { data: signedData } = await supabase.storage
                    .from("models")
                    .createSignedUrl(`${user.id}/${row.id}.glb`, 3600);
                  if (signedData?.signedUrl) {
                    glbUrl = signedData.signedUrl;
                  }
                }
                return {
                  ...row,
                  glb_url: glbUrl,
                };
              })
            );
            setModels(mapped);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("Error fetching models from Supabase:", e);
        }
      }

      // Default: Local SQLite + ~/.3dme/models/ storage
      try {
        const res = await fetch("/api/engine/storage/models");
        if (res.ok) {
          const storedModels = await res.json();
          if (Array.isArray(storedModels) && storedModels.length > 0) {
            setModels(storedModels);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.debug("Local storage API note:", err);
      }

      // Fallback to local browser cache
      setModels(localCache.filter((i: any) => i.status === "completed"));
      setLoading(false);
    }

    fetchModels();
  }, [user]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this 3D model?")) return;

    const isSupabaseMode = process.env.NEXT_PUBLIC_STORAGE_MODE === "supabase";
    if (isSupabaseMode && isSupabaseConfigured() && user) {
      const supabase = createClient();
      await supabase.from("generations").delete().eq("id", id);
      await supabase.storage.from("models").remove([`${user.id}/${id}.glb`]);
    } else {
      try {
        await fetch(`/api/engine/storage/jobs/${id}`, { method: "DELETE" });
      } catch (err) {
        console.warn("Could not delete from local storage:", err);
      }
    }

    const updated = models.filter((m) => m.id !== id);
    setModels(updated);

    const existingHistory = JSON.parse(
      localStorage.getItem("3dme_history") || localStorage.getItem("meshforge_history") || "[]"
    );
    const filtered = existingHistory.filter((i: any) => i.id !== id);
    localStorage.setItem("3dme_history", JSON.stringify(filtered));
    localStorage.setItem("meshforge_history", JSON.stringify(filtered));
  };

  const handleDownload = (model: ModelItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = `/api/engine/download/${model.id}`;
    a.download = `${model.name}.glb`;
    a.click();
  };

  return (
    <div className="flex h-screen w-screen bg-graphite-950 text-graphite-100 overflow-hidden font-sans">
      <AppSidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-14 px-6 border-b border-graphite-800 flex items-center justify-between shrink-0 bg-graphite-900/50">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-sm font-semibold tracking-wide text-graphite-100">
              MODELS LIBRARY
            </h1>
            <span className="text-graphite-600">/</span>
            <span className="text-xs font-mono text-graphite-400">All Meshes</span>
          </div>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 bg-forge hover:bg-forge-hover text-graphite-950 font-semibold rounded text-xs font-mono transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New 3D Model</span>
          </Link>
        </header>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="text-center py-20 font-mono text-xs text-graphite-500">
              Loading models library...
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
              <div className="w-12 h-12 rounded-lg bg-graphite-900 border border-graphite-800 flex items-center justify-center text-graphite-600">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="font-mono text-xs font-semibold text-graphite-300">
                Library Empty
              </h3>
              <p className="font-mono text-[11px] text-graphite-500 max-w-sm mb-2">
                Generate your first 3D model from an image to populate your library.
              </p>
              <Link
                href="/dashboard"
                className="px-3 py-1.5 bg-graphite-800 hover:bg-graphite-750 border border-graphite-700 text-graphite-200 rounded text-xs font-mono transition-colors"
              >
                Create 3D Model
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {models.map((model) => (
                <div
                  key={model.id}
                  onClick={() => setActiveModel(model)}
                  className="bg-graphite-900 border border-graphite-800 hover:border-graphite-700 rounded-lg overflow-hidden flex flex-col group cursor-pointer transition-colors shadow-sm"
                >
                  {/* Preview image */}
                  <div className="aspect-video w-full bg-graphite-950 flex items-center justify-center relative overflow-hidden border-b border-graphite-800">
                    {model.source_image_preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={model.source_image_preview}
                        alt={model.name}
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <Box className="w-10 h-10 text-graphite-700" />
                    )}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-graphite-900/80 border border-graphite-750 text-graphite-300 backdrop-blur-sm">
                      GLB
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <h4 className="font-mono text-xs font-semibold text-graphite-100 truncate">
                        {model.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-graphite-500">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {new Date(model.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Stats & Actions */}
                    <div className="pt-2 border-t border-graphite-800 flex items-center justify-between text-xs font-mono">
                      <span className="text-[11px] text-graphite-400">
                        {model.file_size
                          ? `${(model.file_size / (1024 * 1024)).toFixed(1)} MB`
                          : "Ready"}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveModel(model);
                          }}
                          title="Open 3D Viewer"
                          className="p-1.5 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-300 rounded transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleDownload(model, e)}
                          title="Download GLB"
                          className="p-1.5 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-300 rounded transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleDelete(model.id, e)}
                          title="Delete Model"
                          className="p-1.5 bg-graphite-850 hover:bg-red-950/60 border border-graphite-750 hover:border-red-800 text-graphite-400 hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal 3D Viewer */}
        {activeModel && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="w-full max-w-5xl h-[80vh] bg-graphite-900 border border-graphite-750 rounded-lg flex flex-col overflow-hidden shadow-2xl">
              <div className="h-10 px-4 bg-graphite-850 border-b border-graphite-750 flex items-center justify-between">
                <span className="text-xs font-mono font-medium text-graphite-200">
                  {activeModel.name}.glb
                </span>
                <button
                  onClick={() => setActiveModel(null)}
                  className="p-1 text-graphite-400 hover:text-white rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 relative">
                <ModelViewer
                  glbUrl={activeModel.glb_url || `/api/engine/outputs/${activeModel.id}.glb`}
                  modelName={`${activeModel.name}.glb`}
                  fileSize={activeModel.file_size}
                  vertexCount={activeModel.vertex_count}
                  faceCount={activeModel.face_count}
                  onDownload={() => {
                    const a = document.createElement("a");
                    a.href = `/api/engine/download/${activeModel.id}`;
                    a.download = `${activeModel.name}.glb`;
                    a.click();
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import ModelViewer from "@/components/viewer/ModelViewer";
import { useAuth } from "@/context/AuthContext";
import { createClient, isSupabaseConfigured } from "@/utils/supabase/client";
import {
  History,
  Box,
  Eye,
  Calendar,
  Layers,
  Clock,
  HardDrive,
  X,
  ExternalLink,
  Cpu,
} from "lucide-react";

interface GenerationItem {
  id: string;
  name: string;
  source_type: string;
  source_image_preview?: string;
  model_path?: string;
  glb_url?: string;
  status: string;
  quality?: string;
  generation_time?: number;
  file_size?: number;
  vertex_count?: number;
  face_count?: number;
  created_at: string;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [generations, setGenerations] = useState<GenerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModel, setActiveModel] = useState<GenerationItem | null>(null);

  useEffect(() => {
    async function loadHistory() {
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
            .order("created_at", { ascending: false });

          if (!error && data && data.length > 0) {
            const resolved = await Promise.all(
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
            setGenerations(resolved);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("Could not load from Supabase:", e);
        }
      }

      // Default: Local SQLite jobs storage
      try {
        const res = await fetch("/api/engine/storage/jobs");
        if (res.ok) {
          const storedJobs = await res.json();
          if (Array.isArray(storedJobs) && storedJobs.length > 0) {
            setGenerations(storedJobs);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.debug("Local storage API note:", err);
      }

      setGenerations(localCache);
      setLoading(false);
    }

    loadHistory();
  }, [user]);

  return (
    <div className="flex h-screen w-screen bg-graphite-950 text-graphite-100 overflow-hidden font-sans">
      <AppSidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-14 px-6 border-b border-graphite-800 flex items-center justify-between shrink-0 bg-graphite-900/50">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-sm font-semibold tracking-wide text-graphite-100">
              GENERATION HISTORY
            </h1>
            <span className="text-graphite-600">/</span>
            <span className="text-xs font-mono text-graphite-400">Activity Log</span>
          </div>
          <div className="text-xs font-mono text-graphite-500">
            {generations.length} records
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="text-center py-20 font-mono text-xs text-graphite-500">
              Loading generation activity...
            </div>
          ) : generations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
              <div className="w-12 h-12 rounded-lg bg-graphite-900 border border-graphite-800 flex items-center justify-center text-graphite-600">
                <History className="w-6 h-6" />
              </div>
              <h3 className="font-mono text-xs font-semibold text-graphite-300">
                No Generations Found
              </h3>
              <p className="font-mono text-[11px] text-graphite-500 max-w-sm">
                Generated 3D meshes will appear here with processing logs, timestamps, and model statistics.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-mono font-semibold text-graphite-500 uppercase tracking-wider border-b border-graphite-800">
                <div className="col-span-1">Preview</div>
                <div className="col-span-4">Model Name</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Provider</div>
                <div className="col-span-1 text-right">Action</div>
              </div>

              {generations.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 items-center px-4 py-3 bg-graphite-900/40 hover:bg-graphite-850 border border-graphite-800/80 rounded transition-colors text-xs font-mono"
                >
                  {/* Thumbnail */}
                  <div className="col-span-1">
                    <div className="w-9 h-9 rounded bg-graphite-950 border border-graphite-800 flex items-center justify-center overflow-hidden">
                      {item.source_image_preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.source_image_preview}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Box className="w-4 h-4 text-graphite-600" />
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <div className="col-span-4 font-medium text-graphite-200 truncate pr-4">
                    {item.name}
                  </div>

                  {/* Date */}
                  <div className="col-span-2 text-graphite-400 text-[11px]">
                    {new Date(item.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  {/* Status */}
                  <div className="col-span-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-emerald-400 capitalize text-[11px]">
                      {item.status}
                    </span>
                  </div>

                  {/* Provider */}
                  <div className="col-span-2 text-graphite-400 text-[11px] flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-forge" />
                    <span>Neural 3D</span>
                  </div>

                  {/* Open button */}
                  <div className="col-span-1 text-right">
                    <button
                      onClick={() => setActiveModel(item)}
                      className="px-2.5 py-1 bg-graphite-800 hover:bg-forge hover:text-graphite-950 border border-graphite-700 text-graphite-300 rounded text-[11px] font-mono transition-all active:scale-[0.98]"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal 3D Viewer popup if open button is clicked */}
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
                  generationTime={activeModel.generation_time}
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

"use client";

import React, { useEffect, useState } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import { useAuth } from "@/context/AuthContext";
import { isSupabaseConfigured } from "@/utils/supabase/client";
import {
  Settings,
  Cpu,
  Database,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Box,
} from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [engineHealth, setEngineHealth] = useState<any>(null);
  const [loadingEngine, setLoadingEngine] = useState(false);

  const fetchEngine = async () => {
    setLoadingEngine(true);
    try {
      const res = await fetch("/api/engine/health");
      if (res.ok) {
        setEngineHealth(await res.json());
      } else {
        setEngineHealth({ status: "error" });
      }
    } catch {
      setEngineHealth({ status: "offline" });
    } finally {
      setLoadingEngine(false);
    }
  };

  useEffect(() => {
    fetchEngine();
  }, []);

  const supabaseConnected = isSupabaseConfigured();

  return (
    <div className="flex h-screen w-screen bg-graphite-950 text-graphite-100 overflow-hidden font-sans">
      <AppSidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-14 px-6 border-b border-graphite-800 flex items-center justify-between shrink-0 bg-graphite-900/50">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-sm font-semibold tracking-wide text-graphite-100">
              SYSTEM SETTINGS
            </h1>
            <span className="text-graphite-600">/</span>
            <span className="text-xs font-mono text-graphite-400">Diagnostics & Configuration</span>
          </div>
          <button
            onClick={fetchEngine}
            disabled={loadingEngine}
            className="px-2.5 py-1 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-300 rounded text-xs font-mono transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingEngine ? "animate-spin" : ""}`} />
            <span>Refresh Diagnostics</span>
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto max-w-4xl space-y-6">
          {/* Hardware & Local AI Engine Section */}
          <div className="bg-graphite-900 border border-graphite-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-graphite-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-forge" />
                <h3 className="font-mono text-xs font-semibold uppercase text-graphite-200">
                  Compute &amp; System Resources
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-graphite-850 border border-graphite-750 text-emerald-400">
                Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-1 bg-graphite-850 p-3 rounded border border-graphite-800">
                <span className="text-[10px] text-graphite-500 uppercase">Compute Environment</span>
                <p className="font-semibold text-graphite-200">Local Workstation</p>
              </div>

              <div className="space-y-1 bg-graphite-850 p-3 rounded border border-graphite-800">
                <span className="text-[10px] text-graphite-500 uppercase">Memory Allocation</span>
                <p className="font-semibold text-graphite-200">Unified Architecture</p>
              </div>

              <div className="space-y-1 bg-graphite-850 p-3 rounded border border-graphite-800">
                <span className="text-[10px] text-graphite-500 uppercase">Compute Backend</span>
                <p className="font-semibold text-emerald-400">
                  {engineHealth?.device ? engineHealth.device.toUpperCase() : "Metal / GPU"} Accelerated
                </p>
              </div>

              <div className="space-y-1 bg-graphite-850 p-3 rounded border border-graphite-800">
                <span className="text-[10px] text-graphite-500 uppercase">Engine Type</span>
                <p className="font-semibold text-graphite-200">Parametric CAD &amp; Neural 3D</p>
              </div>
            </div>
          </div>

          {/* Database & Storage Status */}
          <div className="bg-graphite-900 border border-graphite-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-graphite-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-forge" />
                <h3 className="font-mono text-xs font-semibold uppercase text-graphite-200">
                  Supabase Authentication & Storage
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  supabaseConnected
                    ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                    : "bg-graphite-850 border-graphite-750 text-graphite-400"
                }`}
              >
                {supabaseConnected ? "Connected" : "Development Mode"}
              </span>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between p-3 rounded bg-graphite-850 border border-graphite-800">
                <span className="text-graphite-400">NEXT_PUBLIC_SUPABASE_URL</span>
                <span className="text-graphite-300 font-mono text-[11px]">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL || "Using local development fallback"}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded bg-graphite-850 border border-graphite-800">
                <span className="text-graphite-400">Storage Bucket</span>
                <span className="text-graphite-300 font-mono text-[11px]">
                  models (Private, signed URLs)
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded bg-graphite-850 border border-graphite-800">
                <span className="text-graphite-400">Database Table</span>
                <span className="text-graphite-300 font-mono text-[11px]">
                  public.generations (Row-Level Security Enabled)
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

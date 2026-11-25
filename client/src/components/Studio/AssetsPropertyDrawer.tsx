"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  IconCloudUpload,
  IconStar,
  IconFilter,
  IconLayoutGrid,
  IconCube3dSphere,
  IconSparkles,
  IconInfoCircle,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { ActiveModelState } from "./StudioDashboard";

export type DrawerTab = "assets" | "property";

export interface StudioAsset {
  id: string;
  name: string;
  status: string;
  glbUrl?: string;
  vertexCount?: number;
  faceCount?: number;
  createdAt?: string;
}

interface AssetsPropertyDrawerProps {
  drawerTab: DrawerTab;
  onChangeDrawerTab: (tab: DrawerTab) => void;
  assets: StudioAsset[];
  loadingAssets: boolean;
  selectedAssetId?: string;
  onSelectAsset: (asset: StudioAsset) => void;
  onUploadModelFile: (file: File) => void;
  activeModel: ActiveModelState | null;
  scaleAxis: "x" | "y" | "z";
  onChangeScaleAxis: (axis: "x" | "y" | "z") => void;
  targetLength: string;
  onChangeTargetLength: (val: string) => void;
}

export function AssetsPropertyDrawer({
  drawerTab,
  onChangeDrawerTab,
  assets,
  loadingAssets,
  selectedAssetId,
  onSelectAsset,
  onUploadModelFile,
  activeModel,
  scaleAxis,
  onChangeScaleAxis,
  targetLength,
  onChangeTargetLength,
}: AssetsPropertyDrawerProps) {
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const [manageMode, setManageMode] = useState(false);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition-colors">
      {/* Top Tabs */}
      <div className="grid grid-cols-2 border-b border-border text-xs font-bold">
        <button
          type="button"
          onClick={() => onChangeDrawerTab("assets")}
          className={`border-b-2 py-2.5 text-center transition ${
            drawerTab === "assets"
              ? "border-[var(--brand,#ff6b2c)] text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Assets
        </button>
        <button
          type="button"
          onClick={() => onChangeDrawerTab("property")}
          className={`border-b-2 py-2.5 text-center transition ${
            drawerTab === "property"
              ? "border-[var(--brand,#ff6b2c)] text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Property
        </button>
      </div>

      {drawerTab === "assets" ? (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {/* Brand Studio Promo Card */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 p-2.5">
            <div>
              <p className="text-[11px] font-black tracking-wide text-foreground">
                3D.ME STUDIO PACK
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Export clean GLB, STL & CAD meshes
              </p>
            </div>
            <Button
              size="sm"
              className="h-6 rounded-full border-2 border-foreground bg-[var(--brand,#ff6b2c)] px-2.5 text-[10px] font-black text-white shadow-[0_2px_0_var(--foreground)] hover:bg-[var(--brand,#ff6b2c)]/90"
            >
              Pro
            </Button>
          </div>

          {/* Filter & Manage Toolbar */}
          <div className="flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                title="Grid View"
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.9 }}
                className="group inline-flex items-center justify-center rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-1 text-white shadow-[0_2px_0_var(--foreground)]"
              >
                <IconLayoutGrid size={13} stroke={2.1} />
              </motion.button>
              <motion.button
                type="button"
                title="Favorites"
                whileHover={{ scale: 1.12, rotate: -8, y: -1 }}
                whileTap={{ scale: 0.9 }}
                className="group inline-flex items-center justify-center rounded-xl border-2 border-foreground/75 bg-card p-1 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors hover:border-foreground hover:bg-[var(--brand,#ff6b2c)]/15"
              >
                <IconStar size={13} stroke={2.1} />
              </motion.button>
              <motion.button
                type="button"
                title="Filter Assets"
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.9 }}
                className="group inline-flex items-center justify-center rounded-xl border-2 border-foreground/75 bg-card p-1 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors hover:border-foreground hover:bg-[var(--brand,#ff6b2c)]/15"
              >
                <IconFilter size={13} stroke={2.1} />
              </motion.button>
            </div>

            <button
              type="button"
              onClick={() => setManageMode((prev) => !prev)}
              className="rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-[10px] font-bold text-secondary-foreground transition hover:border-foreground"
            >
              {manageMode ? "Done" : "Manage"}
            </button>
          </div>

          {/* 2-Column Asset Grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Upload 3D Model Tile */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => modelInputRef.current?.click()}
              className="group flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-foreground/60 bg-[var(--brand,#ff6b2c)]/[0.06] p-2 text-center transition hover:border-[var(--brand,#ff6b2c)] hover:bg-[var(--brand,#ff6b2c)]/12"
            >
              <input
                ref={modelInputRef}
                type="file"
                accept=".glb,.gltf,.obj,.stl,.fbx"
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadModelFile(file);
                }}
              />
              <motion.span
                whileHover={{ scale: 1.14, y: -2 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="mb-1.5 inline-flex items-center justify-center rounded-xl border-2 border-foreground/80 bg-card p-1.5 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:bg-[var(--brand,#ff6b2c)] group-hover:text-white"
              >
                <IconCloudUpload size={17} stroke={2.1} />
              </motion.span>
              <span className="text-[11px] font-bold text-foreground">
                Upload 3D Model
              </span>
              <span className="mt-0.5 text-[9px] leading-tight text-muted-foreground">
                OBJ, FBX, STL, GLB
              </span>
            </motion.button>

            {loadingAssets ? (
              <div className="flex aspect-square items-center justify-center rounded-xl border border-border bg-secondary/40 text-[11px] text-muted-foreground">
                Loading...
              </div>
            ) : (
              assets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                return (
                  <motion.button
                    key={asset.id}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onSelectAsset(asset)}
                    className={`group relative flex aspect-square flex-col justify-between rounded-xl border p-2 text-left transition ${
                      isSelected
                        ? "border-[var(--brand,#ff6b2c)] bg-[var(--brand,#ff6b2c)]/10"
                        : "border-border bg-secondary/40 hover:border-foreground/50 hover:bg-secondary/70"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                        {asset.status}
                      </span>
                      {manageMode && (
                        <IconInfoCircle
                          size={13}
                          stroke={2.1}
                          className="text-[var(--brand,#ff6b2c)]"
                        />
                      )}
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                      <motion.span
                        whileHover={{ scale: 1.15, rotate: 10 }}
                        animate={isSelected ? { scale: 1.08 } : { scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 22,
                        }}
                        className={`inline-flex items-center justify-center rounded-xl border-2 p-2 transition-colors ${
                          isSelected
                            ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                            : "border-foreground/75 bg-card text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
                        }`}
                      >
                        <IconCube3dSphere size={18} stroke={2.1} />
                      </motion.span>
                    </div>

                    <p className="truncate text-[11px] font-semibold text-foreground">
                      {asset.name}
                    </p>
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
          <div className="space-y-1.5 rounded-xl border border-border bg-secondary/40 p-3">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <motion.span
                animate={{ scale: [1, 1.08, 1] }}
                transition={{
                  repeat: Infinity,
                  duration: 2.4,
                  ease: "easeInOut",
                }}
                className="inline-flex items-center justify-center rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-1 text-white shadow-[0_2px_0_var(--foreground)]"
              >
                <IconSparkles size={14} stroke={2.1} />
              </motion.span>
              <span>Active Mesh Inspector</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {activeModel ? activeModel.name : "No model loaded in viewport"}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1.5 text-[11px]">
              <div className="rounded-lg bg-background/70 p-2">
                <span className="block text-[10px] text-muted-foreground">
                  Vertices
                </span>
                <span className="font-mono font-semibold">
                  {activeModel?.vertexCount?.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="rounded-lg bg-background/70 p-2">
                <span className="block text-[10px] text-muted-foreground">
                  Faces
                </span>
                <span className="font-mono font-semibold">
                  {activeModel?.faceCount?.toLocaleString() ?? "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-border bg-secondary/40 p-3">
            <p className="font-bold text-foreground">Dimension & Scale</p>
            <div className="grid grid-cols-3 gap-1">
              {(["x", "y", "z"] as const).map((axis) => (
                <button
                  key={axis}
                  type="button"
                  onClick={() => onChangeScaleAxis(axis)}
                  className={`rounded-lg py-1 text-[11px] font-bold uppercase transition ${
                    scaleAxis === axis
                      ? "bg-[var(--brand,#ff6b2c)] text-white"
                      : "bg-background/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {axis}
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Target Length (mm)
              </label>
              <input
                type="number"
                step="0.5"
                value={targetLength}
                onChange={(e) => onChangeTargetLength(e.target.value)}
                className="w-full rounded-lg border border-border bg-background/80 px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-[var(--brand,#ff6b2c)] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

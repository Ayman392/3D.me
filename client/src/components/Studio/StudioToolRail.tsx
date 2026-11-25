"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  IconPhotoSpark,
  IconCube3dSphere,
  IconLayersSubtract,
  IconGrid4x4,
  IconWand,
  IconBrush,
  IconRulerMeasure,
  IconHistory,
  IconSettings,
  IconLogout,
  IconSmartHome,
  type IconProps,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export type StudioToolId =
  | "image"
  | "model"
  | "segment"
  | "retopo"
  | "uv"
  | "texture"
  | "cad";

export interface StudioToolRailProps {
  activeTool: StudioToolId;
  onSelectTool: (tool: StudioToolId) => void;
  userEmail?: string | null;
  onSignOut?: () => Promise<void> | void;
}

const RAIL_ITEMS: Array<{
  id: StudioToolId;
  label: string;
  icon: React.ComponentType<IconProps>;
  badge?: string;
}> = [
  { id: "image", label: "Image", icon: IconPhotoSpark },
  { id: "model", label: "Model", icon: IconCube3dSphere },
  { id: "segment", label: "Segment", icon: IconLayersSubtract },
  { id: "retopo", label: "Retopo", icon: IconGrid4x4 },
  { id: "uv", label: "Smart UV", icon: IconWand },
  { id: "texture", label: "Texture", icon: IconBrush },
  { id: "cad", label: "CAD / Fit", icon: IconRulerMeasure, badge: "3D" },
];

export function StudioToolRail({
  activeTool,
  onSelectTool,
  userEmail,
  onSignOut,
}: StudioToolRailProps) {
  const handleSignOutClick = () => {
    if (!onSignOut) return;
    void Promise.resolve(onSignOut()).catch(() => {});
  };

  return (
    <aside
      aria-label="Studio Tool Rail"
      className="my-2 ml-2 flex h-[calc(100vh-1rem)] w-16 shrink-0 flex-col items-center justify-between rounded-2xl border border-sidebar-border bg-sidebar py-3 text-sidebar-foreground transition-colors"
    >
      <div className="flex w-full flex-col items-center gap-1.5 px-1.5">
        <Link
          href="/"
          title="3D.me Home"
          aria-label="3D.me Home"
          className="mb-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground bg-card text-[11px] font-black tracking-tight text-foreground shadow-[0_2px_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          <motion.span
            whileHover={{ scale: 1.12, rotate: -4 }}
            whileTap={{ scale: 0.92 }}
          >
            3d<span className="text-[var(--brand,#ff6b2c)]">.</span>
          </motion.span>
        </Link>

        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTool === item.id;

          return (
            <motion.button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTool(item.id)}
              whileHover="hover"
              whileTap={{ scale: 0.94 }}
              className={`group relative flex w-full flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] font-bold transition-colors ${
                isActive
                  ? "bg-[var(--brand,#ff6b2c)]/14 text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="active-tool-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[var(--brand,#ff6b2c)]"
                />
              )}

              {item.badge && (
                <span className="absolute top-0.5 right-0.5 rounded-full border border-foreground/80 bg-[var(--brand,#ff6b2c)] px-1 text-[7px] font-black leading-tight text-white">
                  {item.badge}
                </span>
              )}

              <motion.span
                variants={{
                  hover: {
                    scale: 1.14,
                    rotate:
                      item.id === "model" ? 12 : item.id === "uv" ? -10 : -5,
                    y: -1.5,
                  },
                }}
                animate={
                  isActive
                    ? { scale: 1.06, y: -1 }
                    : { scale: 1, rotate: 0, y: 0 }
                }
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className={`inline-flex items-center justify-center rounded-xl border-2 p-1 transition-colors ${
                  isActive
                    ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                    : "border-foreground/75 bg-card text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
                }`}
              >
                <Icon size={15} stroke={2.1} className="shrink-0" />
              </motion.span>

              <span className="max-w-full truncate leading-tight">
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex w-full flex-col items-center gap-1.5 border-t border-sidebar-border/60 px-1.5 pt-2.5">
        <ThemeToggle variant="icon" defaultTheme="dark" />

        <Link
          href="/"
          title="Home"
          aria-label="Home"
          className="group flex w-full flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <motion.span
            whileHover={{ scale: 1.14, y: -1.5 }}
            whileTap={{ scale: 0.92 }}
            className="inline-flex items-center justify-center rounded-xl border-2 border-foreground/75 bg-card p-1 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
          >
            <IconSmartHome size={14} stroke={2.1} className="shrink-0" />
          </motion.span>
          <span className="leading-tight">Home</span>
        </Link>

        <Link
          href="/history"
          title="History"
          aria-label="History"
          className="group flex w-full flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <motion.span
            whileHover={{ rotate: -25, scale: 1.14, y: -1.5 }}
            whileTap={{ scale: 0.92 }}
            className="inline-flex items-center justify-center rounded-xl border-2 border-foreground/75 bg-card p-1 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
          >
            <IconHistory size={14} stroke={2.1} className="shrink-0" />
          </motion.span>
          <span className="leading-tight">History</span>
        </Link>

        <Link
          href="/settings"
          title={userEmail ? `Settings (${userEmail})` : "Settings"}
          aria-label="Settings"
          className="group flex w-full flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <motion.span
            whileHover={{ rotate: 45, scale: 1.14, y: -1.5 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="inline-flex items-center justify-center rounded-xl border-2 border-foreground/75 bg-card p-1 text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition-colors group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
          >
            <IconSettings size={14} stroke={2.1} className="shrink-0" />
          </motion.span>
          <span className="leading-tight">App</span>
        </Link>

        {userEmail && onSignOut && (
          <motion.button
            type="button"
            onClick={handleSignOutClick}
            title="Sign Out"
            aria-label="Sign Out"
            whileHover={{ x: 2, scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-foreground/75 bg-card text-muted-foreground shadow-[0_2px_0_var(--foreground)] transition hover:border-destructive hover:bg-destructive/15 hover:text-destructive"
          >
            <IconLogout size={14} stroke={2.1} />
          </motion.button>
        )}
      </div>
    </aside>
  );
}

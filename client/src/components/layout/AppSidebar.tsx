"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Image as ImageIcon,
  Type,
  FolderKanban,
  History,
  Settings,
  LogOut,
  Layers,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge?: string;
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [engineStatus, setEngineStatus] = useState<
    "ready" | "offline" | "checking"
  >("checking");
  const [engineDevice, setEngineDevice] = useState<string>("mps");

  useEffect(() => {
    let isMounted = true;

    const checkEngine = async () => {
      try {
        const res = await fetch("/api/engine/health", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { device?: string };
          if (isMounted) {
            setEngineStatus("ready");
            setEngineDevice(data.device || "mps");
          }
        } else if (isMounted) {
          setEngineStatus("offline");
        }
      } catch {
        if (isMounted) setEngineStatus("offline");
      }
    };

    void checkEngine();
    const interval = setInterval(() => {
      void checkEngine();
    }, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const navLinks: { section: string; items: NavItem[] }[] = [
    {
      section: "CREATE",
      items: [
        {
          name: "Image → 3D",
          href: "/dashboard",
          icon: ImageIcon,
          active: pathname === "/dashboard",
        },
        {
          name: "CAD",
          href: "/cad",
          icon: Layers,
          active: pathname === "/cad",
        },
        {
          name: "Text → 3D",
          href: "/text-to-3d",
          icon: Type,
          active: pathname === "/text-to-3d",
        },
      ],
    },
    {
      section: "LIBRARY",
      items: [
        {
          name: "Models",
          href: "/models",
          icon: FolderKanban,
          active: pathname === "/models",
        },
        {
          name: "History",
          href: "/history",
          icon: History,
          active: pathname === "/history",
        },
      ],
    },
  ];

  const engineTitle =
    engineStatus === "ready"
      ? `Engine Ready (${engineDevice})`
      : `Engine ${engineStatus} (${engineDevice})`;

  return (
    <aside className="flex h-screen w-60 shrink-0 select-none flex-col justify-between border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-colors">
      <div>
        {/* Logo / Brand Header */}
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-sidebar-primary/30 bg-sidebar-primary/15">
              <Box className="h-3.5 w-3.5 text-sidebar-primary" />
            </div>
            <span className="font-mono text-xs font-semibold tracking-wide text-foreground">
              3d.me
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                engineStatus === "ready"
                  ? "bg-emerald-500"
                  : engineStatus === "checking"
                    ? "bg-amber-500"
                    : "bg-destructive"
              }`}
              title={engineTitle}
              aria-label={engineTitle}
            />
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="space-y-6 px-2 py-4">
          {navLinks.map((section) => (
            <div key={section.section} className="space-y-1">
              <div className="px-3 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                {section.section}
              </div>
              <div className="space-y-0.5 pt-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center justify-between rounded px-3 py-2 text-xs font-medium transition-colors ${
                        item.active
                          ? "border border-border bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            item.active
                              ? "text-sidebar-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Settings Section */}
          <div className="space-y-1">
            <div className="px-3 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
              SYSTEM
            </div>
            <div className="pt-1">
              <Link
                href="/settings"
                className={`flex items-center gap-2.5 rounded px-3 py-2 text-xs font-medium transition-colors ${
                  pathname === "/settings"
                    ? "border border-border bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                }`}
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / User Account */}
      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-secondary font-mono text-[10px] text-secondary-foreground">
              {user?.email ? user.email.slice(0, 2).toUpperCase() : "3D"}
            </div>
            <div className="overflow-hidden">
              <div className="max-w-[120px] truncate font-mono text-xs text-foreground">
                {user?.email || "Local User"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            title="Sign Out"
            aria-label="Sign Out"
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

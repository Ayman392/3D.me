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
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Layers,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [engineStatus, setEngineStatus] = useState<"ready" | "offline" | "checking">("checking");
  const [engineDevice, setEngineDevice] = useState<string>("mps");

  useEffect(() => {
    let isMounted = true;
    const checkEngine = async () => {
      try {
        const res = await fetch("/api/engine/health", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setEngineStatus("ready");
            setEngineDevice(data.device || "mps");
          }
        } else {
          if (isMounted) setEngineStatus("offline");
        }
      } catch {
        if (isMounted) setEngineStatus("offline");
      }
    };

    checkEngine();
    const interval = setInterval(checkEngine, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  interface NavItem {
    name: string;
    href: string;
    icon: any;
    active: boolean;
    badge?: string;
  }

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

  return (
    <aside className="w-60 h-screen bg-graphite-900 border-r border-graphite-800 flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* Logo / Brand Header */}
        <div className="h-12 px-4 border-b border-graphite-800 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-forge/15 border border-forge/30 flex items-center justify-center">
              <Box className="w-3.5 h-3.5 text-forge" />
            </div>
            <span className="font-mono font-semibold text-xs text-graphite-100 tracking-wide">
              3d.me
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                engineStatus === "ready"
                  ? "bg-emerald-500"
                  : engineStatus === "checking"
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              title={engineStatus === "ready" ? "Engine Ready" : engineStatus}
            />
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="py-4 px-2 space-y-6">
          {navLinks.map((section) => (
            <div key={section.section} className="space-y-1">
              <div className="px-3 text-[10px] font-mono font-semibold text-graphite-500 tracking-wider">
                {section.section}
              </div>
              <div className="space-y-0.5 pt-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                        item.active
                          ? "bg-graphite-800 text-graphite-100 border border-graphite-750"
                          : "text-graphite-400 hover:text-graphite-200 hover:bg-graphite-850"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-3.5 h-3.5 ${item.active ? "text-forge" : "text-graphite-500"}`} />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-graphite-800 text-graphite-400 border border-graphite-700">
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
            <div className="px-3 text-[10px] font-mono font-semibold text-graphite-500 tracking-wider">
              SYSTEM
            </div>
            <div className="pt-1">
              <Link
                href="/settings"
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors ${
                  pathname === "/settings"
                    ? "bg-graphite-800 text-graphite-100 border border-graphite-750"
                    : "text-graphite-400 hover:text-graphite-200 hover:bg-graphite-850"
                }`}
              >
                <Settings className="w-3.5 h-3.5 text-graphite-500" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / User Account */}
      <div className="p-3 border-t border-graphite-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-6 h-6 rounded bg-graphite-800 border border-graphite-700 flex items-center justify-center text-[10px] font-mono text-graphite-300">
              {user?.email ? user.email.slice(0, 2).toUpperCase() : "3D"}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs text-graphite-300 truncate font-mono max-w-[120px]">
                {user?.email || "Local User"}
              </div>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            title="Sign Out"
            className="p-1.5 text-graphite-400 hover:text-red-400 hover:bg-graphite-800 rounded transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

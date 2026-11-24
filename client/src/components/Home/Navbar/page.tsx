"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  Home,
  FileText,
  CreditCard,
  Info,
  Menu,
  X,
  LayoutDashboard,
  LogOut,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DoodleButton } from "@/components/ui/doodle-button";

const ICON_MAP = {
  home: Home,
  "file-text": FileText,
  "credit-card": CreditCard,
  info: Info,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof ICON_MAP;

export interface NavItem {
  name: string;
  url: string;
  icon: NavIconName;
}

interface NavBarProps {
  items: NavItem[];
  className?: string;
  defaultActive?: string;
}

export function AnimeNavBar({
  items,
  className,
  defaultActive = "Home",
}: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(defaultActive);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfile(userId: string, fallback?: string | null) {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", userId)
          .single();
        setProfileName(data?.name || fallback || null);
      } catch {
        setProfileName(fallback || null);
      }
    }

    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const metaName =
          typeof currentUser.user_metadata?.name === "string"
            ? currentUser.user_metadata.name
            : null;
        void loadProfile(currentUser.id, metaName);
      } else {
        setProfileName(null);
      }
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        const metaName =
          typeof nextUser.user_metadata?.name === "string"
            ? nextUser.user_metadata.name
            : null;
        void loadProfile(nextUser.id, metaName);
      } else {
        setProfileName(null);
      }
      setAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    const matched = items.find((item) => item.url === pathname);
    if (matched) {
      setActiveTab(matched.name);
    }
  }, [pathname, items]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    setSigningOut(true);
    setMenuOpen(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      setProfileName(null);
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  if (!mounted) return null;

  const displayName =
    profileName ||
    (typeof user?.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null) ||
    user?.email?.split("@")[0] ||
    "Creator";

  return (
    <div className={cn("fixed top-5 left-0 right-0 z-[9999]", className)}>
      <div className="flex justify-center px-4 pt-6">
        <motion.div
          className="relative isolate flex w-full max-w-sm items-center justify-between gap-1 rounded-full border-2 border-foreground bg-background p-1.5 shadow-[0_3px_0_var(--foreground)] md:w-auto md:max-w-none md:justify-start"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <Link
            href="/"
            className="hidden items-center pl-4 pr-3 text-lg font-black tracking-tight text-foreground lg:flex"
          >
            3d<span className="text-[var(--brand,#ff6b2c)]">.</span>me
          </Link>
          <div className="hidden h-6 w-0.5 rounded-full bg-foreground/15 lg:block" />

          {items.map((item) => {
            const Icon = ICON_MAP[item.icon];
            const isActive = activeTab === item.name;
            const isHovered = hoveredTab === item.name;

            return (
              <Link
                key={item.name}
                href={item.url}
                onClick={(e) => {
                  if (item.url === "#") e.preventDefault();
                  setActiveTab(item.name);
                }}
                onMouseEnter={() => setHoveredTab(item.name)}
                onMouseLeave={() => setHoveredTab(null)}
                className={cn(
                  "relative flex-1 cursor-pointer rounded-full px-3 py-2.5 text-center text-sm font-bold transition-colors duration-200 md:flex-none md:px-5",
                  isActive
                    ? "text-background"
                    : "text-foreground/60 hover:text-foreground",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}

                <AnimatePresence>
                  {isHovered && !isActive && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute inset-0 rounded-full bg-foreground/10"
                    />
                  )}
                </AnimatePresence>

                <span className="relative z-10 hidden md:inline">
                  {item.name}
                </span>
                <motion.span
                  className="relative z-10 flex h-5 items-center justify-center md:hidden"
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Icon size={18} strokeWidth={2.5} />
                </motion.span>

                {isActive && (
                  <motion.div
                    layoutId="anime-mascot"
                    className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    <div className="relative h-12 w-12">
                      <motion.div
                        className="absolute left-1/2 h-10 w-10 -translate-x-1/2 rounded-full border-2 border-foreground bg-white"
                        animate={
                          hoveredTab
                            ? {
                                scale: [1, 1.1, 1],
                                rotate: [0, -5, 5, 0],
                                transition: {
                                  duration: 0.5,
                                  ease: "easeInOut",
                                },
                              }
                            : {
                                y: [0, -3, 0],
                                transition: {
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                },
                              }
                        }
                      >
                        <motion.div
                          className="absolute h-2 w-2 rounded-full bg-black"
                          animate={
                            hoveredTab
                              ? {
                                  scaleY: [1, 0.2, 1],
                                  transition: {
                                    duration: 0.2,
                                    times: [0, 0.5, 1],
                                  },
                                }
                              : {}
                          }
                          style={{ left: "25%", top: "35%" }}
                        />
                        <motion.div
                          className="absolute h-2 w-2 rounded-full bg-black"
                          animate={
                            hoveredTab
                              ? {
                                  scaleY: [1, 0.2, 1],
                                  transition: {
                                    duration: 0.2,
                                    times: [0, 0.5, 1],
                                  },
                                }
                              : {}
                          }
                          style={{ right: "25%", top: "35%" }}
                        />
                        <motion.div
                          className="absolute h-1.5 w-2 rounded-full bg-pink-300"
                          animate={{ opacity: hoveredTab ? 0.8 : 0.6 }}
                          style={{ left: "10%", top: "52%" }}
                        />
                        <motion.div
                          className="absolute h-1.5 w-2 rounded-full bg-pink-300"
                          animate={{ opacity: hoveredTab ? 0.8 : 0.6 }}
                          style={{ right: "10%", top: "52%" }}
                        />
                        <motion.div
                          className="absolute h-2 w-4 rounded-full border-b-2 border-black"
                          animate={
                            hoveredTab
                              ? { scaleY: 1.5, y: -1 }
                              : { scaleY: 1, y: 0 }
                          }
                          style={{ left: "28%", top: "55%" }}
                        />
                        <AnimatePresence>
                          {hoveredTab && (
                            <>
                              <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                className="absolute -right-2 -top-2 h-2 w-2 text-yellow-300"
                              >
                                ✨
                              </motion.div>
                              <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ delay: 0.1 }}
                                className="absolute -left-2 -top-3 h-2 w-2 text-yellow-300"
                              >
                                ✨
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </motion.div>
                      <motion.div
                        className="absolute -bottom-1 left-1/2 h-4 w-4 -translate-x-1/2"
                        animate={
                          hoveredTab
                            ? {
                                y: [0, -4, 0],
                                transition: {
                                  duration: 0.3,
                                  repeat: Infinity,
                                  repeatType: "reverse",
                                },
                              }
                            : {
                                y: [0, 2, 0],
                                transition: {
                                  duration: 1,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                  delay: 0.5,
                                },
                              }
                        }
                      >
                        <div className="h-full w-full rotate-45 border-b-2 border-r-2 border-foreground bg-white" />
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </Link>
            );
          })}

          <div className="hidden h-6 w-0.5 rounded-full bg-foreground/15 md:block" />

          {/* Desktop: inline actions */}
          <div className="hidden items-center gap-2 pl-1 pr-0.5 md:flex">
            <ThemeToggle variant="icon" defaultTheme="dark" />
            {authLoading ? (
              <div className="h-9 w-28 animate-pulse rounded-full border-2 border-foreground/20 bg-muted" />
            ) : user ? (
              <>
                <DoodleButton href="/dashboard" variant="outline" size="sm">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <LayoutDashboard className="size-3.5 text-[var(--brand,#ff6b2c)]" />
                    <span>Dashboard</span>
                  </span>
                </DoodleButton>

                <div
                  title={user.email ?? undefined}
                  className="inline-flex h-9 max-w-[140px] items-center gap-1.5 rounded-full border-2 border-foreground bg-muted px-3 text-xs font-bold text-foreground"
                >
                  <UserIcon className="size-3.5 shrink-0 text-[var(--brand,#ff6b2c)]" />
                  <span className="truncate">{displayName}</span>
                </div>

                <DoodleButton
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  variant="solid"
                  size="sm"
                >
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <LogOut className="size-3.5" />
                    <span>{signingOut ? "..." : "Sign Out"}</span>
                  </span>
                </DoodleButton>
              </>
            ) : (
              <>
                <DoodleButton href="/login" variant="outline" size="sm">
                  Login
                </DoodleButton>
                <DoodleButton href="/register" variant="solid" size="sm">
                  Register
                </DoodleButton>
              </>
            )}
          </div>

          {/* Mobile: hamburger with dropdown card */}
          <div ref={menuRef} className="relative shrink-0 md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-foreground bg-background text-foreground shadow-[0_2px_0_var(--foreground)] transition-[translate,box-shadow] duration-150 active:translate-y-0.5 active:shadow-none"
            >
              {menuOpen ? (
                <X size={18} strokeWidth={2.5} />
              ) : (
                <Menu size={18} strokeWidth={2.5} />
              )}
            </button>

            <div
              id="mobile-menu"
              aria-hidden={!menuOpen}
              className={cn(
                "absolute right-0 top-full z-20 mt-4 flex w-60 flex-col gap-3 rounded-3xl border-2 border-foreground bg-background p-3 shadow-[0_3px_0_var(--foreground)] transition-[opacity,translate,visibility] duration-200",
                menuOpen
                  ? "visible opacity-100"
                  : "invisible -translate-y-2 opacity-0",
              )}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-foreground">Theme</span>
                <ThemeToggle variant="icon" defaultTheme="dark" />
              </div>

              {user ? (
                <>
                  <div className="flex items-center gap-2 rounded-2xl border-2 border-foreground/20 bg-muted/60 px-3 py-2 text-xs font-bold text-foreground">
                    <UserIcon className="size-3.5 shrink-0 text-[var(--brand,#ff6b2c)]" />
                    <span className="truncate">{displayName}</span>
                  </div>
                  <DoodleButton
                    href="/dashboard"
                    variant="outline"
                    className="w-full"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <LayoutDashboard className="size-4 text-[var(--brand,#ff6b2c)]" />
                      <span>Dashboard</span>
                    </span>
                  </DoodleButton>
                  <DoodleButton
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    variant="solid"
                    className="w-full"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <LogOut className="size-4" />
                      <span>{signingOut ? "Signing out..." : "Sign Out"}</span>
                    </span>
                  </DoodleButton>
                </>
              ) : (
                <>
                  <DoodleButton
                    href="/login"
                    variant="outline"
                    className="w-full"
                  >
                    Login
                  </DoodleButton>
                  <DoodleButton
                    href="/register"
                    variant="solid"
                    className="w-full"
                  >
                    Register
                  </DoodleButton>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

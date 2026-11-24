"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { applyTheme, useTheme, type Theme } from "@/lib/theme";

export interface ThemeToggleProps {
  /** Kept so existing usages like variant="icon" still compile. */
  variant?: "icon";
  /** Ignored: the real theme is read from the page, so every toggle stays in sync. */
  defaultTheme?: Theme;
  /** Diameter of the button in px. Default: 36 */
  buttonSize?: number;
  /** Curtain animation duration in ms. Default: 550 */
  duration?: number;
  /** Called after each theme change */
  onThemeChange?: (theme: Theme) => void;
}

// The curtain wipes in the colour of the NEXT theme. These match --background in globals.css.
const CURTAIN: Record<Theme, string> = { light: "#ffffff", dark: "#0a0a0a" };
const EASING = "cubic-bezier(0.76, 0, 0.24, 1)";

type Phase = "idle" | "falling" | "rising";

const subscribeNoop = () => () => {};

export function ThemeToggle({
  buttonSize = 36,
  duration = 550,
  onThemeChange,
}: ThemeToggleProps) {
  const theme = useTheme();
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [curtainColor, setCurtainColor] = useState(CURTAIN.dark);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const toggle = useCallback(() => {
    if (phase !== "idle") return;
    const next: Theme = theme === "dark" ? "light" : "dark";
    setCurtainColor(CURTAIN[next]);
    setPhase("falling");

    const swap = window.setTimeout(() => {
      applyTheme(next);
      onThemeChange?.(next);
      setPhase("rising");
      const finish = window.setTimeout(() => setPhase("idle"), duration + 60);
      timers.current.push(finish);
    }, duration);
    timers.current.push(swap);
  }, [phase, theme, duration, onThemeChange]);

  const curtainStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: curtainColor,
    transformOrigin: "top",
    transform: phase === "falling" ? "scaleY(1)" : "scaleY(0)",
    transition: phase === "idle" ? "none" : `transform ${duration}ms ${EASING}`,
    zIndex: 10000,
    pointerEvents: "none",
  };

  const isDark = theme === "dark";

  return (
    <>
      {mounted &&
        createPortal(
          <div aria-hidden="true" style={curtainStyle} />,
          document.body,
        )}
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        style={{ width: buttonSize, height: buttonSize }}
        className="flex shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-background text-foreground shadow-[0_2px_0_var(--foreground)] transition-[translate,rotate,box-shadow] duration-150 hover:-translate-y-px hover:-rotate-6 active:translate-y-0.5 active:shadow-none"
      >
        {isDark ? (
          <Sun size={16} strokeWidth={2.5} />
        ) : (
          <Moon size={16} strokeWidth={2.5} />
        )}
      </button>
    </>
  );
}

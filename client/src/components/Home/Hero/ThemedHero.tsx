"use client";

import { useEffect, useRef } from "react";
import { SliderRevolutionHero } from "@/components/ui/cymatic-particle-hero";
import { useTheme } from "@/lib/theme";

type Mode = "light" | "dark";

const HIDE_LABELS = ["Pulse", "Pause Spin", "Play Spin", "Light / Dark"];

const norm = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

const labelMatches = (el: HTMLElement, label: string) => {
  const text = norm(el.textContent);
  if (label === "Light / Dark") return text === label;
  // Allows a trailing icon character, e.g. "Play Spin ▷"
  return text.startsWith(label) && text.length <= label.length + 3;
};

// Smallest elements whose text matches the label.
const findAll = (root: HTMLElement, label: string) => {
  const all = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) =>
    labelMatches(el, label),
  );
  return all.filter(
    (el) =>
      !Array.from(el.children).some((c) => all.includes(c as HTMLElement)),
  );
};

// Only elements this small can be hidden, so the hero itself is never touched.
const isSmall = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.width <= 260 && r.height <= 70;
};

const hideControls = (root: HTMLElement) => {
  for (const label of HIDE_LABELS) {
    for (const el of findAll(root, label)) {
      let target = el;
      let parent = el.parentElement;
      // Climb to the button wrapper, but only while it is still button-sized.
      while (
        parent &&
        parent !== root &&
        isSmall(parent) &&
        norm(parent.textContent) === norm(el.textContent)
      ) {
        target = parent;
        parent = parent.parentElement;
      }
      if (isSmall(target)) target.style.display = "none";
    }
  }
};
export default function ThemedHero() {
  const theme = useTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  // The module always starts in light mode.
  const moduleMode = useRef<Mode>("light");

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;

    const run = () => {
      hideControls(root);
      if (moduleMode.current !== theme) {
        const btn = findAll(root, "Light / Dark")[0];
        if (btn) {
          btn.click(); // still works while the button is hidden
          moduleMode.current = theme;
        }
      }
    };

    run();
    // The module draws itself late and may redraw, so keep watching.
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [theme]);

  return (
    <div ref={wrapRef} className="h-full w-full">
      <SliderRevolutionHero
        embedKey="ek_biqgfhte6l7dhaya3qyw"
        ariaLabel="3d.me animated hero"
        className="h-full"
        placeholderClassName="h-full"
      />
    </div>
  );
}

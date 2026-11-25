"use client";

import { useEffect, useRef, useState } from "react";

export interface SliderRevolutionHeroProps {
  /**
   * The embed key of your module in Slider Revolution Anywhere (anywhere.sliderrevolution.com):
   * open the module, click Embed and copy the `ek_‚Ä¶` part. A free account is enough.
   */
  embedKey: string;
  /** Accessible name of the region, read by screen readers. Default: "Animated hero". */
  ariaLabel?: string;
  /** Extra classes for the outer section, for example "overflow-hidden rounded-xl". */
  className?: string;
  /**
   * Classes for the loading placeholder, shown until the module has drawn.
   * Default: "h-svh min-h-[700px]". The module fills the screen and is at least 700 px tall, so the placeholder reserves the same space.
   */
  placeholderClassName?: string;
}

const join = (...c: Array<string | false | undefined>) =>
  c.filter(Boolean).join(" ");

/**
 * An animated full-screen hero for the top of a landing page, made in Slider Revolution Anywhere.
 * Design, words and motion live in your SR Anywhere module: publish it again there and every app
 * that shows this key updates. No slider library in your bundle; the module's script loads async
 * from Slider Revolution's edge.
 */
export function SliderRevolutionHero({
  embedKey,
  ariaLabel = "Animated hero",
  className,
  placeholderClassName = "h-svh min-h-[700px]",
}: SliderRevolutionHeroProps) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !embedKey) return;
    setReady(false);
    setFailed(false);
    const script = document.createElement("script");
    script.src = `https://embed.sliderrevolution.com/i/${embedKey}/embed.js`;
    script.async = true;
    script.onerror = () => setFailed(true);
    el.appendChild(script);
    // The module draws itself into the host; the placeholder goes as soon as the host has a height.
    const observer = new ResizeObserver(() => {
      if (el.offsetHeight > 0) setReady(true);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Lets the module load again when the user navigates back to this page.
      el.replaceChildren();
      const loaders = (
        window as unknown as { __sraLoaders?: Record<string, unknown> }
      ).__sraLoaders;
      if (loaders)
        delete loaders["SR7_" + embedKey.replace(/[^A-Za-z0-9]/g, "") + "_1"];
    };
  }, [embedKey]);

  return (
    <section
      aria-label={ariaLabel}
      aria-busy={!ready && !failed}
      className={join("relative w-full", className)}
    >
      {!ready && (
        <div
          aria-hidden="true"
          className={join(
            "w-full rounded-md bg-muted",
            !failed && "animate-pulse",
            placeholderClassName,
          )}
        />
      )}
      <div ref={host} className="sr-anywhere-embed-host w-full" />
    </section>
  );
}

export default SliderRevolutionHero;

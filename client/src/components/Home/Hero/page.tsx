"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, useTransform, useSpring, useMotionValue } from "framer-motion";
import ThreeDAmbientBackground from "./ThreeDAmbientBackground";
import Image from "next/image";
import {
  fetchSketchfabHeroItems,
  getInitialHeroItems,
  type SketchfabCardItem,
} from "@/lib/sketchfab";

export type AnimationPhase = "scatter" | "line" | "circle" | "bottom-strip";

interface FlipCardProps {
  item: SketchfabCardItem;
  index: number;
  width: number;
  height: number;
  target: {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    opacity: number;
  };
}

const TOTAL_IMAGES = 20;
const MAX_SCROLL = 3000;

const lerp = (start: number, end: number, t: number) =>
  start * (1 - t) + end * t;

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function FlipCard({ item, index, width, height, target }: FlipCardProps) {
  return (
    <motion.div
      animate={{
        x: target.x,
        y: target.y,
        rotate: target.rotation,
        scale: target.scale,
        opacity: target.opacity,
      }}
      transition={{
        type: "spring",
        stiffness: 40,
        damping: 15,
      }}
      style={{
        position: "absolute",
        width,
        height,
        transformStyle: "preserve-3d",
        perspective: "1000px",
      }}
      className="group cursor-pointer"
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        transition={{
          duration: 0.6,
          type: "spring",
          stiffness: 260,
          damping: 20,
        }}
        whileHover={{ rotateY: 180 }}
      >
        {/* Front Face */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-white/15 dark:bg-black/80 dark:backdrop-blur-md"
          style={{ backfaceVisibility: "hidden" }}
        >
          <Image
            width={width}
            height={height}
            src={item.image}
            alt={item.title || `3d-asset-${index}`}
            unoptimized
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-colors group-hover:from-black/30" />
        </div>

        {/* Back Face */}
        <div
          className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-[#ff6b2c]/50 bg-zinc-950/95 p-2.5 text-center shadow-xl backdrop-blur-md dark:bg-black/90"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-[#ffd23f]">
            GLB / PBR
          </p>
          <p className="line-clamp-2 text-[11px] font-medium leading-tight text-white">
            {item.title}
          </p>
          <span className="mt-1.5 rounded-full bg-[#2433c9]/50 px-2 py-0.5 text-[9px] font-semibold text-[#ff6b2c]">
            Inspect
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Hero() {
  const [items, setItems] = useState<SketchfabCardItem[]>(() =>
    getInitialHeroItems(TOTAL_IMAGES),
  );
  const [introPhase, setIntroPhase] = useState<AnimationPhase>("scatter");
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchSketchfabHeroItems(TOTAL_IMAGES).then((fetched) => {
      if (active && fetched.length > 0) {
        setItems(fetched);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    setContainerSize({
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    });

    return () => observer.disconnect();
  }, []);

  const virtualScroll = useMotionValue(0);
  const scrollRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newScroll = Math.min(
        Math.max(scrollRef.current + e.deltaY, 0),
        MAX_SCROLL,
      );
      scrollRef.current = newScroll;
      virtualScroll.set(newScroll);
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;
      touchStartY = touchY;

      const newScroll = Math.min(
        Math.max(scrollRef.current + deltaY, 0),
        MAX_SCROLL,
      );
      scrollRef.current = newScroll;
      virtualScroll.set(newScroll);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, [virtualScroll]);

  const morphProgress = useTransform(virtualScroll, [0, 600], [0, 1]);
  const smoothMorph = useSpring(morphProgress, { stiffness: 40, damping: 20 });

  const scrollRotate = useTransform(virtualScroll, [600, 3000], [0, 360]);
  const smoothScrollRotate = useSpring(scrollRotate, {
    stiffness: 40,
    damping: 20,
  });

  const mouseX = useMotionValue(0);
  const smoothMouseX = useSpring(mouseX, { stiffness: 30, damping: 20 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const normalizedX = (relativeX / rect.width) * 2 - 1;
      mouseX.set(normalizedX * 120);
    };
    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX]);

  useEffect(() => {
    const timer1 = setTimeout(() => setIntroPhase("line"), 500);
    const timer2 = setTimeout(() => setIntroPhase("circle"), 2500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const scatterPositions = useMemo(() => {
    return Array.from({ length: TOTAL_IMAGES }, (_, i) => ({
      x: (seededRandom(i * 3 + 1) - 0.5) * 1500,
      y: (seededRandom(i * 3 + 2) - 0.5) * 1000,
      rotation: (seededRandom(i * 3 + 3) - 0.5) * 180,
      scale: 0.7,
      opacity: 0,
    }));
  }, []);

  const [morphValue, setMorphValue] = useState(0);
  const [rotateValue, setRotateValue] = useState(0);
  const [parallaxValue, setParallaxValue] = useState(0);

  useEffect(() => {
    const unsubscribeMorph = smoothMorph.on("change", setMorphValue);
    const unsubscribeRotate = smoothScrollRotate.on("change", setRotateValue);
    const unsubscribeParallax = smoothMouseX.on("change", setParallaxValue);
    return () => {
      unsubscribeMorph();
      unsubscribeRotate();
      unsubscribeParallax();
    };
  }, [smoothMorph, smoothScrollRotate, smoothMouseX]);

  const contentOpacity = useTransform(smoothMorph, [0.75, 1], [0, 1]);
  const contentY = useTransform(smoothMorph, [0.75, 1], [24, 0]);

  const width = containerSize.width || 1200;
  const height = containerSize.height || 800;
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;

  const cardWidth = isMobile ? 64 : isTablet ? 76 : 88;
  const cardHeight = isMobile ? 88 : isTablet ? 104 : 120;
  const circleYOffset = isMobile ? 28 : 38;

  const showCircleHero = introPhase === "circle" && morphValue < 0.45;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#FAFAFA] pt-20 text-zinc-950 transition-colors duration-300 dark:bg-[#09090b] dark:text-white sm:pt-24"
    >
      {/* Continuously Shifting 3D Mesh & Palette Light Background */}
      <ThreeDAmbientBackground />
      {/* Subtle Riso Blue & Coral Ambient Glow */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[44rem] -translate-x-1/2 rounded-full opacity-15 blur-3xl dark:opacity-25"
        style={{
          background:
            "radial-gradient(circle, #ff6b2c 0%, #2433c9 55%, transparent 75%)",
        }}
      />

      <div className="relative flex h-full w-full flex-col items-center justify-center perspective-1000">
        {/* Centered Hero Content inside the Circle */}
        <motion.div
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={
            showCircleHero
              ? { opacity: 1 - morphValue * 2, y: 0, filter: "blur(0px)" }
              : { opacity: 0, filter: "blur(8px)" }
          }
          transition={{ duration: 0.7 }}
          style={{ top: `calc(50% + ${circleYOffset}px)` }}
          className="pointer-events-none absolute inset-x-0 z-20 mx-auto flex max-w-[12.5rem] -translate-y-1/2 flex-col items-center justify-center px-2 text-center sm:max-w-[16rem] md:max-w-xs"
        >
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-300/80 bg-white/90 px-3 py-1 text-[9px] font-semibold tracking-wider text-zinc-900 shadow-xs backdrop-blur-md dark:border-white/15 dark:bg-black/80 dark:text-[#ffd23f] sm:text-[10px]">
            <span className="size-1.5 rounded-full bg-[#ff6b2c]" />
            LOCAL 2D → 3D GLB ENGINE
          </span>

          <h1 className="rounded-2xl bg-white/85 px-3.5 py-2 text-lg font-semibold leading-snug tracking-tight text-zinc-950 backdrop-blur-xs dark:bg-black/70 dark:text-white sm:text-2xl md:text-3xl">
            2D to <span className="text-[#ff6b2c]">3D PBR</span>
            <br />
            in Seconds
          </h1>

          <p className="mt-2 text-[9px] font-bold tracking-[0.2em] text-zinc-600 dark:text-zinc-400 sm:text-[10px]">
            SCROLL TO EXPLORE
          </p>
        </motion.div>

        {/* Arc Active Content (clears top floating navbar) */}
        <motion.div
          style={{ opacity: contentOpacity, y: contentY }}
          className="pointer-events-none absolute top-[14%] z-10 flex flex-col items-center justify-center px-4 text-center sm:top-[16%]"
        >
          <span className="mb-2 rounded-full border border-[#2433c9]/40 bg-white/90 px-3.5 py-1 text-[10px] font-medium text-[#2433c9] backdrop-blur-md dark:border-[#2433c9]/50 dark:bg-black/80 dark:text-[#ffd23f] sm:text-xs">
            Zero Cloud Lock-In · 256³ Marching Cubes · Three.js Studio
          </span>
          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-4xl md:text-5xl">
            3d.<span className="text-[#ff6b2c]">me</span> Reconstruction Studio
          </h2>
          <p className="max-w-md text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 sm:max-w-lg sm:text-sm md:text-base">
            Convert single photos, text prompts, or multi-angle captures into
            clean binary{" "}
            <span className="font-semibold text-[#ff6b2c] dark:text-[#ffd23f]">
              .GLB
            </span>{" "}
            meshes with real-time WebGL inspection.
          </p>
        </motion.div>

        {/* Main Card Stage */}
        <div className="relative flex h-full w-full items-center justify-center">
          {items.slice(0, TOTAL_IMAGES).map((item, i) => {
            let target = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

            if (introPhase === "scatter") {
              target = scatterPositions[i];
            } else if (introPhase === "line") {
              const lineSpacing = isMobile ? 66 : isTablet ? 84 : 100;
              const lineTotalWidth = TOTAL_IMAGES * lineSpacing;
              const lineX = i * lineSpacing - lineTotalWidth / 2;
              target = { x: lineX, y: 0, rotation: 0, scale: 1, opacity: 1 };
            } else {
              const circleRadius = isMobile
                ? Math.min(width * 0.36, height * 0.22, 155)
                : isTablet
                  ? Math.min(width * 0.32, height * 0.3, 240)
                  : Math.min(width * 0.33, height * 0.34, 305);

              const circleAngle = (i / TOTAL_IMAGES) * 360;
              const circleRad = (circleAngle * Math.PI) / 180;
              const circleScale = isMobile ? 1.15 : isTablet ? 1.2 : 1.25;

              const circlePos = {
                x: Math.cos(circleRad) * circleRadius,
                y: Math.sin(circleRad) * circleRadius + circleYOffset,
                rotation: circleAngle + 90,
                scale: circleScale,
              };

              const baseRadius = Math.min(width, height * 1.5);
              const arcRadius = baseRadius * (isMobile ? 1.35 : 1.12);
              const arcApexY = height * (isMobile ? 0.42 : 0.34);
              const arcCenterY = arcApexY + arcRadius;

              const spreadAngle = isMobile ? 115 : 135;
              const startAngle = -90 - spreadAngle / 2;
              const step = spreadAngle / (TOTAL_IMAGES - 1);

              const scrollProgress = Math.min(
                Math.max(rotateValue / 360, 0),
                1,
              );
              const maxRotation = spreadAngle * 0.8;
              const boundedRotation = -scrollProgress * maxRotation;

              const currentArcAngle = startAngle + i * step + boundedRotation;
              const arcRad = (currentArcAngle * Math.PI) / 180;

              const arcPos = {
                x: Math.cos(arcRad) * arcRadius + parallaxValue,
                y: Math.sin(arcRad) * arcRadius + arcCenterY,
                rotation: currentArcAngle + 90,
                scale: isMobile ? 1.35 : 1.9,
              };

              target = {
                x: lerp(circlePos.x, arcPos.x, morphValue),
                y: lerp(circlePos.y, arcPos.y, morphValue),
                rotation: lerp(circlePos.rotation, arcPos.rotation, morphValue),
                scale: lerp(circlePos.scale, arcPos.scale, morphValue),
                opacity: 1,
              };
            }

            return (
              <FlipCard
                key={`${item.title}-${i}`}
                item={item}
                index={i}
                width={cardWidth}
                height={cardHeight}
                target={target}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

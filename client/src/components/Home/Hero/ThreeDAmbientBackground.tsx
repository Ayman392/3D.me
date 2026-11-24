"use client";

import React, { useEffect, useRef } from "react";

interface MeshNode {
  baseX: number;
  baseY: number;
  z: number;
  phase: number;
  speed: number;
  colorIndex: number;
}

const PALETTE = [
  { r: 255, g: 107, b: 44 }, // #ff6b2c coral
  { r: 255, g: 210, b: 63 }, // #ffd23f gold
  { r: 36, g: 51, b: 201 }, // #2433c9 riso ink blue
];

export default function ThreeDAmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth || window.innerWidth);
    let height = (canvas.height = canvas.offsetHeight || window.innerHeight);

    const cols = 7;
    const rows = 5;
    const nodes: MeshNode[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        nodes.push({
          baseX: c / (cols - 1),
          baseY: r / (rows - 1),
          z: ((r * cols + c) % 5) * 45 - 90,
          phase: (r + c) * 0.75,
          speed: 0.0007 + ((r + c) % 3) * 0.00025,
          colorIndex: (r + c) % PALETTE.length,
        });
      }
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || window.innerWidth;
      height = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas);

    const project3D = (nx: number, ny: number, nz: number, time: number) => {
      const waveX = Math.sin(time * 0.0006 + nx * 4 + ny * 2) * 0.045;
      const waveY = Math.cos(time * 0.0005 + ny * 4 - nx * 2) * 0.045;
      const zOsc = nz + Math.sin(time * 0.0009 + nx * 5 + ny * 3) * 75;

      // Subtle continuous 3D camera yaw & pitch sway
      const yaw = Math.sin(time * 0.00035) * 0.24;
      const pitch = Math.cos(time * 0.00028) * 0.16;

      const cx = (nx - 0.5 + waveX) * width * 1.15;
      const cy = (ny - 0.5 + waveY) * height * 1.15;
      const cz = zOsc;

      // Rotate around Y axis
      const x1 = cx * Math.cos(yaw) + cz * Math.sin(yaw);
      const z1 = -cx * Math.sin(yaw) + cz * Math.cos(yaw);

      // Rotate around X axis
      const y2 = cy * Math.cos(pitch) - z1 * Math.sin(pitch);
      const z2 = cy * Math.sin(pitch) + z1 * Math.cos(pitch);

      const fov = 620;
      const scale = fov / Math.max(220, fov + z2);

      return {
        x: width * 0.5 + x1 * scale,
        y: height * 0.5 + y2 * scale,
        scale,
        z: z2,
      };
    };

    const render = (time: number) => {
      const isDark = document.documentElement.classList.contains("dark");
      ctx.clearRect(0, 0, width, height);

      // Continuously shifting ambient 3D light orbs in #ff6b2c, #ffd23f, #2433c9
      const orbConfigs = [
        {
          x: width * (0.28 + Math.sin(time * 0.00042) * 0.22),
          y: height * (0.32 + Math.cos(time * 0.00036) * 0.18),
          radius: Math.max(width, height) * 0.42,
          color: PALETTE[0], // #ff6b2c
          alpha: isDark ? 0.18 : 0.14,
        },
        {
          x: width * (0.72 + Math.cos(time * 0.00038) * 0.22),
          y: height * (0.66 + Math.sin(time * 0.00044) * 0.2),
          radius: Math.max(width, height) * 0.44,
          color: PALETTE[2], // #2433c9
          alpha: isDark ? 0.22 : 0.13,
        },
        {
          x: width * (0.52 + Math.sin(time * 0.0005 + 1.5) * 0.25),
          y: height * (0.48 + Math.cos(time * 0.00047 + 0.8) * 0.2),
          radius: Math.max(width, height) * 0.34,
          color: PALETTE[1], // #ffd23f
          alpha: isDark ? 0.12 : 0.12,
        },
      ];

      for (const orb of orbConfigs) {
        const grad = ctx.createRadialGradient(
          orb.x,
          orb.y,
          0,
          orb.x,
          orb.y,
          orb.radius,
        );
        grad.addColorStop(
          0,
          `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, ${orb.alpha})`,
        );
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // Project all 3D mesh vertices
      const projected = nodes.map((node) =>
        project3D(node.baseX, node.baseY, node.z, time),
      );

      // Draw translucent 3D facets + wireframe edges
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const i00 = r * cols + c;
          const i10 = i00 + 1;
          const i01 = (r + 1) * cols + c;
          const i11 = i01 + 1;

          const p00 = projected[i00];
          const p10 = projected[i10];
          const p01 = projected[i01];
          const p11 = projected[i11];

          const nodeColor = PALETTE[(r + c) % PALETTE.length];
          const avgScale =
            (p00.scale + p10.scale + p01.scale + p11.scale) * 0.25;
          const pulse = 0.5 + 0.5 * Math.sin(time * 0.0015 + r + c);

          // Subtle 3D facet fill
          ctx.beginPath();
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.closePath();

          const fillAlpha = isDark
            ? (0.015 + pulse * 0.025) * avgScale
            : (0.02 + pulse * 0.03) * avgScale;
          ctx.fillStyle = `rgba(${nodeColor.r}, ${nodeColor.g}, ${nodeColor.b}, ${fillAlpha.toFixed(4)})`;
          ctx.fill();

          // Wireframe quad lines
          const strokeAlpha = isDark
            ? Math.min(0.26, 0.08 * avgScale + pulse * 0.06)
            : Math.min(0.22, 0.07 * avgScale + pulse * 0.05);
          ctx.strokeStyle = `rgba(${nodeColor.r}, ${nodeColor.g}, ${nodeColor.b}, ${strokeAlpha.toFixed(4)})`;
          ctx.lineWidth = Math.max(0.75, 1.15 * avgScale);
          ctx.stroke();
        }
      }

      // Draw 3D vertices
      projected.forEach((pt, idx) => {
        const c = PALETTE[nodes[idx].colorIndex];
        const radius = Math.max(1.6, 3 * pt.scale);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isDark
          ? `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(0.75, 0.35 * pt.scale)})`
          : `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(0.65, 0.3 * pt.scale)})`;
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    />
  );
}

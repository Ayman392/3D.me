// "use client";

// import React from "react";
// import { motion } from "framer-motion";
// import {
//   IconX,
//   IconSunHigh,
//   IconCamera,
//   IconGrid3x3,
//   IconHelpCircle,
//   IconEye,
//   IconRotateClockwise,
//   IconSparkles,
//   IconCube3dSphere,
//   type IconProps,
// } from "@tabler/icons-react";
// import ModelViewer from "@/components/viewer/ModelViewer";
// import type { ActiveModelState } from "./StudioDashboard";

// interface ViewportStageProps {
//   bannerVisible: boolean;
//   onDismissBanner: () => void;
//   activeModel: ActiveModelState | null;
//   statusMessage: string | null;
//   seeInside: boolean;
//   onToggleSeeInside: () => void;
//   onResetViewport: () => void;
//   onFocusGenerator: () => void;
// }

// function StageDoodleBadge({
//   icon: Icon,
//   isActive = false,
//   size = 15,
//   padClass = "p-1",
//   rotateOnHover = -6,
// }: {
//   icon: React.ComponentType<IconProps>;
//   isActive?: boolean;
//   size?: number;
//   padClass?: string;
//   rotateOnHover?: number;
// }) {
//   return (
//     <motion.span
//       whileHover={{ scale: 1.15, rotate: rotateOnHover, y: -1.5 }}
//       whileTap={{ scale: 0.9, y: 1 }}
//       animate={
//         isActive ? { scale: 1.08, y: -0.5 } : { scale: 1, rotate: 0, y: 0 }
//       }
//       transition={{ type: "spring", stiffness: 420, damping: 22 }}
//       className={`inline-flex shrink-0 items-center justify-center rounded-xl border-2 transition-colors ${padClass} ${
//         isActive
//           ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
//           : "border-foreground/75 bg-card text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] group-hover:border-foreground group-hover:bg-[var(--brand,#ff6b2c)]/15"
//       }`}
//     >
//       <Icon size={size} stroke={2.1} className="shrink-0" />
//     </motion.span>
//   );
// }

// export function ViewportStage({
//   bannerVisible,
//   onDismissBanner,
//   activeModel,
//   statusMessage,
//   seeInside,
//   onToggleSeeInside,
//   onResetViewport,
//   onFocusGenerator,
// }: ViewportStageProps) {
//   return (
//     <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background transition-colors">
//       <div
//         aria-hidden="true"
//         className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklch,var(--brand,#ff6b2c)_12%,transparent),transparent_70%)]"
//       />

//       {bannerVisible && (
//         <div className="pointer-events-auto absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-foreground/85 bg-card/95 px-3.5 py-1.5 text-xs shadow-[0_2px_0_var(--foreground)] backdrop-blur-md">
//           <span className="inline-flex items-center justify-center rounded-full border border-foreground/70 bg-[var(--brand,#ff6b2c)]/15 p-1 text-[var(--brand,#ff6b2c)]">
//             <IconSparkles size={13} stroke={2.2} />
//           </span>
//           <span className="whitespace-nowrap text-muted-foreground">
//             New{" "}
//             <strong className="font-bold text-foreground">
//               CAD Fit-Test & Smart Mesh
//             </strong>{" "}
//             pipeline ready
//           </span>
//           <button
//             type="button"
//             onClick={onDismissBanner}
//             aria-label="Dismiss announcement"
//             className="ml-1 rounded-full p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
//           >
//             <IconX size={13} stroke={2.2} />
//           </button>
//         </div>
//       )}

//       {/* Top-Right Axis Gizmo & Floating Doodle Control Strip */}
//       <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-2.5">
//         <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-foreground/80 bg-card/90 shadow-[0_2px_0_var(--foreground)] backdrop-blur-md">
//           <div className="relative h-7 w-7 text-[10px] font-black">
//             <span className="absolute top-0 left-1/2 -translate-x-1/2 text-emerald-500">
//               Y
//             </span>
//             <span className="absolute right-0 bottom-0 text-[var(--brand,#ff6b2c)]">
//               X
//             </span>
//             <span className="absolute left-0 bottom-0 text-sky-500">Z</span>
//           </div>
//         </div>

//         <div className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-foreground/80 bg-card/90 p-1.5 shadow-[0_2px_0_var(--foreground)] backdrop-blur-md">
//           <button
//             type="button"
//             title="Lighting & Environment"
//             aria-label="Lighting & Environment"
//             className="group flex items-center justify-center"
//           >
//             <StageDoodleBadge
//               icon={IconSunHigh}
//               size={15}
//               padClass="p-1"
//               rotateOnHover={25}
//             />
//           </button>

//           <button
//             type="button"
//             title="See Inside / X-Ray"
//             aria-label="See Inside / X-Ray"
//             aria-pressed={seeInside}
//             onClick={onToggleSeeInside}
//             className="group flex items-center justify-center"
//           >
//             <StageDoodleBadge
//               icon={IconEye}
//               isActive={seeInside}
//               size={15}
//               padClass="p-1"
//               rotateOnHover={0}
//             />
//           </button>

//           <button
//             type="button"
//             title="Capture Viewport"
//             aria-label="Capture Viewport"
//             className="group flex items-center justify-center"
//           >
//             <StageDoodleBadge
//               icon={IconCamera}
//               size={15}
//               padClass="p-1"
//               rotateOnHover={-8}
//             />
//           </button>

//           <button
//             type="button"
//             title="Reset Viewport"
//             aria-label="Reset Viewport"
//             onClick={onResetViewport}
//             className="group flex items-center justify-center"
//           >
//             <StageDoodleBadge
//               icon={IconRotateClockwise}
//               size={15}
//               padClass="p-1"
//               rotateOnHover={45}
//             />
//           </button>

//           <div className="my-0.5 h-px w-5 bg-border" />

//           <button
//             type="button"
//             title="Grid & Topology"
//             aria-label="Grid & Topology"
//             className="group flex items-center justify-center"
//           >
//             <StageDoodleBadge
//               icon={IconGrid3x3}
//               size={15}
//               padClass="p-1"
//               rotateOnHover={8}
//             />
//           </button>

//           <button
//             type="button"
//             title="Studio Shortcuts"
//             aria-label="Studio Shortcuts"
//             className="group flex items-center justify-center"
//           >
//             <StageDoodleBadge
//               icon={IconHelpCircle}
//               size={15}
//               padClass="p-1"
//               rotateOnHover={-10}
//             />
//           </button>
//         </div>
//       </div>

//       {activeModel?.glbUrl ? (
//         <div className="relative z-10 h-full w-full">
//           <ModelViewer
//             glbUrl={activeModel.glbUrl}
//             modelName={activeModel.name}
//             generationTime={activeModel.generationTime}
//             fileSize={activeModel.fileSize}
//             vertexCount={activeModel.vertexCount}
//             faceCount={activeModel.faceCount}
//             seeInside={seeInside}
//             onToggleSeeInside={onToggleSeeInside}
//           />
//         </div>
//       ) : (
//         <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 text-center">
//           <motion.div
//             animate={{ y: [0, -4, 0], rotate: [0, 3, -3, 0] }}
//             transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
//             className="mb-4 inline-flex items-center justify-center rounded-2xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-3.5 text-white shadow-[0_4px_0_var(--foreground)]"
//           >
//             <IconCube3dSphere size={24} stroke={2.1} />
//           </motion.div>

//           <h1 className="text-xl font-extrabold tracking-tight text-foreground">
//             Ready For A New 3D Model?
//           </h1>
//           <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
//             Instantly generate 3D from image or text, or upload a model from the
//             right drawer.
//           </p>
//           {statusMessage && (
//             <p className="mt-3 rounded-xl border border-border bg-card/85 px-3 py-1.5 text-[11px] text-muted-foreground">
//               {statusMessage}
//             </p>
//           )}
//           <motion.button
//             type="button"
//             whileHover={{ y: -1.5 }}
//             whileTap={{ scale: 0.96, y: 1 }}
//             onClick={onFocusGenerator}
//             className="group mt-4 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-card px-4 py-2 text-xs font-extrabold text-foreground shadow-[0_3px_0_var(--foreground)] transition active:shadow-none"
//           >
//             <span className="inline-flex items-center justify-center rounded-full border border-foreground/75 bg-[var(--brand,#ff6b2c)] p-1 text-white">
//               <IconSparkles size={13} stroke={2.2} />
//             </span>
//             <span>Start from Prompt or Image</span>
//           </motion.button>
//         </div>
//       )}
//     </section>
//   );
// }

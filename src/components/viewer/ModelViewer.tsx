"use client";

import React, { Suspense, useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Stage,
  Grid,
  GizmoHelper,
  GizmoViewport,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Maximize2,
  RotateCw,
  Eye,
  Grid3X3,
  RefreshCw,
  Box,
  Layers,
  ZoomIn,
  Download,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface ModelViewerProps {
  glbUrl: string;
  modelName?: string;
  generationTime?: number;
  fileSize?: number;
  vertexCount?: number;
  faceCount?: number;
  onDownload?: () => void;
  seeInside?: boolean;
  onToggleSeeInside?: () => void;
  clippingPlane?: { axis: "x" | "y" | "z"; offset: number; enabled: boolean };
  explodedOffset?: number;
  rotationEuler?: [number, number, number];
  ghostComponents?: Array<{ name: string; size: [number, number, number]; position?: [number, number, number] }>;
  dimensionLabels?: Array<{ text: string; position: [number, number, number] }>;
}

function LoadedMesh({
  url,
  wireframe,
  seeInside,
  clippingPlane,
  explodedOffset,
  rotationEuler,
  onLoaded,
}: {
  url: string;
  wireframe: boolean;
  seeInside: boolean;
  clippingPlane?: { axis: "x" | "y" | "z"; offset: number; enabled: boolean };
  explodedOffset?: number;
  rotationEuler?: [number, number, number];
  onLoaded: (stats: { vertices: number; faces: number }) => void;
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { gl } = useThree();

  useEffect(() => {
    gl.localClippingEnabled = !!clippingPlane?.enabled;
  }, [gl, clippingPlane?.enabled]);

  const clipPlane = useMemo(() => {
    if (!clippingPlane?.enabled) return null;
    const normal =
      clippingPlane.axis === "x"
        ? new THREE.Vector3(1, 0, 0)
        : clippingPlane.axis === "y"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    return new THREE.Plane(normal, -clippingPlane.offset * 0.02);
  }, [clippingPlane]);

  useEffect(() => {
    let isCancelled = false;
    const loader = new GLTFLoader();

    loader.load(
      url,
      (gltf) => {
        if (isCancelled) return;
        const root = gltf.scene;

        let totalVerts = 0;
        let totalFaces = 0;

        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.geometry) {
              const geom = mesh.geometry;
              const pos = geom.getAttribute("position");
              if (pos) totalVerts += pos.count;
              if (geom.index) {
                totalFaces += geom.index.count / 3;
              } else if (pos) {
                totalFaces += pos.count / 3;
              }
            }

            if (mesh.material) {
              const materials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];

              materials.forEach((mat) => {
                if ("wireframe" in mat) {
                  (mat as any).wireframe = wireframe;
                }
                mat.side = THREE.DoubleSide;
                if (seeInside) {
                  mat.transparent = true;
                  mat.opacity = 0.35;
                  mat.depthWrite = false;
                } else {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.depthWrite = true;
                }
                if (mat instanceof THREE.MeshStandardMaterial) {
                  mat.roughness = 0.6;
                  mat.metalness = 0.1;
                }
                if (clipPlane) {
                  mat.clippingPlanes = [clipPlane];
                  mat.clipShadows = true;
                } else {
                  mat.clippingPlanes = [];
                }
              });
            }
          }
        });

        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 2.2 / maxDim : 1;

        root.position.x = -center.x * scale;
        root.position.y = -center.y * scale + (size.y * scale) / 2;
        root.position.z = -center.z * scale;
        root.scale.setScalar(scale);

        setScene(root);
        onLoaded({ vertices: totalVerts, faces: totalFaces });
      },
      undefined,
      (err) => {
        if (!isCancelled) {
          console.error("GLTF Load Error:", err);
          setError("Failed to load 3D GLB mesh.");
        }
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [url, onLoaded, clipPlane]);

  // Handle dynamic clipping plane updates
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((mat) => {
            mat.clippingPlanes = clipPlane ? [clipPlane] : [];
            mat.needsUpdate = true;
          });
        }
      }
    });
  }, [scene, clipPlane]);

  // Handle rotationEuler updates (e.g. rotate for best print)
  useEffect(() => {
    if (!scene) return;
    if (rotationEuler) {
      scene.rotation.set(
        (rotationEuler[0] * Math.PI) / 180,
        (rotationEuler[1] * Math.PI) / 180,
        (rotationEuler[2] * Math.PI) / 180
      );
    } else {
      scene.rotation.set(0, 0, 0);
    }
  }, [scene, rotationEuler]);

  // Handle exploded view offset
  useEffect(() => {
    if (!scene) return;
    const off = (explodedOffset || 0) * 0.008;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const name = (child.name || "").toLowerCase();
        if (name.includes("front")) {
          child.position.z = off;
        } else if (name.includes("back")) {
          child.position.z = -off;
        } else if (name.includes("left")) {
          child.position.x = -off;
        } else if (name.includes("right")) {
          child.position.x = off;
        } else if (name.includes("top")) {
          child.position.y = off;
        } else if (name.includes("bottom")) {
          child.position.y = -off;
        }
      }
    });
  }, [scene, explodedOffset]);

  // Update wireframe state dynamically
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((mat) => {
            if ("wireframe" in mat) {
              (mat as any).wireframe = wireframe;
            }
          });
        }
      }
    });
  }, [wireframe, scene]);

  if (error) {
    return (
      <Html center>
        <div className="flex items-center gap-2 px-3 py-2 bg-red-950/80 border border-red-700/60 rounded text-red-200 text-xs font-mono">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{error}</span>
        </div>
      </Html>
    );
  }

  if (!scene) {
    return (
      <Html center>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-graphite-900/90 border border-graphite-700 rounded text-graphite-200 text-xs font-mono shadow-xl backdrop-blur-sm">
          <Loader2 className="w-4 h-4 text-forge animate-spin" />
          <span>Rendering 3D mesh...</span>
        </div>
      </Html>
    );
  }

  return <primitive object={scene} />;
}

export default function ModelViewer({
  glbUrl,
  modelName = "3dme_model.glb",
  generationTime,
  fileSize,
  vertexCount,
  faceCount,
  onDownload,
  seeInside,
  onToggleSeeInside,
  clippingPlane,
  explodedOffset,
  rotationEuler,
  ghostComponents,
  dimensionLabels,
}: ModelViewerProps) {
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [internalSeeInside, setInternalSeeInside] = useState(false);

  const activeSeeInside = seeInside !== undefined ? seeInside : internalSeeInside;
  const [stats, setStats] = useState({
    vertices: vertexCount || 0,
    faces: faceCount || 0,
  });
  const controlsRef = useRef<any>(null);

  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  const formattedSize = useMemo(() => {
    if (!fileSize) return null;
    return fileSize > 1024 * 1024
      ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB`
      : `${(fileSize / 1024).toFixed(1)} KB`;
  }, [fileSize]);

  return (
    <div className="relative w-full h-full bg-graphite-950 select-none overflow-hidden flex flex-col">
      {/* Top Professional CAD/DCC Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-graphite-900/85 backdrop-blur-sm border-b border-graphite-800 text-xs font-mono">
        <div className="flex items-center gap-3 text-graphite-300">
          <div className="flex items-center gap-1.5 font-medium text-graphite-100">
            <Box className="w-3.5 h-3.5 text-forge" />
            <span className="truncate max-w-[200px]">{modelName}</span>
          </div>
          <span className="text-graphite-600">|</span>
          <span className="text-graphite-400">
            {stats.vertices ? `${stats.vertices.toLocaleString()} verts` : "--"}
          </span>
          <span className="text-graphite-600">·</span>
          <span className="text-graphite-400">
            {stats.faces ? `${stats.faces.toLocaleString()} tris` : "--"}
          </span>
          {formattedSize && (
            <>
              <span className="text-graphite-600">·</span>
              <span className="text-graphite-400">{formattedSize}</span>
            </>
          )}
          {generationTime && (
            <>
              <span className="text-graphite-600">·</span>
              <span className="text-emerald-400">{generationTime}s</span>
            </>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (onToggleSeeInside) {
                onToggleSeeInside();
              } else {
                setInternalSeeInside(!internalSeeInside);
              }
            }}
            title="Toggle See Inside / X-Ray"
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors border ${
              activeSeeInside
                ? "bg-forge/20 border-forge text-forge font-semibold"
                : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-graphite-200"
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>See Inside</span>
          </button>

          <button
            onClick={() => setWireframe(!wireframe)}
            title="Toggle Wireframe (W)"
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors border ${
              wireframe
                ? "bg-forge/20 border-forge text-forge"
                : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-graphite-200"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Wire</span>
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            title="Toggle Turntable Rotation (R)"
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors border ${
              autoRotate
                ? "bg-forge/20 border-forge text-forge"
                : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-graphite-200"
            }`}
          >
            <RotateCw className="w-3 h-3" />
            <span>Turntable</span>
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Ground Plane (G)"
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors border ${
              showGrid
                ? "bg-graphite-800 border-graphite-700 text-graphite-200"
                : "bg-graphite-850 border-graphite-750 text-graphite-500"
            }`}
          >
            <Grid3X3 className="w-3 h-3" />
            <span>Grid</span>
          </button>

          <button
            onClick={resetCamera}
            title="Reset Camera Framing"
            className="px-2 py-1 bg-graphite-850 border border-graphite-750 hover:border-graphite-700 text-graphite-300 hover:text-white rounded text-[11px] font-mono flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset</span>
          </button>

          {onDownload && (
            <button
              onClick={onDownload}
              title="Download Binary GLB"
              className="ml-2 px-2.5 py-1 bg-forge hover:bg-forge-hover text-graphite-950 font-semibold rounded text-[11px] font-mono flex items-center gap-1 transition-colors shadow-sm"
            >
              <Download className="w-3 h-3" />
              <span>Export GLB</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 3D Canvas Area */}
      <div className="flex-1 w-full h-full pt-8">
        <Canvas
          shadows
          camera={{ position: [0, 1.8, 3.2], fov: 45 }}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <color attach="background" args={["#0c0d11"]} />

          {/* Lighting Rig */}
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[4, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0001}
          />
          <directionalLight position={[-4, 3, -3]} intensity={0.4} />
          <pointLight position={[0, -2, 2]} intensity={0.3} />

          {/* Ground Grid */}
          {showGrid && (
            <Grid
              position={[0, 0, 0]}
              args={[12, 12]}
              cellSize={0.4}
              cellThickness={0.7}
              cellColor="#1c202a"
              sectionSize={2}
              sectionThickness={1.2}
              sectionColor="#293040"
              fadeDistance={10}
              fadeStrength={1.5}
            />
          )}

          {/* 3D Model Instance */}
          <Suspense fallback={null}>
            <LoadedMesh
              url={glbUrl}
              wireframe={wireframe}
              seeInside={activeSeeInside}
              clippingPlane={clippingPlane}
              explodedOffset={explodedOffset}
              rotationEuler={rotationEuler}
              onLoaded={(loadedStats) => {
                setStats({
                  vertices: loadedStats.vertices || vertexCount || 0,
                  faces: loadedStats.faces || faceCount || 0,
                });
              }}
            />

            {/* Ghost Component Bounding Boxes */}
            {ghostComponents && ghostComponents.length > 0 && (
              <group>
                {ghostComponents.map((item, idx) => {
                  const s = [
                    Math.max(0.1, item.size[0] * 0.015),
                    Math.max(0.1, item.size[2] * 0.015),
                    Math.max(0.1, item.size[1] * 0.015),
                  ] as [number, number, number];
                  const p = item.position
                    ? ([item.position[0] * 0.015, item.position[2] * 0.015, item.position[1] * 0.015] as [
                        number,
                        number,
                        number
                      ])
                    : ([0, 0.5, 0] as [number, number, number]);
                  return (
                    <group key={idx} position={p}>
                      <mesh>
                        <boxGeometry args={s} />
                        <meshBasicMaterial color="#ff7700" wireframe transparent opacity={0.65} />
                      </mesh>
                      <Html center position={[0, s[1] / 2 + 0.1, 0]}>
                        <div className="px-1.5 py-0.5 rounded bg-graphite-950/90 border border-forge/60 text-forge text-[9px] font-mono whitespace-nowrap shadow pointer-events-none">
                          {item.name}
                        </div>
                      </Html>
                    </group>
                  );
                })}
              </group>
            )}

            {/* Dimension Labels */}
            {dimensionLabels && dimensionLabels.length > 0 && (
              <group>
                {dimensionLabels.map((lbl, idx) => (
                  <Html
                    key={idx}
                    center
                    position={[
                      lbl.position[0] * 0.015,
                      lbl.position[2] * 0.015,
                      lbl.position[1] * 0.015,
                    ]}
                  >
                    <div className="px-1.5 py-0.5 rounded bg-graphite-900/95 border border-graphite-700 text-graphite-200 text-[9px] font-mono whitespace-nowrap shadow-sm pointer-events-none">
                      {lbl.text}
                    </div>
                  </Html>
                ))}
              </group>
            )}
          </Suspense>

          {/* Camera Controls */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            autoRotate={autoRotate}
            autoRotateSpeed={1.5}
            enableDamping
            dampingFactor={0.08}
            minDistance={0.5}
            maxDistance={12}
            target={[0, 0.7, 0]}
          />

          {/* Interactive Orientation Gizmo in bottom-right */}
          <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
            <GizmoViewport
              axisColors={["#e53e3e", "#38a169", "#3182ce"]}
              labelColor="#ffffff"
            />
          </GizmoHelper>
        </Canvas>
      </div>

      {/* Bottom Viewport Status Line */}
      <div className="absolute bottom-2 left-3 z-10 flex items-center gap-3 text-[10px] font-mono text-graphite-500 pointer-events-none">
        <span>LMB: Orbit</span>
        <span>·</span>
        <span>RMB / Shift+LMB: Pan</span>
        <span>·</span>
        <span>Wheel: Zoom</span>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import ModelViewer from "@/components/viewer/ModelViewer";
import CadSettingsModal from "@/components/cad/CadSettingsModal";
import FitTestModal, { FitTestSliceItem } from "@/components/cad/FitTestModal";
import DesignModeLeftPanel, {
  MissingMeasurementItem,
  DesignComponentItem,
} from "@/components/cad/DesignModeLeftPanel";
import DesignModeRightPanel, {
  RightPanelValidationIssue,
  RightPanelOverhangRec,
  RightPanelIteration,
} from "@/components/cad/DesignModeRightPanel";
import {
  Package,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Download,
  Plus,
  Trash2,
  RotateCcw,
  RotateCw,
  Box,
  Eye,
  Send,
  Loader2,
  Sliders,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Layers,
  Wrench,
  FolderOpen,
  Copy,
  Search,
  Edit2,
  Check,
  X,
  Ruler,
  Disc,
  Square,
  Camera,
  Upload,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Maximize2,
  HelpCircle,
  CheckCircle,
  Bot,
  Bookmark,
  Scissors,
} from "lucide-react";

// ================= TYPES & INTERFACES =================

interface MeasureChecklistItem {
  key: string;
  label: string;
  hint: string;
}

interface PhotoAnalysisResult {
  part_type: string;
  confidence: "low" | "medium" | "high";
  features: string[];
  measure_checklist: MeasureChecklistItem[];
  notes?: string;
  photo_ref?: string;
  default_measurements?: Record<string, number>;
}

interface ComponentItem {
  id: string;
  name: string;
  size: [number, number, number];
  qty: number;
  note?: string;
  screen?: { w: number; h: number; x: number; z: number };
}

interface WindowFeature {
  id: string;
  name?: string;
  face: "front" | "back" | "left" | "right" | "top" | "bottom";
  shape: "rect" | "round";
  w: number;
  h: number;
  d?: number;
  x: number;
  z: number;
  corner_radius?: number;
}

interface AppendageFeature {
  id: string;
  name?: string;
  type: "cone" | "capsule" | "ball" | "cylinder";
  face: "top" | "bottom" | "left" | "right" | "front" | "back";
  x: number;
  z: number;
  y?: number;
  base_d: number;
  tip_d: number;
  length: number;
  tilt_deg: number;
  mirror: boolean;
  ball_tip?: boolean;
  ball_d?: number;
}

interface PartMeasurement {
  length?: number;
  width?: number;
  thickness?: number;
  corner_radius?: number;
  leg1?: number;
  leg2?: number;
  fillet?: number;
  outer_d?: number;
  inner_d?: number;
  height?: number;
  gap?: number;
  [key: string]: number | undefined;
}

interface PartFeature {
  id: string;
  type: "hole" | "linear_pattern" | "slot";
  x?: number;
  y?: number;
  d?: number;
  count?: number;
  pitch?: number;
  leg?: "leg1" | "leg2";
  axis?: "x" | "y";
  length?: number;
  width?: number;
}

interface CadSpec {
  mode?: "enclosure" | "part" | "robot" | "design";
  part_type?: string;
  measurements?: PartMeasurement;
  features?: PartFeature[];
  body?: { shape: string; corner_radius: number };
  inner?: [number, number, number];
  wall?: number;
  corner_radius?: number;
  split?: string;
  components?: any[];
  windows?: WindowFeature[];
  appendages?: AppendageFeature[];
  standoffs?: any[];
  cutouts?: any[];
  project_id?: string;
  analysis_result?: PhotoAnalysisResult;
  reference_photo?: string;
  // Robot Assembly fields
  overall_height_mm?: number;
  parts?: any[];
  joints?: any[];
  print?: {
    orientation_hints?: Record<string, string>;
  };
}

interface ComponentLibraryItem {
  id: string;
  name: string;
  category: "board" | "display" | "servo" | "battery" | "connector" | "custom";
  size: [number, number, number];
  mount_holes?: Array<{ x: number; y: number; d: number }>;
  screen?: { w: number; h: number; x: number; z: number };
  ports?: Array<{ face: string; x: number; z: number; w: number; h: number }>;
  tags?: string[];
  notes?: string;
  source: "measured" | "approximate" | "datasheet";
  created?: string;
  updated?: string;
}

interface BoardOption {
  id: string;
  key: string;
  name: string;
  category?: string;
  size: [number, number, number];
  note?: string;
  source?: "measured" | "approximate" | "datasheet";
  screen?: { w: number; h: number; x: number; z: number };
}

interface Issue {
  level: "error" | "warn" | "info";
  msg: string;
}

interface BuildResult {
  id: string;
  issues: Issue[];
  files: {
    part_step?: string;
    part_stl?: string;
    part_glb?: string;
    shell_step?: string;
    shell_stl?: string;
    shell_glb?: string;
    cover_step?: string;
    cover_stl?: string;
    cover_glb?: string;
    both_glb?: string;
    ghost_glb?: string;
    base_glb?: string;
    lid_glb?: string;
    base_step?: string;
    base_stl?: string;
    lid_step?: string;
    lid_stl?: string;
    // Multi-part robot exports
    assembled_glb?: string;
    exploded_glb?: string;
    all_zip?: string;
    head_front_step?: string;
    head_front_stl?: string;
    head_front_glb?: string;
    head_back_step?: string;
    head_back_stl?: string;
    head_back_glb?: string;
    body_front_step?: string;
    body_front_stl?: string;
    body_front_glb?: string;
    body_back_step?: string;
    body_back_stl?: string;
    body_back_glb?: string;
    neck_step?: string;
    neck_stl?: string;
    neck_glb?: string;
    arm_left_step?: string;
    arm_left_stl?: string;
    arm_left_glb?: string;
    arm_right_step?: string;
    arm_right_stl?: string;
    arm_right_glb?: string;
    ear_left_step?: string;
    ear_left_stl?: string;
    ear_left_glb?: string;
    ear_right_step?: string;
    ear_right_stl?: string;
    ear_right_glb?: string;
    [key: string]: string | undefined;
  };
}

interface ProjectSummary {
  id: string;
  name: string;
  created: string;
  updated: string;
  thumbnail?: string | null;
  mode?: "enclosure" | "part" | "robot" | "design";
  part_type?: string;
  last_build_id?: string;
  reference_photo?: string | null;
}

// ================= DEFAULT CONSTANTS =================

const defaultEnclosureSpec: CadSpec = {
  mode: "enclosure",
  body: { shape: "rounded_box", corner_radius: 12.0 },
  inner: [75.2, 55.2, 50.2],
  wall: 2.4,
  corner_radius: 12.0,
  split: "back",
  components: [
    { id: "esp32", name: "ESP32 DevKit", size: [51.5, 28.5, 13.0], qty: 1 },
    {
      id: "oled",
      name: "0.96in OLED SSD1306",
      size: [27.3, 27.8, 4.0],
      qty: 1,
      note: "verify with calipers",
    },
  ],
  windows: [
    {
      id: "front_win",
      name: "Screen Window",
      face: "front",
      shape: "rect",
      w: 50.0,
      h: 38.0,
      x: 0.0,
      z: 0.0,
      corner_radius: 6.0,
    },
    {
      id: "bottom_hole",
      name: "Bottom Port",
      face: "front",
      shape: "round",
      w: 3.0,
      h: 3.0,
      x: 0.0,
      z: -20.0,
    },
  ],
  appendages: [
    {
      id: "ears",
      name: "Cat Ears",
      type: "cone",
      face: "top",
      x: 20.0,
      z: 0.0,
      base_d: 16.0,
      tip_d: 3.0,
      length: 22.0,
      tilt_deg: 10.0,
      mirror: true,
    },
    {
      id: "arms",
      name: "Stubby Arms",
      type: "cone",
      face: "left",
      x: 0.0,
      z: 0.0,
      base_d: 12.0,
      tip_d: 8.0,
      length: 22.0,
      tilt_deg: 0.0,
      mirror: true,
    },
  ],
};

const defaultPartMeasurementsMap: Record<string, PartMeasurement> = {
  bracket: { leg1: 40.0, leg2: 25.0, width: 25.0, thickness: 3.0, fillet: 2.0 },
  plate: { length: 60.0, width: 40.0, thickness: 3.0, corner_radius: 0.0 },
  mounting_plate: { length: 70.0, width: 50.0, thickness: 3.0, corner_radius: 2.0 },
  spacer: { outer_d: 12.0, inner_d: 4.2, height: 15.0 },
  clip: { outer_d: 26.0, inner_d: 20.0, height: 10.0, gap: 4.0 },
};

const defaultPartFeaturesMap: Record<string, PartFeature[]> = {
  bracket: [
    { id: "pat_1", type: "linear_pattern", count: 2, pitch: 30.0, d: 3.4, leg: "leg1" },
  ],
  plate: [
    { id: "hole_1", type: "hole", x: -15.0, y: 0.0, d: 3.4 },
    { id: "hole_2", type: "hole", x: 15.0, y: 0.0, d: 3.4 },
  ],
  mounting_plate: [
    { id: "pat_mp", type: "linear_pattern", count: 2, pitch: 40.0, d: 3.4, axis: "x" },
  ],
  spacer: [],
  clip: [],
};

const defaultChecklistsByType: Record<string, MeasureChecklistItem[]> = {
  bracket: [
    { key: "leg1", label: "Bottom Leg Length", hint: "Outer corner to end of bottom leg" },
    { key: "leg2", label: "Upright Leg Height", hint: "Outer bottom to top of vertical leg" },
    { key: "width", label: "Bracket Width", hint: "Width across both legs" },
    { key: "thickness", label: "Wall Thickness", hint: "Material thickness of bracket walls" },
    { key: "fillet", label: "Inside Fillet Radius", hint: "Curvature at inside corner (default 2 mm)" },
  ],
  plate: [
    { key: "length", label: "Plate Length", hint: "Overall length of plate (longest dimension)" },
    { key: "width", label: "Plate Width", hint: "Overall width of plate" },
    { key: "thickness", label: "Plate Thickness", hint: "Material thickness" },
    { key: "corner_radius", label: "Corner Radius", hint: "Corner rounding (0 for square)" },
  ],
  mounting_plate: [
    { key: "length", label: "Mounting Plate Length", hint: "Total length along X" },
    { key: "width", label: "Mounting Plate Width", hint: "Total width along Y" },
    { key: "thickness", label: "Plate Thickness", hint: "Material thickness" },
    { key: "corner_radius", label: "Corner Radius", hint: "Corner rounding (0 for square)" },
  ],
  spacer: [
    { key: "outer_d", label: "Outer Diameter", hint: "Outside diameter of spacer body" },
    { key: "inner_d", label: "Inner Diameter / Through-Hole", hint: "Clearance hole diameter for screw/bolt" },
    { key: "height", label: "Spacer Height / Standoff Length", hint: "Total length along axis" },
  ],
  clip: [
    { key: "outer_d", label: "Outer Diameter", hint: "Outside diameter of ring" },
    { key: "inner_d", label: "Inner Diameter", hint: "Inside diameter gripping shaft or cable" },
    { key: "height", label: "Clip Height", hint: "Thickness / width along ring axis" },
    { key: "gap", label: "Opening Gap", hint: "Width of opening slot" },
  ],
};

const requiredMeasurementKeys: Record<string, string[]> = {
  bracket: ["leg1", "leg2", "width", "thickness"],
  plate: ["length", "width", "thickness"],
  mounting_plate: ["length", "width", "thickness"],
  spacer: ["outer_d", "inner_d", "height"],
  clip: ["outer_d", "inner_d", "height"],
};

const defaultRobotSpec: CadSpec = {
  mode: "robot",
  overall_height_mm: 120.0,
  wall: 2.0,
  parts: [
    {
      id: "head",
      kind: "head",
      name: "Head",
      w: 64.0,
      h: 54.0,
      d: 54.0,
      roundness: 0.8,
      corner_radius: 16.0,
      wall: 2.0,
      split: "front_back",
      display: {
        name: "0.96in OLED SSD1306",
        size: [27.3, 27.8, 4.0],
        active_area: [22.0, 11.0],
        shape: "rect",
        offset: [0.0, 0.0],
        ledge: 1.5,
      },
    },
    {
      id: "body",
      kind: "body",
      name: "Body",
      w: 68.0,
      h: 54.0,
      d: 54.0,
      shape: "egg",
      top_radius: 24.0,
      bottom_radius: 32.0,
      wall: 2.0,
      split: "front_back",
      has_speaker_holes: true,
      has_usb_cutout: true,
    },
    {
      id: "neck",
      kind: "neck",
      name: "Neck Collar",
      outer_d: 24.0,
      inner_d: 16.0,
      height: 8.0,
      cable_hole_d: 12.0,
      lip: 1.5,
    },
    {
      id: "arm",
      kind: "arm",
      name: "Arms",
      length: 34.0,
      base_d: 14.0,
      tip_d: 10.0,
      joint_mode: "fixed",
      mirror: true,
      wall: 2.0,
    },
    {
      id: "ear_pod",
      kind: "ear_pod",
      name: "Ear Pods",
      w: 18.0,
      h: 18.0,
      d: 6.0,
      peg_d: 4.0,
      peg_length: 4.8,
      mirror: true,
    },
  ],
  components: [
    {
      id: "comp_oled",
      name: "0.96in OLED SSD1306",
      size: [27.3, 27.8, 4.0],
      qty: 1,
    },
    {
      id: "comp_xiao",
      name: "Seeed XIAO ESP32-C3",
      size: [21.0, 17.5, 5.0],
      qty: 1,
    },
    {
      id: "comp_battery",
      name: "18650 Li-ion Cell",
      size: [66.0, 18.5, 18.5],
      qty: 1,
    },
  ],
  joints: [
    { kind: "lip", clearance: 0.2 },
    { kind: "neck_collar", clearance: 0.2 },
    { kind: "peg_socket", clearance: 0.2, peg_d: 4.0, socket_d: 4.4 },
    { kind: "arm_mount", clearance: 0.2, mode: "fixed" },
  ],
  print: {
    orientation_hints: {
      head_front: "Place face down or parting plane down on build plate.",
      head_back: "Place back dome down or parting plane flat.",
      body_front: "Place parting plane flat on build plate.",
      body_back: "Place parting plane flat on build plate.",
      neck: "Print standing vertically on collar base (no supports needed).",
      arm: "Print flat with parting line parallel to build plate.",
      ear_pod: "Print flat with peg pointing upward.",
    },
  },
};

const displayPresetsMap: Record<
  string,
  { name: string; size: [number, number, number]; active: [number, number]; shape: "rect" | "round" }
> = {
  "0.96in OLED": {
    name: "0.96in OLED SSD1306",
    size: [27.3, 27.8, 4.0],
    active: [22.0, 11.0],
    shape: "rect",
  },
  "1.3in OLED": {
    name: "1.3in OLED SH1106",
    size: [35.4, 33.5, 4.0],
    active: [29.4, 14.7],
    shape: "rect",
  },
  "1.28in round GC9A01": {
    name: "1.28in Round GC9A01",
    size: [38.0, 38.0, 4.2],
    active: [32.4, 32.4],
    shape: "round",
  },
  Custom: {
    name: "Custom Display",
    size: [30.0, 30.0, 4.0],
    active: [24.0, 20.0],
    shape: "rect",
  },
};

const robotViewOptions = [
  { key: "assembled", label: "Assembled Robot" },
  { key: "exploded", label: "Exploded View" },
  { key: "ghost", label: "Ghost Internal View" },
  { key: "head_front", label: "Head Front" },
  { key: "head_back", label: "Head Back" },
  { key: "body_front", label: "Body Front" },
  { key: "body_back", label: "Body Back" },
  { key: "neck", label: "Neck Collar" },
  { key: "arm_left", label: "Arm Left" },
  { key: "arm_right", label: "Arm Right" },
  { key: "ear_left", label: "Ear Pod Left" },
  { key: "ear_right", label: "Ear Pod Right" },
];

// ================= MAIN COMPONENT =================

export default function CadStudioPage() {
  // Mode switcher: "enclosure", "part", "robot", or "design"
  const [cadMode, setCadMode] = useState<"enclosure" | "part" | "robot" | "design">("enclosure");

  // Settings & Brain State (Phase 7)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [designBrain, setDesignBrain] = useState<"local">("local");

  // Design Mode (Phase 7) State
  const [designPrompt, setDesignPrompt] = useState<string>(
    "Cat head desktop companion with 0.96in OLED screen window on the front face, two cone ears on top, two tapered arms on the sides, and a small round hole at the bottom front"
  );
  const [designPhotoUrl, setDesignPhotoUrl] = useState<string | null>(null);
  const [detectedFeatures, setDetectedFeatures] = useState<Array<{ key: string; label: string; detected: boolean }>>([
    { key: "body", label: "main body", detected: true },
    { key: "window", label: "front window", detected: true },
    { key: "ears", label: "cone ears", detected: true },
    { key: "arms", label: "side arms", detected: true },
    { key: "hole", label: "bottom hole", detected: true },
  ]);
  const [designComponents, setDesignComponents] = useState<DesignComponentItem[]>([
    {
      id: "oled_096",
      name: "0.96in OLED SSD1306",
      size: [27.3, 27.8, 4.0],
      anchor: "front face",
      source: "approximate",
    },
  ]);
  const [missingMeasurements, setMissingMeasurements] = useState<MissingMeasurementItem[]>([]);
  const [missingValues, setMissingValues] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qPrompt = params.get("prompt");
      if (qPrompt && qPrompt.trim()) {
        setDesignPrompt(qPrompt.trim());
        setCadMode("design");
      }
    }
  }, []);
  const [isDesigning, setIsDesigning] = useState(false);
  const [designProgressText, setDesignProgressText] = useState("");
  const [designValidation, setDesignValidation] = useState<{
    valid: boolean;
    errors: RightPanelValidationIssue[];
    warnings: RightPanelValidationIssue[];
    infos: RightPanelValidationIssue[];
  }>({
    valid: true,
    errors: [],
    warnings: [],
    infos: [],
  });
  const [designOverhangs, setDesignOverhangs] = useState<Record<string, RightPanelOverhangRec>>({});
  const [designIterations, setDesignIterations] = useState<RightPanelIteration[]>([]);
  const [designParts, setDesignParts] = useState<string[]>([]);
  const [designFiles, setDesignFiles] = useState<Record<string, { stl?: string; step?: string; glb?: string }>>({});
  const [selectedDesignPart, setSelectedDesignPart] = useState<string>("assembled");
  const [clippingPlane, setClippingPlane] = useState<{ axis: "x" | "y" | "z"; offset: number; enabled: boolean }>({
    axis: "y",
    offset: 0,
    enabled: false,
  });
  const [explodedOffset, setExplodedOffset] = useState<number>(0);
  const [previewRotationEuler, setPreviewRotationEuler] = useState<[number, number, number] | undefined>(undefined);
  const [fitTestSlices, setFitTestSlices] = useState<FitTestSliceItem[]>([]);
  const [isFitTestModalOpen, setIsFitTestModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Project management state
  const [projectId, setProjectId] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isProjectsDrawerOpen, setIsProjectsDrawerOpen] = useState(false);
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Part Library State
  const [componentLibrary, setComponentLibrary] = useState<ComponentLibraryItem[]>([]);
  const [isLibraryDrawerOpen, setIsLibraryDrawerOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState<string>("All");
  const [isEditingComponent, setIsEditingComponent] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Partial<ComponentLibraryItem> | null>(null);
  const [isSavingComponent, setIsSavingComponent] = useState(false);
  const [libraryDeleteConfirmId, setLibraryDeleteConfirmId] = useState<string | null>(null);
  const [saveToLibStatus, setSaveToLibStatus] = useState<string | null>(null);
  const libraryFileInputRef = useRef<HTMLInputElement>(null);

  // Layout sidebar visibility toggles
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Photo-to-Part & Photo-to-Robot State
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<{ message: string; pullCmd?: string } | null>(null);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [referencePhotoUrl, setReferencePhotoUrl] = useState<string | null>(null);
  const [isReferencePanelOpen, setIsReferencePanelOpen] = useState(true);
  const [referenceZoom, setReferenceZoom] = useState<number>(100);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0);
  const [isScaleHelperOpen, setIsScaleHelperOpen] = useState(false);
  const [scaleTargetKey, setScaleTargetKey] = useState<string>("leg1");
  const [scaleTargetLabel, setScaleTargetLabel] = useState<string>("Bottom Leg Length");
  const [scaleRefObject, setScaleRefObject] = useState<"us_quarter" | "euro_1" | "euro_2" | "credit_card" | "ruler_mm">("us_quarter");
  const [scaleCustomMm, setScaleCustomMm] = useState<number>(25.0);
  const [scalePoints, setScalePoints] = useState<Array<[number, number]>>([]);
  const [scaleEstimateResult, setScaleEstimateResult] = useState<{
    estimated_mm: number;
    confidence: string;
    warning: string;
  } | null>(null);
  const [isCalculatingScale, setIsCalculatingScale] = useState(false);
  const [scaleCalcError, setScaleCalcError] = useState<string | null>(null);
  const [estimatedFields, setEstimatedFields] = useState<Record<string, boolean>>({});
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Enclosure Design Spec
  const [enclosureSpec, setEnclosureSpec] = useState<CadSpec>(defaultEnclosureSpec);

  // Robot Assembly State
  const [robotSpec, setRobotSpec] = useState<CadSpec>(defaultRobotSpec);
  const [robotOverallHeight, setRobotOverallHeight] = useState<number>(120.0);
  const [robotWall, setRobotWall] = useState<number>(2.0);
  const [selectedDisplayPreset, setSelectedDisplayPreset] = useState<string>("0.96in OLED");
  const [displaySizeL, setDisplaySizeL] = useState<number>(27.3);
  const [displaySizeW, setDisplaySizeW] = useState<number>(27.8);
  const [displaySizeT, setDisplaySizeT] = useState<number>(4.0);
  const [displayActiveW, setDisplayActiveW] = useState<number>(22.0);
  const [displayActiveH, setDisplayActiveH] = useState<number>(11.0);
  const [displayOffsetX, setDisplayOffsetX] = useState<number>(0.0);
  const [displayOffsetZ, setDisplayOffsetZ] = useState<number>(0.0);
  const [displayShape, setDisplayShape] = useState<"rect" | "round">("rect");
  const [robotArmMode, setRobotArmMode] = useState<"fixed" | "servo">("fixed");
  const [activeRobotPartTab, setActiveRobotPartTab] = useState<string>("assembled");
  const [showDimensionLabels, setShowDimensionLabels] = useState<boolean>(true);
  const [expandedRobotCard, setExpandedRobotCard] = useState<string | null>("head");

  // Robot Photo Boxes & Screen Detection
  const [robotBoxes, setRobotBoxes] = useState<Array<{ id: string; label: string; box: [number, number, number, number] }>>([
    { id: "head", label: "Head", box: [0.20, 0.08, 0.80, 0.48] },
    { id: "body", label: "Body", box: [0.22, 0.48, 0.78, 0.88] },
    { id: "arm_left", label: "Arm Left", box: [0.08, 0.48, 0.22, 0.76] },
    { id: "arm_right", label: "Arm Right", box: [0.78, 0.48, 0.92, 0.76] },
    { id: "ear_left", label: "Ear Left", box: [0.10, 0.18, 0.22, 0.36] },
    { id: "ear_right", label: "Ear Right", box: [0.78, 0.18, 0.90, 0.36] },
  ]);
  const [robotDisplayBox, setRobotDisplayBox] = useState<[number, number, number, number]>([0.35, 0.18, 0.65, 0.35]);
  const [isScreenConfirmed, setIsScreenConfirmed] = useState<boolean>(false);
  const [draggingBoxId, setDraggingBoxId] = useState<string | null>(null);

  // Replacement Part State
  const [partType, setPartType] = useState<"bracket" | "plate" | "mounting_plate" | "spacer" | "clip">("bracket");
  const [partMeasurements, setPartMeasurements] = useState<PartMeasurement>(defaultPartMeasurementsMap.bracket);
  const [partFeatures, setPartFeatures] = useState<PartFeature[]>(defaultPartFeaturesMap.bracket);

  // Feature creation form modal/card state
  const [showAddFeature, setShowAddFeature] = useState(false);
  const [newFeatureType, setNewFeatureType] = useState<"hole" | "linear_pattern">("hole");
  const [newHoleX, setNewHoleX] = useState<string>("15.0");
  const [newHoleY, setNewHoleY] = useState<string>("0.0");
  const [newHoleD, setNewHoleD] = useState<string>("3.4");
  const [newPatCount, setNewPatCount] = useState<string>("2");
  const [newPatPitch, setNewPatPitch] = useState<string>("30.0");
  const [newPatD, setNewPatD] = useState<string>("3.4");
  const [newPatLeg, setNewPatLeg] = useState<"leg1" | "leg2">("leg1");

  // Session & Version History
  const [sessionId, setSessionId] = useState<string>("");
  const [version, setVersion] = useState<number>(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [diffLog, setDiffLog] = useState<string[]>(["Initial CAD workspace"]);

  // Prompt inputs
  const [initialPrompt, setInitialPrompt] = useState(
    "Cat-style head case for an ESP32 and a 0.96in OLED, big window for the screen, stubby arms, small hole at the bottom front"
  );
  const [editPrompt, setEditPrompt] = useState("");

  // Component library chips
  const [libraryBoards, setLibraryBoards] = useState<BoardOption[]>([]);

  // Feasibility & Check state
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  // Status flags
  const [isPlanning, setIsPlanning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Viewer options & build result
  const [activeTab, setActiveTab] = useState<"assembled" | "shell" | "cover">("assembled");
  const [seeInside, setSeeInside] = useState(true);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);

  // Missing required measurements check
  const hasMissingRequiredMeasurements = useCallback(() => {
    if (cadMode !== "part") return false;
    const reqKeys = requiredMeasurementKeys[partType] || ["length", "width", "thickness"];
    return reqKeys.some((k) => {
      const val = (partMeasurements as any)[k];
      return val === undefined || val === null || val <= 0;
    });
  }, [cadMode, partType, partMeasurements]);

  // Compute full active spec based on active mode
  const getActiveSpec = useCallback((): CadSpec => {
    if (cadMode === "robot") {
      const updatedParts = (robotSpec.parts || []).map((p: any) => {
        if (p.kind === "head") {
          return {
            ...p,
            display: {
              ...p.display,
              name:
                selectedDisplayPreset === "Custom"
                  ? "Custom Display"
                  : displayPresetsMap[selectedDisplayPreset]?.name || "0.96in OLED SSD1306",
              size: [displaySizeL, displaySizeW, displaySizeT],
              active_area: [displayActiveW, displayActiveH],
              shape: displayShape,
              offset: [displayOffsetX, displayOffsetZ],
              ledge: 1.5,
            },
          };
        }
        if (p.kind === "arm") {
          return {
            ...p,
            joint_mode: robotArmMode,
          };
        }
        return p;
      });

      return {
        ...robotSpec,
        mode: "robot",
        overall_height_mm: robotOverallHeight,
        wall: robotWall,
        parts: updatedParts,
        project_id: projectId || undefined,
        reference_photo: referencePhotoUrl || undefined,
      };
    } else if (cadMode === "part") {
      return {
        mode: "part",
        part_type: partType,
        measurements: partMeasurements,
        features: partFeatures,
        corner_radius: partMeasurements.corner_radius || 0.0,
        project_id: projectId || undefined,
        analysis_result: photoAnalysis || undefined,
        reference_photo: referencePhotoUrl || undefined,
      };
    } else {
      return {
        ...enclosureSpec,
        mode: "enclosure",
        project_id: projectId || undefined,
      };
    }
  }, [
    cadMode,
    robotSpec,
    robotOverallHeight,
    robotWall,
    selectedDisplayPreset,
    displaySizeL,
    displaySizeW,
    displaySizeT,
    displayActiveW,
    displayActiveH,
    displayOffsetX,
    displayOffsetZ,
    displayShape,
    robotArmMode,
    partType,
    partMeasurements,
    partFeatures,
    enclosureSpec,
    projectId,
    photoAnalysis,
    referencePhotoUrl,
  ]);

  // Load part library
  const loadComponentLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/engine/cad/library");
      if (res.ok) {
        const data: ComponentLibraryItem[] = await res.json();
        setComponentLibrary(data);
        const boards: BoardOption[] = data.map((item) => ({
          id: item.id,
          key: item.id,
          name: item.name,
          category: item.category,
          size: item.size,
          note: item.notes,
          source: item.source,
          screen: item.screen,
        }));
        setLibraryBoards(boards);
      }
    } catch (err) {
      console.warn("Could not load component library:", err);
    }
  }, []);

  // Handle Save / Add Component to Library
  const handleSaveComponent = async (comp: Partial<ComponentLibraryItem>) => {
    if (!comp.name || !comp.size || comp.size.length !== 3) {
      alert("Please provide a valid component name and 3 dimensions [L, W, H].");
      return;
    }
    for (const d of comp.size) {
      if (d < 0.5 || d > 400.0) {
        alert(`Dimension ${d} mm must be between 0.5 and 400.0 mm.`);
        return;
      }
    }

    setIsSavingComponent(true);
    try {
      const isUpdate = Boolean(comp.id && componentLibrary.some((c) => c.id === comp.id));
      const targetId = comp.id || comp.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
      const payload = {
        ...comp,
        id: targetId,
        category: comp.category || "custom",
        source: comp.source || "measured",
      };

      const url = isUpdate
        ? `/api/engine/cad/library/${targetId}`
        : `/api/engine/cad/library`;
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await loadComponentLibrary();
        setIsEditingComponent(false);
        setEditingComponent(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to save component to library.");
      }
    } catch (err) {
      console.error("Save component error:", err);
      alert("Network error saving component.");
    } finally {
      setIsSavingComponent(false);
    }
  };

  // Handle Delete Component from Library
  const handleDeleteComponent = async (id: string) => {
    try {
      const res = await fetch(`/api/engine/cad/library/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLibraryDeleteConfirmId(null);
        await loadComponentLibrary();
      } else {
        alert("Could not delete component.");
      }
    } catch (err) {
      console.error("Delete component error:", err);
    }
  };

  // Handle Duplicate Component
  const handleDuplicateComponent = (item: ComponentLibraryItem) => {
    const clone: Partial<ComponentLibraryItem> = {
      ...item,
      id: `${item.id}_copy`,
      name: `${item.name} (Copy)`,
      created: undefined,
      updated: undefined,
    };
    setEditingComponent(clone);
    setIsEditingComponent(true);
  };

  // Handle Export Library
  const handleExportLibrary = async () => {
    try {
      const res = await fetch("/api/engine/cad/library/export");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "components.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export library error:", err);
    }
  };

  // Handle Import Library
  const handleImportLibraryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/engine/cad/library/import", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const info = await res.json();
        alert(`Imported ${info.imported || 0} new, updated ${info.updated || 0} components.`);
        await loadComponentLibrary();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to import components.");
      }
    } catch (err) {
      console.error("Import error:", err);
      alert("Error uploading library JSON.");
    } finally {
      if (libraryFileInputRef.current) libraryFileInputRef.current.value = "";
    }
  };

  // Quick Save Custom Component to Library
  const handleSaveCustomComponentToLibrary = async (
    name: string,
    size: [number, number, number],
    category: ComponentLibraryItem["category"] = "custom",
    notes?: string,
    screen?: any
  ) => {
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
    const item: Partial<ComponentLibraryItem> = {
      id,
      name,
      category,
      size,
      notes: notes || "Measured component from design",
      source: "measured",
      screen: screen || undefined,
    };
    try {
      const res = await fetch("/api/engine/cad/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        setSaveToLibStatus(`Saved '${name}' to library!`);
        setTimeout(() => setSaveToLibStatus(null), 3000);
        await loadComponentLibrary();
      } else {
        // If already exists, update it
        const putRes = await fetch(`/api/engine/cad/library/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (putRes.ok) {
          setSaveToLibStatus(`Updated '${name}' in library!`);
          setTimeout(() => setSaveToLibStatus(null), 3000);
          await loadComponentLibrary();
        }
      }
    } catch (err) {
      console.error("Save to library error:", err);
    }
  };

  // Load projects list
  const loadProjectsList = useCallback(async () => {
    try {
      const res = await fetch("/api/engine/cad/projects");
      if (res.ok) {
        const list: ProjectSummary[] = await res.json();
        setProjectsList(list);
      }
    } catch (err) {
      console.warn("Could not load projects list:", err);
    }
  }, []);

  // Fetch boards & library on mount & load initial project
  useEffect(() => {
    async function init() {
      await loadComponentLibrary();

      // Load projects
      try {
        const pRes = await fetch("/api/engine/cad/projects");
        if (pRes.ok) {
          const list: ProjectSummary[] = await pRes.json();
          setProjectsList(list);
          if (list.length > 0) {
            handleOpenProject(list[0].id);
          } else {
            // Create default initial project
            handleCreateProject("enclosure");
          }
        }
      } catch (err) {
        console.warn("Could not init project:", err);
      }
    }
    init();
  }, []);

  // Debounced feasibility check (350ms)
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const triggerCheck = useCallback(async (currentSpec: CadSpec) => {
    setIsChecking(true);
    try {
      const res = await fetch("/api/engine/cad/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentSpec),
      });
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
      }
    } catch (err) {
      console.error("Feasibility check failed:", err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const cur = getActiveSpec();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerCheck(cur);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [getActiveSpec, triggerCheck]);

  // Debounced autosave
  const autosaveRef = useRef<NodeJS.Timeout | null>(null);
  const triggerAutosave = useCallback(
    (currentProjId: string, name: string, currentSpec: CadSpec, history: any[], buildId?: string) => {
      if (!currentProjId) return;
      setSaveStatus("saving");
      if (autosaveRef.current) clearTimeout(autosaveRef.current);

      autosaveRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/engine/cad/projects/${currentProjId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              spec: currentSpec,
              version_history: history,
              last_build_id: buildId || undefined,
            }),
          });
          if (res.ok) {
            setSaveStatus("saved");
            loadProjectsList();
          } else {
            setSaveStatus("unsaved");
          }
        } catch (err) {
          console.warn("Autosave error:", err);
          setSaveStatus("unsaved");
        }
      }, 700);
    },
    [loadProjectsList]
  );

  // Capture canvas thumbnail after build
  const captureThumbnail = async (pId: string) => {
    if (!pId) return;
    try {
      await new Promise((r) => setTimeout(r, 600));
      const canvas = document.querySelector("canvas");
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl && dataUrl.length > 100) {
          await fetch(`/api/engine/cad/projects/${pId}/thumbnail`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_base64: dataUrl }),
          });
          loadProjectsList();
        }
      }
    } catch (err) {
      console.warn("Thumbnail capture error:", err);
    }
  };

  // Create Project
  const handleCreateProject = async (targetMode: "enclosure" | "part" | "robot" | "design" = "enclosure") => {
    try {
      const defaultName =
        targetMode === "design"
          ? "AI Design Companion"
          : targetMode === "robot"
          ? "Desktop Robot Assembly"
          : targetMode === "part"
          ? "New Replacement Part"
          : "New Enclosure Design";
      const newSpec: CadSpec =
        targetMode === "design"
          ? { mode: "design" }
          : targetMode === "robot"
          ? defaultRobotSpec
          : targetMode === "part"
          ? {
              mode: "part",
              part_type: "bracket",
              measurements: defaultPartMeasurementsMap.bracket,
              features: defaultPartFeaturesMap.bracket,
            }
          : defaultEnclosureSpec;

      const res = await fetch("/api/engine/cad/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: defaultName,
          spec: newSpec,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProjectId(data.id);
        setProjectName(data.name);
        setCadMode(targetMode);
        if (targetMode === "design") {
          setDesignValidation({ valid: true, errors: [], warnings: [], infos: [] });
          setDesignOverhangs({});
          setDesignIterations([]);
          setDesignParts([]);
          setDesignFiles({});
          setSelectedDesignPart("assembled");
          setMissingMeasurements([]);
        } else if (targetMode === "robot") {
          setRobotSpec(defaultRobotSpec);
          setRobotOverallHeight(120.0);
          setRobotWall(2.0);
          setSelectedDisplayPreset("0.96in OLED");
          setDisplaySizeL(27.3);
          setDisplaySizeW(27.8);
          setDisplaySizeT(4.0);
          setDisplayActiveW(22.0);
          setDisplayActiveH(11.0);
          setDisplayOffsetX(0.0);
          setDisplayOffsetZ(0.0);
          setDisplayShape("rect");
          setRobotArmMode("fixed");
        } else if (targetMode === "part") {
          setPartType("bracket");
          setPartMeasurements(defaultPartMeasurementsMap.bracket);
          setPartFeatures(defaultPartFeaturesMap.bracket);
        } else {
          setEnclosureSpec(newSpec);
        }
        setSessionId("");
        setVersion(1);
        setCanUndo(false);
        setCanRedo(false);
        setDiffLog([`Created ${data.name}`]);
        setBuildResult(null);
        setReferencePhotoUrl(null);
        setPhotoAnalysis(null);
        setPhotoError(null);
        setIsProjectsDrawerOpen(false);
        loadProjectsList();
      }
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  // Open Project
  const handleOpenProject = async (pId: string) => {
    try {
      const res = await fetch(`/api/engine/cad/projects/${pId}`);
      if (!res.ok) return;
      const proj = await res.json();

      setProjectId(proj.id);
      setProjectName(proj.name || "Untitled Project");
      const loadedSpec = proj.spec || {};
      const projMode =
        loadedSpec.mode === "robot"
          ? "robot"
          : loadedSpec.mode === "part"
          ? "part"
          : "enclosure";
      setCadMode(projMode);

      if (projMode === "robot") {
        setRobotSpec({ ...defaultRobotSpec, ...loadedSpec });
        if (loadedSpec.overall_height_mm) setRobotOverallHeight(loadedSpec.overall_height_mm);
        if (loadedSpec.wall) setRobotWall(loadedSpec.wall);
        const headPart = (loadedSpec.parts || []).find((p: any) => p.kind === "head");
        if (headPart?.display) {
          setDisplaySizeL(headPart.display.size?.[0] || 27.3);
          setDisplaySizeW(headPart.display.size?.[1] || 27.8);
          setDisplaySizeT(headPart.display.size?.[2] || 4.0);
          setDisplayActiveW(headPart.display.active_area?.[0] || 22.0);
          setDisplayActiveH(headPart.display.active_area?.[1] || 11.0);
          setDisplayOffsetX(headPart.display.offset?.[0] || 0.0);
          setDisplayOffsetZ(headPart.display.offset?.[1] || 0.0);
          setDisplayShape(headPart.display.shape || "rect");
        }
        const armPart = (loadedSpec.parts || []).find((p: any) => p.kind === "arm");
        if (armPart?.joint_mode) setRobotArmMode(armPart.joint_mode);
      } else if (projMode === "part") {
        const pType = loadedSpec.part_type || "bracket";
        setPartType(pType);
        setPartMeasurements(loadedSpec.measurements || defaultPartMeasurementsMap[pType] || {});
        setPartFeatures(loadedSpec.features || []);
      } else {
        setEnclosureSpec({
          ...defaultEnclosureSpec,
          ...loadedSpec,
        });
      }

      // Restore photo state if present
      if (proj.reference_photo) {
        setReferencePhotoUrl(`/api/engine${proj.reference_photo}`);
        setIsReferencePanelOpen(true);
      } else {
        setReferencePhotoUrl(null);
      }

      if (loadedSpec.analysis_result) {
        setPhotoAnalysis(loadedSpec.analysis_result);
      } else {
        setPhotoAnalysis(null);
      }
      setPhotoError(null);

      setDiffLog(
        proj.version_history?.length
          ? proj.version_history.map((v: any) => v.description || v.prompt || "Edit")
          : ["Project loaded"]
      );
      setVersion(proj.version_history?.length || 1);
      setSessionId("");
      setCanUndo(false);
      setCanRedo(false);

      // Restore build results if last build id present
      if (proj.last_build_id) {
        setBuildResult({
          id: proj.last_build_id,
          issues: [],
          files: {
            part_step: `/api/engine/cad/projects/${proj.id}/files/part.step`,
            part_stl: `/api/engine/cad/projects/${proj.id}/files/part.stl`,
            part_glb: `/api/engine/cad/projects/${proj.id}/files/part.glb`,
            shell_step: `/api/engine/cad/projects/${proj.id}/files/front_shell.step`,
            shell_stl: `/api/engine/cad/projects/${proj.id}/files/front_shell.stl`,
            shell_glb: `/api/engine/cad/projects/${proj.id}/files/front_shell.glb`,
            cover_step: `/api/engine/cad/projects/${proj.id}/files/back_cover.step`,
            cover_stl: `/api/engine/cad/projects/${proj.id}/files/back_cover.stl`,
            cover_glb: `/api/engine/cad/projects/${proj.id}/files/back_cover.glb`,
            both_glb: `/api/engine/cad/projects/${proj.id}/files/both.glb`,
          },
        });
      } else {
        setBuildResult(null);
      }

      setIsProjectsDrawerOpen(false);
    } catch (err) {
      console.error("Failed to open project:", err);
    }
  };

  // Rename Project
  const handleRenameProject = async (newName: string) => {
    const clean = newName.trim();
    if (!clean || !projectId) {
      setIsEditingName(false);
      return;
    }
    setProjectName(clean);
    setIsEditingName(false);
    triggerAutosave(projectId, clean, getActiveSpec(), []);
  };

  // Duplicate Project
  const handleDuplicateProject = async (pId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/engine/cad/projects/${pId}/duplicate`, {
        method: "POST",
      });
      if (res.ok) {
        loadProjectsList();
      }
    } catch (err) {
      console.error("Duplicate failed:", err);
    }
  };

  // Delete Project
  const handleDeleteProject = async (pId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/engine/cad/projects/${pId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteConfirmId(null);
        loadProjectsList();
        if (projectId === pId) {
          handleCreateProject("enclosure");
        }
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Plan Design via Ollama
  const handlePlanDesign = async () => {
    if (!initialPrompt.trim()) return;
    setIsPlanning(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/engine/cad/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: initialPrompt.trim(),
          mode: cadMode,
          project_id: projectId || undefined,
        }),
      });

      if (res.status === 503) {
        throw new Error("Local AI service (Ollama) is offline. Start Ollama ('ollama serve') to plan from prompts.");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Planning failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      setSessionId(data.session_id);
      setVersion(data.version);
      setCanUndo(data.can_undo);
      setCanRedo(data.can_redo);

      if (data.spec) {
        if (data.spec.mode === "part" || data.spec.part_type) {
          setCadMode("part");
          setPartType(data.spec.part_type || "bracket");
          setPartMeasurements(data.spec.measurements || {});
          setPartFeatures(data.spec.features || []);
        } else {
          setCadMode("enclosure");
          setEnclosureSpec(data.spec);
        }
        triggerAutosave(projectId, projectName, data.spec, data.version_history || []);
      }

      if (data.issues) setIssues(data.issues);
      if (data.diff_log) setDiffLog(data.diff_log);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate CAD plan.");
    } finally {
      setIsPlanning(false);
    }
  };

  // Apply Natural Language Edit
  const handleApplyEdit = async () => {
    if (!editPrompt.trim() || isEditing) return;
    setIsEditing(true);
    setErrorMessage(null);

    try {
      let sid = sessionId;
      if (!sid) {
        const curSpec = getActiveSpec();
        const sRes = await fetch("/api/engine/cad/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: curSpec, mode: cadMode, project_id: projectId || undefined }),
        });
        const sData = await sRes.json();
        sid = sData.session_id;
        setSessionId(sid);
      }

      const res = await fetch(`/api/engine/cad/session/${sid}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: editPrompt.trim(), project_id: projectId || undefined }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Edit could not be applied.");
      }

      const data = await res.json();
      setVersion(data.version);
      setCanUndo(data.can_undo);
      setCanRedo(data.can_redo);

      if (data.spec) {
        if (cadMode === "robot") {
          setRobotSpec(data.spec);
          if (data.spec.overall_height_mm) setRobotOverallHeight(data.spec.overall_height_mm);
          if (data.spec.wall) setRobotWall(data.spec.wall);
          const headPart = (data.spec.parts || []).find((p: any) => p.kind === "head");
          if (headPart?.display) {
            setDisplaySizeL(headPart.display.size?.[0] || 27.3);
            setDisplaySizeW(headPart.display.size?.[1] || 27.8);
            setDisplaySizeT(headPart.display.size?.[2] || 4.0);
            setDisplayActiveW(headPart.display.active_area?.[0] || 22.0);
            setDisplayActiveH(headPart.display.active_area?.[1] || 11.0);
            setDisplayOffsetX(headPart.display.offset?.[0] || 0.0);
            setDisplayOffsetZ(headPart.display.offset?.[1] || 0.0);
            setDisplayShape(headPart.display.shape || "rect");
          }
          const armPart = (data.spec.parts || []).find((p: any) => p.kind === "arm");
          if (armPart?.joint_mode) setRobotArmMode(armPart.joint_mode);
        } else if (cadMode === "part") {
          setPartType(data.spec.part_type || partType);
          setPartMeasurements(data.spec.measurements || partMeasurements);
          setPartFeatures(data.spec.features || partFeatures);
        } else {
          setEnclosureSpec(data.spec);
        }
        triggerAutosave(projectId, projectName, data.spec, data.version_history || []);
      }

      if (data.issues) setIssues(data.issues);
      if (data.diff_log) setDiffLog(data.diff_log);
      setEditPrompt("");
    } catch (err: any) {
      setErrorMessage(err.message || "Edit operation rejected.");
    } finally {
      setIsEditing(false);
    }
  };

  // Undo / Redo / Reset
  const handleUndo = async () => {
    if (!sessionId || !canUndo) return;
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/engine/cad/session/${sessionId}/undo`, { method: "POST" });
      if (!res.ok) throw new Error("Undo failed");
      const data = await res.json();
      setVersion(data.version);
      setCanUndo(data.can_undo);
      setCanRedo(data.can_redo);
      if (cadMode === "robot") {
        setRobotSpec(data.spec);
        if (data.spec.overall_height_mm) setRobotOverallHeight(data.spec.overall_height_mm);
        if (data.spec.wall) setRobotWall(data.spec.wall);
        const headPart = (data.spec.parts || []).find((p: any) => p.kind === "head");
        if (headPart?.display) {
          setDisplaySizeL(headPart.display.size?.[0] || 27.3);
          setDisplaySizeW(headPart.display.size?.[1] || 27.8);
          setDisplaySizeT(headPart.display.size?.[2] || 4.0);
          setDisplayActiveW(headPart.display.active_area?.[0] || 22.0);
          setDisplayActiveH(headPart.display.active_area?.[1] || 11.0);
          setDisplayOffsetX(headPart.display.offset?.[0] || 0.0);
          setDisplayOffsetZ(headPart.display.offset?.[1] || 0.0);
          setDisplayShape(headPart.display.shape || "rect");
        }
        const armPart = (data.spec.parts || []).find((p: any) => p.kind === "arm");
        if (armPart?.joint_mode) setRobotArmMode(armPart.joint_mode);
      } else if (cadMode === "part") {
        setPartMeasurements(data.spec.measurements || {});
        setPartFeatures(data.spec.features || []);
      } else {
        setEnclosureSpec(data.spec);
      }
      setIssues(data.issues || []);
      setDiffLog(data.diff_log || []);
      triggerAutosave(projectId, projectName, data.spec, []);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleRedo = async () => {
    if (!sessionId || !canRedo) return;
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/engine/cad/session/${sessionId}/redo`, { method: "POST" });
      if (!res.ok) throw new Error("Redo failed");
      const data = await res.json();
      setVersion(data.version);
      setCanUndo(data.can_undo);
      setCanRedo(data.can_redo);
      if (cadMode === "robot") {
        setRobotSpec(data.spec);
        if (data.spec.overall_height_mm) setRobotOverallHeight(data.spec.overall_height_mm);
        if (data.spec.wall) setRobotWall(data.spec.wall);
        const headPart = (data.spec.parts || []).find((p: any) => p.kind === "head");
        if (headPart?.display) {
          setDisplaySizeL(headPart.display.size?.[0] || 27.3);
          setDisplaySizeW(headPart.display.size?.[1] || 27.8);
          setDisplaySizeT(headPart.display.size?.[2] || 4.0);
          setDisplayActiveW(headPart.display.active_area?.[0] || 22.0);
          setDisplayActiveH(headPart.display.active_area?.[1] || 11.0);
          setDisplayOffsetX(headPart.display.offset?.[0] || 0.0);
          setDisplayOffsetZ(headPart.display.offset?.[1] || 0.0);
          setDisplayShape(headPart.display.shape || "rect");
        }
        const armPart = (data.spec.parts || []).find((p: any) => p.kind === "arm");
        if (armPart?.joint_mode) setRobotArmMode(armPart.joint_mode);
      } else if (cadMode === "part") {
        setPartMeasurements(data.spec.measurements || {});
        setPartFeatures(data.spec.features || []);
      } else {
        setEnclosureSpec(data.spec);
      }
      setIssues(data.issues || []);
      setDiffLog(data.diff_log || []);
      triggerAutosave(projectId, projectName, data.spec, []);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Photo-to-Part Upload Handler
  const handlePhotoUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("Photo exceeds 15 MB limit. Please select a smaller photo.");
      return;
    }
    setIsAnalyzingPhoto(true);
    setPhotoError(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (projectId) {
        formData.append("project_id", projectId);
      }
      if (cadMode === "robot") {
        formData.append("mode", "robot");
      }

      const res = await fetch("/api/engine/cad/analyze-photo", {
        method: "POST",
        body: formData,
      });

      if (res.status === 503) {
        const err = await res.json().catch(() => ({}));
        setPhotoError({
          message: err.detail || "Local vision model is offline or not installed.",
          pullCmd: "ollama pull qwen2.5vl:7b",
        });
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Analysis failed (HTTP ${res.status})`);
      }

      const data = await res.json();

      // Handle robot assembly photo analysis
      if (data.suggested_spec || data.part_type === "robot_assembly" || cadMode === "robot") {
        setCadMode("robot");
        if (data.photo_ref) {
          setReferencePhotoUrl(`/api/engine${data.photo_ref}?t=${Date.now()}`);
          setIsReferencePanelOpen(true);
        } else {
          const localUrl = URL.createObjectURL(file);
          setReferencePhotoUrl(localUrl);
          setIsReferencePanelOpen(true);
        }

        if (data.suggested_spec) {
          setRobotSpec(data.suggested_spec);
          if (data.suggested_spec.overall_height_mm) setRobotOverallHeight(data.suggested_spec.overall_height_mm);
          if (data.suggested_spec.wall) setRobotWall(data.suggested_spec.wall);
          const headPart = (data.suggested_spec.parts || []).find((p: any) => p.kind === "head");
          if (headPart?.display) {
            setDisplaySizeL(headPart.display.size?.[0] || 27.3);
            setDisplaySizeW(headPart.display.size?.[1] || 27.8);
            setDisplaySizeT(headPart.display.size?.[2] || 4.0);
            setDisplayActiveW(headPart.display.active_area?.[0] || 22.0);
            setDisplayActiveH(headPart.display.active_area?.[1] || 11.0);
            setDisplayOffsetX(headPart.display.offset?.[0] || 0.0);
            setDisplayOffsetZ(headPart.display.offset?.[1] || 0.0);
            setDisplayShape(headPart.display.shape || "rect");
          }
        }
        if (data.detected_parts && Array.isArray(data.detected_parts) && data.detected_parts.length > 0) {
          setRobotBoxes(
            data.detected_parts.map((p: any, idx: number) => ({
              id: p.name || `part_${idx}`,
              label: p.name ? p.name.replace("_", " ").toUpperCase() : `Part ${idx + 1}`,
              box: p.box || [0.2, 0.2, 0.8, 0.8],
            }))
          );
        }
        if (data.display_box) {
          setRobotDisplayBox(data.display_box);
        }
        setDiffLog((prev) => [
          ...prev,
          `Robot photo analyzed: ${data.detected_parts?.length || 0} parts detected (${data.confidence || "medium"} confidence)`,
        ]);
        if (projectId && data.suggested_spec) {
          triggerAutosave(projectId, projectName, data.suggested_spec, []);
        }
        return;
      }

      setPhotoAnalysis(data);
      setCadMode("part");

      if (data.photo_ref) {
        setReferencePhotoUrl(`/api/engine${data.photo_ref}?t=${Date.now()}`);
        setIsReferencePanelOpen(true);
      } else {
        const localUrl = URL.createObjectURL(file);
        setReferencePhotoUrl(localUrl);
        setIsReferencePanelOpen(true);
      }

      // Map detected part type (e.g. clip_ring -> clip)
      const detected = data.part_type === "clip_ring" ? "clip" : data.part_type;
      const validTypes: Array<"bracket" | "plate" | "mounting_plate" | "spacer" | "clip"> = [
        "bracket",
        "plate",
        "mounting_plate",
        "spacer",
        "clip",
      ];
      const finalType = validTypes.includes(detected) ? detected : "bracket";
      setPartType(finalType);

      // Prefill default measurements form for that type
      const defaultMeas = data.default_measurements || defaultPartMeasurementsMap[finalType] || {};
      setPartMeasurements(defaultMeas);
      setPartFeatures(defaultPartFeaturesMap[finalType] || []);

      setDiffLog((prev) => [
        ...prev,
        `Photo analyzed: detected ${data.part_type} (${data.confidence} confidence)`,
      ]);

      // Autosave updated project
      if (projectId) {
        triggerAutosave(
          projectId,
          projectName,
          {
            mode: "part",
            part_type: finalType,
            measurements: defaultMeas,
            features: defaultPartFeaturesMap[finalType] || [],
            project_id: projectId,
            analysis_result: data,
          },
          []
        );
      }
    } catch (err: any) {
      setPhotoError({
        message: err.message || "Failed to analyze photo. You can pick a part type manually below.",
      });
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  // Scale helper handlers
  const handleComputeScale = async () => {
    if (scalePoints.length < 4) return;
    setIsCalculatingScale(true);
    setScaleCalcError(null);
    try {
      const res = await fetch("/api/engine/cad/estimate-scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference_object: scaleRefObject,
          known_mm: scaleRefObject === "ruler_mm" ? scaleCustomMm : undefined,
          ref_points: [scalePoints[0], scalePoints[1]],
          target_points: [scalePoints[2], scalePoints[3]],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to calculate scale estimate.");
      }

      const data = await res.json();
      setScaleEstimateResult(data);
    } catch (err: any) {
      setScaleCalcError(err.message || "Scale calculation failed.");
    } finally {
      setIsCalculatingScale(false);
    }
  };

  const handleApplyScaleEstimate = () => {
    if (!scaleEstimateResult || !scaleTargetKey) return;
    handleMeasurementChange(scaleTargetKey, scaleEstimateResult.estimated_mm);
    setEstimatedFields((prev) => ({ ...prev, [scaleTargetKey]: true }));
    setIsScaleHelperOpen(false);
    setScaleEstimateResult(null);
    setScalePoints([]);
  };

  // Build CAD Model
  const hasErrors = issues.some((i) => i.level === "error");
  const isMissingMeasurements = hasMissingRequiredMeasurements();

  const handleBuild = async () => {
    if (hasErrors || isMissingMeasurements || isBuilding) return;
    setIsBuilding(true);
    setErrorMessage(null);

    try {
      const curSpec = getActiveSpec();
      const res = await fetch("/api/engine/cad/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: curSpec,
          project_id: projectId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail?.message || err.detail || "Build rejected.");
      }

      const data: BuildResult = await res.json();
      setBuildResult(data);
      if (data.issues) setIssues(data.issues);

      // Autosave build result and take thumbnail
      triggerAutosave(projectId, projectName, curSpec, [], data.id);
      captureThumbnail(projectId);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to compile CAD model.");
    } finally {
      setIsBuilding(false);
    }
  };

  // Part measurements change handler
  const handleMeasurementChange = (key: keyof PartMeasurement, val: number) => {
    const updated = { ...partMeasurements, [key]: val };
    setPartMeasurements(updated);
    const spec = {
      mode: "part" as const,
      part_type: partType,
      measurements: updated,
      features: partFeatures,
      corner_radius: updated.corner_radius || 0.0,
      project_id: projectId,
    };
    triggerAutosave(projectId, projectName, spec, []);
  };

  // Add Part Feature
  const handleAddFeature = () => {
    if (newFeatureType === "hole") {
      const x = parseFloat(newHoleX) || 0;
      const y = parseFloat(newHoleY) || 0;
      const d = parseFloat(newHoleD) || 3.4;
      const feat: PartFeature = {
        id: `h_${Date.now().toString(36)}`,
        type: "hole",
        x,
        y,
        d,
      };
      const updated = [...partFeatures, feat];
      setPartFeatures(updated);
      setShowAddFeature(false);
      triggerAutosave(projectId, projectName, { ...getActiveSpec(), features: updated }, []);
    } else {
      const count = parseInt(newPatCount, 10) || 2;
      const pitch = parseFloat(newPatPitch) || 30.0;
      const d = parseFloat(newPatD) || 3.4;
      const feat: PartFeature = {
        id: `pat_${Date.now().toString(36)}`,
        type: "linear_pattern",
        count,
        pitch,
        d,
        leg: newPatLeg,
      };
      const updated = [...partFeatures, feat];
      setPartFeatures(updated);
      setShowAddFeature(false);
      triggerAutosave(projectId, projectName, { ...getActiveSpec(), features: updated }, []);
    }
  };

  const handleRemoveFeature = (id: string) => {
    const updated = partFeatures.filter((f) => f.id !== id);
    setPartFeatures(updated);
    triggerAutosave(projectId, projectName, { ...getActiveSpec(), features: updated }, []);
  };

  // Component manipulation in Enclosure mode
  const handleAddBoardChip = (boardKey: string) => {
    const found = libraryBoards.find((b) => b.key === boardKey);
    if (!found) return;

    const newComp: ComponentItem = {
      id: `comp_${Date.now().toString(36)}`,
      name: found.name,
      size: [...found.size] as [number, number, number],
      qty: 1,
      note: found.note,
    };

    setEnclosureSpec((prev) => {
      const updated = [...(prev.components || []), newComp];
      const prevInner = prev.inner || [60, 40, 30];
      const newInnerL = Number((prevInner[0] + found.size[0] + 5.0).toFixed(1));
      const newInnerW = Math.max(prevInner[1], found.size[1] + 2.0);
      const newInnerH = Math.max(prevInner[2], found.size[2] + 7.0);

      const nextSpec: CadSpec = {
        ...prev,
        components: updated,
        inner: [newInnerL, newInnerW, newInnerH],
      };
      triggerAutosave(projectId, projectName, nextSpec, []);
      return nextSpec;
    });
  };

  const handleRemoveComponent = (id: string) => {
    setEnclosureSpec((prev) => {
      const updated = (prev.components || []).filter((c) => c.id !== id);
      const nextSpec: CadSpec = { ...prev, components: updated };
      triggerAutosave(projectId, projectName, nextSpec, []);
      return nextSpec;
    });
  };

  const handleDownload = (fileUrl: string | undefined, filename: string) => {
    if (!fileUrl) return;
    const a = document.createElement("a");
    a.href = fileUrl.startsWith("/api/engine") ? fileUrl : `/api/engine${fileUrl}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Calculate enclosure dimensions
  const inner = enclosureSpec.inner || [60, 40, 30];
  const wall = enclosureSpec.wall || 2.4;
  const outerL = (inner[0] + 2 * wall).toFixed(1);
  const outerW = (inner[1] + 2 * wall).toFixed(1);
  const outerH = (inner[2] + 2 * wall).toFixed(1);

  // Active GLB url for ModelViewer
  const activeGlbUrl = (() => {
    if (!buildResult) return null;
    const f = buildResult.files;
    if (cadMode === "design") {
      let p: string | undefined;
      if (selectedDesignPart === "assembled") {
        p =
          designFiles["assembled"]?.glb ||
          f.assembled_glb ||
          (designParts.length > 0 ? designFiles[designParts[0]]?.glb : undefined) ||
          f.both_glb;
      } else {
        p = designFiles[selectedDesignPart]?.glb || f[`${selectedDesignPart}_glb`];
      }
      return p ? (p.startsWith("/api/engine") ? p : `/api/engine${p}`) : null;
    }
    if (cadMode === "robot") {
      let p: string | undefined;
      if (activeRobotPartTab === "assembled") {
        p = f.assembled_glb || f.both_glb;
      } else if (activeRobotPartTab === "exploded") {
        p = f.exploded_glb || f.assembled_glb || f.both_glb;
      } else if (activeRobotPartTab === "ghost") {
        p = f.ghost_glb || f.assembled_glb || f.both_glb;
      } else {
        p = f[`${activeRobotPartTab}_glb`];
      }
      return p ? (p.startsWith("/api/engine") ? p : `/api/engine${p}`) : null;
    }
    if (cadMode === "part") {
      const p = f.part_glb || f.both_glb || f.shell_glb;
      return p ? (p.startsWith("/api/engine") ? p : `/api/engine${p}`) : null;
    }
    const path =
      activeTab === "shell"
        ? f.shell_glb
        : activeTab === "cover"
        ? f.cover_glb
        : f.both_glb;
    return path ? (path.startsWith("/api/engine") ? path : `/api/engine${path}`) : null;
  })();

  const filteredProjects = projectsList.filter((p) => {
    if (!projectSearch.trim()) return true;
    const q = projectSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.mode && p.mode.toLowerCase().includes(q)) ||
      (p.part_type && p.part_type.toLowerCase().includes(q))
    );
  });

  const filteredLibrary = componentLibrary.filter((item) => {
    const matchesSearch =
      librarySearch === "" ||
      item.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
      item.id.toLowerCase().includes(librarySearch.toLowerCase()) ||
      (item.tags || []).some((t) => t.toLowerCase().includes(librarySearch.toLowerCase())) ||
      (item.notes || "").toLowerCase().includes(librarySearch.toLowerCase());

    const matchesCategory =
      libraryCategoryFilter === "All" ||
      item.category.toLowerCase() === libraryCategoryFilter.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  // Design Mode Handlers (Phase 7)
  const handleGenerateDesign = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || designPrompt).trim();
    if (!promptToSend) return;
    setIsDesigning(true);
    setErrorMessage(null);

    try {
      // 1. Try template-based parametric CAD first (deterministic, verified, instant Build123d)
      if (!customPrompt && designComponents.length === 0) {
        setDesignProgressText("Evaluating parametric CAD templates...");
        try {
          const tplRes = await fetch("/api/engine/cad/template/design", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: promptToSend,
              parameters: missingValues,
            }),
          });
          if (tplRes.ok) {
            const tplData = await tplRes.json();
            if (tplData && tplData.status === "completed" && tplData.glb_url) {
              setDesignProgressText(`Built parametric template: ${tplData.template}`);
              setBuildResult({
                id: tplData.job_id,
                issues: (tplData.clamping_notices || []).map((notice: string) => ({
                  type: "warning",
                  code: "clamping",
                  msg: notice,
                })),
                files: {
                  assembled_glb: tplData.glb_url,
                  part_glb: tplData.glb_url,
                  both_glb: tplData.glb_url,
                  assembled_stl: tplData.stl_url,
                  part_stl: tplData.stl_url,
                  assembled_step: tplData.step_url,
                  part_step: tplData.step_url,
                },
              });
              setDesignParts(["part"]);
              setSelectedDesignPart("assembled");
              setIsDesigning(false);
              return;
            }
          }
        } catch (tplErr) {
          console.warn("Template design bypassed, falling back to agent loop:", tplErr);
        }
      }

      setDesignProgressText("Synthesizing custom CAD design brief...");
      const compsPayload = designComponents.map((c) => ({
        id: c.id,
        name: c.name,
        size: c.size,
        anchor: c.anchor,
      }));

      const isEdit = !!projectId && designParts.length > 0;
      const endpoint = isEdit
        ? `/api/engine/cad/agent/design/${projectId}/edit`
        : "/api/engine/cad/agent/design";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId || undefined,
          prompt: promptToSend,
          image_base64: designPhotoUrl || undefined,
          components: compsPayload,
          measurements: missingValues,
          provider: "ollama",
          model_name: "qwen2.5-coder:7b",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail?.message || err.detail || `Design request failed (${res.status})`);
      }

      const jobData = await res.json();
      const jobId = jobData.job_id;
      if (jobData.project_id && !projectId) {
        setProjectId(jobData.project_id);
      }

      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/engine/cad/agent/jobs/${jobId}`);
          if (!pollRes.ok) return;
          const pollData = await pollRes.json();
          setDesignProgressText(pollData.progress || "Synthesizing and verifying CadQuery geometry...");

          if (pollData.status === "needs_input") {
            clearInterval(pollInterval);
            setIsDesigning(false);
            setMissingMeasurements(pollData.missing_measurements || []);
          } else if (pollData.status === "completed") {
            clearInterval(pollInterval);
            setIsDesigning(false);
            const r = pollData.result || {};
            setDesignValidation(
              r.validation || { valid: true, errors: [], warnings: [], infos: [] }
            );
            setDesignOverhangs(r.overhang_recommendations || {});
            setDesignParts(r.parts || []);
            setDesignFiles(r.files || {});
            setDesignIterations(r.iteration_history || []);
            setMissingMeasurements([]);

            const filesMap: any = {};
            if (r.files) {
              Object.entries(r.files).forEach(([pName, pFiles]: [string, any]) => {
                if (pFiles?.glb) filesMap[`${pName}_glb`] = pFiles.glb;
                if (pFiles?.stl) filesMap[`${pName}_stl`] = pFiles.stl;
                if (pFiles?.step) filesMap[`${pName}_step`] = pFiles.step;
              });
              if (r.files.assembled_glb) {
                filesMap.assembled_glb = r.files.assembled_glb;
              } else if (r.parts && r.parts[0] && r.files[r.parts[0]]?.glb) {
                filesMap.assembled_glb = r.files[r.parts[0]].glb;
              }
            }
            setBuildResult({
              id: jobId,
              issues: (r.validation?.errors || []).concat(r.validation?.warnings || []),
              files: filesMap,
            });
          } else if (pollData.status === "failed") {
            clearInterval(pollInterval);
            setIsDesigning(false);
            setErrorMessage(pollData.error || "Design agent failed to produce valid CAD model.");
          }
        } catch (pollErr: any) {
          console.error("Poll error:", pollErr);
        }
      }, 1500);
    } catch (err: any) {
      setIsDesigning(false);
      setErrorMessage(err.message || "Failed to start design agent.");
    }
  };

  const handleFixIssue = (issue: RightPanelValidationIssue) => {
    const targeted = `Fix ${issue.code || "feasibility issue"} on ${issue.part || "the model"}: ${issue.msg}. Keep all user-defined outer dimensions exact.`;
    handleGenerateDesign(targeted);
  };

  const handleRotateForBestPrint = (partName: string) => {
    const rec = designOverhangs[partName];
    if (rec?.rotation_euler_deg) {
      setPreviewRotationEuler(rec.rotation_euler_deg);
    } else {
      setPreviewRotationEuler([0, 0, 0]);
    }
  };

  const handleOpenFitTest = async () => {
    if (!projectId) {
      setErrorMessage("Please generate or select a project first.");
      return;
    }
    try {
      const res = await fetch(`/api/engine/cad/projects/${projectId}/fit-test`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail?.message || err.detail || "Fit-test slice generation failed.");
      }
      const data = await res.json();
      setFitTestSlices(data.slices || []);
      setIsFitTestModalOpen(true);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate fit-test slices.");
    }
  };

  const handleExportDesign = async () => {
    if ((designValidation?.errors || []).length > 0) {
      setErrorMessage("Export refused: resolve error-level feasibility checks first.");
      return;
    }
    if (!projectId) {
      setErrorMessage("Please generate a design first.");
      return;
    }
    setIsExporting(true);
    try {
      const res = await fetch(`/api/engine/cad/projects/${projectId}/export`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail?.message || err.detail || "Export refused.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectId}_export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to export CAD package.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-graphite-950 text-graphite-100 overflow-hidden font-sans">
      <AppSidebar />

      {/* Main Studio Viewport */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-graphite-950 relative">
        {/* ================= TOP HEADER BAR ================= */}
        <header className="h-14 border-b border-graphite-800 bg-graphite-900/95 px-5 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-3">
            {/* Projects Drawer Toggle Button */}
            <button
              onClick={() => {
                setIsProjectsDrawerOpen(true);
                setIsLibraryDrawerOpen(false);
              }}
              className="px-2.5 py-1.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-200 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Open Projects Library"
            >
              <FolderOpen className="w-3.5 h-3.5 text-forge" />
              <span>Projects</span>
              <span className="px-1.5 py-0.2 rounded bg-graphite-750 text-[10px] text-graphite-400">
                {projectsList.length}
              </span>
            </button>

            {/* Component Library Drawer Toggle Button */}
            <button
              onClick={() => {
                setIsLibraryDrawerOpen(true);
                setIsProjectsDrawerOpen(false);
              }}
              className="px-2.5 py-1.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-200 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Open Part Library"
            >
              <Layers className="w-3.5 h-3.5 text-forge" />
              <span>Library</span>
              <span className="px-1.5 py-0.2 rounded bg-graphite-750 text-[10px] text-graphite-400">
                {componentLibrary.length}
              </span>
            </button>

            <span className="text-graphite-700">|</span>

            {/* Editable Project Name */}
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameProject(tempName);
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                  onBlur={() => handleRenameProject(tempName)}
                  className="bg-graphite-950 border border-forge rounded px-2 py-0.5 text-xs font-mono text-white outline-none"
                />
                <button
                  onClick={() => handleRenameProject(tempName)}
                  className="p-1 text-forge hover:text-white"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTempName(projectName);
                  setIsEditingName(true);
                }}
                className="group flex items-center gap-1.5 text-xs font-mono text-graphite-200 hover:text-white transition-colors"
                title="Click to rename project"
              >
                <span className="font-semibold text-graphite-100">{projectName}</span>
                <Edit2 className="w-3 h-3 text-graphite-500 group-hover:text-forge transition-colors" />
              </button>
            )}

            {/* Autosave Status */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-graphite-500">
              {saveStatus === "saving" ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-forge" />
                  <span>Saving...</span>
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Unsaved</span>
                </>
              )}
            </div>
          </div>

          {/* Mode Switcher: Enclosure vs Replacement Part vs Robot */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-graphite-950 border border-graphite-750 rounded p-0.5 text-xs font-mono">
              <button
                onClick={() => setCadMode("enclosure")}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  cadMode === "enclosure"
                    ? "bg-forge text-graphite-950 font-semibold"
                    : "text-graphite-400 hover:text-white"
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>Enclosure</span>
              </button>
              <button
                onClick={() => setCadMode("part")}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  cadMode === "part"
                    ? "bg-forge text-graphite-950 font-semibold"
                    : "text-graphite-400 hover:text-white"
                }`}
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>Replacement Part</span>
              </button>
              <button
                onClick={() => setCadMode("robot")}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  cadMode === "robot"
                    ? "bg-forge text-graphite-950 font-semibold"
                    : "text-graphite-400 hover:text-white"
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Robot</span>
              </button>
              <button
                onClick={() => setCadMode("design")}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  cadMode === "design"
                    ? "bg-forge text-graphite-950 font-semibold"
                    : "text-graphite-400 hover:text-white"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Design</span>
              </button>
            </div>


            {/* Settings & Calibration Button */}
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="px-2.5 py-1.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="CAD settings & printer calibration"
            >
              <Sliders className="w-3.5 h-3.5 text-forge" />
              <span>Settings</span>
            </button>

            {/* New Project Button */}
            <button
              onClick={() => handleCreateProject(cadMode)}
              className="px-2.5 py-1.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Create a new CAD project"
            >
              <Plus className="w-3.5 h-3.5 text-forge" />
              <span>New</span>
            </button>
          </div>
        </header>

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="bg-red-950/80 border-b border-red-800/80 px-6 py-2.5 flex items-center justify-between text-xs font-mono text-red-200 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white px-2 py-0.5"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Save to Library Success Banner */}
        {saveToLibStatus && (
          <div className="bg-emerald-950/90 border-b border-emerald-800 px-6 py-2 flex items-center gap-2 text-xs font-mono text-emerald-300 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveToLibStatus}</span>
          </div>
        )}

        {/* ================= 3-COLUMN STUDIO LAYOUT ================= */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {/* ================= PROJECTS DRAWER OVERLAY ================= */}
          {isProjectsDrawerOpen && (
            <div className="absolute inset-0 z-40 flex">
              <div
                className="w-80 h-full bg-graphite-900 border-r border-graphite-800 shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-200"
              >
                {/* Drawer Header */}
                <div className="p-4 border-b border-graphite-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-forge" />
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-graphite-100">
                      CAD Projects
                    </span>
                  </div>
                  <button
                    onClick={() => setIsProjectsDrawerOpen(false)}
                    className="p-1 text-graphite-400 hover:text-white rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search & New Project Actions */}
                <div className="p-3 border-b border-graphite-800 space-y-2">
                  <div className="flex items-center bg-graphite-950 border border-graphite-750 rounded px-2.5 py-1.5 text-xs font-mono">
                    <Search className="w-3.5 h-3.5 text-graphite-500 mr-2 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="w-full bg-transparent text-white outline-none placeholder-graphite-600"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => handleCreateProject("enclosure")}
                      className="py-1.5 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[11px] font-mono text-graphite-200 rounded flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3 text-forge" />
                      <span>+ Enclosure</span>
                    </button>
                    <button
                      onClick={() => handleCreateProject("part")}
                      className="py-1.5 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[11px] font-mono text-graphite-200 rounded flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3 text-forge" />
                      <span>+ Part</span>
                    </button>
                    <button
                      onClick={() => handleCreateProject("robot")}
                      className="py-1.5 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[11px] font-mono text-graphite-200 rounded flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3 text-forge" />
                      <span>+ Robot</span>
                    </button>
                  </div>
                </div>

                {/* Projects List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-8 text-xs font-mono text-graphite-500">
                      No matching projects found.
                    </div>
                  ) : (
                    filteredProjects.map((p) => {
                      const isActive = p.id === projectId;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleOpenProject(p.id)}
                          className={`p-2.5 rounded border text-left cursor-pointer transition-colors relative group ${
                            isActive
                              ? "bg-graphite-800 border-forge"
                              : "bg-graphite-950 border-graphite-800 hover:border-graphite-700 hover:bg-graphite-850"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Project Thumbnail */}
                            <div className="w-12 h-12 rounded bg-graphite-900 border border-graphite-800 shrink-0 overflow-hidden flex items-center justify-center">
                              {p.thumbnail ? (
                                <img
                                  src={`/api/engine${p.thumbnail}`}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Box className="w-6 h-6 text-graphite-600" />
                              )}
                            </div>

                            {/* Project Metadata */}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-mono font-medium text-graphite-100 truncate">
                                {p.name}
                              </div>
                              <div className="text-[10px] font-mono text-graphite-500 mt-0.5">
                                {p.updated
                                  ? new Date(p.updated).toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    }) +
                                    " " +
                                    new Date(p.updated).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "Recently"}
                              </div>
                              <div className="mt-1">
                                <span className="inline-block px-1.5 py-0.2 rounded bg-graphite-800 border border-graphite-700 text-[9px] font-mono text-forge">
                                  {p.mode === "part"
                                    ? `Part: ${p.part_type || "plate"}`
                                    : "Enclosure"}
                                </span>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => handleDuplicateProject(p.id, e)}
                                title="Duplicate Project"
                                className="p-1 text-graphite-400 hover:text-white rounded"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(p.id);
                                }}
                                title="Delete Project"
                                className="p-1 text-graphite-400 hover:text-red-400 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Delete Confirmation Box */}
                          {deleteConfirmId === p.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 pt-2 border-t border-graphite-800 flex items-center justify-between text-[11px] font-mono text-red-300"
                            >
                              <span>Delete this project?</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => handleDeleteProject(p.id, e)}
                                  className="px-2 py-0.5 rounded bg-red-950 border border-red-800 text-red-300 hover:text-white"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-2 py-0.5 rounded bg-graphite-800 border border-graphite-700 text-graphite-400 hover:text-white"
                                >
                                  No
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Backdrop */}
              <div
                onClick={() => setIsProjectsDrawerOpen(false)}
                className="flex-1 bg-black/60 backdrop-blur-sm z-40"
              />
            </div>
          )}

          {/* ================= PART LIBRARY DRAWER OVERLAY ================= */}
          {isLibraryDrawerOpen && (
            <div className="absolute inset-0 z-40 flex">
              <div
                className="w-[450px] max-w-full h-full bg-graphite-900 border-r border-graphite-800 shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-200"
              >
                {/* Header */}
                <div className="p-4 border-b border-graphite-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-forge" />
                    <div>
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-graphite-100 block">
                        Part Library
                      </span>
                      <span className="text-[10px] font-mono text-graphite-400">
                        components.json · {componentLibrary.length} parts
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsLibraryDrawerOpen(false);
                      setIsEditingComponent(false);
                      setEditingComponent(null);
                    }}
                    className="p-1 text-graphite-400 hover:text-white rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search, Category Filters, and Action Bar */}
                <div className="p-3 border-b border-graphite-800 space-y-2">
                  <div className="flex items-center bg-graphite-950 border border-graphite-750 rounded px-2.5 py-1.5 text-xs font-mono">
                    <Search className="w-3.5 h-3.5 text-graphite-500 mr-2 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search parts by name, tag, notes..."
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      className="w-full bg-transparent text-white outline-none placeholder-graphite-600"
                    />
                  </div>

                  {/* Category Chips */}
                  <div className="flex flex-wrap gap-1">
                    {["All", "board", "display", "servo", "battery", "connector", "custom"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setLibraryCategoryFilter(cat)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize transition-colors border ${
                          libraryCategoryFilter.toLowerCase() === cat.toLowerCase()
                            ? "bg-graphite-800 border-forge text-forge font-semibold"
                            : "bg-graphite-950 border-graphite-800 text-graphite-400 hover:text-white hover:border-graphite-700"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Actions: Add, Import, Export */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => {
                        setEditingComponent({
                          id: `comp_${Date.now().toString(36)}`,
                          name: "New Component",
                          category: "custom",
                          size: [25.0, 25.0, 10.0],
                          source: "measured",
                          notes: "",
                          tags: [],
                          mount_holes: [],
                        });
                        setIsEditingComponent(true);
                      }}
                      className="flex-1 py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[11px] font-mono text-graphite-200 rounded flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3 text-forge" />
                      <span>New Component</span>
                    </button>

                    <button
                      onClick={() => libraryFileInputRef.current?.click()}
                      className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[11px] font-mono text-graphite-300 hover:text-white rounded flex items-center gap-1 transition-colors"
                      title="Import components JSON"
                    >
                      <Upload className="w-3 h-3 text-graphite-400" />
                      <span>Import</span>
                    </button>
                    <input
                      ref={libraryFileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleImportLibraryFile}
                      className="hidden"
                    />

                    <button
                      onClick={handleExportLibrary}
                      className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[11px] font-mono text-graphite-300 hover:text-white rounded flex items-center gap-1 transition-colors"
                      title="Export components JSON"
                    >
                      <Download className="w-3 h-3 text-graphite-400" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* Edit / Add Component Modal Form within drawer */}
                {isEditingComponent && editingComponent && (
                  <div className="p-3 bg-graphite-950 border-b border-forge/40 space-y-2 text-xs font-mono animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-1 border-b border-graphite-800">
                      <span className="text-[11px] font-semibold text-forge">
                        {componentLibrary.some((c) => c.id === editingComponent.id) ? "Edit Component" : "Add to Library"}
                      </span>
                      <button
                        onClick={() => {
                          setIsEditingComponent(false);
                          setEditingComponent(null);
                        }}
                        className="text-graphite-400 hover:text-white text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-graphite-400 block mb-0.5">Component ID</label>
                        <input
                          type="text"
                          value={editingComponent.id || ""}
                          onChange={(e) => setEditingComponent({ ...editingComponent, id: e.target.value.replace(/[^a-zA-Z0-9_\-]/g, "") })}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                          placeholder="e.g. oled_096"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-graphite-400 block mb-0.5">Category</label>
                        <select
                          value={editingComponent.category || "custom"}
                          onChange={(e) => setEditingComponent({ ...editingComponent, category: e.target.value as any })}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                        >
                          <option value="board">board</option>
                          <option value="display">display</option>
                          <option value="servo">servo</option>
                          <option value="battery">battery</option>
                          <option value="connector">connector</option>
                          <option value="custom">custom</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-graphite-400 block mb-0.5">Name</label>
                      <input
                        type="text"
                        value={editingComponent.name || ""}
                        onChange={(e) => setEditingComponent({ ...editingComponent, name: e.target.value })}
                        className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                        placeholder="e.g. Raspberry Pi 4B"
                      />
                    </div>

                    {/* Dimensions L, W, H */}
                    <div>
                      <label className="text-[10px] text-graphite-400 block mb-0.5">Size L × W × H (0.5 to 400 mm)</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="number"
                          step="0.1"
                          min="0.5"
                          max="400"
                          value={editingComponent.size?.[0] ?? 25.0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const s = [...(editingComponent.size || [25, 25, 10])] as [number, number, number];
                            s[0] = val;
                            setEditingComponent({ ...editingComponent, size: s });
                          }}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                          placeholder="L mm"
                        />
                        <input
                          type="number"
                          step="0.1"
                          min="0.5"
                          max="400"
                          value={editingComponent.size?.[1] ?? 25.0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const s = [...(editingComponent.size || [25, 25, 10])] as [number, number, number];
                            s[1] = val;
                            setEditingComponent({ ...editingComponent, size: s });
                          }}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                          placeholder="W mm"
                        />
                        <input
                          type="number"
                          step="0.1"
                          min="0.5"
                          max="400"
                          value={editingComponent.size?.[2] ?? 10.0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const s = [...(editingComponent.size || [25, 25, 10])] as [number, number, number];
                            s[2] = val;
                            setEditingComponent({ ...editingComponent, size: s });
                          }}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                          placeholder="H mm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-graphite-400 block mb-0.5">Source</label>
                        <select
                          value={editingComponent.source || "measured"}
                          onChange={(e) => setEditingComponent({ ...editingComponent, source: e.target.value as any })}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                        >
                          <option value="measured">measured (by me)</option>
                          <option value="approximate">approximate (calipers)</option>
                          <option value="datasheet">datasheet</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-graphite-400 block mb-0.5">Notes</label>
                        <input
                          type="text"
                          value={editingComponent.notes || ""}
                          onChange={(e) => setEditingComponent({ ...editingComponent, notes: e.target.value })}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-white text-[11px] outline-none focus:border-forge"
                          placeholder="e.g. measured with calipers"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => handleSaveComponent(editingComponent)}
                      disabled={isSavingComponent}
                      className="w-full py-1.5 bg-forge hover:bg-forge-light text-graphite-950 font-bold rounded text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      {isSavingComponent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Save to Library</span>
                    </button>
                  </div>
                )}

                {/* Components List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredLibrary.length === 0 ? (
                    <div className="text-center py-8 text-xs font-mono text-graphite-500">
                      No matching components in library.
                    </div>
                  ) : (
                    filteredLibrary.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded bg-graphite-950 border border-graphite-800 hover:border-graphite-700 transition-colors text-xs font-mono space-y-1.5 group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-graphite-200">{item.name}</span>
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-graphite-850 text-graphite-400 border border-graphite-800">
                                {item.category}
                              </span>
                            </div>
                            <div className="text-[11px] text-graphite-400 mt-0.5">
                              {item.size[0]} × {item.size[1]} × {item.size[2]} mm
                            </div>
                          </div>

                          {/* Badge based on source */}
                          <div>
                            {item.source === "measured" ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                                measured by me
                              </span>
                            ) : item.source === "datasheet" ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-blue-950/80 border border-blue-800 text-blue-400">
                                datasheet
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-amber-950/80 border border-amber-800 text-amber-400">
                                approximate - verify with calipers
                              </span>
                            )}
                          </div>
                        </div>

                        {item.notes && (
                          <div className="text-[10px] text-graphite-500">
                            {item.notes}
                          </div>
                        )}

                        {item.mount_holes && item.mount_holes.length > 0 && (
                          <div className="text-[10px] text-graphite-400">
                            Holes: {item.mount_holes.length}x Ø{item.mount_holes[0]?.d || 2.1} mm
                          </div>
                        )}

                        {item.screen && (
                          <div className="text-[10px] text-graphite-400">
                            Screen: {item.screen.w} × {item.screen.h} mm
                          </div>
                        )}

                        {/* Action buttons on card */}
                        <div className="flex items-center justify-between pt-1 border-t border-graphite-850/60">
                          <button
                            onClick={() => {
                              if (cadMode === "enclosure") {
                                handleAddBoardChip(item.id);
                              } else if (cadMode === "design") {
                                setDesignComponents((prev) => [
                                  ...prev.filter((c) => c.id !== item.id),
                                  {
                                    id: item.id,
                                    name: item.name,
                                    size: item.size,
                                    anchor: item.category === "display" || item.screen ? "front face" : "bottom center",
                                    source: item.source || "approximate",
                                  },
                                ]);
                              } else if (cadMode === "robot") {
                                if (item.category === "display" || item.screen) {
                                  setSelectedDisplayPreset(item.name);
                                  setDisplaySizeL(item.size[0]);
                                  setDisplaySizeW(item.size[1]);
                                  setDisplaySizeT(item.size[2]);
                                  if (item.screen) {
                                    setDisplayActiveW(item.screen.w);
                                    setDisplayActiveH(item.screen.h);
                                  }
                                }
                              }
                              setIsLibraryDrawerOpen(false);
                            }}
                            className="text-[10px] text-forge hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Use in {cadMode}</span>
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setEditingComponent(item);
                                setIsEditingComponent(true);
                              }}
                              className="p-1 text-graphite-400 hover:text-white rounded"
                              title="Edit component"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDuplicateComponent(item)}
                              className="p-1 text-graphite-400 hover:text-white rounded"
                              title="Duplicate component"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            {libraryDeleteConfirmId === item.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDeleteComponent(item.id)}
                                  className="text-[10px] text-red-400 font-semibold hover:underline"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setLibraryDeleteConfirmId(null)}
                                  className="text-[10px] text-graphite-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setLibraryDeleteConfirmId(item.id)}
                                className="p-1 text-graphite-500 hover:text-red-400 rounded"
                                title="Delete component"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Backdrop */}
              <div
                className="flex-1 bg-black/50 backdrop-blur-sm"
                onClick={() => {
                  setIsLibraryDrawerOpen(false);
                  setIsEditingComponent(false);
                  setEditingComponent(null);
                }}
              />
            </div>
          )}

          {/* ================= LEFT COLUMN: Mode Dependent Form (340px) ================= */}
          {isLeftPanelOpen ? (
            <div className="w-[340px] shrink-0 border-r border-graphite-800 bg-graphite-900 flex flex-col overflow-y-auto">
              <div className="h-10 px-4 border-b border-graphite-800 flex items-center justify-between shrink-0 bg-graphite-900/80">
                <span className="text-[10px] font-mono uppercase tracking-wider text-graphite-400 font-semibold">
                  Specification · {cadMode.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => setIsLeftPanelOpen(false)}
                  className="p-1 text-graphite-500 hover:text-white rounded hover:bg-graphite-800 transition-colors"
                  title="Collapse Specification Panel"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
              {cadMode === "design" ? (
                <DesignModeLeftPanel
                prompt={designPrompt}
                onChangePrompt={setDesignPrompt}
                referencePhotoUrl={designPhotoUrl}
                onPhotoSelected={(file) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    setDesignPhotoUrl(reader.result as string);
                  };
                  reader.readAsDataURL(file);
                }}
                onRemovePhoto={() => setDesignPhotoUrl(null)}
                detectedFeatures={detectedFeatures}
                onToggleFeature={(featureLabel) => {
                  setDetectedFeatures((prev) =>
                    prev.map((f) =>
                      f.label === featureLabel ? { ...f, detected: !f.detected } : f
                    )
                  );
                  if (!designPrompt.toLowerCase().includes(featureLabel.toLowerCase())) {
                    setDesignPrompt((p) => `${p}, with ${featureLabel}`);
                  }
                }}
                components={designComponents}
                onAddComponent={() => {
                  setIsLibraryDrawerOpen(true);
                }}
                onRemoveComponent={(id) => {
                  setDesignComponents((prev) => prev.filter((c) => c.id !== id));
                }}
                onChangeAnchor={(id, anchor) => {
                  setDesignComponents((prev) =>
                    prev.map((c) => (c.id === id ? { ...c, anchor } : c))
                  );
                }}
                missingMeasurements={missingMeasurements}
                missingValues={missingValues}
                onSetMissingValue={(key, val) => {
                  setMissingValues((prev) => ({ ...prev, [key]: val }));
                }}
                onSubmitMissingMeasurements={() => {
                  handleGenerateDesign();
                }}
                onGenerateDesign={() => handleGenerateDesign()}
                isDesigning={isDesigning}
                designProgressText={designProgressText}
              />
            ) : cadMode === "robot" ? (
              /* ================= ROBOT ASSEMBLY CONTROLS ================= */
              <div className="p-4 space-y-5">
                {/* Hidden Photo File Input for Robot */}
                <input
                  type="file"
                  ref={photoInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handlePhotoUpload(e.target.files[0]);
                    }
                  }}
                />

                {/* Photo Dropzone or Status */}
                {referencePhotoUrl ? (
                  <div className="p-3 rounded bg-graphite-950 border border-forge/40 space-y-2 font-mono">
                    <div className="flex items-center justify-between pb-1.5 border-b border-graphite-800">
                      <div className="flex items-center gap-1.5 text-xs text-graphite-100 font-semibold">
                        <Camera className="w-3.5 h-3.5 text-forge" />
                        <span>Reference Robot Photo</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isAnalyzingPhoto}
                        className="text-[10px] text-forge hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Change</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-graphite-400 flex items-center justify-between">
                      <span>Proportions extracted</span>
                      <span className="text-emerald-400 font-medium">
                        {isScreenConfirmed ? "Screen Confirmed ✓" : "Screen Drag Active"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    className="p-3.5 rounded border border-dashed border-graphite-750 hover:border-forge/60 bg-graphite-950/60 hover:bg-graphite-950 cursor-pointer transition-colors font-mono flex flex-col items-center justify-center text-center group"
                  >
                    <Camera className="w-5 h-5 text-graphite-500 group-hover:text-forge mb-1.5 transition-colors" />
                    <span className="text-xs font-semibold text-graphite-200 group-hover:text-white">
                      Upload Robot Photo
                    </span>
                    <span className="text-[10px] text-graphite-500 mt-0.5">
                      Extracts chibi proportions &amp; screen position
                    </span>
                  </div>
                )}

                {/* Overall Height & Wall */}
                <div className="space-y-3 p-3.5 rounded bg-graphite-950 border border-graphite-800 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-graphite-200">Total Height</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="60"
                        max="220"
                        step="1"
                        value={robotOverallHeight}
                        onChange={(e) => {
                          const val = Math.max(60, Math.min(220, parseFloat(e.target.value) || 120));
                          setRobotOverallHeight(val);
                        }}
                        className="w-16 bg-graphite-900 border border-graphite-750 rounded px-2 py-0.5 text-xs text-right text-forge font-bold outline-none focus:border-forge"
                      />
                      <span className="text-xs text-graphite-500">mm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="220"
                    step="1"
                    value={robotOverallHeight}
                    onChange={(e) => setRobotOverallHeight(parseFloat(e.target.value))}
                    className="w-full accent-forge cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-graphite-500">
                    <span>60 mm (Mini)</span>
                    <span>120 mm (Standard)</span>
                    <span>220 mm (Max)</span>
                  </div>

                  <div className="pt-2 border-t border-graphite-850 flex items-center justify-between">
                    <span className="text-[11px] text-graphite-400">Shell Wall Thickness:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1.2"
                        max="4.0"
                        step="0.1"
                        value={robotWall}
                        onChange={(e) => setRobotWall(parseFloat(e.target.value) || 2.0)}
                        className="w-14 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-xs text-right text-graphite-200 outline-none focus:border-forge"
                      />
                      <span className="text-xs text-graphite-500">mm</span>
                    </div>
                  </div>
                  {robotWall < 1.6 && (
                    <p className="text-[10px] text-amber-400">
                      * Wall &lt; 1.6 mm may be fragile or flex under press-fit loads.
                    </p>
                  )}
                </div>

                {/* Display Pocket Section */}
                <div className="p-3.5 rounded bg-graphite-950 border border-graphite-800 space-y-3 font-mono">
                  <div className="flex items-center justify-between pb-1.5 border-b border-graphite-800">
                    <span className="text-xs font-semibold text-graphite-200 flex items-center gap-1.5">
                      <Square className="w-3.5 h-3.5 text-forge" />
                      <span>Face Display Window</span>
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-forge/15 text-forge text-[10px]">
                      1.5mm Ledge
                    </span>
                  </div>

                  {/* Preset chips */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-graphite-500 mb-1 font-semibold">
                      Display Presets:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.keys(displayPresetsMap).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setSelectedDisplayPreset(k);
                            const p = displayPresetsMap[k];
                            setDisplaySizeL(p.size[0]);
                            setDisplaySizeW(p.size[1]);
                            setDisplaySizeT(p.size[2]);
                            setDisplayActiveW(p.active[0]);
                            setDisplayActiveH(p.active[1]);
                            setDisplayShape(p.shape);
                          }}
                          className={`py-1 px-2 rounded text-[11px] text-left transition-colors truncate border ${
                            selectedDisplayPreset === k
                              ? "bg-graphite-800 border-forge text-forge font-semibold"
                              : "bg-graphite-900 border-graphite-800 text-graphite-400 hover:text-white"
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Area Size */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-graphite-400 mb-0.5">Active Width (mm)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={displayActiveW}
                        onChange={(e) => setDisplayActiveW(parseFloat(e.target.value) || 0)}
                        className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-xs text-graphite-200 outline-none focus:border-forge"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-graphite-400 mb-0.5">Active Height (mm)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={displayActiveH}
                        onChange={(e) => setDisplayActiveH(parseFloat(e.target.value) || 0)}
                        className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-xs text-graphite-200 outline-none focus:border-forge"
                      />
                    </div>
                  </div>

                  {/* Offset & Shape */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-graphite-850">
                    <div>
                      <label className="block text-[10px] text-graphite-400 mb-0.5">Offset X (mm)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={displayOffsetX}
                        onChange={(e) => setDisplayOffsetX(parseFloat(e.target.value) || 0)}
                        className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-xs text-graphite-200 outline-none focus:border-forge"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-graphite-400 mb-0.5">Offset Z (mm)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={displayOffsetZ}
                        onChange={(e) => setDisplayOffsetZ(parseFloat(e.target.value) || 0)}
                        className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-1 text-xs text-graphite-200 outline-none focus:border-forge"
                      />
                    </div>
                  </div>

                  {/* Save Display to Library */}
                  <button
                    type="button"
                    onClick={() => handleSaveCustomComponentToLibrary(
                      selectedDisplayPreset === "Custom" ? "Custom OLED Screen" : selectedDisplayPreset,
                      [displaySizeL, displaySizeW, displaySizeT],
                      "display",
                      "Robot face display module",
                      { w: displayActiveW, h: displayActiveH, x: displayOffsetX, z: displayOffsetZ }
                    )}
                    className="w-full mt-2 py-1 px-2 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[10px] font-mono text-graphite-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Bookmark className="w-3 h-3 text-forge" />
                    <span>Save display module to library</span>
                  </button>
                </div>

                {/* Robot Parts Accordion */}
                <div className="space-y-2 font-mono text-xs">
                  <span className="text-[11px] uppercase tracking-wider text-graphite-400 font-semibold block mb-1">
                    Assembly Parts (5 Parts / 9 Halves)
                  </span>

                  {/* Head Part */}
                  <div className="p-3 rounded bg-graphite-950 border border-graphite-800">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedRobotCard(expandedRobotCard === "head" ? null : "head")}
                    >
                      <span className="font-semibold text-graphite-200 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-forge" /> Head (Front &amp; Back)
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-graphite-400 transition-transform ${
                          expandedRobotCard === "head" ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    {expandedRobotCard === "head" && (
                      <div className="mt-3 pt-2 border-t border-graphite-850 space-y-2 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Size (W × H × D):</span>
                          <span className="text-graphite-200">64.0 × 54.0 × 54.0 mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Parting Split:</span>
                          <span className="text-forge">Front / Back (Lip Joint)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Roundness:</span>
                          <span className="text-graphite-200">0.8 (Superellipse)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Body Part */}
                  <div className="p-3 rounded bg-graphite-950 border border-graphite-800">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedRobotCard(expandedRobotCard === "body" ? null : "body")}
                    >
                      <span className="font-semibold text-graphite-200 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-forge" /> Body (Front &amp; Back)
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-graphite-400 transition-transform ${
                          expandedRobotCard === "body" ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    {expandedRobotCard === "body" && (
                      <div className="mt-3 pt-2 border-t border-graphite-850 space-y-2 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Size (W × H × D):</span>
                          <span className="text-graphite-200">68.0 × 54.0 × 54.0 mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Shape:</span>
                          <span className="text-graphite-200">Egg (R24 top / R32 bottom)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Features:</span>
                          <span className="text-emerald-400">Speaker Grille + USB Cutout</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Arms Part */}
                  <div className="p-3 rounded bg-graphite-950 border border-graphite-800">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedRobotCard(expandedRobotCard === "arms" ? null : "arms")}
                    >
                      <span className="font-semibold text-graphite-200 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-forge" /> Arms (Left &amp; Right)
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-graphite-400 transition-transform ${
                          expandedRobotCard === "arms" ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    {expandedRobotCard === "arms" && (
                      <div className="mt-3 pt-2 border-t border-graphite-850 space-y-2.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Length:</span>
                          <span className="text-graphite-200">34.0 mm (Mirrored pair)</span>
                        </div>
                        <div>
                          <label className="block text-[10px] text-graphite-400 mb-1">Joint Type:</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRobotArmMode("fixed")}
                              className={`py-1 px-2 rounded text-[10px] font-semibold transition-colors border ${
                                robotArmMode === "fixed"
                                  ? "bg-graphite-800 border-forge text-forge"
                                  : "bg-graphite-900 border-graphite-800 text-graphite-400 hover:text-white"
                              }`}
                            >
                              Fixed Joint
                            </button>
                            <button
                              type="button"
                              onClick={() => setRobotArmMode("servo")}
                              className={`py-1 px-2 rounded text-[10px] font-semibold transition-colors border ${
                                robotArmMode === "servo"
                                  ? "bg-graphite-800 border-forge text-forge"
                                  : "bg-graphite-900 border-graphite-800 text-graphite-400 hover:text-white"
                              }`}
                            >
                              SG90 Servo
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ear Pods Part */}
                  <div className="p-3 rounded bg-graphite-950 border border-graphite-800">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedRobotCard(expandedRobotCard === "ears" ? null : "ears")}
                    >
                      <span className="font-semibold text-graphite-200 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-forge" /> Ear Pods (Left &amp; Right)
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-graphite-400 transition-transform ${
                          expandedRobotCard === "ears" ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    {expandedRobotCard === "ears" && (
                      <div className="mt-3 pt-2 border-t border-graphite-850 space-y-2 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Dimensions:</span>
                          <span className="text-graphite-200">Ø18.0 mm × 6.0 mm disc</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Mount Peg:</span>
                          <span className="text-forge">Ø4.0 mm × 4.8 mm (Press-fit)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Neck Collar Part */}
                  <div className="p-3 rounded bg-graphite-950 border border-graphite-800">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedRobotCard(expandedRobotCard === "neck" ? null : "neck")}
                    >
                      <span className="font-semibold text-graphite-200 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-forge" /> Neck Collar
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-graphite-400 transition-transform ${
                          expandedRobotCard === "neck" ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    {expandedRobotCard === "neck" && (
                      <div className="mt-3 pt-2 border-t border-graphite-850 space-y-2 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Dimensions:</span>
                          <span className="text-graphite-200">Ø24.0 mm × 8.0 mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-graphite-400">Wiring Hole:</span>
                          <span className="text-emerald-400">Ø12.0 mm Pass-through</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Internal Cavity Components */}
                <div className="p-3.5 rounded bg-graphite-950 border border-graphite-800 space-y-3 font-mono">
                  <span className="text-[11px] uppercase tracking-wider text-graphite-300 font-semibold block">
                    Internal Cavity Components ({(robotSpec.components || []).length})
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { name: "XIAO ESP32-C3", size: [21.0, 17.5, 5.0] },
                      { name: "18650 Battery", size: [66.0, 18.5, 18.5] },
                      { name: "LiPo 500mAh", size: [30.0, 25.0, 8.0] },
                      { name: "Mini Speaker", size: [28.0, 28.0, 9.0] },
                      { name: "SG90 Servo", size: [22.5, 12.2, 22.7] },
                    ].map((comp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const newC = {
                            id: `comp_${Date.now().toString(36)}`,
                            name: comp.name,
                            size: comp.size,
                            qty: 1,
                          };
                          setRobotSpec((prev) => ({
                            ...prev,
                            components: [...(prev.components || []), newC],
                          }));
                        }}
                        className="px-2 py-0.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[10px] text-graphite-300 hover:text-white transition-colors"
                      >
                        + {comp.name}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5 mt-2">
                    {(robotSpec.components || []).map((c: any) => (
                      <div
                        key={c.id}
                        className="p-2 rounded bg-graphite-900 border border-graphite-800 text-[11px] flex items-center justify-between"
                      >
                        <div>
                          <span className="text-graphite-200 font-medium">{c.name}</span>
                          <span className="text-graphite-500 block text-[10px]">
                            {c.size[0]} × {c.size[1]} × {c.size[2]} mm
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setRobotSpec((prev) => ({
                              ...prev,
                              components: (prev.components || []).filter((item: any) => item.id !== c.id),
                            }));
                          }}
                          className="text-graphite-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : cadMode === "part" ? (
              /* ================= PART MODE CONTROLS ================= */
              <div className="p-4 space-y-5">
                {/* Hidden Photo File Input */}
                <input
                  type="file"
                  ref={photoInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handlePhotoUpload(e.target.files[0]);
                    }
                  }}
                />

                {/* Photo Analysis Card or Upload Dropzone */}
                {photoAnalysis ? (
                  /* ================= PHOTO ANALYSIS CARD ================= */
                  <div className="p-3.5 rounded bg-graphite-950 border border-forge/40 space-y-3 font-mono">
                    <div className="flex items-center justify-between pb-2 border-b border-graphite-800">
                      <div className="flex items-center gap-1.5 text-xs text-graphite-100 font-semibold">
                        <Camera className="w-3.5 h-3.5 text-forge" />
                        <span>Photo Analysis</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isAnalyzingPhoto}
                        className="text-[10px] text-forge hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Change Photo</span>
                      </button>
                    </div>

                    {/* Detected Part Type Dropdown */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-graphite-400 mb-1 font-semibold">
                        Detected Type (Editable):
                      </label>
                      <select
                        value={partType}
                        onChange={(e) => {
                          const nt = e.target.value as "bracket" | "plate" | "mounting_plate" | "spacer" | "clip";
                          setPartType(nt);
                          const newMeas = defaultPartMeasurementsMap[nt] || {};
                          setPartMeasurements(newMeas);
                          setPartFeatures(defaultPartFeaturesMap[nt] || []);
                          triggerAutosave(projectId, projectName, {
                            mode: "part",
                            part_type: nt,
                            measurements: newMeas,
                            features: defaultPartFeaturesMap[nt] || [],
                            analysis_result: photoAnalysis,
                          }, []);
                        }}
                        className="w-full bg-graphite-900 border border-graphite-750 text-white rounded p-1.5 text-xs outline-none focus:border-forge"
                      >
                        <option value="bracket">L-Bracket</option>
                        <option value="plate">Plate</option>
                        <option value="mounting_plate">Mounting Plate</option>
                        <option value="spacer">Spacer / Standoff</option>
                        <option value="clip">Clip / Ring</option>
                      </select>
                    </div>

                    {/* Confidence Badge */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] text-graphite-500">Confidence:</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          photoAnalysis.confidence === "high"
                            ? "bg-emerald-950/80 border border-emerald-800 text-emerald-400"
                            : photoAnalysis.confidence === "medium"
                            ? "bg-cyan-950/80 border border-cyan-800 text-cyan-400"
                            : "bg-amber-950/80 border border-amber-800 text-amber-400"
                        }`}
                      >
                        {photoAnalysis.confidence} Confidence
                      </span>
                    </div>

                    {/* Low Confidence Warning */}
                    {photoAnalysis.confidence === "low" && (
                      <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>Not sure about this one. Check the type before building.</span>
                      </div>
                    )}

                    {/* Plain-English Features List */}
                    {photoAnalysis.features && photoAnalysis.features.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-graphite-400 block mb-1 font-semibold">
                          Visible Features:
                        </span>
                        <ul className="space-y-1 text-xs text-graphite-300 bg-graphite-900/60 p-2.5 rounded border border-graphite-800">
                          {photoAnalysis.features.map((feat, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-forge">•</span>
                              <span className="leading-snug">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Measure These Caliper Checklist */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] uppercase tracking-wider text-graphite-200 font-semibold flex items-center gap-1.5">
                          <Ruler className="w-3.5 h-3.5 text-forge" />
                          <span>Measure These (Caliper Checklist)</span>
                        </span>
                        <span className="text-[10px] text-graphite-500">Unit: mm</span>
                      </div>
                      <p className="text-[10px] text-graphite-500 mb-2 leading-relaxed">
                        Values link directly to the 3D model. Enter measurements using calipers or the scale estimator.
                      </p>

                      <div className="space-y-2">
                        {(photoAnalysis.measure_checklist && photoAnalysis.measure_checklist.length > 0
                          ? photoAnalysis.measure_checklist
                          : defaultChecklistsByType[partType] || []
                        ).map((item) => {
                          const curVal = (partMeasurements as any)[item.key] ?? "";
                          const isEst = !!estimatedFields[item.key];
                          return (
                            <div
                              key={item.key}
                              className="p-2.5 rounded bg-graphite-900/70 border border-graphite-800 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-graphite-200">
                                  {item.label}
                                </span>
                                {isEst && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-forge/15 border border-forge/40 text-forge">
                                    ~ estimated
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-graphite-500">{item.hint}</p>
                              <div className="flex items-center gap-2 pt-1">
                                <div className="flex-1 flex items-center bg-graphite-950 border border-graphite-750 focus-within:border-forge rounded px-2 py-1">
                                  <input
                                    type="number"
                                    step="0.1"
                                    placeholder="e.g. 25.0"
                                    value={curVal}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value) || 0;
                                      handleMeasurementChange(item.key as any, v);
                                      setEstimatedFields((prev) => ({ ...prev, [item.key]: false }));
                                    }}
                                    className="w-full bg-transparent text-xs text-white outline-none"
                                  />
                                  <span className="text-[10px] text-graphite-500 ml-1">mm</span>
                                </div>
                                {referencePhotoUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setScaleTargetKey(item.key);
                                      setScaleTargetLabel(item.label);
                                      setScalePoints([]);
                                      setScaleEstimateResult(null);
                                      setIsScaleHelperOpen(true);
                                    }}
                                    className="px-2 py-1 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-forge text-[10px] flex items-center gap-1 transition-colors"
                                    title="Estimate measurement from reference object in photo"
                                  >
                                    <Crosshair className="w-3 h-3" />
                                    <span>Est</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ================= START FROM PHOTO DROPZONE ================= */
                  <div className="space-y-3 font-mono">
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handlePhotoUpload(e.dataTransfer.files[0]);
                        }
                      }}
                      className="p-4 rounded border border-dashed border-graphite-700 bg-graphite-950/80 hover:border-forge transition-colors text-center"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 rounded bg-graphite-900 border border-graphite-800 flex items-center justify-center text-forge">
                          <Camera className="w-4 h-4" />
                        </div>
                        <div className="text-xs font-semibold text-graphite-200">
                          Start from Photo of Real Part
                        </div>
                        <p className="text-[10px] text-graphite-500 leading-relaxed max-w-[240px]">
                          Upload a photo of a broken/missing part. Vision AI classifies type & lists required caliper measurements.
                        </p>
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={isAnalyzingPhoto}
                          className="mt-1 py-1.5 px-3 bg-forge hover:bg-forge-hover disabled:opacity-50 text-graphite-950 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors shadow"
                        >
                          {isAnalyzingPhoto ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Analyzing Part Photo...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3 h-3" />
                              <span>Upload Part Photo</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Photo Analysis Error State */}
                    {photoError && (
                      <div className="p-3 rounded bg-red-950/50 border border-red-800 text-xs text-red-200 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <span>{photoError.message}</span>
                        </div>
                        {photoError.pullCmd && (
                          <div className="p-2 bg-graphite-950 rounded border border-graphite-800 text-[11px] text-forge select-all">
                            {photoError.pullCmd}
                          </div>
                        )}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setPhotoError(null)}
                            className="text-[10px] text-graphite-400 hover:text-white underline"
                          >
                            Configure part manually below
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Part Type Selection */}
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-graphite-400 mb-2 font-semibold">
                        Replacement Part Type
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {(
                          [
                            { id: "bracket", label: "L-Bracket", icon: Ruler },
                            { id: "plate", label: "Plate", icon: Square },
                            { id: "mounting_plate", label: "Mounting Plate", icon: Layers },
                            { id: "spacer", label: "Spacer / Standoff", icon: Disc },
                            { id: "clip", label: "Clip / Ring", icon: Disc },
                          ] as const
                        ).map((pt) => {
                          const Icon = pt.icon;
                          const isSel = partType === pt.id;
                          return (
                            <button
                              key={pt.id}
                              onClick={() => {
                                setPartType(pt.id);
                                setPartMeasurements(defaultPartMeasurementsMap[pt.id]);
                                setPartFeatures(defaultPartFeaturesMap[pt.id] || []);
                                triggerAutosave(projectId, projectName, {
                                  mode: "part",
                                  part_type: pt.id,
                                  measurements: defaultPartMeasurementsMap[pt.id],
                                  features: defaultPartFeaturesMap[pt.id] || [],
                                }, []);
                              }}
                              className={`p-2 rounded border text-left flex items-center gap-2 transition-colors ${
                                isSel
                                  ? "bg-forge/15 border-forge text-forge font-semibold"
                                  : "bg-graphite-950 border-graphite-800 text-graphite-400 hover:text-white hover:border-graphite-700"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{pt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Measurements Form */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-wider text-graphite-300 font-semibold">
                          Measurements
                        </span>
                        <span className="text-[10px] text-graphite-500">Unit: mm</span>
                      </div>

                      <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-2.5">
                        {partType === "bracket" && (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Leg 1 Length (X):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.leg1 ?? 40}
                                  onChange={(e) => handleMeasurementChange("leg1", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Leg 2 Height (Z):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.leg2 ?? 25}
                                  onChange={(e) => handleMeasurementChange("leg2", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Width (Y):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.width ?? 25}
                                  onChange={(e) => handleMeasurementChange("width", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Wall Thickness (T):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={partMeasurements.thickness ?? 3}
                                  onChange={(e) => handleMeasurementChange("thickness", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Inside Fillet:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={partMeasurements.fillet ?? 2}
                                  onChange={(e) => handleMeasurementChange("fillet", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>
                          </>
                        )}

                        {(partType === "plate" || partType === "mounting_plate") && (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Length (L):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.length ?? 60}
                                  onChange={(e) => handleMeasurementChange("length", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Width (W):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.width ?? 40}
                                  onChange={(e) => handleMeasurementChange("width", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Thickness (T):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={partMeasurements.thickness ?? 3}
                                  onChange={(e) => handleMeasurementChange("thickness", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Corner Fillet:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={partMeasurements.corner_radius ?? 0}
                                  onChange={(e) => handleMeasurementChange("corner_radius", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>
                          </>
                        )}

                        {partType === "spacer" && (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Outer Diameter:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={partMeasurements.outer_d ?? 12}
                                  onChange={(e) => handleMeasurementChange("outer_d", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Inner Hole (ID):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={partMeasurements.inner_d ?? 4.2}
                                  onChange={(e) => handleMeasurementChange("inner_d", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Height:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.height ?? 15}
                                  onChange={(e) => handleMeasurementChange("height", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>
                          </>
                        )}

                        {partType === "clip" && (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Outer Diameter:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.outer_d ?? 26}
                                  onChange={(e) => handleMeasurementChange("outer_d", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Inner Diameter:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.inner_d ?? 20}
                                  onChange={(e) => handleMeasurementChange("inner_d", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Height:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  value={partMeasurements.height ?? 10}
                                  onChange={(e) => handleMeasurementChange("height", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-graphite-400">Opening Gap:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={partMeasurements.gap ?? 4}
                                  onChange={(e) => handleMeasurementChange("gap", parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-graphite-900 border border-graphite-750 rounded px-1.5 py-0.5 text-right text-white outline-none focus:border-forge"
                                />
                                <span className="text-graphite-500 text-[10px]">mm</span>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Save Part Measurements to Library */}
                        <div className="pt-2 border-t border-graphite-850">
                          <button
                            type="button"
                            onClick={() => {
                              const pName = `${partType.replace('_', ' ').toUpperCase()} (${partMeasurements.length || partMeasurements.leg1 || partMeasurements.outer_d || 30}mm)`;
                              const l = partMeasurements.length || partMeasurements.leg1 || partMeasurements.outer_d || 30;
                              const w = partMeasurements.width || partMeasurements.outer_d || 20;
                              const t = partMeasurements.thickness || partMeasurements.height || 3;
                              handleSaveCustomComponentToLibrary(pName, [l, w, t], "custom", `Custom ${partType} replacement part`);
                            }}
                            className="w-full py-1 px-2 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[10px] font-mono text-graphite-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Bookmark className="w-3 h-3 text-forge" />
                            <span>Save part measurements to library</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Features List & Adding */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-graphite-300 font-semibold">
                      Features ({partFeatures.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddFeature(!showAddFeature)}
                      className="px-2 py-0.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[10px] font-mono text-forge transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Feature</span>
                    </button>
                  </div>

                  {/* Add Feature Mini-Form */}
                  {showAddFeature && (
                    <div className="p-3 mb-2 rounded bg-graphite-950 border border-forge/40 space-y-2.5 text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewFeatureType("hole")}
                          className={`flex-1 py-1 rounded text-[11px] transition-colors border ${
                            newFeatureType === "hole"
                              ? "bg-forge/15 border-forge text-forge font-semibold"
                              : "bg-graphite-900 border-graphite-750 text-graphite-400"
                          }`}
                        >
                          Single Hole
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewFeatureType("linear_pattern")}
                          className={`flex-1 py-1 rounded text-[11px] transition-colors border ${
                            newFeatureType === "linear_pattern"
                              ? "bg-forge/15 border-forge text-forge font-semibold"
                              : "bg-graphite-900 border-graphite-750 text-graphite-400"
                          }`}
                        >
                          Linear Pattern
                        </button>
                      </div>

                      {newFeatureType === "hole" ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <span className="text-[10px] text-graphite-500 block">X (mm)</span>
                            <input
                              type="number"
                              value={newHoleX}
                              onChange={(e) => setNewHoleX(e.target.value)}
                              className="w-full bg-graphite-900 border border-graphite-750 rounded px-1.5 py-1 text-white text-xs"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-graphite-500 block">Y (mm)</span>
                            <input
                              type="number"
                              value={newHoleY}
                              onChange={(e) => setNewHoleY(e.target.value)}
                              className="w-full bg-graphite-900 border border-graphite-750 rounded px-1.5 py-1 text-white text-xs"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-graphite-500 block">Diam (mm)</span>
                            <input
                              type="number"
                              step="0.1"
                              value={newHoleD}
                              onChange={(e) => setNewHoleD(e.target.value)}
                              className="w-full bg-graphite-900 border border-graphite-750 rounded px-1.5 py-1 text-white text-xs"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-1.5">
                            <div>
                              <span className="text-[10px] text-graphite-500 block">Count</span>
                              <input
                                type="number"
                                min="2"
                                max="10"
                                value={newPatCount}
                                onChange={(e) => setNewPatCount(e.target.value)}
                                className="w-full bg-graphite-900 border border-graphite-750 rounded px-1.5 py-1 text-white text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-graphite-500 block">Pitch (mm)</span>
                              <input
                                type="number"
                                step="1"
                                value={newPatPitch}
                                onChange={(e) => setNewPatPitch(e.target.value)}
                                className="w-full bg-graphite-900 border border-graphite-750 rounded px-1.5 py-1 text-white text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-graphite-500 block">Diam (mm)</span>
                              <input
                                type="number"
                                step="0.1"
                                value={newPatD}
                                onChange={(e) => setNewPatD(e.target.value)}
                                className="w-full bg-graphite-900 border border-graphite-750 rounded px-1.5 py-1 text-white text-xs"
                              />
                            </div>
                          </div>
                          {partType === "bracket" && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-graphite-500">Target:</span>
                              <button
                                type="button"
                                onClick={() => setNewPatLeg("leg1")}
                                className={`px-2 py-0.5 rounded text-[10px] border ${
                                  newPatLeg === "leg1"
                                    ? "bg-forge/15 border-forge text-forge"
                                    : "bg-graphite-900 border-graphite-750 text-graphite-400"
                                }`}
                              >
                                Leg 1
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewPatLeg("leg2")}
                                className={`px-2 py-0.5 rounded text-[10px] border ${
                                  newPatLeg === "leg2"
                                    ? "bg-forge/15 border-forge text-forge"
                                    : "bg-graphite-900 border-graphite-750 text-graphite-400"
                                }`}
                              >
                                Leg 2
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddFeature(false)}
                          className="px-2 py-1 rounded bg-graphite-850 hover:bg-graphite-800 text-graphite-400 text-[11px]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddFeature}
                          className="px-3 py-1 rounded bg-forge hover:bg-forge-hover text-graphite-950 font-semibold text-[11px]"
                        >
                          Add Feature
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Feature Cards */}
                  <div className="space-y-1.5">
                    {partFeatures.length === 0 ? (
                      <div className="p-3 text-center text-[11px] font-mono text-graphite-500 bg-graphite-950 rounded border border-graphite-800">
                        No holes or patterns added yet.
                      </div>
                    ) : (
                      partFeatures.map((f) => (
                        <div
                          key={f.id}
                          className="p-2.5 rounded bg-graphite-950 border border-graphite-800 flex items-center justify-between text-xs font-mono"
                        >
                          <div>
                            {f.type === "linear_pattern" ? (
                              <div>
                                <span className="text-forge font-medium">
                                  Linear Pattern: {f.count} × Ø{f.d} mm
                                </span>
                                <div className="text-[10px] text-graphite-400">
                                  {f.pitch} mm pitch {f.leg ? `on ${f.leg}` : ""}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="text-forge font-medium">
                                  Round Hole: Ø{f.d} mm
                                </span>
                                <div className="text-[10px] text-graphite-400">
                                  Position: ({f.x}, {f.y}) mm
                                </div>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFeature(f.id)}
                            className="p-1 text-graphite-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* ================= ENCLOSURE MODE CONTROLS ================= */
              <div className="p-4 space-y-5">
                {/* Natural Language Plan Box */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-graphite-400 mb-1.5 font-semibold">
                    Character Design Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={initialPrompt}
                    onChange={(e) => setInitialPrompt(e.target.value)}
                    placeholder="e.g. Cat-style head case for an ESP32 and OLED screen, ears, stubby arms"
                    className="w-full bg-graphite-950 border border-graphite-750 focus:border-forge rounded p-2.5 text-xs text-graphite-200 placeholder-graphite-600 font-mono outline-none resize-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handlePlanDesign}
                    disabled={isPlanning || !initialPrompt.trim()}
                    className="mt-2 w-full py-2 bg-graphite-850 hover:bg-graphite-800 disabled:opacity-50 text-forge border border-forge/40 hover:border-forge rounded text-xs font-mono font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {isPlanning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Planning Enclosure...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-forge" />
                        <span>Plan Character Design</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Components Cards */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-graphite-300 font-semibold">
                      Components ({(enclosureSpec.components || []).length})
                    </span>
                    <span className="text-[10px] font-mono text-graphite-500">L × W × H (mm)</span>
                  </div>

                  {/* Library Chips */}
                  <div className="mb-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-graphite-400">
                        Add from library:
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsLibraryDrawerOpen(true)}
                        className="text-[10px] font-mono text-forge hover:underline flex items-center gap-1"
                      >
                        <Layers className="w-3 h-3" />
                        <span>Browse Library</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {libraryBoards.map((b) => (
                        <button
                          key={b.key}
                          onClick={() => handleAddBoardChip(b.key)}
                          className="px-2 py-0.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-[10px] font-mono text-graphite-300 hover:text-white transition-colors"
                        >
                          + {b.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Component Cards */}
                  <div className="space-y-2">
                    {(enclosureSpec.components || []).map((c) => (
                      <div
                        key={c.id}
                        className="p-2.5 rounded bg-graphite-950 border border-graphite-800 text-xs font-mono flex items-start justify-between"
                      >
                        <div>
                          <div className="font-medium text-graphite-200">{c.name}</div>
                          <div className="text-[11px] text-graphite-400 mt-0.5">
                            {c.size[0]} × {c.size[1]} × {c.size[2]} mm
                          </div>
                          {c.note && (
                            <div className="text-[10px] text-amber-400/80 mt-0.5">
                              * {c.note}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveCustomComponentToLibrary(c.name, c.size, "custom", c.note, c.screen)}
                            className="px-1.5 py-0.5 rounded bg-graphite-900 hover:bg-graphite-850 border border-graphite-750 text-graphite-400 hover:text-forge text-[10px] flex items-center gap-1 transition-colors"
                            title="Save component to library"
                          >
                            <Bookmark className="w-3 h-3 text-forge" />
                            <span>Save to library</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveComponent(c.id)}
                            className="text-graphite-500 hover:text-red-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Windows */}
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-graphite-300 block mb-2 font-semibold">
                    Windows & Ports ({(enclosureSpec.windows || []).length})
                  </span>
                  <div className="space-y-2">
                    {(enclosureSpec.windows || []).map((w) => (
                      <div
                        key={w.id}
                        className="p-2.5 rounded bg-graphite-950 border border-graphite-800 text-xs font-mono flex justify-between"
                      >
                        <div>
                          <div className="font-medium text-graphite-200">
                            {w.name || w.id}
                          </div>
                          <div className="text-[11px] text-graphite-400 mt-0.5">
                            {w.face} face · {w.shape} {w.w} × {w.h} mm
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Appendages */}
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-graphite-300 block mb-2 font-semibold">
                    Appendages ({(enclosureSpec.appendages || []).length})
                  </span>
                  <div className="space-y-2">
                    {(enclosureSpec.appendages || []).map((a) => (
                      <div
                        key={a.id}
                        className="p-2.5 rounded bg-graphite-950 border border-graphite-800 text-xs font-mono flex justify-between"
                      >
                        <div>
                          <div className="font-medium text-graphite-200">
                            {a.name || a.id}
                          </div>
                          <div className="text-[11px] text-graphite-400 mt-0.5">
                            {a.type} on {a.face} · len {a.length}mm (base Ø{a.base_d}
                            mm)
                            {a.mirror ? " · mirrored pair" : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-10 shrink-0 border-r border-graphite-800 bg-graphite-900 flex flex-col items-center py-3 justify-between select-none">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setIsLeftPanelOpen(true)}
                className="p-2 text-graphite-400 hover:text-white hover:bg-graphite-800 rounded transition-colors"
                title="Expand Specification Panel"
              >
                <ChevronRight className="w-4 h-4 text-forge" />
              </button>
              <div className="w-4 h-px bg-graphite-800" />
              <span className="text-[9px] font-mono text-graphite-500 uppercase -rotate-90 py-4 whitespace-nowrap tracking-wider">
                Specs
              </span>
            </div>
          </div>
        )}

          {/* ================= CENTER COLUMN: 3D Viewport & Bottom Prompt Bar ================= */}
          <div className="flex-1 flex flex-col min-w-0 h-full bg-[#0c0d11]">
            {/* Viewport Tabs Header */}
            <div className="h-10 border-b border-graphite-800 bg-graphite-900/60 px-4 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[75%] scrollbar-none">
                {!isLeftPanelOpen && (
                  <button
                    type="button"
                    onClick={() => setIsLeftPanelOpen(true)}
                    className="p-1 rounded bg-graphite-850 border border-graphite-750 text-forge hover:text-white transition-colors mr-1 shrink-0 flex items-center gap-1 text-[11px]"
                    title="Open Specification Panel"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Specs</span>
                  </button>
                )}
                {cadMode === "design" ? (
                  <>
                    <button
                      onClick={() => setSelectedDesignPart("assembled")}
                      className={`px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors ${
                        selectedDesignPart === "assembled"
                          ? "bg-graphite-800 text-forge font-medium border border-forge/40"
                          : "text-graphite-400 hover:text-graphite-200"
                      }`}
                    >
                      Assembled
                    </button>
                    {designParts.length > 0 && (
                      <select
                        value={selectedDesignPart}
                        onChange={(e) => setSelectedDesignPart(e.target.value)}
                        className="bg-graphite-950 border border-graphite-750 text-white rounded px-2 py-0.5 text-[11px] outline-none focus:border-forge font-mono"
                      >
                        <option value="assembled">All Parts (Assembled)</option>
                        {designParts.map((p) => (
                          <option key={p} value={p}>
                            Single Part: {p}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-[10px] text-graphite-400">Explode:</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={explodedOffset}
                        onChange={(e) => setExplodedOffset(parseFloat(e.target.value))}
                        className="w-16 accent-forge cursor-pointer"
                      />
                      <span className="text-[10px] text-graphite-400">{explodedOffset}mm</span>
                    </div>
                  </>
                ) : cadMode === "robot" ? (
                  robotViewOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setActiveRobotPartTab(opt.key)}
                      className={`px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors ${
                        activeRobotPartTab === opt.key
                          ? "bg-graphite-800 text-forge font-medium border border-forge/40"
                          : "text-graphite-400 hover:text-graphite-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))
                ) : cadMode === "part" ? (
                  <span className="text-graphite-300 font-medium">
                    Part Preview ({partType})
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveTab("assembled")}
                      className={`px-3 py-1 rounded transition-colors ${
                        activeTab === "assembled"
                          ? "bg-graphite-800 text-forge font-medium"
                          : "text-graphite-400 hover:text-graphite-200"
                      }`}
                    >
                      Assembled
                    </button>
                    <button
                      onClick={() => setActiveTab("shell")}
                      className={`px-3 py-1 rounded transition-colors ${
                        activeTab === "shell"
                          ? "bg-graphite-800 text-forge font-medium"
                          : "text-graphite-400 hover:text-graphite-200"
                      }`}
                    >
                      Front Shell
                    </button>
                    <button
                      onClick={() => setActiveTab("cover")}
                      className={`px-3 py-1 rounded transition-colors ${
                        activeTab === "cover"
                          ? "bg-graphite-800 text-forge font-medium"
                          : "text-graphite-400 hover:text-graphite-200"
                      }`}
                    >
                      Back Cover
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {cadMode === "design" && (
                  <>
                    <div className="flex items-center gap-1 bg-graphite-950 border border-graphite-750 rounded px-1.5 py-0.5 text-[11px]">
                      <button
                        onClick={() =>
                          setClippingPlane((prev) => ({ ...prev, enabled: !prev.enabled }))
                        }
                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                          clippingPlane.enabled
                            ? "bg-forge text-graphite-950"
                            : "text-graphite-400 hover:text-white"
                        }`}
                        title="See inside with cross-section clipping plane"
                      >
                        See Inside
                      </button>
                      {clippingPlane.enabled && (
                        <>
                          <select
                            value={clippingPlane.axis}
                            onChange={(e) =>
                              setClippingPlane((prev) => ({
                                ...prev,
                                axis: e.target.value as any,
                              }))
                            }
                            className="bg-graphite-900 text-white text-[10px] rounded px-1 py-0.2 outline-none font-mono"
                          >
                            <option value="x">X</option>
                            <option value="y">Y</option>
                            <option value="z">Z</option>
                          </select>
                          <input
                            type="range"
                            min="-60"
                            max="60"
                            value={clippingPlane.offset}
                            onChange={(e) =>
                              setClippingPlane((prev) => ({
                                ...prev,
                                offset: parseFloat(e.target.value),
                              }))
                            }
                            className="w-14 accent-forge cursor-pointer"
                          />
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => setShowDimensionLabels(!showDimensionLabels)}
                      className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 ${
                        showDimensionLabels
                          ? "bg-forge/15 border-forge text-forge font-medium"
                          : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-graphite-200"
                      }`}
                    >
                      <Ruler className="w-3.5 h-3.5" />
                      <span>Dimensions</span>
                    </button>
                  </>
                )}
                {cadMode === "robot" && (
                  <button
                    onClick={() => setShowDimensionLabels(!showDimensionLabels)}
                    className={`px-2.5 py-1 rounded border text-[11px] transition-colors flex items-center gap-1.5 ${
                      showDimensionLabels
                        ? "bg-forge/15 border-forge text-forge font-medium"
                        : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-graphite-200"
                    }`}
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    <span>Dimensions</span>
                  </button>
                )}
                {cadMode === "enclosure" && (
                  <button
                    onClick={() => setSeeInside(!seeInside)}
                    className={`px-2.5 py-1 rounded border text-[11px] transition-colors flex items-center gap-1.5 ${
                      seeInside
                        ? "bg-forge/15 border-forge text-forge font-medium"
                        : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-graphite-200"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ghost View</span>
                  </button>
                )}
                <div className="h-4 w-px bg-graphite-800 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                  className={`px-2 py-1 rounded border text-[11px] font-mono transition-colors flex items-center gap-1 ${
                    isRightPanelOpen
                      ? "bg-graphite-800 border-graphite-700 text-forge"
                      : "bg-graphite-850 border-graphite-750 text-graphite-400 hover:text-white"
                  }`}
                  title={isRightPanelOpen ? "Collapse Inspector" : "Expand Inspector"}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>{isRightPanelOpen ? "Inspector" : "Export"}</span>
                </button>
              </div>
            </div>

            {/* Viewport 3D Canvas Area */}
            <div className="flex-1 flex min-h-0 relative overflow-hidden">
              <div className="flex-1 relative overflow-hidden">
                {activeGlbUrl ? (
                  <ModelViewer
                    glbUrl={activeGlbUrl}
                    modelName={
                      cadMode === "design"
                        ? `${selectedDesignPart}.glb`
                        : cadMode === "robot"
                        ? `robot-${activeRobotPartTab}.glb`
                        : cadMode === "part"
                        ? `${partType}_part.glb`
                        : `character-${activeTab}.glb`
                    }
                    seeInside={seeInside}
                    onToggleSeeInside={() => setSeeInside(!seeInside)}
                    clippingPlane={clippingPlane}
                    explodedOffset={explodedOffset}
                    rotationEuler={previewRotationEuler}
                    ghostComponents={
                      cadMode === "design"
                        ? designComponents.map((c) => ({
                            name: c.name,
                            size: c.size,
                            position:
                              c.anchor === "front face"
                                ? [0, 0, 15]
                                : c.anchor === "top center"
                                ? [0, 20, 0]
                                : c.anchor === "back face"
                                ? [0, 0, -15]
                                : [0, -10, 0],
                          }))
                        : undefined
                    }
                    dimensionLabels={
                      cadMode === "design" && showDimensionLabels
                        ? [
                            { text: "Outer Shell: 64 × 50 × 50 mm", position: [0, 45, 0] },
                            { text: "Window: 34 × 22 mm", position: [0, 0, 30] },
                            { text: "Wall: 2.0 mm", position: [35, 0, 0] },
                          ]
                        : undefined
                    }
                    onDownload={() => {
                      if (cadMode === "design") {
                        handleDownload(activeGlbUrl || undefined, `${selectedDesignPart}.glb`);
                        return;
                      }
                      if (buildResult) {
                        const f = buildResult.files;
                        if (cadMode === "robot") {
                          handleDownload(
                            activeRobotPartTab === "exploded"
                              ? f.exploded_glb || f.assembled_glb
                              : activeRobotPartTab === "ghost"
                              ? f.ghost_glb || f.assembled_glb
                              : f[`${activeRobotPartTab}_glb`] || f.assembled_glb,
                            `robot-${activeRobotPartTab}.glb`
                          );
                        } else if (cadMode === "part") {
                          handleDownload(f.part_glb || f.both_glb, `${partType}.glb`);
                        } else {
                          const file =
                            activeTab === "shell"
                              ? f.shell_glb
                              : activeTab === "cover"
                              ? f.cover_glb
                              : f.both_glb;
                          handleDownload(file, `character-${activeTab}.glb`);
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-[#0c0d11]">
                    <div className="w-16 h-16 rounded-xl bg-graphite-900 border border-graphite-800 flex items-center justify-center mb-4 text-forge">
                      {cadMode === "design" ? (
                        <Sparkles className="w-8 h-8" />
                      ) : cadMode === "robot" ? (
                        <Bot className="w-8 h-8" />
                      ) : cadMode === "part" ? (
                        <Ruler className="w-8 h-8" />
                      ) : (
                        <Box className="w-8 h-8" />
                      )}
                    </div>
                    <h3 className="text-sm font-mono font-medium text-graphite-200 mb-1">
                      {cadMode === "design"
                        ? "Ready to Synthesize 3D CAD Design"
                        : cadMode === "robot"
                        ? "Ready to Build Desktop Robot Assembly"
                        : cadMode === "part"
                        ? "Ready to Build Replacement Part"
                        : "Ready to Generate Character Enclosure"}
                    </h3>
                    <p className="text-xs font-mono text-graphite-500 max-w-md mb-5 leading-relaxed">
                      {cadMode === "design"
                        ? "Describe your design in natural English on the left, add components and measurements, then click Generate 3D CAD Design. The AI writes CadQuery code, executes it in a sandbox, and validates watertightness."
                        : cadMode === "robot"
                        ? "Configure chibi proportions, display pocket and component cavity on the left, or upload a reference robot photo, then click Build Robot Assembly to compile all 9 printable STL halves, STEP and exploded GLB."
                        : cadMode === "part"
                        ? "Configure measurements on the left or prompt like 'bracket 40 x 25 x 3 mm with 2 M3 holes 30 mm apart', then click Build Part to compile watertight STL, STEP and interactive 3D."
                        : "Plan your robot head or character shell on the left, or click Build Enclosure to compile watertight STL, STEP and interactive 3D preview with ghost components."}
                    </p>
                    <button
                      type="button"
                      onClick={handleBuild}
                      disabled={hasErrors || isMissingMeasurements || isBuilding}
                      className="px-4 py-2 bg-forge hover:bg-forge-hover disabled:opacity-50 text-graphite-950 font-mono text-xs font-semibold rounded flex items-center gap-2 transition-colors shadow"
                    >
                      {cadMode === "robot" ? <Bot className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
                      <span>
                        {cadMode === "robot"
                          ? "Build Robot Assembly Now"
                          : cadMode === "part"
                          ? "Build Part Now"
                          : "Build Enclosure Now"}
                      </span>
                    </button>
                  </div>
                )}

                {/* Floating Dimension Badges in Robot Mode */}
                {cadMode === "robot" && showDimensionLabels && (
                  <div className="absolute top-4 left-4 z-20 space-y-1.5 font-mono text-[11px] pointer-events-none select-none">
                    <div className="px-2.5 py-1 rounded bg-graphite-950/85 border border-graphite-800 text-graphite-200 backdrop-blur shadow">
                      <span className="text-graphite-500 mr-1.5">Total Height:</span>
                      <span className="text-forge font-bold">{robotOverallHeight} mm</span>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-graphite-950/85 border border-graphite-800 text-graphite-200 backdrop-blur shadow">
                      <span className="text-graphite-500 mr-1.5">Head:</span>
                      <span>64.0 × 54.0 × 54.0 mm</span>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-graphite-950/85 border border-graphite-800 text-graphite-200 backdrop-blur shadow">
                      <span className="text-graphite-500 mr-1.5">Body:</span>
                      <span>68.0 × 54.0 × 54.0 mm</span>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-graphite-950/85 border border-graphite-800 text-graphite-200 backdrop-blur shadow">
                      <span className="text-graphite-500 mr-1.5">Display:</span>
                      <span>{displayActiveW} × {displayActiveH} mm (1.5mm ledge)</span>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-graphite-950/85 border border-graphite-800 text-graphite-200 backdrop-blur shadow">
                      <span className="text-graphite-500 mr-1.5">Arms:</span>
                      <span>34.0 mm ({robotArmMode === "servo" ? "SG90 Servo" : "Fixed"})</span>
                    </div>
                  </div>
                )}

                {/* Reference Photo 3D Overlay */}
                {referencePhotoUrl && overlayOpacity > 0 && (
                  <div
                    className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-hidden"
                    style={{ opacity: overlayOpacity / 100 }}
                  >
                    <img
                      src={referencePhotoUrl}
                      alt="Reference Overlay"
                      className="max-w-full max-h-full object-contain filter drop-shadow-md select-none"
                      style={{ transform: `scale(${referenceZoom / 100})` }}
                    />
                  </div>
                )}
              </div>

              {/* Pinned Reference Photo Side Panel */}
              {referencePhotoUrl && isReferencePanelOpen && (
                <div className="w-72 shrink-0 border-l border-graphite-800 bg-graphite-900/95 flex flex-col z-20 transition-all font-mono">
                  {/* Panel Header */}
                  <div className="h-10 border-b border-graphite-800 px-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-graphite-200">
                      <Camera className="w-3.5 h-3.5 text-forge" />
                      <span className="font-semibold">Reference Photo</span>
                    </div>
                    <button
                      onClick={() => setIsReferencePanelOpen(false)}
                      className="p-1 text-graphite-400 hover:text-white rounded"
                      title="Collapse Photo Panel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Image with Zoom and Interactive SVG Overlay for Robot */}
                  <div className="flex-1 overflow-auto relative p-2 flex items-center justify-center bg-black/40">
                    <div
                      className="relative max-w-full max-h-full"
                      style={{ transform: `scale(${referenceZoom / 100})`, transformOrigin: "center" }}
                    >
                      <img
                        src={referencePhotoUrl}
                        alt="Reference Part"
                        className="max-w-full max-h-full object-contain rounded select-none pointer-events-none"
                      />

                      {cadMode === "robot" && (
                        <svg
                          className="absolute inset-0 w-full h-full cursor-crosshair pointer-events-auto"
                          viewBox="0 0 1000 1000"
                          preserveAspectRatio="none"
                        >
                          {/* Part Bounding Boxes */}
                          {robotBoxes.map((b) => {
                            const [ymin, xmin, ymax, xmax] = b.box;
                            const x = xmin * 1000;
                            const y = ymin * 1000;
                            const w = (xmax - xmin) * 1000;
                            const h = (ymax - ymin) * 1000;
                            return (
                              <g key={b.id}>
                                <rect
                                  x={x}
                                  y={y}
                                  width={w}
                                  height={h}
                                  fill="rgba(59, 130, 246, 0.12)"
                                  stroke="#3b82f6"
                                  strokeWidth="2"
                                  strokeDasharray="4 2"
                                />
                                <text
                                  x={x + 6}
                                  y={y + 16}
                                  fill="#93c5fd"
                                  fontSize="14"
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                >
                                  {b.label}
                                </text>
                              </g>
                            );
                          })}

                          {/* Display Screen Box (Draggable & Resizable) */}
                          {(() => {
                            const [ymin, xmin, ymax, xmax] = robotDisplayBox;
                            const x = xmin * 1000;
                            const y = ymin * 1000;
                            const w = Math.max(10, (xmax - xmin) * 1000);
                            const h = Math.max(10, (ymax - ymin) * 1000);
                            return (
                              <g
                                className="cursor-move pointer-events-auto"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setDraggingBoxId("display_center");
                                }}
                              >
                                <rect
                                  x={x}
                                  y={y}
                                  width={w}
                                  height={h}
                                  fill="rgba(255, 119, 0, 0.25)"
                                  stroke="#ff7700"
                                  strokeWidth="3"
                                />
                                <text
                                  x={x + 6}
                                  y={y + 18}
                                  fill="#ff7700"
                                  fontSize="15"
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                >
                                  SCREEN {isScreenConfirmed ? "✓" : ""}
                                </text>
                                {/* Resize Corner Handle */}
                                <circle
                                  cx={x + w}
                                  cy={y + h}
                                  r="14"
                                  fill="#ff7700"
                                  stroke="#ffffff"
                                  strokeWidth="2"
                                  className="cursor-nwse-resize"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setDraggingBoxId("display_corner");
                                  }}
                                />
                              </g>
                            );
                          })()}
                        </svg>
                      )}
                    </div>
                  </div>

                  {cadMode === "robot" ? (
                    <div className="p-3 border-t border-graphite-800 bg-graphite-950 space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-graphite-400">Zoom:</span>
                        <input
                          type="range"
                          min="100"
                          max="300"
                          step="10"
                          value={referenceZoom}
                          onChange={(e) => setReferenceZoom(parseInt(e.target.value, 10))}
                          className="w-24 accent-forge cursor-pointer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsScreenConfirmed(true);
                          const headBox = robotBoxes.find((b) => b.id === "head")?.box || [0.2, 0.08, 0.8, 0.48];
                          const headW_norm = Math.max(0.01, headBox[3] - headBox[1]);
                          const headH_norm = Math.max(0.01, headBox[2] - headBox[0]);
                          const headCenterX = (headBox[1] + headBox[3]) / 2;
                          const headCenterY = (headBox[0] + headBox[2]) / 2;

                          const dispCenterX = (robotDisplayBox[1] + robotDisplayBox[3]) / 2;
                          const dispCenterY = (robotDisplayBox[0] + robotDisplayBox[2]) / 2;

                          const actualHeadW = 64.0;
                          const actualHeadH = 54.0;

                          const dx_mm = Math.round(((dispCenterX - headCenterX) / headW_norm) * actualHeadW * 10) / 10;
                          const dz_mm = Math.round(((headCenterY - dispCenterY) / headH_norm) * actualHeadH * 10) / 10;

                          setDisplayOffsetX(dx_mm);
                          setDisplayOffsetZ(dz_mm);

                          setDiffLog((prev) => [
                            ...prev,
                            `Screen confirmed from photo: offset (${dx_mm > 0 ? "+" : ""}${dx_mm}, ${dz_mm > 0 ? "+" : ""}${dz_mm}) mm`,
                          ]);
                        }}
                        className={`w-full py-1.5 px-2 rounded text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          isScreenConfirmed
                            ? "bg-emerald-600 text-white"
                            : "bg-forge text-graphite-950 hover:bg-forge/90"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isScreenConfirmed ? "Screen Confirmed ✓" : "Confirm Screen"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleBuild}
                        disabled={isBuilding}
                        className="w-full py-1.5 px-2 bg-graphite-850 hover:bg-graphite-800 border border-forge/50 text-forge font-semibold rounded text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate Robot</span>
                      </button>
                    </div>
                  ) : (
                    /* Zoom, Overlay & Scale Helpers */
                    <div className="p-3 border-t border-graphite-800 bg-graphite-950 space-y-2.5 text-xs">
                      {/* Zoom Slider */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-graphite-400 flex items-center gap-1">
                          <ZoomIn className="w-3 h-3 text-forge" /> Zoom:
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="100"
                            max="300"
                            step="10"
                            value={referenceZoom}
                            onChange={(e) => setReferenceZoom(parseInt(e.target.value, 10))}
                            className="w-24 accent-forge cursor-pointer"
                          />
                          <span className="text-[10px] text-graphite-300 w-8 text-right font-mono">
                            {referenceZoom}%
                          </span>
                        </div>
                      </div>

                      {/* 3D Overlay Opacity Slider */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-graphite-400 flex items-center gap-1">
                          <Eye className="w-3 h-3 text-forge" /> 3D Overlay:
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={overlayOpacity}
                            onChange={(e) => setOverlayOpacity(parseInt(e.target.value, 10))}
                            className="w-24 accent-forge cursor-pointer"
                          />
                          <span className="text-[10px] text-graphite-300 w-8 text-right font-mono">
                            {overlayOpacity}%
                          </span>
                        </div>
                      </div>

                      {/* Open Scale Helper Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setScalePoints([]);
                          setScaleEstimateResult(null);
                          setScaleTargetKey(Object.keys(partMeasurements)[0] || "length");
                          setScaleTargetLabel("Part Dimension");
                          setIsScaleHelperOpen(true);
                        }}
                        className="w-full py-1.5 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-forge rounded text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>Estimate with Coin/Card</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Reopen Button if Collapsed */}
              {referencePhotoUrl && !isReferencePanelOpen && (
                <button
                  onClick={() => setIsReferencePanelOpen(true)}
                  className="absolute top-3 right-3 z-30 px-2.5 py-1.5 bg-graphite-900/95 hover:bg-graphite-850 border border-graphite-750 text-forge rounded text-xs font-mono flex items-center gap-1.5 shadow-lg transition-colors"
                  title="Show Reference Photo"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Photo</span>
                </button>
              )}
            </div>

            {/* ================= BOTTOM BAR: Prompt Box, Diff Log & Undo/Redo ================= */}
            <div className="border-t border-graphite-800 bg-graphite-900/90 p-3 shrink-0">
              <div className="flex items-center gap-3 mb-2">
                {/* Prompt Edit Input */}
                <div className="flex-1 flex items-center bg-graphite-950 border border-graphite-750 focus-within:border-forge rounded px-3 py-1.5 transition-colors">
                  <input
                    type="text"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyEdit();
                    }}
                    placeholder={
                      cadMode === "part"
                        ? "e.g. bracket 40 x 25 x 3 mm with 2 M3 holes 30 mm apart, or make leg1 50 mm..."
                        : "e.g. make the ears 4 mm taller, arms tilted down 15 degrees, window 6 mm wider..."
                    }
                    className="w-full bg-transparent text-xs font-mono text-graphite-100 placeholder-graphite-600 outline-none"
                  />
                  <button
                    onClick={handleApplyEdit}
                    disabled={isEditing || !editPrompt.trim()}
                    className="ml-2 text-forge hover:text-white disabled:opacity-40 p-1"
                    title="Send edit request"
                  >
                    {isEditing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Undo / Redo controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="p-1.5 rounded bg-graphite-850 hover:bg-graphite-800 disabled:opacity-30 border border-graphite-750 text-graphite-300 hover:text-white transition-colors"
                    title="Undo edit"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="p-1.5 rounded bg-graphite-850 hover:bg-graphite-800 disabled:opacity-30 border border-graphite-750 text-graphite-300 hover:text-white transition-colors"
                    title="Redo edit"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono text-graphite-400 px-2 py-1 rounded bg-graphite-850 border border-graphite-750">
                    v{version}
                  </span>
                </div>
              </div>

              {/* Diff Log (Last 5 edits in plain English) */}
              <div className="flex items-center gap-2 text-[10px] font-mono text-graphite-400 overflow-x-auto whitespace-nowrap">
                <span className="text-graphite-500 font-semibold shrink-0">Recent Edits:</span>
                {diffLog.slice(-5).map((d, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-graphite-850 border border-graphite-750 text-graphite-300 shrink-0"
                  >
                    • {d}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: Feasibility & Downloads (300px) ================= */}
          {isRightPanelOpen ? (
            <div className="w-[300px] shrink-0 border-l border-graphite-800 bg-graphite-900 flex flex-col justify-between overflow-y-auto">
              <div className="h-10 px-4 border-b border-graphite-800 flex items-center justify-between shrink-0 bg-graphite-900/80">
                <button
                  type="button"
                  onClick={() => setIsRightPanelOpen(false)}
                  className="p-1 text-graphite-500 hover:text-white rounded hover:bg-graphite-800 transition-colors"
                  title="Collapse Inspector Panel"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono uppercase tracking-wider text-graphite-400 font-semibold">
                  Inspector &amp; Export
                </span>
              </div>
              {cadMode === "design" ? (
              <DesignModeRightPanel
                validation={designValidation}
                overhangs={designOverhangs}
                iterations={designIterations}
                onFixIssue={handleFixIssue}
                onRotateForBestPrint={handleRotateForBestPrint}
                onExport={handleExportDesign}
                onOpenFitTest={handleOpenFitTest}
                isExporting={isExporting}
              />
            ) : (
              <>
                <div className="p-4 space-y-5">
              {/* Build Action Button */}
              <div>
                <button
                  type="button"
                  onClick={handleBuild}
                  disabled={hasErrors || isMissingMeasurements || isBuilding}
                  className={`w-full py-2.5 rounded font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                    hasErrors || isMissingMeasurements
                      ? "bg-graphite-800 text-graphite-500 border border-graphite-750 cursor-not-allowed"
                      : "bg-forge hover:bg-forge-hover text-graphite-950 cursor-pointer shadow"
                  }`}
                >
                  {isBuilding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-graphite-950" />
                      <span>
                        {cadMode === "robot"
                          ? "Compiling 3D Robot Assembly..."
                          : cadMode === "part"
                          ? "Compiling CAD Part..."
                          : "Compiling Enclosure..."}
                      </span>
                    </>
                  ) : hasErrors ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span>Build Blocked (Fix Errors)</span>
                    </>
                  ) : isMissingMeasurements ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <span>Caliper Measurements Required</span>
                    </>
                  ) : (
                    <>
                      {cadMode === "robot" ? (
                        <Bot className="w-4 h-4" />
                      ) : cadMode === "part" ? (
                        <Wrench className="w-4 h-4" />
                      ) : (
                        <Box className="w-4 h-4" />
                      )}
                      <span>
                        {cadMode === "robot"
                          ? "Build Robot Assembly"
                          : cadMode === "part"
                          ? "Build Replacement Part"
                          : "Build Enclosure"}
                      </span>
                    </>
                  )}
                </button>
                {isMissingMeasurements && (
                  <p className="text-[10px] font-mono text-amber-400/80 mt-1 text-center">
                    All required caliper measurements must be &gt; 0 mm before building.
                  </p>
                )}
              </div>

              {/* Overview Card */}
              <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-graphite-400 block font-semibold">
                  {cadMode === "robot"
                    ? "Robot Assembly Overview"
                    : cadMode === "part"
                    ? "Part Overview"
                    : "Enclosure Overview"}
                </span>
                <div className="space-y-1.5 text-xs font-mono">
                  {cadMode === "robot" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Total Height:</span>
                        <span className="text-forge font-medium">{robotOverallHeight} mm</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Printable Halves:</span>
                        <span className="text-graphite-200">9 parts (5 assembly units)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Wall / Tolerance:</span>
                        <span className="text-graphite-200">{robotWall.toFixed(1)} mm (0.2mm gap)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Display Pocket:</span>
                        <span className="text-graphite-200">
                          {selectedDisplayPreset} (1.5mm ledge)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Arm Joints:</span>
                        <span className="text-graphite-200">
                          {robotArmMode === "servo" ? "SG90 Servo Mount" : "Fixed Shoulder"}
                        </span>
                      </div>
                    </>
                  ) : cadMode === "part" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Part Type:</span>
                        <span className="text-forge font-medium uppercase">{partType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Thickness:</span>
                        <span className="text-graphite-200">
                          {(partMeasurements.thickness ?? 3).toFixed(1)} mm
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Features:</span>
                        <span className="text-graphite-200">
                          {partFeatures.length} hole / pattern
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Outer Size:</span>
                        <span className="text-forge font-medium">
                          {outerL} × {outerW} × {outerH} mm
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Inner Space:</span>
                        <span className="text-graphite-200">
                          {inner[0]} × {inner[1]} × {inner[2]} mm
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-graphite-500">Wall / Split:</span>
                        <span className="text-graphite-200">
                          {wall.toFixed(1)} mm ({enclosureSpec.split || "back"})
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Print Orientation Advice Card for Robot Mode */}
              {cadMode === "robot" && (
                <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-2 font-mono">
                  <span className="text-[10px] uppercase tracking-wider text-graphite-400 block font-semibold">
                    Print Orientation Hints
                  </span>
                  <div className="space-y-1.5 text-[11px] text-graphite-300">
                    <div className="flex items-start gap-1.5">
                      <span className="text-forge font-semibold">Head Front:</span>
                      <span className="text-graphite-400">Place parting plane flat on build plate.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-forge font-semibold">Body Front/Back:</span>
                      <span className="text-graphite-400">Place parting plane flat on build plate.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-forge font-semibold">Neck Collar:</span>
                      <span className="text-graphite-400">Print standing vertically (no supports).</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-forge font-semibold">Arms:</span>
                      <span className="text-graphite-400">Print flat with parting plane down.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-forge font-semibold">Ear Pods:</span>
                      <span className="text-graphite-400">Print flat with peg pointing upward.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Feasibility Check Rules */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-graphite-400 font-semibold">
                    Feasibility Rules
                  </span>
                  {isChecking && (
                    <span className="text-[10px] font-mono text-forge flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Checking...
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {issues.length === 0 ? (
                    <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-xs font-mono flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>All printability checks passed.</span>
                    </div>
                  ) : (
                    issues.map((issue, idx) => {
                      const isError = issue.level === "error";
                      const isWarn = issue.level === "warn";
                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded border text-xs font-mono flex items-start gap-2 ${
                            isError
                              ? "bg-red-950/40 border-red-800/60 text-red-300"
                              : isWarn
                              ? "bg-[#ff7700]/10 border-[#ff7700]/30 text-[#ff7700]"
                              : "bg-graphite-850 border-graphite-750 text-graphite-400"
                          }`}
                        >
                          {isError ? (
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          ) : isWarn ? (
                            <AlertTriangle className="w-4 h-4 text-[#ff7700] shrink-0 mt-0.5" />
                          ) : (
                            <Info className="w-4 h-4 text-graphite-400 shrink-0 mt-0.5" />
                          )}
                          <span className="leading-snug">{issue.msg}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Download CAD Files Section */}
              {buildResult && (
                <div className="pt-2 border-t border-graphite-800 space-y-3">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-graphite-400 block font-semibold">
                    Download CAD Files
                  </span>

                  {cadMode === "robot" ? (
                    <div className="space-y-2 font-mono">
                      {/* Download All ZIP */}
                      <button
                        onClick={() =>
                          handleDownload(
                            buildResult.files.all_zip || `/api/engine/cad/projects/${projectId}/files/all.zip`,
                            "robot_assembly.zip"
                          )
                        }
                        className="w-full py-2 px-3 bg-forge/15 hover:bg-forge/25 border border-forge text-forge font-bold rounded text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download All (ZIP - 9 STLs)</span>
                      </button>

                      {/* Assembled & Exploded GLB */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() =>
                            handleDownload(buildResult.files.assembled_glb, "robot_assembled.glb")
                          }
                          className="py-1.5 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-200 rounded text-[11px] text-center transition-colors truncate"
                        >
                          Assembled (GLB)
                        </button>
                        <button
                          onClick={() =>
                            handleDownload(buildResult.files.exploded_glb, "robot_exploded.glb")
                          }
                          className="py-1.5 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-graphite-200 rounded text-[11px] text-center transition-colors truncate"
                        >
                          Exploded (GLB)
                        </button>
                      </div>

                      {/* Part downloads list */}
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {[
                          { key: "head_front", name: "Head Front" },
                          { key: "head_back", name: "Head Back" },
                          { key: "body_front", name: "Body Front" },
                          { key: "body_back", name: "Body Back" },
                          { key: "neck", name: "Neck Collar" },
                          { key: "arm_left", name: "Arm Left" },
                          { key: "arm_right", name: "Arm Right" },
                          { key: "ear_left", name: "Ear Left" },
                          { key: "ear_right", name: "Ear Right" },
                        ].map((part) => (
                          <div
                            key={part.key}
                            className="p-1.5 rounded bg-graphite-950 border border-graphite-800 flex items-center justify-between"
                          >
                            <span className="text-[11px] text-graphite-300 font-medium truncate">
                              {part.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() =>
                                  handleDownload(buildResult.files[`${part.key}_stl`], `${part.key}.stl`)
                                }
                                className="py-0.5 px-1.5 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-300 rounded text-[10px]"
                              >
                                STL
                              </button>
                              <button
                                onClick={() =>
                                  handleDownload(buildResult.files[`${part.key}_step`], `${part.key}.step`)
                                }
                                className="py-0.5 px-1.5 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-300 rounded text-[10px]"
                              >
                                STEP
                              </button>
                              <button
                                onClick={() =>
                                  handleDownload(buildResult.files[`${part.key}_glb`], `${part.key}.glb`)
                                }
                                className="py-0.5 px-1.5 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-300 rounded text-[10px]"
                              >
                                GLB
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : cadMode === "part" ? (
                    <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800">
                      <span className="text-[11px] font-mono text-graphite-300 block mb-1.5 font-medium">
                        {partType}
                      </span>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() =>
                            handleDownload(
                              buildResult.files.part_stl || buildResult.files.shell_stl,
                              `${partType}.stl`
                            )
                          }
                          className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                        >
                          STL
                        </button>
                        <button
                          onClick={() =>
                            handleDownload(
                              buildResult.files.part_step || buildResult.files.shell_step,
                              `${partType}.step`
                            )
                          }
                          className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                        >
                          STEP
                        </button>
                        <button
                          onClick={() =>
                            handleDownload(
                              buildResult.files.part_glb || buildResult.files.both_glb,
                              `${partType}.glb`
                            )
                          }
                          className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                        >
                          GLB
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Front Shell Downloads */}
                      <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800">
                        <span className="text-[11px] font-mono text-graphite-300 block mb-1.5 font-medium">
                          Front Shell
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            onClick={() =>
                              handleDownload(buildResult.files.shell_stl, "front_shell.stl")
                            }
                            className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                          >
                            STL
                          </button>
                          <button
                            onClick={() =>
                              handleDownload(buildResult.files.shell_step, "front_shell.step")
                            }
                            className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                          >
                            STEP
                          </button>
                          <button
                            onClick={() =>
                              handleDownload(buildResult.files.shell_glb, "front_shell.glb")
                            }
                            className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                          >
                            GLB
                          </button>
                        </div>
                      </div>

                      {/* Back Cover Downloads */}
                      <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800">
                        <span className="text-[11px] font-mono text-graphite-300 block mb-1.5 font-medium">
                          Back Cover
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            onClick={() =>
                              handleDownload(buildResult.files.cover_stl, "back_cover.stl")
                            }
                            className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                          >
                            STL
                          </button>
                          <button
                            onClick={() =>
                              handleDownload(buildResult.files.cover_step, "back_cover.step")
                            }
                            className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                          >
                            STEP
                          </button>
                          <button
                            onClick={() =>
                              handleDownload(buildResult.files.cover_glb, "back_cover.glb")
                            }
                            className="py-1 px-2 bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-graphite-200 rounded text-[10px] font-mono text-center transition-colors"
                          >
                            GLB
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-graphite-800 text-[10px] font-mono text-graphite-500">
              <span>Bed: 220 × 220 × 250 mm · Nozzle: 0.4 mm</span>
            </div>
              </>
            )}
          </div>
        ) : (
          <div className="w-10 shrink-0 border-l border-graphite-800 bg-graphite-900 flex flex-col items-center py-3 justify-between select-none">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setIsRightPanelOpen(true)}
                className="p-2 text-graphite-400 hover:text-white hover:bg-graphite-800 rounded transition-colors"
                title="Expand Inspector & Export"
              >
                <ChevronLeft className="w-4 h-4 text-forge" />
              </button>
              <div className="w-4 h-px bg-graphite-800" />
              <span className="text-[9px] font-mono text-graphite-500 uppercase rotate-90 py-4 whitespace-nowrap tracking-wider">
                Export
              </span>
            </div>
          </div>
        )}
        </div>

        {/* ================= CAD SETTINGS & PRINTER CALIBRATION MODAL ================= */}
        <CadSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
        />

        {/* ================= FIT-TEST SLICE DOWNLOAD MODAL ================= */}
        <FitTestModal
          isOpen={isFitTestModalOpen}
          onClose={() => setIsFitTestModalOpen(false)}
          slices={fitTestSlices}
          projectName={projectName}
        />

        {/* ================= REFERENCE SCALE ESTIMATOR MODAL ================= */}
        {isScaleHelperOpen && referencePhotoUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-graphite-900 border border-graphite-750 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 border-b border-graphite-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-forge" />
                  <h3 className="text-sm font-mono font-semibold text-white">
                    Reference Scale Estimator: {scaleTargetLabel}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsScaleHelperOpen(false);
                    setScalePoints([]);
                    setScaleEstimateResult(null);
                  }}
                  className="p-1 text-graphite-400 hover:text-white rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Instructions Banner */}
              <div className="px-4 py-2.5 bg-graphite-950 border-b border-graphite-800 text-xs font-mono">
                {scalePoints.length < 2 ? (
                  <div className="flex items-center gap-2 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Step 1: Click 2 points across the reference object (known coin or card) [Green Line]</span>
                  </div>
                ) : scalePoints.length < 4 ? (
                  <div className="flex items-center gap-2 text-forge">
                    <span className="w-2 h-2 rounded-full bg-forge animate-pulse" />
                    <span>Step 2: Click 2 points across the feature to measure ({scaleTargetLabel}) [Orange Line]</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-graphite-300">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>All 4 points placed. Select reference item and compute estimate.</span>
                  </div>
                )}
              </div>

              {/* Reference Object Selection Bar */}
              <div className="p-3 border-b border-graphite-800 bg-graphite-900 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-graphite-400">Known Reference:</span>
                  <select
                    value={scaleRefObject}
                    onChange={(e) => setScaleRefObject(e.target.value as any)}
                    className="bg-graphite-950 border border-graphite-750 text-white rounded px-2 py-1 text-xs outline-none focus:border-forge"
                  >
                    <option value="us_quarter">US Quarter (24.26 mm)</option>
                    <option value="euro_1">1 Euro (23.25 mm)</option>
                    <option value="euro_2">2 Euro (25.75 mm)</option>
                    <option value="credit_card">Credit Card Long Edge (85.60 mm)</option>
                    <option value="ruler_mm">Ruler / Custom Measurement</option>
                  </select>
                </div>

                {scaleRefObject === "ruler_mm" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-graphite-400">Known mm:</span>
                    <input
                      type="number"
                      step="1"
                      value={scaleCustomMm}
                      onChange={(e) => setScaleCustomMm(parseFloat(e.target.value) || 1)}
                      className="w-16 bg-graphite-950 border border-graphite-750 rounded px-1.5 py-1 text-white text-xs outline-none"
                    />
                  </div>
                )}

                <button
                  onClick={() => {
                    setScalePoints([]);
                    setScaleEstimateResult(null);
                    setScaleCalcError(null);
                  }}
                  className="px-2 py-1 rounded bg-graphite-800 hover:bg-graphite-750 text-graphite-300 text-xs font-mono transition-colors"
                >
                  Reset Points
                </button>
              </div>

              {/* Interactive Photo Click Canvas */}
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/60 relative select-none">
                <div
                  onClick={(e) => {
                    if (scalePoints.length >= 4) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.round(e.clientX - rect.left);
                    const y = Math.round(e.clientY - rect.top);
                    setScalePoints((prev) => [...prev, [x, y]]);
                  }}
                  className="relative inline-block cursor-crosshair max-w-full"
                >
                  <img
                    src={referencePhotoUrl}
                    alt="Reference Scale Image"
                    className="max-h-[50vh] max-w-full object-contain block rounded"
                    draggable={false}
                  />

                  {/* SVG Overlay for Points and Lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {/* Reference Line (Points 0 and 1) */}
                    {scalePoints[0] && (
                      <circle cx={scalePoints[0][0]} cy={scalePoints[0][1]} r="4" fill="#10b981" />
                    )}
                    {scalePoints[1] && (
                      <circle cx={scalePoints[1][0]} cy={scalePoints[1][1]} r="4" fill="#10b981" />
                    )}
                    {scalePoints[0] && scalePoints[1] && (
                      <>
                        <line
                          x1={scalePoints[0][0]}
                          y1={scalePoints[0][1]}
                          x2={scalePoints[1][0]}
                          y2={scalePoints[1][1]}
                          stroke="#10b981"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                        <text
                          x={(scalePoints[0][0] + scalePoints[1][0]) / 2}
                          y={(scalePoints[0][1] + scalePoints[1][1]) / 2 - 6}
                          fill="#10b981"
                          fontSize="10"
                          fontFamily="monospace"
                          textAnchor="middle"
                          className="font-bold drop-shadow"
                        >
                          Ref Object
                        </text>
                      </>
                    )}

                    {/* Target Feature Line (Points 2 and 3) */}
                    {scalePoints[2] && (
                      <circle cx={scalePoints[2][0]} cy={scalePoints[2][1]} r="4" fill="#ff7700" />
                    )}
                    {scalePoints[3] && (
                      <circle cx={scalePoints[3][0]} cy={scalePoints[3][1]} r="4" fill="#ff7700" />
                    )}
                    {scalePoints[2] && scalePoints[3] && (
                      <>
                        <line
                          x1={scalePoints[2][0]}
                          y1={scalePoints[2][1]}
                          x2={scalePoints[3][0]}
                          y2={scalePoints[3][1]}
                          stroke="#ff7700"
                          strokeWidth="2"
                        />
                        <text
                          x={(scalePoints[2][0] + scalePoints[3][0]) / 2}
                          y={(scalePoints[2][1] + scalePoints[3][1]) / 2 - 6}
                          fill="#ff7700"
                          fontSize="10"
                          fontFamily="monospace"
                          textAnchor="middle"
                          className="font-bold drop-shadow"
                        >
                          {scaleTargetLabel}
                        </text>
                      </>
                    )}
                  </svg>
                </div>
              </div>

              {/* Modal Footer / Calculation Results */}
              <div className="p-4 border-t border-graphite-800 bg-graphite-950 space-y-3 font-mono">
                {scaleCalcError && (
                  <div className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{scaleCalcError}</span>
                  </div>
                )}

                {scaleEstimateResult ? (
                  <div className="p-3 rounded bg-graphite-900 border border-forge/40 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-graphite-400">Estimated Dimension:</span>
                        <span className="text-sm font-bold text-forge">
                          {scaleEstimateResult.estimated_mm} mm
                        </span>
                      </div>
                      <div className="text-[10px] text-amber-400/90 mt-0.5">
                        ⚠️ {scaleEstimateResult.warning}
                      </div>
                    </div>
                    <button
                      onClick={handleApplyScaleEstimate}
                      className="py-1.5 px-3 bg-forge hover:bg-forge-hover text-graphite-950 font-semibold text-xs rounded transition-colors"
                    >
                      Apply to {scaleTargetLabel}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-graphite-500">
                      {scalePoints.length === 4
                        ? "Ready to calculate"
                        : `${4 - scalePoints.length} point(s) remaining`}
                    </span>
                    <button
                      onClick={handleComputeScale}
                      disabled={scalePoints.length < 4 || isCalculatingScale}
                      className="py-1.5 px-4 bg-forge hover:bg-forge-hover disabled:opacity-40 text-graphite-950 font-semibold text-xs rounded flex items-center gap-1.5 transition-colors"
                    >
                      {isCalculatingScale ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Estimating Scale...</span>
                        </>
                      ) : (
                        <>
                          <Crosshair className="w-3.5 h-3.5" />
                          <span>Calculate Scale</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

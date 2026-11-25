"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  IconAdjustmentsHorizontal,
  IconX,
  IconCpu,
  IconDownload,
  IconCircleCheck,
  IconAlertCircle,
  IconLoader2,
  IconCheck,
  IconPrinter,
  IconSparkles,
} from "@tabler/icons-react";

interface PrinterProfile {
  name: string;
  hole_offset: number;
  peg_offset: number;
  lip_clearance: number;
  wall_offset: number;
  updated_at?: string;
}

interface PrinterConfigResponse {
  active_profile: string;
  bed: [number, number, number];
  nozzle: number;
  profiles: Record<string, PrinterProfile>;
}

interface CadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshProfiles?: () => void;
}

const HOLE_NOMINALS = [2, 3, 4, 5, 6, 8] as const;
const WALL_NOMINALS = [0.8, 1.2, 1.6, 2.0, 2.4, 3.0] as const;

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function CadSettingsModal({
  isOpen,
  onClose,
  onRefreshProfiles,
}: CadSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"brain" | "calibration">("brain");
  const [printerConfig, setPrinterConfig] =
    useState<PrinterConfigResponse | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isDownloadingCoupon, setIsDownloadingCoupon] = useState(false);
  const [isSavingCalibration, setIsSavingCalibration] = useState(false);
  const [calibSuccessMsg, setCalibSuccessMsg] = useState<string | null>(null);
  const [calibErrorMsg, setCalibErrorMsg] = useState<string | null>(null);

  // Caliper Form State
  const [newProfileName, setNewProfileName] = useState("my_calibrated_printer");
  const [holeValues, setHoleValues] = useState<number[]>([
    2.0, 3.0, 4.0, 5.0, 6.0, 8.0,
  ]);
  const [pegValues, setPegValues] = useState<number[]>([
    2.0, 3.0, 4.0, 5.0, 6.0, 8.0,
  ]);
  const [wallValues, setWallValues] = useState<number[]>([
    0.8, 1.2, 1.6, 2.0, 2.4, 3.0,
  ]);
  const [clearanceValue, setClearanceValue] = useState<number>(0.2);
  const [bedSize, setBedSize] = useState<[number, number, number]>([
    256, 256, 256,
  ]);
  const [nozzleSize, setNozzleSize] = useState<number>(0.4);

  const fetchProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    try {
      const res = await fetch("/api/engine/cad/calibration/profiles");
      if (res.ok) {
        const data = (await res.json()) as PrinterConfigResponse;
        setPrinterConfig(data);
        if (Array.isArray(data.bed) && data.bed.length === 3) {
          setBedSize(data.bed);
        }
        if (typeof data.nozzle === "number") {
          setNozzleSize(data.nozzle);
        }
      }
    } catch (e: unknown) {
      console.error("Failed to load printer profiles:", e);
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void fetchProfiles();
  }, [isOpen, fetchProfiles]);

  const handleDownloadCoupon = async () => {
    setIsDownloadingCoupon(true);
    setCalibSuccessMsg(null);
    setCalibErrorMsg(null);
    try {
      const res = await fetch("/api/engine/cad/calibration/coupon", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate coupon STL");
      const data = (await res.json()) as { file: string };
      const a = document.createElement("a");
      a.href = `/api/engine${data.file}`;
      a.download = "calibration_coupon.stl";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setCalibSuccessMsg(
        "Calibration coupon STL downloaded. Print with 0.2mm layers & 0.4mm nozzle.",
      );
    } catch (e: unknown) {
      setCalibErrorMsg(getErrorMessage(e, "Could not generate coupon."));
    } finally {
      setIsDownloadingCoupon(false);
    }
  };

  const handleSaveCalibration = async () => {
    setIsSavingCalibration(true);
    setCalibSuccessMsg(null);
    setCalibErrorMsg(null);
    try {
      const res = await fetch("/api/engine/cad/calibration/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_name: newProfileName.trim() || "my_printer",
          measurements: {
            holes: holeValues,
            pegs: pegValues,
            walls: wallValues,
            clearance: clearanceValue,
          },
          bed: bedSize,
          nozzle: nozzleSize,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to compute and save calibration profile.");
      }
      const data = (await res.json()) as {
        active_profile: string;
        offsets: {
          hole_offset: number;
          peg_offset: number;
          wall_offset: number;
          lip_clearance: number;
        };
      };
      setCalibSuccessMsg(
        `Profile '${data.active_profile}' saved! Offsets applied: Holes +${data.offsets.hole_offset.toFixed(2)}mm, Pegs ${data.offsets.peg_offset.toFixed(2)}mm, Walls ${data.offsets.wall_offset.toFixed(2)}mm, Clearance ${data.offsets.lip_clearance.toFixed(2)}mm.`,
      );
      await fetchProfiles();
      onRefreshProfiles?.();
    } catch (e: unknown) {
      setCalibErrorMsg(getErrorMessage(e, "Failed to save calibration."));
    } finally {
      setIsSavingCalibration(false);
    }
  };

  if (!isOpen) return null;

  const activeProfileData = printerConfig
    ? printerConfig.profiles[printerConfig.active_profile]
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 font-mono backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 26 }}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-foreground/85 bg-card text-card-foreground shadow-[0_6px_0_var(--foreground)] transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2.5">
            <motion.span
              whileHover={{ rotate: 18, scale: 1.12 }}
              transition={{ type: "spring", stiffness: 420, damping: 20 }}
              className="inline-flex items-center justify-center rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-1.5 text-white shadow-[0_2px_0_var(--foreground)]"
            >
              <IconAdjustmentsHorizontal size={15} stroke={2.1} />
            </motion.span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              CAD & Agent Settings
            </h3>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            aria-label="Close settings modal"
            className="rounded-lg border border-border bg-secondary/60 p-1 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <IconX size={16} stroke={2.1} />
          </motion.button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-3 border-b border-border bg-background/60 px-4 pt-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("brain")}
            className={`group flex items-center gap-2 border-b-2 px-3 pb-2.5 transition-colors ${
              activeTab === "brain"
                ? "border-[var(--brand,#ff6b2c)] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <motion.span
              animate={activeTab === "brain" ? { scale: 1.08 } : { scale: 1 }}
              className={`inline-flex items-center justify-center rounded-lg border p-1 transition-colors ${
                activeTab === "brain"
                  ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                  : "border-border bg-card text-[var(--brand,#ff6b2c)] group-hover:border-foreground"
              }`}
            >
              <IconSparkles size={13} stroke={2.1} />
            </motion.span>
            <span>Design Brain</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("calibration")}
            className={`group flex items-center gap-2 border-b-2 px-3 pb-2.5 transition-colors ${
              activeTab === "calibration"
                ? "border-[var(--brand,#ff6b2c)] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <motion.span
              animate={
                activeTab === "calibration" ? { scale: 1.08 } : { scale: 1 }
              }
              className={`inline-flex items-center justify-center rounded-lg border p-1 transition-colors ${
                activeTab === "calibration"
                  ? "border-foreground bg-[var(--brand,#ff6b2c)] text-white shadow-[0_2px_0_var(--foreground)]"
                  : "border-border bg-card text-[var(--brand,#ff6b2c)] group-hover:border-foreground"
              }`}
            >
              <IconPrinter size={13} stroke={2.1} />
            </motion.span>
            <span>Printer Calibration</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {activeTab === "brain" ? (
            <div className="space-y-5">
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select AI Reasoning Engine:
                </span>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-secondary/40 p-4 text-foreground">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <motion.span
                          whileHover={{ scale: 1.12, rotate: -6 }}
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 20,
                          }}
                          className="inline-flex items-center justify-center rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] p-1.5 text-white shadow-[0_2px_0_var(--foreground)]"
                        >
                          <IconCpu size={15} stroke={2.1} />
                        </motion.span>
                        <span className="text-xs font-bold">
                          Local Design Engine
                        </span>
                      </div>
                      <span className="rounded-full border border-[var(--brand,#ff6b2c)]/40 bg-[var(--brand,#ff6b2c)]/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--brand,#ff6b2c)]">
                        Active
                      </span>
                    </div>
                    <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                      Generates parametric CAD geometry and performs visual code
                      inspection offline.
                    </p>
                    <ul className="list-inside list-disc space-y-1 font-mono text-[10px] text-muted-foreground">
                      <li>
                        Automated sandbox verification loop with error recovery
                      </li>
                      <li>Local execution with immediate memory release</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {isLoadingProfiles && !printerConfig && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <IconLoader2
                    size={15}
                    stroke={2.1}
                    className="animate-spin text-[var(--brand,#ff6b2c)]"
                  />
                  <span>Loading printer profiles...</span>
                </div>
              )}

              {/* Active Profile Info */}
              {printerConfig && (
                <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      Active Profile:
                    </span>
                    <span className="rounded-full border border-[var(--brand,#ff6b2c)]/40 bg-[var(--brand,#ff6b2c)]/15 px-2.5 py-0.5 text-xs font-bold text-[var(--brand,#ff6b2c)]">
                      {printerConfig.active_profile}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                    <div>
                      Hole Offset:{" "}
                      <span className="font-semibold text-foreground">
                        +{activeProfileData?.hole_offset ?? 0} mm
                      </span>
                    </div>
                    <div>
                      Peg Offset:{" "}
                      <span className="font-semibold text-foreground">
                        {activeProfileData?.peg_offset ?? 0} mm
                      </span>
                    </div>
                    <div>
                      Wall Offset:{" "}
                      <span className="font-semibold text-foreground">
                        {activeProfileData?.wall_offset ?? 0} mm
                      </span>
                    </div>
                    <div>
                      Lip Clearance:{" "}
                      <span className="font-semibold text-foreground">
                        {activeProfileData?.lip_clearance ?? 0.2} mm
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Download Calibration Coupon */}
              <div className="space-y-2.5 rounded-xl border border-border bg-secondary/30 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      Step 1: Calibration Test Coupon
                    </h4>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Prints all 6 features on one coupon: stepped holes, test
                      pegs, wall thicknesses, and slip-fit joint.
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    whileHover={{ y: -1.5 }}
                    whileTap={{ scale: 0.96, y: 1 }}
                    onClick={() => {
                      void handleDownloadCoupon();
                    }}
                    disabled={isDownloadingCoupon}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-foreground/80 bg-card px-3 py-1.5 text-xs font-bold text-[var(--brand,#ff6b2c)] shadow-[0_2px_0_var(--foreground)] transition hover:border-foreground hover:bg-[var(--brand,#ff6b2c)]/12 disabled:opacity-50"
                  >
                    {isDownloadingCoupon ? (
                      <IconLoader2
                        size={14}
                        stroke={2.2}
                        className="animate-spin"
                      />
                    ) : (
                      <IconDownload size={14} stroke={2.2} />
                    )}
                    <span>Download Coupon STL</span>
                  </motion.button>
                </div>
              </div>

              {/* Step 2: Caliper Measurement Input Form */}
              <div className="space-y-4 rounded-xl border border-border bg-secondary/30 p-3.5">
                <h4 className="text-xs font-bold text-foreground">
                  Step 2: Enter Caliper Measurements
                </h4>

                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">
                    New Profile Name:
                  </label>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                    placeholder="e.g. Ender3_PLA_04"
                  />
                </div>

                {/* 1. Holes */}
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-foreground">
                    1. Measured Hole Diameters (Nominal: 2, 3, 4, 5, 6, 8 mm):
                  </span>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {HOLE_NOMINALS.map((nom, i) => (
                      <div key={nom} className="text-center">
                        <span className="block text-[9px] text-muted-foreground">
                          Ø{nom}
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          value={holeValues[i]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || nom;
                            setHoleValues((prev) =>
                              prev.map((item, idx) => (idx === i ? val : item)),
                            );
                          }}
                          className="w-full rounded-md border border-border bg-background px-1 py-1 text-center text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Pegs */}
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-foreground">
                    2. Measured Peg Diameters (Nominal: 2, 3, 4, 5, 6, 8 mm):
                  </span>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {HOLE_NOMINALS.map((nom, i) => (
                      <div key={nom} className="text-center">
                        <span className="block text-[9px] text-muted-foreground">
                          Ø{nom}
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          value={pegValues[i]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || nom;
                            setPegValues((prev) =>
                              prev.map((item, idx) => (idx === i ? val : item)),
                            );
                          }}
                          className="w-full rounded-md border border-border bg-background px-1 py-1 text-center text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Walls */}
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-foreground">
                    3. Measured Wall Thicknesses (Nominal: 0.8, 1.2, 1.6, 2.0,
                    2.4, 3.0 mm):
                  </span>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {WALL_NOMINALS.map((nom, i) => (
                      <div key={nom} className="text-center">
                        <span className="block text-[9px] text-muted-foreground">
                          {nom}mm
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          value={wallValues[i]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || nom;
                            setWallValues((prev) =>
                              prev.map((item, idx) => (idx === i ? val : item)),
                            );
                          }}
                          className="w-full rounded-md border border-border bg-background px-1 py-1 text-center text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Clearance, Bed, and Nozzle */}
                <div className="grid grid-cols-1 gap-2 border-t border-border pt-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">
                      Slip-fit Clearance (mm):
                    </label>
                    <input
                      type="number"
                      step="0.02"
                      value={clearanceValue}
                      onChange={(e) =>
                        setClearanceValue(parseFloat(e.target.value) || 0.2)
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">
                      Printer Bed [X, Y, Z]:
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={bedSize[0]}
                        onChange={(e) =>
                          setBedSize([
                            parseFloat(e.target.value) || 220,
                            bedSize[1],
                            bedSize[2],
                          ])
                        }
                        className="w-1/3 rounded-md border border-border bg-background px-1 py-1 text-center text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                      />
                      <input
                        type="number"
                        value={bedSize[1]}
                        onChange={(e) =>
                          setBedSize([
                            bedSize[0],
                            parseFloat(e.target.value) || 220,
                            bedSize[2],
                          ])
                        }
                        className="w-1/3 rounded-md border border-border bg-background px-1 py-1 text-center text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                      />
                      <input
                        type="number"
                        value={bedSize[2]}
                        onChange={(e) =>
                          setBedSize([
                            bedSize[0],
                            bedSize[1],
                            parseFloat(e.target.value) || 250,
                          ])
                        }
                        className="w-1/3 rounded-md border border-border bg-background px-1 py-1 text-center text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">
                      Nozzle (mm):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={nozzleSize}
                      onChange={(e) =>
                        setNozzleSize(parseFloat(e.target.value) || 0.4)
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-[var(--brand,#ff6b2c)]"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <motion.button
                  type="button"
                  whileHover={{ y: -1.5 }}
                  whileTap={{ scale: 0.98, y: 1 }}
                  onClick={() => {
                    void handleSaveCalibration();
                  }}
                  disabled={isSavingCalibration}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-[var(--brand,#ff6b2c)] py-2 text-xs font-black text-white shadow-[0_3px_0_var(--foreground)] transition active:shadow-none disabled:opacity-50"
                >
                  <span className="inline-flex items-center justify-center rounded-lg border border-foreground bg-card p-0.5 text-[var(--brand,#ff6b2c)]">
                    {isSavingCalibration ? (
                      <IconLoader2
                        size={14}
                        stroke={2.2}
                        className="animate-spin"
                      />
                    ) : (
                      <IconCheck size={14} stroke={2.4} />
                    )}
                  </span>
                  <span>Calculate Offsets & Save Profile</span>
                </motion.button>
              </div>

              {/* Status messages */}
              {calibSuccessMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  <IconCircleCheck
                    size={16}
                    stroke={2.1}
                    className="shrink-0"
                  />
                  <span>{calibSuccessMsg}</span>
                </div>
              )}
              {calibErrorMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <IconAlertCircle
                    size={16}
                    stroke={2.1}
                    className="shrink-0"
                  />
                  <span>{calibErrorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

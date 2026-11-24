"use client";

import React, { useState, useEffect } from "react";
import {
  Sliders,
  X,
  Cpu,
  Cloud,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  Printer,
  Sparkles,
} from "lucide-react";

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

export default function CadSettingsModal({
  isOpen,
  onClose,
  onRefreshProfiles,
}: CadSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"brain" | "calibration">("brain");
  const [printerConfig, setPrinterConfig] = useState<PrinterConfigResponse | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isDownloadingCoupon, setIsDownloadingCoupon] = useState(false);
  const [isSavingCalibration, setIsSavingCalibration] = useState(false);
  const [calibSuccessMsg, setCalibSuccessMsg] = useState<string | null>(null);
  const [calibErrorMsg, setCalibErrorMsg] = useState<string | null>(null);

  // Caliper Form State
  const [newProfileName, setNewProfileName] = useState("my_calibrated_printer");
  const [holeValues, setHoleValues] = useState<number[]>([2.0, 3.0, 4.0, 5.0, 6.0, 8.0]);
  const [pegValues, setPegValues] = useState<number[]>([2.0, 3.0, 4.0, 5.0, 6.0, 8.0]);
  const [wallValues, setWallValues] = useState<number[]>([0.8, 1.2, 1.6, 2.0, 2.4, 3.0]);
  const [clearanceValue, setClearanceValue] = useState<number>(0.20);
  const [bedSize, setBedSize] = useState<[number, number, number]>([256, 256, 256]);
  const [nozzleSize, setNozzleSize] = useState<number>(0.4);

  useEffect(() => {
    if (!isOpen) return;
    fetchProfiles();
  }, [isOpen]);

  const fetchProfiles = async () => {
    setIsLoadingProfiles(true);
    try {
      const res = await fetch("/api/engine/cad/calibration/profiles");
      if (res.ok) {
        const data = await res.json();
        setPrinterConfig(data);
        if (data.bed) setBedSize(data.bed);
        if (data.nozzle) setNozzleSize(data.nozzle);
      }
    } catch (e) {
      console.error("Failed to load printer profiles:", e);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  const handleDownloadCoupon = async () => {
    setIsDownloadingCoupon(true);
    setCalibSuccessMsg(null);
    setCalibErrorMsg(null);
    try {
      const res = await fetch("/api/engine/cad/calibration/coupon", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate coupon STL");
      const data = await res.json();
      const a = document.createElement("a");
      a.href = `/api/engine${data.file}`;
      a.download = "calibration_coupon.stl";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setCalibSuccessMsg("Calibration coupon STL downloaded. Print with 0.2mm layers & 0.4mm nozzle.");
    } catch (e: any) {
      setCalibErrorMsg(e.message || "Could not generate coupon.");
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

      if (!res.ok) throw new Error("Failed to compute and save calibration profile.");
      const data = await res.json();
      setCalibSuccessMsg(
        `Profile '${data.active_profile}' saved! Offsets applied: Holes +${data.offsets.hole_offset.toFixed(2)}mm, Pegs ${data.offsets.peg_offset.toFixed(2)}mm, Walls ${data.offsets.wall_offset.toFixed(2)}mm, Clearance ${data.offsets.lip_clearance.toFixed(2)}mm.`
      );
      fetchProfiles();
      if (onRefreshProfiles) onRefreshProfiles();
    } catch (e: any) {
      setCalibErrorMsg(e.message || "Failed to save calibration.");
    } finally {
      setIsSavingCalibration(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-graphite-900 border border-graphite-750 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-mono">
        {/* Header */}
        <div className="p-4 border-b border-graphite-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-forge" />
            <h3 className="text-sm font-semibold text-white">CAD &amp; Agent Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-graphite-400 hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-graphite-800 bg-graphite-950 px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab("brain")}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === "brain"
                ? "border-forge text-forge"
                : "border-transparent text-graphite-400 hover:text-graphite-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Design Brain</span>
          </button>
          <button
            onClick={() => setActiveTab("calibration")}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === "calibration"
                ? "border-forge text-forge"
                : "border-transparent text-graphite-400 hover:text-graphite-200"
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Printer Calibration</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === "brain" ? (
            <div className="space-y-5">
              <div>
                <label className="text-xs uppercase tracking-wider text-graphite-400 font-semibold block mb-2">
                  Select AI Reasoning Engine:
                </label>
                <div className="space-y-3">
                  {/* Local Brain Card */}
                  <div
                    className="p-4 rounded-lg border bg-graphite-900 border-graphite-750 text-white"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-forge" />
                        <span className="font-semibold text-xs text-graphite-100">Local Design Engine</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-graphite-800 border border-graphite-700 text-graphite-300 text-[10px] font-mono">
                        Active
                      </span>
                    </div>
                    <p className="text-[11px] text-graphite-300 leading-relaxed mb-2">
                      Generates parametric CAD geometry and performs visual code inspection offline.
                    </p>
                    <ul className="text-[10px] text-graphite-400 space-y-1 font-mono list-disc list-inside">
                      <li>Automated sandbox verification loop with error recovery</li>
                      <li>Local execution with immediate memory release</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Profile Info */}
              {printerConfig && (
                <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-graphite-300 font-semibold">Active Profile:</span>
                    <span className="px-2 py-0.5 rounded bg-forge/15 border border-forge/40 text-forge text-xs font-bold">
                      {printerConfig.active_profile}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1 text-[11px] text-graphite-400">
                    <div>Hole Offset: <span className="text-white font-semibold">+{printerConfig.profiles[printerConfig.active_profile]?.hole_offset ?? 0} mm</span></div>
                    <div>Peg Offset: <span className="text-white font-semibold">{printerConfig.profiles[printerConfig.active_profile]?.peg_offset ?? 0} mm</span></div>
                    <div>Wall Offset: <span className="text-white font-semibold">{printerConfig.profiles[printerConfig.active_profile]?.wall_offset ?? 0} mm</span></div>
                    <div>Lip Clearance: <span className="text-white font-semibold">{printerConfig.profiles[printerConfig.active_profile]?.lip_clearance ?? 0.2} mm</span></div>
                  </div>
                </div>
              )}

              {/* Step 1: Download Calibration Coupon */}
              <div className="p-3.5 rounded bg-graphite-950 border border-graphite-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-graphite-200">Step 1: Calibration Test Coupon</h4>
                    <p className="text-[11px] text-graphite-400 mt-0.5">
                      Prints all 6 features on one coupon: stepped holes, test pegs, wall thicknesses, and slip-fit joint.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadCoupon}
                    disabled={isDownloadingCoupon}
                    className="px-3 py-1.5 bg-graphite-850 hover:bg-graphite-800 border border-graphite-750 text-forge font-semibold rounded text-xs flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    {isDownloadingCoupon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>Download Coupon STL</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Caliper Measurement Input Form */}
              <div className="p-3.5 rounded bg-graphite-950 border border-graphite-800 space-y-4">
                <h4 className="text-xs font-semibold text-graphite-200">Step 2: Enter Caliper Measurements</h4>

                <div>
                  <label className="text-[10px] text-graphite-400 block mb-1">New Profile Name:</label>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="w-full bg-graphite-900 border border-graphite-750 rounded px-2.5 py-1 text-xs text-white outline-none focus:border-forge"
                    placeholder="e.g. Ender3_PLA_04"
                  />
                </div>

                {/* 1. Holes */}
                <div>
                  <span className="text-[11px] text-graphite-300 block mb-1 font-semibold">
                    1. Measured Hole Diameters (Nominal: 2, 3, 4, 5, 6, 8 mm):
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[2, 3, 4, 5, 6, 8].map((nom, i) => (
                      <div key={nom} className="text-center">
                        <span className="text-[9px] text-graphite-500 block">Ø{nom}</span>
                        <input
                          type="number"
                          step="0.05"
                          value={holeValues[i]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || nom;
                            const next = [...holeValues];
                            next[i] = val;
                            setHoleValues(next);
                          }}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-1 py-0.5 text-xs text-center text-white outline-none focus:border-forge"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Pegs */}
                <div>
                  <span className="text-[11px] text-graphite-300 block mb-1 font-semibold">
                    2. Measured Peg Diameters (Nominal: 2, 3, 4, 5, 6, 8 mm):
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[2, 3, 4, 5, 6, 8].map((nom, i) => (
                      <div key={nom} className="text-center">
                        <span className="text-[9px] text-graphite-500 block">Ø{nom}</span>
                        <input
                          type="number"
                          step="0.05"
                          value={pegValues[i]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || nom;
                            const next = [...pegValues];
                            next[i] = val;
                            setPegValues(next);
                          }}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-1 py-0.5 text-xs text-center text-white outline-none focus:border-forge"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Walls */}
                <div>
                  <span className="text-[11px] text-graphite-300 block mb-1 font-semibold">
                    3. Measured Wall Thicknesses (Nominal: 0.8, 1.2, 1.6, 2.0, 2.4, 3.0 mm):
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[0.8, 1.2, 1.6, 2.0, 2.4, 3.0].map((nom, i) => (
                      <div key={nom} className="text-center">
                        <span className="text-[9px] text-graphite-500 block">{nom}mm</span>
                        <input
                          type="number"
                          step="0.05"
                          value={wallValues[i]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || nom;
                            const next = [...wallValues];
                            next[i] = val;
                            setWallValues(next);
                          }}
                          className="w-full bg-graphite-900 border border-graphite-750 rounded px-1 py-0.5 text-xs text-center text-white outline-none focus:border-forge"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Clearance, Bed, and Nozzle */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-graphite-850">
                  <div>
                    <label className="text-[10px] text-graphite-400 block mb-0.5">Slip-fit Clearance (mm):</label>
                    <input
                      type="number"
                      step="0.02"
                      value={clearanceValue}
                      onChange={(e) => setClearanceValue(parseFloat(e.target.value) || 0.20)}
                      className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-forge"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-graphite-400 block mb-0.5">Printer Bed [X, Y, Z]:</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={bedSize[0]}
                        onChange={(e) => setBedSize([parseFloat(e.target.value) || 220, bedSize[1], bedSize[2]])}
                        className="w-1/3 bg-graphite-900 border border-graphite-750 rounded px-1 py-0.5 text-xs text-center text-white outline-none"
                      />
                      <input
                        type="number"
                        value={bedSize[1]}
                        onChange={(e) => setBedSize([bedSize[0], parseFloat(e.target.value) || 220, bedSize[2]])}
                        className="w-1/3 bg-graphite-900 border border-graphite-750 rounded px-1 py-0.5 text-xs text-center text-white outline-none"
                      />
                      <input
                        type="number"
                        value={bedSize[2]}
                        onChange={(e) => setBedSize([bedSize[0], bedSize[1], parseFloat(e.target.value) || 250])}
                        className="w-1/3 bg-graphite-900 border border-graphite-750 rounded px-1 py-0.5 text-xs text-center text-white outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-graphite-400 block mb-0.5">Nozzle (mm):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={nozzleSize}
                      onChange={(e) => setNozzleSize(parseFloat(e.target.value) || 0.4)}
                      className="w-full bg-graphite-900 border border-graphite-750 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-forge"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveCalibration}
                  disabled={isSavingCalibration}
                  className="w-full py-2 bg-forge hover:bg-forge-hover text-graphite-950 font-bold rounded text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                >
                  {isSavingCalibration ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Calculate Offsets &amp; Save Profile</span>
                </button>
              </div>

              {/* Status messages */}
              {calibSuccessMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{calibSuccessMsg}</span>
                </div>
              )}
              {calibErrorMsg && (
                <div className="p-3 bg-red-950/80 border border-red-800 rounded text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{calibErrorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"""
3d.me Printer Calibration & Tolerance Profiles (Phase 4)
Manages printer profiles in ~/.3dme/printers/<name>.json with presets for
Bambu P1/X1, Prusa MK3/MK4, Ender 3, and Voron 2.4.
Provides active clearance lookups for parametric CAD templates.
"""

import json
import logging
import os
from typing import Dict, Any, List, Optional

logger = logging.getLogger("3dme.cad.profiles")

PRINTERS_DIR = os.path.expanduser("~/.3dme/printers")
os.makedirs(PRINTERS_DIR, exist_ok=True)

DEFAULT_PRESETS: Dict[str, Dict[str, Any]] = {
    "bambu_x1c_p1s": {
        "name": "Bambu Lab P1 / X1 Series",
        "nozzle": 0.4,
        "bed": [256.0, 256.0, 256.0],
        "clearances": {
            "press": 0.05,
            "snug": 0.15,
            "slip": 0.25,
            "loose": 0.40
        },
        "hole_compensation": 0.05,
        "peg_compensation": -0.05,
        "wall_offset": 0.0
    },
    "prusa_mk4_mk3s": {
        "name": "Prusa MK3S+ / MK4",
        "nozzle": 0.4,
        "bed": [250.0, 210.0, 220.0],
        "clearances": {
            "press": 0.08,
            "snug": 0.18,
            "slip": 0.30,
            "loose": 0.45
        },
        "hole_compensation": 0.08,
        "peg_compensation": -0.08,
        "wall_offset": 0.0
    },
    "ender_3": {
        "name": "Creality Ender 3 / V2 / Pro",
        "nozzle": 0.4,
        "bed": [220.0, 220.0, 250.0],
        "clearances": {
            "press": 0.10,
            "snug": 0.22,
            "slip": 0.35,
            "loose": 0.50
        },
        "hole_compensation": 0.12,
        "peg_compensation": -0.12,
        "wall_offset": 0.0
    },
    "voron_2_4": {
        "name": "Generic Voron 2.4",
        "nozzle": 0.4,
        "bed": [300.0, 300.0, 300.0],
        "clearances": {
            "press": 0.06,
            "snug": 0.15,
            "slip": 0.25,
            "loose": 0.40
        },
        "hole_compensation": 0.06,
        "peg_compensation": -0.06,
        "wall_offset": 0.0
    }
}


def init_default_profiles():
    """Initializes default printer profile presets if not present."""
    for profile_id, data in DEFAULT_PRESETS.items():
        path = os.path.join(PRINTERS_DIR, f"{profile_id}.json")
        if not os.path.exists(path):
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
            except Exception as e:
                logger.warning(f"Could not initialize profile {profile_id}: {e}")

    # Active profile pointer
    active_path = os.path.join(PRINTERS_DIR, "active.json")
    if not os.path.exists(active_path):
        try:
            with open(active_path, "w", encoding="utf-8") as f:
                json.dump({"active_profile": "bambu_x1c_p1s"}, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not set active profile: {e}")


init_default_profiles()


def get_active_profile_id() -> str:
    active_path = os.path.join(PRINTERS_DIR, "active.json")
    if os.path.exists(active_path):
        try:
            with open(active_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("active_profile", "bambu_x1c_p1s")
        except Exception:
            pass
    return "bambu_x1c_p1s"


def set_active_profile_id(profile_id: str):
    active_path = os.path.join(PRINTERS_DIR, "active.json")
    with open(active_path, "w", encoding="utf-8") as f:
        json.dump({"active_profile": profile_id}, f, indent=2)


def get_active_profile() -> Dict[str, Any]:
    active_id = get_active_profile_id()
    path = os.path.join(PRINTERS_DIR, f"{active_id}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Error reading active profile {active_id}: {e}")

    return DEFAULT_PRESETS.get(active_id, DEFAULT_PRESETS["bambu_x1c_p1s"])


def get_profile(profile_id: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(PRINTERS_DIR, f"{profile_id}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_PRESETS.get(profile_id)


def save_profile(profile_id: str, data: Dict[str, Any]):
    path = os.path.join(PRINTERS_DIR, f"{profile_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def list_profiles() -> List[Dict[str, Any]]:
    init_default_profiles()
    active_id = get_active_profile_id()
    profiles = []

    for fname in sorted(os.listdir(PRINTERS_DIR)):
        if fname.endswith(".json") and fname != "active.json":
            pid = fname[:-5]
            try:
                with open(os.path.join(PRINTERS_DIR, fname), "r", encoding="utf-8") as f:
                    pdata = json.load(f)
                    pdata["id"] = pid
                    pdata["is_active"] = (pid == active_id)
                    profiles.append(pdata)
            except Exception:
                pass
    return profiles


def get_clearance(fit_type: str = "slip") -> float:
    """
    Looks up active printer profile clearance in mm.
    fit_type: "press" | "snug" | "slip" | "loose"
    """
    prof = get_active_profile()
    clearances = prof.get("clearances", {})
    return float(clearances.get(fit_type, 0.25))

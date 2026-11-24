import json
import logging
import os
import re
import tempfile
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field, field_validator, ConfigDict

logger = logging.getLogger("cad_library")

LIBRARY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "library")
COMPONENTS_JSON_PATH = os.path.join(LIBRARY_DIR, "components.json")

# Fallback built-in components if components.json is missing or corrupt
FALLBACK_COMPONENTS: List[Dict[str, Any]] = [
  {
    "id": "pi_4b",
    "name": "Raspberry Pi 4B",
    "category": "board",
    "size": [85.0, 56.0, 17.0],
    "mount_holes": [
      {"x": -39.0, "y": -24.5, "d": 2.1},
      {"x": -39.0, "y": 24.5, "d": 2.1},
      {"x": 19.0, "y": -24.5, "d": 2.1},
      {"x": 19.0, "y": 24.5, "d": 2.1}
    ],
    "ports": [
      {"face": "back", "x": -10.0, "z": 0.0, "w": 16.0, "h": 8.0},
      {"face": "left", "x": -15.0, "z": 0.0, "w": 10.0, "h": 5.0}
    ],
    "tags": ["sbc", "arm", "linux"],
    "notes": "Raspberry Pi 4 Model B single board computer",
    "source": "approximate",
    "created": "2026-11-22T00:00:00Z",
    "updated": "2026-11-22T00:00:00Z"
  },
  {
    "id": "pi_zero_2w",
    "name": "Raspberry Pi Zero 2W",
    "category": "board",
    "size": [65.0, 30.0, 5.5],
    "mount_holes": [
      {"x": -29.0, "y": -11.5, "d": 2.1},
      {"x": -29.0, "y": 11.5, "d": 2.1},
      {"x": 29.0, "y": -11.5, "d": 2.1},
      {"x": 29.0, "y": 11.5, "d": 2.1}
    ],
    "ports": [
      {"face": "back", "x": 10.0, "z": 0.0, "w": 8.0, "h": 3.0}
    ],
    "tags": ["sbc", "zero", "compact"],
    "notes": "Raspberry Pi Zero 2 W compact board",
    "source": "approximate",
    "created": "2026-11-22T00:00:00Z",
    "updated": "2026-11-22T00:00:00Z"
  },
  {
    "id": "arduino_uno",
    "name": "Arduino Uno",
    "category": "board",
    "size": [68.6, 53.3, 15.0],
    "mount_holes": [
      {"x": -20.3, "y": -24.1, "d": 2.8},
      {"x": -19.0, "y": 24.0, "d": 2.8},
      {"x": 31.8, "y": -19.0, "d": 2.8},
      {"x": 31.8, "y": 8.9, "d": 2.8}
    ],
    "tags": ["microcontroller", "avr", "uno"],
    "notes": "Arduino Uno Rev3 development board",
    "source": "approximate",
    "created": "2026-11-22T00:00:00Z",
    "updated": "2026-11-22T00:00:00Z"
  },
  {
    "id": "esp32_devkit",
    "name": "ESP32 DevKit",
    "category": "board",
    "size": [51.5, 28.5, 13.0],
    "mount_holes": [],
    "ports": [
      {"face": "back", "x": 0.0, "z": 0.0, "w": 8.0, "h": 3.5}
    ],
    "tags": ["microcontroller", "wifi", "bluetooth", "iot"],
    "notes": "ESP32-WROOM-32 DevKit V1",
    "source": "approximate",
    "created": "2026-11-22T00:00:00Z",
    "updated": "2026-11-22T00:00:00Z"
  },
  {
    "id": "oled_ssd1306",
    "name": "0.96in OLED SSD1306",
    "category": "display",
    "size": [27.3, 27.8, 4.0],
    "mount_holes": [],
    "screen": {"w": 22.0, "h": 11.0, "x": 0.0, "z": 0.0},
    "tags": ["display", "oled", "i2c", "screen"],
    "notes": "verify with calipers",
    "source": "approximate",
    "created": "2026-11-22T00:00:00Z",
    "updated": "2026-11-22T00:00:00Z"
  },
  {
    "id": "sg90_servo",
    "name": "SG90 Servo",
    "category": "servo",
    "size": [22.5, 12.2, 22.7],
    "mount_holes": [],
    "tags": ["actuator", "motor", "micro servo"],
    "notes": "verify with calipers",
    "source": "approximate",
    "created": "2026-11-22T00:00:00Z",
    "updated": "2026-11-22T00:00:00Z"
  }
]


# ----------------- Pydantic Models -----------------

class MountHole(BaseModel):
    x: float
    y: float
    d: float = Field(default=2.1, ge=0.5, le=50.0)


class ScreenSpec(BaseModel):
    w: float = Field(..., ge=0.5, le=400.0)
    h: float = Field(..., ge=0.5, le=400.0)
    x: float = 0.0
    z: float = 0.0


class PortSpec(BaseModel):
    face: Literal["front", "back", "left", "right", "top", "bottom"]
    x: float = 0.0
    z: float = 0.0
    w: float = Field(..., ge=0.5, le=400.0)
    h: float = Field(..., ge=0.5, le=400.0)


class ComponentItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    category: Literal["board", "display", "servo", "battery", "connector", "custom"] = "board"
    size: List[float] = Field(..., min_length=3, max_length=3)
    mount_holes: List[MountHole] = Field(default_factory=list)
    screen: Optional[ScreenSpec] = None
    ports: Optional[List[PortSpec]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""
    source: Literal["measured", "approximate", "datasheet"] = "approximate"
    created: Optional[str] = None
    updated: Optional[str] = None

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^[a-zA-Z0-9_\-]+$", clean):
            raise ValueError(f"Invalid ID '{v}'. Must only contain letters, numbers, underscores, and hyphens.")
        return clean

    @field_validator("size")
    @classmethod
    def validate_size(cls, v: List[float]) -> List[float]:
        if len(v) != 3:
            raise ValueError("Component size must be exactly 3 dimensions [L, W, H].")
        for dim in v:
            if dim < 0.5 or dim > 400.0:
                raise ValueError(f"Component dimension {dim} mm is outside allowed range (0.5 to 400.0 mm).")
        return [float(x) for x in v]


# ----------------- File Storage Operations -----------------

def get_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_components(path: Optional[str] = None) -> List[Dict[str, Any]]:
    target = path or COMPONENTS_JSON_PATH
    if not os.path.exists(target):
        logger.warning(f"Library file {target} does not exist. Using fallback components.")
        return [dict(c) for c in FALLBACK_COMPONENTS]

    try:
        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                raise ValueError("Library file contents must be a JSON array.")
            return data
    except Exception as e:
        logger.error(f"Error loading {target}: {e}. Using fallback components.")
        return [dict(c) for c in FALLBACK_COMPONENTS]


def save_components(items: List[Dict[str, Any]], path: Optional[str] = None) -> None:
    target = path or COMPONENTS_JSON_PATH
    target_dir = os.path.dirname(os.path.abspath(target))
    os.makedirs(target_dir, exist_ok=True)

    # Atomic write via temporary file in same folder
    tmp_path = f"{target}.tmp_{os.getpid()}"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, target)
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise IOError(f"Failed to atomically write {target}: {e}")


# ----------------- Library Service Methods -----------------

def list_components(
    search: Optional[str] = None,
    category: Optional[str] = None,
    path: Optional[str] = None
) -> List[Dict[str, Any]]:
    items = load_components(path)
    filtered = items

    if category and category.lower() != "all":
        cat_lower = category.lower().strip()
        filtered = [c for c in filtered if c.get("category", "").lower() == cat_lower]

    if search:
        query = search.lower().strip()
        filtered = [
            c for c in filtered
            if query in c.get("name", "").lower()
            or query in c.get("id", "").lower()
            or query in " ".join(c.get("tags", [])).lower()
            or query in c.get("notes", "").lower()
        ]

    return filtered


def get_component(comp_id: str, path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    clean_id = comp_id.strip().lower()
    for item in load_components(path):
        if item.get("id", "").lower() == clean_id:
            return item
    return None


def add_component(item: ComponentItem, path: Optional[str] = None) -> Dict[str, Any]:
    items = load_components(path)
    for existing in items:
        if existing.get("id", "").lower() == item.id.lower():
            raise ValueError(f"Component with ID '{item.id}' already exists.")

    now = get_now_iso()
    doc = item.model_dump()
    doc["created"] = doc.get("created") or now
    doc["updated"] = now

    items.append(doc)
    save_components(items, path)
    return doc


def update_component(comp_id: str, item: ComponentItem, path: Optional[str] = None) -> Dict[str, Any]:
    items = load_components(path)
    clean_id = comp_id.strip().lower()

    found_idx = -1
    for idx, existing in enumerate(items):
        if existing.get("id", "").lower() == clean_id:
            found_idx = idx
            break

    if found_idx == -1:
        raise KeyError(f"Component with ID '{comp_id}' not found.")

    now = get_now_iso()
    doc = item.model_dump()
    doc["created"] = items[found_idx].get("created", now)
    doc["updated"] = now

    items[found_idx] = doc
    save_components(items, path)
    return doc


def delete_component(comp_id: str, path: Optional[str] = None) -> bool:
    items = load_components(path)
    clean_id = comp_id.strip().lower()

    initial_len = len(items)
    items = [c for c in items if c.get("id", "").lower() != clean_id]

    if len(items) == initial_len:
        raise KeyError(f"Component with ID '{comp_id}' not found.")

    save_components(items, path)
    return True


def import_components(new_items: List[Dict[str, Any]], path: Optional[str] = None) -> Dict[str, Any]:
    current_items = load_components(path)
    id_map = {c["id"].lower(): idx for idx, c in enumerate(current_items)}

    imported_count = 0
    updated_count = 0

    for raw in new_items:
        validated = ComponentItem.model_validate(raw)
        doc = validated.model_dump()
        now = get_now_iso()
        doc["updated"] = now

        cid = doc["id"].lower()
        if cid in id_map:
            doc["created"] = current_items[id_map[cid]].get("created", now)
            current_items[id_map[cid]] = doc
            updated_count += 1
        else:
            doc["created"] = doc.get("created") or now
            current_items.append(doc)
            id_map[cid] = len(current_items) - 1
            imported_count += 1

    save_components(current_items, path)
    return {
        "status": "success",
        "imported": imported_count,
        "updated": updated_count,
        "total": len(current_items),
    }


def export_components(path: Optional[str] = None) -> List[Dict[str, Any]]:
    return load_components(path)


def get_boards_dict(path: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """
    Returns a dictionary structured like the legacy BOARDS constant:
    keys: "raspberry pi 4b", "pi_4b", "arduino uno", etc.
    values: {"name": ..., "size": [L, W, H], "holes": [(-39, -24.5), ...], "pilot": 2.1, ...}
    """
    items = load_components(path)
    res: Dict[str, Dict[str, Any]] = {}

    for item in items:
        # Convert mount_holes to (x, y) tuples
        holes = []
        pilot = 2.1
        for mh in item.get("mount_holes", []):
            if isinstance(mh, dict):
                holes.append((float(mh.get("x", 0.0)), float(mh.get("y", 0.0))))
                pilot = float(mh.get("d", 2.1))
            elif isinstance(mh, (list, tuple)) and len(mh) >= 2:
                holes.append((float(mh[0]), float(mh[1])))

        entry = {
            "id": item["id"],
            "name": item["name"],
            "category": item.get("category", "board"),
            "size": [float(x) for x in item["size"]],
            "holes": holes,
            "pilot": pilot,
            "source": item.get("source", "approximate"),
        }
        if item.get("screen"):
            entry["screen"] = dict(item["screen"])
        if item.get("ports"):
            entry["ports"] = [dict(p) for p in item["ports"]]
        if item.get("notes"):
            entry["note"] = item["notes"]

        # Map both raw ID and lowercased name
        res[item["id"].lower()] = entry
        res[item["name"].lower()] = entry

    return res

import json
import math
import os
import uuid
from typing import Dict, Any, List, Union, Optional, Tuple

import cad_library

def get_current_boards() -> Dict[str, Dict[str, Any]]:
    return cad_library.get_boards_dict()

class _BoardsProxy(dict):
    """Dynamically delegates to cad_library.get_boards_dict() while behaving as a dict."""
    def __getitem__(self, key):
        return get_current_boards()[key]
    def get(self, key, default=None):
        return get_current_boards().get(key, default)
    def __contains__(self, key):
        return key in get_current_boards()
    def keys(self):
        return get_current_boards().keys()
    def values(self):
        return get_current_boards().values()
    def items(self):
        return get_current_boards().items()
    def __iter__(self):
        return iter(get_current_boards())
    def __len__(self):
        return len(get_current_boards())
    def copy(self):
        return dict(get_current_boards())

BOARDS: Dict[str, Dict[str, Any]] = _BoardsProxy()

DEFAULT_PRINTER: Dict[str, Any] = {
    "bed": [220.0, 220.0, 250.0],
    "nozzle": 0.4,
}

def get_printer_config(path: Optional[str] = None) -> Dict[str, Any]:
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "printer.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return DEFAULT_PRINTER.copy()

def resolve(component: Union[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Resolves component from library by lowercase name or validates custom dict."""
    boards = get_current_boards()
    if isinstance(component, str):
        key = component.strip().lower()
        # fuzzy lookup matching key prefixes
        found_key = None
        for k in boards:
            if key == k or key in k or k in key:
                found_key = k
                break
        if found_key:
            data = boards[found_key].copy()
            data["key"] = found_key
            data["id"] = data.get("id") or f"comp_{found_key.replace(' ', '_').replace('.', '_')}"
            data["qty"] = 1
            return data
        raise ValueError(f"Unknown component '{component}'. Available: {list(boards.keys())}")
    elif isinstance(component, dict):
        if "size" not in component or not isinstance(component["size"], (list, tuple)) or len(component["size"]) != 3:
            raise ValueError("Custom component must have 'size': [L, W, H]")
        comp_id = component.get("id") or f"comp_{uuid.uuid4().hex[:6]}"
        return {
            "id": comp_id,
            "name": component.get("name", "Custom Component"),
            "size": [float(x) for x in component["size"]],
            "qty": int(component.get("qty", 1)),
            "holes": component.get("holes", []),
            "pilot": float(component.get("pilot", 2.1)),
            "screen": component.get("screen"),
            "ports": component.get("ports", []),
            "note": component.get("note", "verify with calipers" if "screen" in component or "servo" in component.get("name", "").lower() else None),
        }
    else:
        raise ValueError(f"Invalid component type: {type(component)}")

def get_presets(outer_l: float, outer_w: float, outer_h: float) -> Dict[str, Any]:
    """
    Computes parametric character appendage presets from body size:
    - cat ears: mirrored cones on top, base_d ~22% width, length ~35% height, tip_d ~15% base, tilt 8 deg outward.
    - stubby arms: mirrored tapered cones on left/right at mid height, base_d ~20% height, length ~30% width.
    - antenna: thin cylinder + ball on top.
    - feet: two cylinders/balls on bottom.
    """
    ear_base_d = round(outer_l * 0.22, 1)
    ear_length = round(outer_h * 0.35, 1)
    ear_tip_d = max(2.5, round(ear_base_d * 0.15, 1))

    arm_base_d = round(outer_h * 0.20, 1)
    arm_length = round(outer_l * 0.30, 1)
    arm_tip_d = max(3.0, round(arm_base_d * 0.60, 1))

    antenna_len = round(outer_h * 0.40, 1)

    foot_d = round(outer_w * 0.25, 1)

    return {
        "cat ears": {
            "id": "ears",
            "name": "Cat Ears",
            "type": "cone",
            "face": "top",
            "x": round(outer_l * 0.26, 1),
            "z": 0.0,
            "base_d": ear_base_d,
            "tip_d": ear_tip_d,
            "length": ear_length,
            "tilt_deg": 8.0,
            "mirror": True,
            "fillet": 1.0,
        },
        "stubby arms": {
            "id": "arms",
            "name": "Stubby Arms",
            "type": "cone",
            "face": "left",
            "x": 0.0,
            "z": 0.0,
            "base_d": arm_base_d,
            "tip_d": arm_tip_d,
            "length": arm_length,
            "tilt_deg": 0.0,
            "mirror": True,
            "fillet": 1.0,
        },
        "antenna": {
            "id": "antenna",
            "name": "Antenna",
            "type": "cylinder",
            "face": "top",
            "x": 0.0,
            "z": 0.0,
            "base_d": 3.0,
            "tip_d": 3.0,
            "length": antenna_len,
            "tilt_deg": 0.0,
            "mirror": False,
            "ball_tip": True,
            "ball_d": 8.0,
            "fillet": 0.5,
        },
        "feet": {
            "id": "feet",
            "name": "Feet",
            "type": "cylinder",
            "face": "bottom",
            "x": round(outer_l * 0.25, 1),
            "z": 0.0,
            "base_d": foot_d,
            "tip_d": foot_d,
            "length": 8.0,
            "tilt_deg": 0.0,
            "mirror": True,
            "fillet": 1.0,
        },
    }

def layout(
    components: List[Union[str, Dict[str, Any]]],
    clearance: float = 1.0,
    gap: float = 5.0,
    standoff: float = 4.0,
    headroom: float = 3.0,
    wall: float = 2.4,
    corner_radius: float = 12.0,
    split: str = "back",
) -> Dict[str, Any]:
    """
    Computes inner cavity dimensions, component placement, and auto-aligns screen windows.
    Default split is 'back' (front shell + back cover).
    """
    if not components:
        resolved = [resolve("esp32 devkit")]
    else:
        resolved = [resolve(c) for c in components]

    n = len(resolved)
    total_comp_l = sum(c["size"][0] * c.get("qty", 1) for c in resolved)
    total_gaps = (n - 1) * gap if n > 1 else 0.0
    inner_l = max(45.0, total_comp_l + total_gaps + 2.0 * clearance)
    inner_w = max(35.0, max(c["size"][1] for c in resolved) + 2.0 * clearance)
    inner_h = max(30.0, standoff + max(c["size"][2] for c in resolved) + headroom)

    outer_l = inner_l + 2.0 * wall
    outer_w = inner_w + 2.0 * wall
    outer_h = inner_h + 2.0 * wall

    # Constrain corner radius to at most 40% of smallest outer dimension
    min_outer = min(outer_l, outer_w, outer_h)
    max_cr = round(min_outer * 0.40, 1)
    effective_cr = min(corner_radius, max_cr)

    # Position components along X
    current_x = -inner_l / 2.0 + clearance
    standoffs: List[Dict[str, Any]] = []
    windows: List[Dict[str, Any]] = []

    for comp in resolved:
        comp_l = comp["size"][0]
        center_x = current_x + comp_l / 2.0
        center_y = 0.0
        center_z = -inner_h / 2.0 + standoff + comp["size"][2] / 2.0

        comp["placed_center"] = [round(center_x, 2), round(center_y, 2), round(center_z, 2)]

        for hx, hy in comp.get("holes", []):
            standoffs.append({
                "x": round(center_x + hx, 2),
                "y": round(center_y + hy, 2),
                "hole_d": comp.get("pilot", 2.1),
                "height": standoff,
            })

        # Auto-align window if component has an embedded screen
        if comp.get("screen"):
            scr = comp["screen"]
            windows.append({
                "id": f"win_{comp['id']}",
                "name": f"{comp['name']} Screen Window",
                "face": "front",
                "shape": "rect",
                "w": float(scr.get("w", 22.0)),
                "h": float(scr.get("h", 11.0)),
                "x": round(center_x + float(scr.get("x", 0.0)), 2),
                "z": round(float(scr.get("z", 0.0)), 2),
                "corner_radius": 2.0,
            })

        current_x += comp_l + gap

    return {
        "body": {
            "shape": "rounded_box",
            "corner_radius": effective_cr,
        },
        "inner": [round(inner_l, 2), round(inner_w, 2), round(inner_h, 2)],
        "wall": round(wall, 2),
        "corner_radius": effective_cr,
        "split": split,
        "components": resolved,
        "standoffs": standoffs,
        "windows": windows,
        "appendages": [],
        "cutouts": [],
    }

def check(spec: Dict[str, Any], printer: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
    """
    Feasibility rules for enclosures, parts, and robot assemblies.
    """
    if spec.get("mode") == "robot":
        import cad_robot
        return cad_robot.check_robot(spec, printer)

    if printer is None:
        printer = get_printer_config()

    bed = printer.get("bed", [220.0, 220.0, 250.0])
    inner = spec.get("inner", [60.0, 40.0, 25.0])
    inner_l, inner_w, inner_h = float(inner[0]), float(inner[1]), float(inner[2])
    wall = float(spec.get("wall", 2.4))
    corner_radius = float(spec.get("corner_radius", spec.get("body", {}).get("corner_radius", 12.0)))
    split = spec.get("split", "back")

    outer_l = inner_l + 2.0 * wall
    outer_w = inner_w + 2.0 * wall
    outer_h = inner_h + 2.0 * wall

    issues: List[Dict[str, str]] = []

    # 1. Component Fit Check
    for comp in spec.get("components", []):
        c_size = comp.get("size", [0, 0, 0])
        c_name = comp.get("name", "Component")
        if c_size[0] > inner_l or c_size[1] > inner_w or c_size[2] > inner_h:
            issues.append({
                "level": "error",
                "msg": f"Component '{c_name}' ({c_size[0]:.1f}×{c_size[1]:.1f}×{c_size[2]:.1f} mm) does not fit inside inner cavity ({inner_l:.1f}×{inner_w:.1f}×{inner_h:.1f} mm)",
            })

    # 2. Wall Thickness Check
    if wall < 1.2:
        issues.append({
            "level": "error",
            "msg": f"Wall thickness {wall:.1f} mm is below the 1.2 mm minimum limit for structural integrity",
        })
    elif wall < 1.6:
        issues.append({
            "level": "warn",
            "msg": f"Wall thickness {wall:.1f} mm is thin; 2.0–2.4 mm recommended for rigid character shells",
        })

    # 3. Corner Radius / Geometry Check
    min_outer = min(outer_l, outer_w, outer_h)
    max_cr = min_outer * 0.40
    if corner_radius > max_cr + 0.1:
        issues.append({
            "level": "warn",
            "msg": f"Corner radius {corner_radius:.1f} mm exceeds 40% of body dimension ({max_cr:.1f} mm); clamped to prevent self-intersection",
        })

    # 4. Total Size & Bounding Box Check (including appendages)
    min_x = -outer_l / 2.0
    max_x = outer_l / 2.0
    min_y = 0.0 if split == "back" else -outer_w / 2.0
    max_y = outer_w if split == "back" else outer_w / 2.0
    min_z = -outer_h / 2.0
    max_z = outer_h / 2.0

    appendages = spec.get("appendages", [])
    for app in appendages:
        face = app.get("face", "top")
        length = float(app.get("length", 15.0))
        base_d = float(app.get("base_d", 10.0))
        app_x = float(app.get("x", 0.0))
        app_z = float(app.get("z", 0.0))
        is_mirror = bool(app.get("mirror", False))
        tilt = float(app.get("tilt_deg", 0.0))

        # Check total bounding envelope
        reach_x = abs(app_x) + length if face in ("left", "right") else abs(app_x) + base_d / 2.0
        reach_z = abs(app_z) + length if face in ("top", "bottom") else abs(app_z) + base_d / 2.0
        reach_y = outer_w + length if face in ("front", "back") else outer_w

        if reach_x > max_x:
            max_x = reach_x
            if is_mirror:
                min_x = -reach_x
        if reach_z > max_z:
            max_z = reach_z
        if face == "bottom":
            min_z = min(min_z, -outer_h / 2.0 - length)

    tot_l = max_x - min_x
    tot_w = max_y - min_y
    tot_h = max_z - min_z

    if tot_l > bed[0]:
        overshoot = tot_l - bed[0]
        issues.append({
            "level": "error",
            "msg": f"Total width {tot_l:.1f} mm exceeds printer bed ({bed[0]:.1f} mm) by {overshoot:.1f} mm on X axis",
        })
    if tot_w > bed[1]:
        overshoot = tot_w - bed[1]
        issues.append({
            "level": "error",
            "msg": f"Total depth {tot_w:.1f} mm exceeds printer bed ({bed[1]:.1f} mm) by {overshoot:.1f} mm on Y axis",
        })
    if tot_h > bed[2]:
        overshoot = tot_h - bed[2]
        issues.append({
            "level": "error",
            "msg": f"Total height {tot_h:.1f} mm exceeds printer bed ({bed[2]:.1f} mm) by {overshoot:.1f} mm on Z axis",
        })

    # 5. Window Checks
    windows = spec.get("windows", [])
    for idx, win in enumerate(windows):
        face = win.get("face", "front")
        w_shape = win.get("shape", "rect")
        win_w = float(win.get("w", win.get("d", 10.0)))
        win_h = float(win.get("h", win.get("d", 10.0)))
        win_x = float(win.get("x", 0.0))
        win_z = float(win.get("z", 0.0))
        win_id = win.get("id", f"win_{idx+1}")

        # Check proximity to body edges
        face_w = outer_l if face in ("front", "back") else outer_w
        face_h = outer_h

        dist_left = (face_w / 2.0) - (abs(win_x) + win_w / 2.0)
        dist_top = (face_h / 2.0) - (abs(win_z) + win_h / 2.0)
        min_dist = min(dist_left, dist_top)

        if min_dist < 2.0:
            issues.append({
                "level": "error",
                "msg": f"Window '{win_id}' on {face} face is too close to body edge ({min_dist:.1f} mm < 2.0 mm clearance required)",
            })

    # 6. Appendage Checks (Overhangs, Tip diameter, Collisions)
    for idx, app in enumerate(appendages):
        app_id = app.get("id", f"app_{idx+1}")
        app_name = app.get("name", app_id)
        face = app.get("face", "top")
        tilt = float(app.get("tilt_deg", 0.0))
        tip_d = float(app.get("tip_d", app.get("base_d", 10.0)))
        base_d = float(app.get("base_d", 10.0))
        length = float(app.get("length", 15.0))
        app_x = float(app.get("x", 0.0))
        app_z = float(app.get("z", 0.0))

        # Tip diameter warning
        if tip_d < 1.5:
            issues.append({
                "level": "warn",
                "msg": f"Appendage '{app_name}' tip diameter ({tip_d:.1f} mm) is under 1.5 mm; may be delicate during FDM printing",
            })

        # Overhang angle check relative to vertical (+Z)
        if face in ("left", "right"):
            # Horizontal appendages have ~90° overhang from vertical
            eff_angle = 90.0 - abs(tilt)
            if eff_angle > 45.0:
                issues.append({
                    "level": "warn",
                    "msg": f"Appendage '{app_name}' overhang angle ({eff_angle:.0f}°) exceeds 45° from vertical; needs print supports (suggest printing shell on back cover face)",
                })
        elif face == "bottom":
            issues.append({
                "level": "warn",
                "msg": f"Appendage '{app_name}' on bottom face requires supports if printed upright",
            })
        elif face == "top":
            if abs(tilt) > 45.0:
                issues.append({
                    "level": "warn",
                    "msg": f"Appendage '{app_name}' tilt angle ({abs(tilt):.0f}°) exceeds 45° from vertical; needs supports",
                })

        # Collisions: Check if appendage overlaps with any window
        for win in windows:
            if win.get("face") == face:
                win_x = float(win.get("x", 0.0))
                win_z = float(win.get("z", 0.0))
                win_w = float(win.get("w", win.get("d", 10.0)))
                win_h = float(win.get("h", win.get("d", 10.0)))

                dx = abs(app_x - win_x)
                dz = abs(app_z - win_z)
                if dx < (base_d / 2.0 + win_w / 2.0) and dz < (base_d / 2.0 + win_h / 2.0):
                    issues.append({
                        "level": "error",
                        "msg": f"Appendage '{app_name}' collides with window '{win.get('id', 'win')}' on {face} face",
                    })

        # Collision with cavity: base position must stay on the solid wall
        if face == "top":
            wall_boundary_z = outer_h / 2.0 - wall
            if app_z < -wall_boundary_z:
                issues.append({
                    "level": "error",
                    "msg": f"Appendage '{app_name}' penetrates inner cavity",
                })

    # 7. Backward compatible cutouts check
    for idx, c in enumerate(spec.get("cutouts", [])):
        face = c.get("face", "front").lower()
        cx = float(c.get("x", 0.0))
        cz = float(c.get("z", 0.0))
        cw = float(c.get("w", 0.0))
        ch = float(c.get("h", 0.0))

        wall_len = inner_l if face in ("front", "back") else inner_w
        dist_left_corner = (wall_len / 2.0) + (cx - cw / 2.0)
        dist_right_corner = (wall_len / 2.0) - (cx + cw / 2.0)
        min_corner_dist = min(dist_left_corner, dist_right_corner)

        if min_corner_dist < 2.0:
            issues.append({
                "level": "error",
                "msg": f"Cutout #{idx+1} on {face} face is within 2 mm of corner ({min_corner_dist:.1f} mm clearance)",
            })

    # 8. Height Warning
    if inner_h > 60.0:
        issues.append({
            "level": "warn",
            "msg": f"Inner height {inner_h:.1f} mm exceeds 60 mm; tall prints may be susceptible to bed adhesion warping",
        })

    # 9. Standard Info Notes
    issues.append({
        "level": "info",
        "msg": f"Split: {split.capitalize()} cover (0.2 mm fit tolerance). Recommended print orientation: flat on back cover face.",
    })

    return issues

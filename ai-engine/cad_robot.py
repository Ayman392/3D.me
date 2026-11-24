import copy
import logging
import math
from typing import Dict, Any, List, Optional, Tuple, Union

logger = logging.getLogger("3dme.cad.robot")

# Default printer bed limits (mm)
DEFAULT_PRINTER_BED = [220.0, 220.0, 250.0]

# Standard Display Modules Library for Robots
COMMON_DISPLAYS: Dict[str, Dict[str, Any]] = {
    "0.96in oled ssd1306": {
        "name": "0.96in OLED SSD1306",
        "size": [27.3, 27.8, 4.0],  # module L (X), W (Z), H (Y depth)
        "active_area": [22.0, 11.0],  # visible w, h
        "shape": "rect",
        "offset": [0.0, 0.0],
        "ledge": 1.5,
    },
    "1.3in oled sh1106": {
        "name": "1.3in OLED SH1106",
        "size": [35.4, 33.5, 4.0],
        "active_area": [29.4, 14.7],
        "shape": "rect",
        "offset": [0.0, 0.0],
        "ledge": 1.5,
    },
    "1.28in round gc9a01": {
        "name": "1.28in Round GC9A01",
        "size": [38.0, 38.0, 4.2],
        "active_area": [32.4, 32.4],
        "shape": "round",
        "offset": [0.0, 0.0],
        "ledge": 1.5,
    },
}

# Standard Component Library additions for Robots
ROBOT_COMPONENTS: Dict[str, Dict[str, Any]] = {
    "xiao esp32-c3": {
        "name": "Seeed XIAO ESP32-C3",
        "size": [21.0, 17.5, 5.0],
        "target": "body",
    },
    "18650 battery": {
        "name": "18650 Li-ion Cell",
        "size": [66.0, 18.5, 18.5],
        "target": "body",
    },
    "lipo 500mah": {
        "name": "LiPo 500mAh Battery",
        "size": [36.0, 25.0, 8.0],
        "target": "body",
    },
    "mini speaker 28mm": {
        "name": "Mini Speaker 28mm",
        "size": [28.0, 28.0, 5.0],
        "target": "body",
    },
    "sg90 servo": {
        "name": "SG90 Micro Servo",
        "size": [22.5, 12.2, 22.7],
        "target": "arms",
    },
}


def resolve_robot_display(display: Optional[Union[str, Dict[str, Any]]]) -> Dict[str, Any]:
    """Resolves display settings from preset name or custom dictionary."""
    if display is None:
        base = COMMON_DISPLAYS["0.96in oled ssd1306"].copy()
        base["key"] = "0.96in oled ssd1306"
        return base

    if isinstance(display, str):
        key = display.strip().lower()
        found = None
        for k, v in COMMON_DISPLAYS.items():
            if key in k or k in key:
                found = v.copy()
                found["key"] = k
                break
        if found:
            return found
        # Fallback default
        base = COMMON_DISPLAYS["0.96in oled ssd1306"].copy()
        base["key"] = "custom"
        return base

    if isinstance(display, dict):
        base = COMMON_DISPLAYS["0.96in oled ssd1306"].copy()
        base["key"] = display.get("key", "custom")
        base["name"] = display.get("name", "Custom Display")
        if "size" in display:
            base["size"] = [float(x) for x in display["size"]]
        if "active_area" in display:
            base["active_area"] = [float(x) for x in display["active_area"]]
        if "offset" in display:
            base["offset"] = [float(x) for x in display["offset"]]
        if "shape" in display:
            base["shape"] = str(display["shape"]).lower()
        if "ledge" in display:
            base["ledge"] = float(display["ledge"])
        return base

    raise ValueError(f"Invalid display specification: {type(display)}")


def create_chibi_robot_spec(
    overall_height_mm: float = 120.0,
    display: Optional[Union[str, Dict[str, Any]]] = None,
    arm_mode: str = "fixed",
    split: str = "front_back",
    wall: float = 2.0,
) -> Dict[str, Any]:
    """
    Generates a full character robot assembly specification using the chibi proportion preset:
    - Head: ~45% of total height (superellipse/rounded box, split front/back, with display pocket)
    - Body: ~45% of total height (egg shape, split front/back, battery/board mounts, speaker/USB)
    - Neck: ~5-6% of total height (collar ring linking head and body with cable hole)
    - Arms: ~28% length (capsule, fixed or servo joint)
    - Ear pods: ~15% disc (flattened disc with mounting peg)
    """
    h_total = float(overall_height_mm)

    # 1. Proportions
    head_h = round(h_total * 0.45, 1)        # e.g. 54.0 mm
    head_w = round(head_h * 1.185, 1)        # e.g. 64.0 mm
    head_d = round(head_h * 1.0, 1)          # e.g. 54.0 mm
    head_cr = round(head_d * 0.35, 1)        # corner radius / roundness factor

    body_h = round(h_total * 0.45, 1)        # e.g. 54.0 mm
    body_w = max(68.0, round(head_w * 1.05, 1)) # e.g. 68.0 mm to accommodate 18650 battery
    body_d = round(head_d * 1.0, 1)          # e.g. 54.0 mm
    top_r = round(body_w * 0.375, 1)         # e.g. 24.0 mm top taper
    bot_r = round(body_w * 0.50, 1)          # e.g. 32.0 mm bottom roundness

    neck_h = max(6.0, round(h_total * 0.065, 1))  # e.g. 8.0 mm
    collar_od = round(head_w * 0.375, 1)     # e.g. 24.0 mm
    collar_id = round(collar_od * 0.67, 1)   # e.g. 16.0 mm
    cable_hole = 12.0

    arm_len = round(h_total * 0.28, 1)       # e.g. 34.0 mm
    arm_base_d = round(arm_len * 0.41, 1)    # e.g. 14.0 mm
    arm_tip_d = round(arm_base_d * 0.71, 1)  # e.g. 10.0 mm

    ear_w = round(h_total * 0.15, 1)         # e.g. 18.0 mm
    ear_h = round(ear_w, 1)                  # e.g. 18.0 mm
    ear_d = max(5.0, round(ear_w * 0.33, 1)) # e.g. 6.0 mm
    peg_d = 4.0
    peg_len = 5.0

    disp_spec = resolve_robot_display(display)

    parts: List[Dict[str, Any]] = [
        {
            "id": "head",
            "kind": "head",
            "name": "Head",
            "w": head_w,
            "h": head_h,
            "d": head_d,
            "roundness": 0.8,
            "corner_radius": head_cr,
            "wall": wall,
            "split": split,
            "display": disp_spec,
        },
        {
            "id": "body",
            "kind": "body",
            "name": "Body",
            "w": body_w,
            "h": body_h,
            "d": body_d,
            "shape": "egg",
            "top_radius": top_r,
            "bottom_radius": bot_r,
            "wall": wall,
            "split": split,
            "has_speaker_holes": True,
            "has_usb_cutout": True,
        },
        {
            "id": "neck",
            "kind": "neck",
            "name": "Neck Collar",
            "outer_d": collar_od,
            "inner_d": collar_id,
            "height": neck_h,
            "cable_hole_d": cable_hole,
            "lip": 1.5,
        },
        {
            "id": "arm",
            "kind": "arm",
            "name": "Arms",
            "length": arm_len,
            "base_d": arm_base_d,
            "tip_d": arm_tip_d,
            "joint_mode": arm_mode,
            "mirror": True,
            "wall": wall,
        },
        {
            "id": "ear_pod",
            "kind": "ear_pod",
            "name": "Ear Pods",
            "w": ear_w,
            "h": ear_h,
            "d": ear_d,
            "peg_d": peg_d,
            "peg_length": peg_len,
            "mirror": True,
        },
    ]

    components: List[Dict[str, Any]] = [
        {
            "id": "comp_oled",
            "name": disp_spec.get("name", "0.96in OLED SSD1306"),
            "size": disp_spec.get("size", [27.3, 27.8, 4.0]),
            "target": "head",
            "active_area": disp_spec.get("active_area", [22.0, 11.0]),
        },
        {
            "id": "comp_xiao",
            "name": "Seeed XIAO ESP32-C3",
            "size": [21.0, 17.5, 5.0],
            "target": "body",
        },
        {
            "id": "comp_battery",
            "name": "18650 Li-ion Cell",
            "size": [66.0, 18.5, 18.5],
            "target": "body",
        },
    ]

    if arm_mode == "servo":
        components.append({
            "id": "comp_servo_left",
            "name": "SG90 Servo Left",
            "size": [22.5, 12.2, 22.7],
            "target": "body",
        })
        components.append({
            "id": "comp_servo_right",
            "name": "SG90 Servo Right",
            "size": [22.5, 12.2, 22.7],
            "target": "body",
        })

    joints: List[Dict[str, Any]] = [
        {"kind": "lip", "clearance": 0.2, "target": "shell_halves"},
        {"kind": "neck_collar", "clearance": 0.2, "outer_d": collar_od, "lip": 1.5},
        {"kind": "peg_socket", "clearance": 0.2, "peg_d": peg_d, "socket_d": peg_d + 0.4},
        {"kind": "arm_mount", "mode": arm_mode, "clearance": 0.2},
    ]

    return {
        "mode": "robot",
        "preset": "chibi",
        "overall_height_mm": h_total,
        "wall": wall,
        "parts": parts,
        "components": components,
        "joints": joints,
        "print": {
            "orientation_hints": {
                "head_front": "Place face down or parting plane down on build plate.",
                "head_back": "Place back dome down with support or parting plane flat.",
                "body_front": "Place parting plane flat on build plate.",
                "body_back": "Place parting plane flat on build plate.",
                "neck": "Print standing vertically on collar base (no supports needed).",
                "arm": "Print flat with parting line parallel to build plate.",
                "ear_pod": "Print flat with peg pointing upward.",
            }
        },
    }


def get_part_by_kind(spec: Dict[str, Any], kind: str) -> Optional[Dict[str, Any]]:
    for p in spec.get("parts", []):
        if p.get("kind") == kind:
            return p
    return None


def check_robot(
    spec: Dict[str, Any],
    printer: Optional[Dict[str, Any]] = None,
    assembled_solids: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """
    Feasibility rules for character robot assembly:
    - Minimum wall thickness (warn < 1.6 mm, error < 1.2 mm)
    - Arm overhang angle check & suggested print orientation
    - Parts fit within printer bed (220x220x250 default)
    - Display pocket fits inside head cavity
    - Display window distance from head edges >= 2.0 mm
    - Socket clearance: socket_d = peg_d + 2*clearance (clearance >= 0.1 mm)
    - Boolean interference check between any two parts in assembled pose (> 0.5 mm³ overlap is an error)
    """
    issues: List[Dict[str, str]] = []

    bed = (printer.get("bed") if printer else None) or DEFAULT_PRINTER_BED

    overall_height = float(spec.get("overall_height_mm", 120.0))
    if overall_height > bed[2]:
        issues.append({
            "level": "error",
            "msg": f"Overall robot height {overall_height:.1f} mm exceeds printer bed Z-limit ({bed[2]:.1f} mm)",
        })

    parts = spec.get("parts", [])
    head_part = get_part_by_kind(spec, "head")
    body_part = get_part_by_kind(spec, "body")
    neck_part = get_part_by_kind(spec, "neck")
    arm_part = get_part_by_kind(spec, "arm")
    ear_part = get_part_by_kind(spec, "ear_pod")

    # 1. Wall thickness checks
    global_wall = float(spec.get("wall", 2.0))
    for p in parts:
        p_name = p.get("name", p.get("kind", "Part"))
        p_wall = float(p.get("wall", global_wall))
        if p.get("kind") in ("head", "body", "arm"):
            if p_wall < 1.2:
                issues.append({
                    "level": "error",
                    "msg": f"{p_name} wall thickness {p_wall:.1f} mm is below the 1.2 mm minimum structural threshold",
                })
            elif p_wall < 1.6:
                issues.append({
                    "level": "warn",
                    "msg": f"{p_name} wall thickness {p_wall:.1f} mm is thin; 2.0 mm recommended for rigid assembly shells",
                })

    # 2. Part Dimensions vs Printer Bed
    for p in parts:
        p_name = p.get("name", p.get("kind", "Part"))
        pw = float(p.get("w", p.get("outer_d", p.get("length", 40.0))))
        pd = float(p.get("d", p.get("outer_d", p.get("base_d", 40.0))))
        ph = float(p.get("h", p.get("height", p.get("length", 40.0))))
        if pw > bed[0] or pd > bed[1] or ph > bed[2]:
            issues.append({
                "level": "error",
                "msg": f"Part '{p_name}' ({pw:.1f}×{pd:.1f}×{ph:.1f} mm) exceeds printer bed limits ({bed[0]}×{bed[1]}×{bed[2]} mm)",
            })

    # 3. Head Display Pocket & Window Clearance
    if head_part:
        hw = float(head_part.get("w", 64.0))
        hh = float(head_part.get("h", 54.0))
        hd = float(head_part.get("d", 54.0))
        h_wall = float(head_part.get("wall", global_wall))

        inner_hw = hw - 2.0 * h_wall
        inner_hh = hh - 2.0 * h_wall
        inner_hd = hd - 2.0 * h_wall

        disp = head_part.get("display") or {}
        disp_size = disp.get("size", [27.3, 27.8, 4.0])
        disp_w, disp_h, disp_t = float(disp_size[0]), float(disp_size[1]), float(disp_size[2])

        if disp_w > inner_hw or disp_h > inner_hh or disp_t > inner_hd:
            issues.append({
                "level": "error",
                "msg": f"Display module ({disp_w:.1f}×{disp_h:.1f} mm) does not fit inside head cavity ({inner_hw:.1f}×{inner_hh:.1f} mm)",
            })

        active_area = disp.get("active_area", [22.0, 11.0])
        act_w = float(active_area[0])
        act_h = float(active_area[1])
        offset = disp.get("offset", [0.0, 0.0])
        off_x = float(offset[0])
        off_z = float(offset[1])

        # Distance from window edge to outer head perimeter
        dist_x = (hw / 2.0) - (abs(off_x) + act_w / 2.0)
        dist_z = (hh / 2.0) - (abs(off_z) + act_h / 2.0)

        if dist_x < 2.0:
            issues.append({
                "level": "error",
                "msg": f"Display window edge is only {dist_x:.1f} mm from head side edge (minimum 2.0 mm required)",
            })
        if dist_z < 2.0:
            issues.append({
                "level": "error",
                "msg": f"Display window edge is only {dist_z:.1f} mm from head top/bottom edge (minimum 2.0 mm required)",
            })

    # 4. Ear Peg and Socket Clearance
    if ear_part and head_part:
        peg_d = float(ear_part.get("peg_d", 4.0))
        peg_len = float(ear_part.get("peg_length", 5.0))
        head_w = float(head_part.get("w", 64.0))
        head_wall = float(head_part.get("wall", global_wall))

        # Check joint definitions
        peg_joint = next((j for j in spec.get("joints", []) if j.get("kind") == "peg_socket"), None)
        clearance = float(peg_joint.get("clearance", 0.2)) if peg_joint else 0.2
        socket_d = float(peg_joint.get("socket_d", peg_d + 2.0 * clearance)) if peg_joint else peg_d + 2.0 * clearance

        if clearance < 0.1:
            issues.append({
                "level": "error",
                "msg": f"Ear peg/socket clearance {clearance:.2f} mm is too tight (minimum 0.10 mm clearance required for FDM press-fit)",
            })
        if socket_d < peg_d + 2.0 * clearance - 0.01:
            issues.append({
                "level": "error",
                "msg": f"Socket diameter {socket_d:.2f} mm is smaller than required peg fit (peg: {peg_d:.2f} mm + 2×clearance)",
            })

        # Ear peg length check: must not penetrate through head inner cavity
        max_safe_peg_len = head_wall + 3.0  # safe socket depth inside wall boss
        if peg_len > max_safe_peg_len + 4.0:
            issues.append({
                "level": "error",
                "msg": f"Ear peg length {peg_len:.1f} mm is too long and causes internal interference with head cavity",
            })

    # 5. Arm Overhang & Print Orientation Hints
    if arm_part:
        arm_len = float(arm_part.get("length", 34.0))
        arm_base = float(arm_part.get("base_d", 14.0))
        # If arms are mounted at 90 deg horizontal, note support warning
        issues.append({
            "level": "warn",
            "msg": f"Arm components have horizontal cantilever (length {arm_len:.1f} mm); print flat on build plate with parting plane down to avoid supports",
        })

    # 6. Body Component Cavity Fit
    if body_part:
        bw = float(body_part.get("w", 64.0))
        bd = float(body_part.get("d", 54.0))
        bh = float(body_part.get("h", 54.0))
        b_wall = float(body_part.get("wall", global_wall))
        cavity_w = bw - 2.0 * b_wall
        cavity_d = bd - 2.0 * b_wall
        cavity_h = bh - 2.0 * b_wall
        cav_sorted = sorted([cavity_w, cavity_d, cavity_h])
        max_diag = math.sqrt(cav_sorted[1]**2 + cav_sorted[2]**2)

        for comp in spec.get("components", []):
            if comp.get("target") == "body":
                c_size = comp.get("size", [0, 0, 0])
                c_name = comp.get("name", "Component")
                c_sorted = sorted(c_size)
                fits = (
                    c_sorted[0] <= cav_sorted[0] and
                    c_sorted[1] <= cav_sorted[1] and
                    c_sorted[2] <= max(cav_sorted[2], max_diag)
                )
                if not fits:
                    issues.append({
                        "level": "error",
                        "msg": f"Component '{c_name}' ({c_size[0]:.1f}×{c_size[1]:.1f}×{c_size[2]:.1f} mm) exceeds body internal cavity ({cavity_w:.1f}×{cavity_d:.1f}×{cavity_h:.1f} mm)",
                    })

    # 7. Boolean Interference Check in Assembled Pose
    if assembled_solids:
        part_keys = [k for k in assembled_solids.keys() if not k.startswith("_")]
        for i in range(len(part_keys)):
            for j in range(i + 1, len(part_keys)):
                k1, k2 = part_keys[i], part_keys[j]
                # Skip mating halves of the same part (e.g. head_front and head_back)
                if k1.replace("_front", "").replace("_back", "") == k2.replace("_front", "").replace("_back", ""):
                    continue
                s1, s2 = assembled_solids[k1], assembled_solids[k2]
                if s1 is None or s2 is None:
                    continue
                try:
                    inter = s1.intersect(s2)
                    v = inter.val().Volume() if (inter and inter.val()) else 0.0
                    if v > 0.5:
                        issues.append({
                            "level": "error",
                            "msg": f"Interference detected: part '{k1}' collides with part '{k2}' ({v:.2f} mm³ overlap > 0.5 mm³ limit)",
                        })
                except Exception as e:
                    logger.warning(f"Could not compute interference between {k1} and {k2}: {e}")

    return issues

import copy
import logging
import time
import uuid
from typing import Dict, Any, List, Tuple, Optional

from cad_design import BOARDS, resolve, get_presets, layout, check

logger = logging.getLogger("3dme.edit")

class EditError(Exception):
    """Raised when an edit operation cannot be applied."""
    pass

def _find_appendage(spec: Dict[str, Any], query_id: str) -> Optional[Dict[str, Any]]:
    qid = query_id.lower().strip()
    for app in spec.get("appendages", []):
        if app.get("id", "").lower() == qid:
            return app
    for app in spec.get("appendages", []):
        if qid in app.get("id", "").lower() or qid in app.get("name", "").lower():
            return app
        if qid in ("ear", "ears") and ("ear" in app.get("id", "").lower() or app.get("face") == "top"):
            return app
        if qid in ("arm", "arms") and ("arm" in app.get("id", "").lower() or app.get("face") in ("left", "right")):
            return app
        if qid in ("antenna",) and ("antenna" in app.get("id", "").lower() or app.get("type") == "cylinder"):
            return app
        if qid in ("foot", "feet") and ("foot" in app.get("id", "").lower() or app.get("face") == "bottom"):
            return app
    return None

def _find_window(spec: Dict[str, Any], query_id: str) -> Optional[Dict[str, Any]]:
    qid = query_id.lower().strip()
    windows = spec.get("windows", [])
    if not windows:
        return None
    for win in windows:
        if win.get("id", "").lower() == qid:
            return win
    for win in windows:
        if qid in win.get("id", "").lower() or qid in win.get("name", "").lower():
            return win
    # Fallback to first window if ambiguous or generic "window"
    if qid in ("window", "screen", "front_window", "front"):
        return windows[0]
    return windows[0]

def _find_component(spec: Dict[str, Any], query_id: str) -> Optional[Dict[str, Any]]:
    qid = query_id.lower().strip()
    for comp in spec.get("components", []):
        if comp.get("id", "").lower() == qid:
            return comp
        if qid in comp.get("name", "").lower() or qid in comp.get("id", "").lower():
            return comp
    return None

def _find_robot_part(spec: Dict[str, Any], query_id: str) -> Optional[Dict[str, Any]]:
    qid = query_id.lower().strip()
    parts = spec.get("parts", [])
    for p in parts:
        if p.get("id", "").lower() == qid or p.get("kind", "").lower() == qid:
            return p
    for p in parts:
        if qid in p.get("id", "").lower() or qid in p.get("name", "").lower() or qid in p.get("kind", "").lower():
            return p
        if qid in ("head", "face") and p.get("kind") == "head":
            return p
        if qid in ("body", "torso") and p.get("kind") == "body":
            return p
        if qid in ("arm", "arms") and p.get("kind") == "arm":
            return p
        if qid in ("ear", "ears", "pod", "ear_pod", "ear_pods") and p.get("kind") == "ear_pod":
            return p
        if qid in ("neck", "collar") and p.get("kind") == "neck":
            return p
    return None


def apply_ops(spec: Dict[str, Any], ops: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[str]]:
    """
    Atomically applies a sequence of edit operations to spec.
    Returns (new_spec, diff_descriptions).
    If any operation fails or violates feasibility with error, raises EditError.
    """
    new_spec = copy.deepcopy(spec)
    if "windows" not in new_spec:
        new_spec["windows"] = []
    if "appendages" not in new_spec:
        new_spec["appendages"] = []
    if "components" not in new_spec:
        new_spec["components"] = []

    diffs: List[str] = []

    for op in ops:
        action = op.get("op", "").lower().strip()
        data = op.get("data") or op

        if action == "add_component":
            comp_raw = op.get("component") or data.get("component") or data
            comp = resolve(comp_raw)
            new_spec["components"].append(comp)
            diffs.append(f"Added component: {comp['name']} ({comp['size'][0]}×{comp['size'][1]}×{comp['size'][2]} mm)")

        elif action == "remove_component":
            cid = op.get("id") or op.get("name") or ""
            comp = _find_component(new_spec, cid)
            if comp:
                new_spec["components"] = [c for c in new_spec["components"] if c.get("id") != comp.get("id")]
                diffs.append(f"Removed component: {comp['name']}")
            else:
                raise EditError(f"Component '{cid}' not found")

        elif action == "set_component":
            cid = op.get("id") or op.get("name") or ""
            comp = _find_component(new_spec, cid)
            if not comp:
                raise EditError(f"Component '{cid}' not found")
            if "size" in op:
                old_s = comp["size"]
                comp["size"] = [float(x) for x in op["size"]]
                diffs.append(f"{comp['name']}: size {old_s} -> {comp['size']} mm")

        elif action == "add_window":
            win_id = op.get("id") or f"win_{uuid.uuid4().hex[:4]}"
            shape = op.get("shape", "rect")
            face = op.get("face", "front")
            w = float(op.get("w", op.get("d", 20.0)))
            h = float(op.get("h", op.get("d", 15.0)))
            x = float(op.get("x", 0.0))
            z = float(op.get("z", 0.0))
            cr = float(op.get("corner_radius", 2.0))
            new_win = {
                "id": win_id,
                "name": op.get("name", "Window"),
                "face": face,
                "shape": shape,
                "w": w,
                "h": h,
                "x": x,
                "z": z,
                "corner_radius": cr,
            }
            new_spec["windows"].append(new_win)
            diffs.append(f"Added {shape} window on {face} face ({w}×{h} mm)")

        elif action == "set_window":
            wid = op.get("id") or "window"
            win = _find_window(new_spec, wid)
            if not win:
                raise EditError(f"Window '{wid}' not found")

            # Relative width/height changes
            if "d_w" in op:
                old_w = win["w"]
                win["w"] = max(1.0, round(old_w + float(op["d_w"]), 1))
                diffs.append(f"Window: width {old_w} -> {win['w']} mm")
            elif "w" in op:
                old_w = win["w"]
                win["w"] = max(1.0, float(op["w"]))
                diffs.append(f"Window: width {old_w} -> {win['w']} mm")

            if "d_h" in op:
                old_h = win["h"]
                win["h"] = max(1.0, round(old_h + float(op["d_h"]), 1))
                diffs.append(f"Window: height {old_h} -> {win['h']} mm")
            elif "h" in op:
                old_h = win["h"]
                win["h"] = max(1.0, float(op["h"]))
                diffs.append(f"Window: height {old_h} -> {win['h']} mm")

            if "d_x" in op:
                old_x = win["x"]
                win["x"] = round(old_x + float(op["d_x"]), 1)
                diffs.append(f"Window: X pos {old_x} -> {win['x']} mm")

            if "d_z" in op:
                old_z = win["z"]
                win["z"] = round(old_z + float(op["d_z"]), 1)
                diffs.append(f"Window: Z pos {old_z} -> {win['z']} mm")

            if "corner_radius" in op:
                win["corner_radius"] = float(op["corner_radius"])
                diffs.append(f"Window: corner radius -> {win['corner_radius']} mm")

        elif action == "remove_window":
            wid = op.get("id") or "window"
            win = _find_window(new_spec, wid)
            if win:
                new_spec["windows"] = [w for w in new_spec["windows"] if w.get("id") != win.get("id")]
                diffs.append(f"Removed window: {win.get('name', wid)}")
            else:
                raise EditError(f"Window '{wid}' not found")

        elif action == "add_appendage":
            app_id = op.get("id") or f"app_{uuid.uuid4().hex[:4]}"
            app_type = op.get("type", "cone")
            face = op.get("face", "top")
            length = float(op.get("length", 20.0))
            base_d = float(op.get("base_d", 14.0))
            tip_d = float(op.get("tip_d", 3.0))
            tilt = float(op.get("tilt_deg", 0.0))
            mirror = bool(op.get("mirror", True))
            app_x = float(op.get("x", 20.0 if mirror else 0.0))
            app_z = float(op.get("z", 0.0))

            new_app = {
                "id": app_id,
                "name": op.get("name", f"{app_type.capitalize()} on {face}"),
                "type": app_type,
                "face": face,
                "x": app_x,
                "z": app_z,
                "base_d": base_d,
                "tip_d": tip_d,
                "length": length,
                "tilt_deg": tilt,
                "mirror": mirror,
                "fillet": float(op.get("fillet", 1.0)),
            }
            if op.get("ball_tip"):
                new_app["ball_tip"] = True
                new_app["ball_d"] = float(op.get("ball_d", 8.0))

            new_spec["appendages"].append(new_app)
            diffs.append(f"Added {new_app['name']} (length {length} mm, base {base_d} mm)")

        elif action == "set_appendage":
            aid = op.get("id") or ""
            app = _find_appendage(new_spec, aid)
            if not app:
                raise EditError(f"Appendage '{aid}' not found")

            name = app.get("name", app.get("id", "Appendage"))

            # Relative length/height changes
            if "d_length" in op:
                old_l = app["length"]
                app["length"] = max(1.0, round(old_l + float(op["d_length"]), 1))
                diffs.append(f"{name}: height {old_l:.1f} -> {app['length']:.1f} mm")
            elif "length" in op:
                old_l = app["length"]
                app["length"] = max(1.0, float(op["length"]))
                diffs.append(f"{name}: height {old_l:.1f} -> {app['length']:.1f} mm")

            # Relative tilt changes
            if "d_tilt" in op:
                old_tilt = app.get("tilt_deg", 0.0)
                app["tilt_deg"] = round(old_tilt + float(op["d_tilt"]), 1)
                diffs.append(f"{name}: tilt {old_tilt:.1f} -> {app['tilt_deg']:.1f} deg")
            elif "tilt_deg" in op:
                old_tilt = app.get("tilt_deg", 0.0)
                app["tilt_deg"] = float(op["tilt_deg"])
                diffs.append(f"{name}: tilt {old_tilt:.1f} -> {app['tilt_deg']:.1f} deg")

            # Relative base diameter changes
            if "d_base_d" in op:
                old_b = app["base_d"]
                app["base_d"] = max(1.0, round(old_b + float(op["d_base_d"]), 1))
                diffs.append(f"{name}: base width {old_b:.1f} -> {app['base_d']:.1f} mm")
            elif "base_d" in op:
                old_b = app["base_d"]
                app["base_d"] = max(1.0, float(op["base_d"]))
                diffs.append(f"{name}: base width {old_b:.1f} -> {app['base_d']:.1f} mm")

            # Relative tip diameter changes
            if "d_tip_d" in op:
                old_t = app.get("tip_d", app["base_d"])
                app["tip_d"] = max(0.5, round(old_t + float(op["d_tip_d"]), 1))
                diffs.append(f"{name}: tip width {old_t:.1f} -> {app['tip_d']:.1f} mm")
            elif "tip_d" in op:
                old_t = app.get("tip_d", app["base_d"])
                app["tip_d"] = max(0.5, float(op["tip_d"]))
                diffs.append(f"{name}: tip width {old_t:.1f} -> {app['tip_d']:.1f} mm")

            if "d_x" in op:
                old_x = app.get("x", 0.0)
                app["x"] = round(old_x + float(op["d_x"]), 1)
                diffs.append(f"{name}: X pos {old_x:.1f} -> {app['x']:.1f} mm")

        elif action == "remove_appendage":
            aid = op.get("id") or ""
            app = _find_appendage(new_spec, aid)
            if app:
                new_spec["appendages"] = [a for a in new_spec["appendages"] if a.get("id") != app.get("id")]
                diffs.append(f"Removed {app.get('name', aid)}")
            else:
                raise EditError(f"Appendage '{aid}' not found")

        elif action == "apply_preset":
            pname = op.get("name", "").lower().strip()
            inner = new_spec.get("inner", [60, 40, 25])
            wall = float(new_spec.get("wall", 2.4))
            outer_l = inner[0] + 2 * wall
            outer_w = inner[1] + 2 * wall
            outer_h = inner[2] + 2 * wall

            presets = get_presets(outer_l, outer_w, outer_h)
            found_preset = None
            for pk, pv in presets.items():
                if pname in pk or pk in pname:
                    found_preset = copy.deepcopy(pv)
                    break

            if not found_preset:
                raise EditError(f"Unknown preset '{pname}'. Available: {list(presets.keys())}")

            # Apply user overrides
            overrides = op.get("overrides", {})
            found_preset.update(overrides)

            # Check if an appendage of this type already exists, replace it or add
            existing = _find_appendage(new_spec, found_preset["id"])
            if existing:
                new_spec["appendages"] = [a for a in new_spec["appendages"] if a.get("id") != existing.get("id")]
            new_spec["appendages"].append(found_preset)
            diffs.append(f"Applied preset: {found_preset['name']}")

        elif action == "set_body":
            body = new_spec.setdefault("body", {})
            if "corner_radius" in op:
                old_cr = new_spec.get("corner_radius", 12.0)
                new_cr = float(op["corner_radius"])
                new_spec["corner_radius"] = new_cr
                body["corner_radius"] = new_cr
                diffs.append(f"Corner radius: {old_cr} -> {new_cr} mm")
            if "shape" in op:
                body["shape"] = op["shape"]
                diffs.append(f"Body shape: {op['shape']}")
            if "split" in op:
                new_spec["split"] = op["split"]
                diffs.append(f"Split style: {op['split']}")

        elif action == "set_wall":
            old_w = float(new_spec.get("wall", 2.4))
            new_w = float(op.get("wall", 2.4))
            new_spec["wall"] = new_w
            for p in new_spec.get("parts", []):
                p["wall"] = new_w
            diffs.append(f"Wall thickness: {old_w:.1f} -> {new_w:.1f} mm")

        # --- Replacement Part Operations ---
        elif action == "set_part_type":
            old_t = new_spec.get("part_type", "plate")
            new_t = op.get("part_type", "plate")
            new_spec["part_type"] = new_t
            new_spec["mode"] = "part"
            diffs.append(f"Part type: {old_t} -> {new_t}")

        elif action == "set_measurement":
            meas = new_spec.setdefault("measurements", {})
            key = op.get("key") or op.get("name")
            if not key:
                # check if key in op keys
                for k in ["leg1", "leg2", "width", "thickness", "length", "outer_d", "inner_d", "height", "fillet"]:
                    if k in op or f"d_{k}" in op:
                        key = k
                        break
            if key:
                old_v = float(meas.get(key, 0.0))
                d_key = f"d_{key}"
                if d_key in op:
                    new_v = round(old_v + float(op[d_key]), 2)
                elif "d_val" in op:
                    new_v = round(old_v + float(op["d_val"]), 2)
                elif key in op:
                    new_v = float(op[key])
                elif "value" in op:
                    new_v = float(op["value"])
                else:
                    new_v = old_v
                meas[key] = new_v
                diffs.append(f"{key.capitalize()}: {old_v:.1f} -> {new_v:.1f} mm")

        elif action in ("set_pattern", "add_pattern"):
            features = new_spec.setdefault("features", [])
            pat = next((f for f in features if f.get("type") == "linear_pattern"), None)
            if not pat:
                pat = {"type": "linear_pattern", "count": 2, "pitch": 30.0, "d": 3.4, "leg": "leg1"}
                features.append(pat)
                diffs.append("Added linear hole pattern")

            if "d_pitch" in op:
                old_p = float(pat.get("pitch", 30.0))
                pat["pitch"] = round(old_p + float(op["d_pitch"]), 2)
                diffs.append(f"Hole spacing: {old_p:.1f} -> {pat['pitch']:.1f} mm")
            elif "pitch" in op:
                old_p = float(pat.get("pitch", 30.0))
                pat["pitch"] = float(op["pitch"])
                diffs.append(f"Hole spacing: {old_p:.1f} -> {pat['pitch']:.1f} mm")

            if "count" in op:
                old_c = int(pat.get("count", 2))
                pat["count"] = int(op["count"])
                diffs.append(f"Hole count: {old_c} -> {pat['count']}")

            if "d" in op or "size" in op:
                old_d = float(pat.get("d", 3.4))
                pat["d"] = float(op.get("d", op.get("size", 3.4)))
                diffs.append(f"Hole diameter: {old_d:.1f} -> {pat['d']:.1f} mm")

        elif action == "add_hole":
            features = new_spec.setdefault("features", [])
            d = float(op.get("d", op.get("size", 3.4)))
            hx = float(op.get("x", 0.0))
            hy = float(op.get("y", 0.0))
            features.append({
                "type": "hole",
                "d": d,
                "x": hx,
                "y": hy,
                "countersink": bool(op.get("countersink", False)),
                "cs_d": float(op.get("cs_d", d * 1.8)),
                "cs_angle": float(op.get("cs_angle", 90.0)),
            })
            diffs.append(f"Added Ø{d:.1f}mm hole at ({hx:.1f}, {hy:.1f})")

        elif action == "remove_hole":
            features = new_spec.setdefault("features", [])
            idx = int(op.get("index", len(features) - 1))
            if 0 <= idx < len(features):
                removed = features.pop(idx)
                diffs.append(f"Removed hole at index {idx}")

        elif action == "set_fillet":
            meas = new_spec.setdefault("measurements", {})
            old_f = float(meas.get("fillet", 0.0))
            new_f = float(op.get("fillet", op.get("value", 2.0)))
            meas["fillet"] = new_f
            diffs.append(f"Fillet radius: {old_f:.1f} -> {new_f:.1f} mm")

        # ----------------- Robot Assembly Operations -----------------

        elif action == "set_overall_height":
            old_h = float(new_spec.get("overall_height_mm", 120.0))
            new_h = float(op.get("height", op.get("overall_height_mm", op.get("value", old_h))))
            new_spec["overall_height_mm"] = new_h
            diffs.append(f"Overall height: {old_h:.1f} -> {new_h:.1f} mm")

        elif action == "set_part":
            pid = op.get("part") or op.get("id") or op.get("kind") or ""
            part = _find_robot_part(new_spec, pid)
            if not part:
                raise EditError(f"Robot part '{pid}' not found")
            p_name = part.get("name", part.get("kind", pid))

            # Width / Length deltas & sets
            if "d_w" in op:
                old_v = float(part.get("w", 50.0))
                part["w"] = round(old_v + float(op["d_w"]), 1)
                diffs.append(f"{p_name}: width {old_v:.1f} -> {part['w']:.1f} mm")
            elif "w" in op:
                old_v = float(part.get("w", 50.0))
                part["w"] = float(op["w"])
                diffs.append(f"{p_name}: width {old_v:.1f} -> {part['w']:.1f} mm")

            if "d_h" in op:
                old_v = float(part.get("h", 50.0))
                part["h"] = round(old_v + float(op["d_h"]), 1)
                diffs.append(f"{p_name}: height {old_v:.1f} -> {part['h']:.1f} mm")
            elif "h" in op:
                old_v = float(part.get("h", 50.0))
                part["h"] = float(op["h"])
                diffs.append(f"{p_name}: height {old_v:.1f} -> {part['h']:.1f} mm")

            if "d_d" in op:
                old_v = float(part.get("d", 50.0))
                part["d"] = round(old_v + float(op["d_d"]), 1)
                diffs.append(f"{p_name}: depth {old_v:.1f} -> {part['d']:.1f} mm")
            elif "d" in op:
                old_v = float(part.get("d", 50.0))
                part["d"] = float(op["d"])
                diffs.append(f"{p_name}: depth {old_v:.1f} -> {part['d']:.1f} mm")

            if "d_length" in op:
                old_v = float(part.get("length", part.get("peg_length", 30.0)))
                new_v = round(old_v + float(op["d_length"]), 1)
                if "length" in part:
                    part["length"] = new_v
                if "peg_length" in part:
                    part["peg_length"] = new_v
                diffs.append(f"{p_name}: length {old_v:.1f} -> {new_v:.1f} mm")
            elif "length" in op:
                old_v = float(part.get("length", 30.0))
                part["length"] = float(op["length"])
                diffs.append(f"{p_name}: length {old_v:.1f} -> {part['length']:.1f} mm")

            if "wall" in op:
                part["wall"] = float(op["wall"])
                diffs.append(f"{p_name}: wall {part['wall']:.1f} mm")

            if "roundness" in op:
                part["roundness"] = float(op["roundness"])
                diffs.append(f"{p_name}: roundness {part['roundness']:.2f}")

            if "corner_radius" in op:
                part["corner_radius"] = float(op["corner_radius"])
                diffs.append(f"{p_name}: corner radius {part['corner_radius']:.1f} mm")

            if "has_speaker_holes" in op:
                part["has_speaker_holes"] = bool(op["has_speaker_holes"])
                diffs.append(f"{p_name}: speaker holes {'enabled' if part['has_speaker_holes'] else 'disabled'}")

            if "has_usb_cutout" in op:
                part["has_usb_cutout"] = bool(op["has_usb_cutout"])
                diffs.append(f"{p_name}: USB cutout {'enabled' if part['has_usb_cutout'] else 'disabled'}")

        elif action == "add_part":
            parts = new_spec.setdefault("parts", [])
            new_p = op.get("part") or data
            parts.append(new_p)
            diffs.append(f"Added robot part: {new_p.get('name', new_p.get('kind', 'Part'))}")

        elif action == "remove_part":
            pid = op.get("part") or op.get("id") or op.get("kind") or ""
            parts = new_spec.get("parts", [])
            part = _find_robot_part(new_spec, pid)
            if part:
                new_spec["parts"] = [p for p in parts if p.get("id") != part.get("id")]
                diffs.append(f"Removed robot part: {part.get('name', pid)}")
            else:
                raise EditError(f"Robot part '{pid}' not found")

        elif action == "mirror_part":
            pid = op.get("part") or op.get("id") or op.get("kind") or ""
            part = _find_robot_part(new_spec, pid)
            if not part:
                raise EditError(f"Robot part '{pid}' not found")
            part["mirror"] = bool(op.get("mirror", True))
            diffs.append(f"{part.get('name', pid)}: mirror set to {part['mirror']}")

        elif action == "set_joint":
            joints = new_spec.setdefault("joints", [])
            kind = op.get("kind") or op.get("type") or ""
            target_joint = next((j for j in joints if j.get("kind") == kind), None)
            if not target_joint:
                target_joint = {"kind": kind}
                joints.append(target_joint)
            if "clearance" in op:
                target_joint["clearance"] = float(op["clearance"])
                diffs.append(f"Joint '{kind}': clearance {target_joint['clearance']:.2f} mm")
            if "mode" in op:
                target_joint["mode"] = str(op["mode"])
                diffs.append(f"Joint '{kind}': mode {target_joint['mode']}")

        elif action == "set_display":
            head = _find_robot_part(new_spec, "head")
            if not head:
                raise EditError("Robot head part not found for display configuration")
            disp = head.setdefault("display", {})
            if "size" in op:
                disp["size"] = [float(x) for x in op["size"]]
                diffs.append(f"Display module size: {disp['size']}")
            if "active_area" in op:
                disp["active_area"] = [float(x) for x in op["active_area"]]
                diffs.append(f"Display active area: {disp['active_area']}")
            if "shape" in op:
                disp["shape"] = str(op["shape"])
                diffs.append(f"Display shape: {disp['shape']}")
            if "name" in op:
                disp["name"] = str(op["name"])
                diffs.append(f"Display module: {disp['name']}")

        elif action == "move_display":
            head = _find_robot_part(new_spec, "head")
            if not head:
                raise EditError("Robot head part not found for display adjustment")
            disp = head.setdefault("display", {})
            offset = disp.get("offset", [0.0, 0.0])
            dx = float(op.get("dx", 0.0))
            dz = float(op.get("dz", 0.0))
            disp["offset"] = [round(offset[0] + dx, 2), round(offset[1] + dz, 2)]
            diffs.append(f"Moved display window: dx={dx:+.1f}, dz={dz:+.1f} mm (offset: {disp['offset']})")

        elif action == "set_roundness":
            new_r = float(op.get("roundness", op.get("value", 0.8)))
            for p in new_spec.get("parts", []):
                if p.get("kind") in ("head", "body"):
                    p["roundness"] = new_r
            diffs.append(f"Shell roundness updated to {new_r:.2f}")

        elif action == "set_clearance":
            clr = float(op.get("clearance", op.get("value", 0.2)))
            for j in new_spec.get("joints", []):
                j["clearance"] = clr
            diffs.append(f"Joint clearance updated to {clr:.2f} mm")

        elif action == "set_arm_mode":
            mode = str(op.get("mode", op.get("arm_mode", "fixed"))).lower().strip()
            if mode not in ("fixed", "servo"):
                mode = "servo" if "servo" in mode else "fixed"
            arm = _find_robot_part(new_spec, "arm")
            if arm:
                arm["joint_mode"] = mode
            for j in new_spec.get("joints", []):
                if j.get("kind") == "arm_mount":
                    j["mode"] = mode

            components = new_spec.setdefault("components", [])
            if mode == "servo":
                if not any("servo" in c.get("name", "").lower() for c in components):
                    components.append({"id": "comp_servo_left", "name": "SG90 Servo Left", "size": [22.5, 12.2, 22.7], "target": "body"})
                    components.append({"id": "comp_servo_right", "name": "SG90 Servo Right", "size": [22.5, 12.2, 22.7], "target": "body"})
            else:
                new_spec["components"] = [c for c in components if "servo" not in c.get("name", "").lower()]
            diffs.append(f"Arm mount mode set to '{mode}'")

        elif action in ("preset", "apply_preset"):
            p_name = str(op.get("name", op.get("preset", "chibi_robot"))).lower()
            if "chibi" in p_name or "robot" in p_name:
                import cad_robot
                h_val = float(new_spec.get("overall_height_mm", 120.0))
                head_p = _find_robot_part(new_spec, "head")
                disp = head_p.get("display") if head_p else None
                new_spec = cad_robot.create_chibi_robot_spec(overall_height_mm=h_val, display=disp)
                diffs.append("Applied Chibi Robot proportion preset")
            else:
                diffs.append(f"Preset '{p_name}' applied")

        else:
            raise EditError(f"Unsupported operation '{action}'")

    # Feasibility validation
    if new_spec.get("mode") == "part" or new_spec.get("part_type"):
        import cad_parts
        issues = cad_parts.check_part(new_spec)
    else:
        issues = check(new_spec)

    errors = [i for i in issues if i["level"] == "error"]
    if errors:
        raise EditError(f"Edit rejected due to feasibility error: {errors[0]['msg']}")

    return new_spec, diffs

class CadSession:
    """Manages iterative character CAD session state, undo/redo stack, and versioning."""
    def __init__(self, session_id: str, initial_spec: Dict[str, Any], initial_prompt: str = ""):
        self.session_id = session_id
        self.spec = copy.deepcopy(initial_spec)
        self.initial_prompt = initial_prompt
        self.history: List[Dict[str, Any]] = [
            {
                "version": 1,
                "spec": copy.deepcopy(initial_spec),
                "diff": ["Initial enclosure plan"],
                "prompt": initial_prompt,
                "timestamp": time.time(),
            }
        ]
        self.current_idx = 0
        self.diff_log: List[str] = ["Initial enclosure plan"]
        self.build_result: Optional[Dict[str, Any]] = None

    def push_version(self, new_spec: Dict[str, Any], diffs: List[str], prompt: str = "") -> int:
        # Truncate any redo branch
        self.history = self.history[: self.current_idx + 1]
        version_num = len(self.history) + 1
        entry = {
            "version": version_num,
            "spec": copy.deepcopy(new_spec),
            "diff": diffs,
            "prompt": prompt,
            "timestamp": time.time(),
        }
        self.history.append(entry)
        self.current_idx = len(self.history) - 1
        self.spec = copy.deepcopy(new_spec)
        self.diff_log.extend(diffs)
        return version_num

    def undo(self) -> Tuple[Dict[str, Any], str]:
        if self.current_idx <= 0:
            raise EditError("Nothing to undo.")
        self.current_idx -= 1
        entry = self.history[self.current_idx]
        self.spec = copy.deepcopy(entry["spec"])
        msg = f"Undid to version {entry['version']}"
        self.diff_log.append(msg)
        return self.spec, msg

    def redo(self) -> Tuple[Dict[str, Any], str]:
        if self.current_idx >= len(self.history) - 1:
            raise EditError("Nothing to redo.")
        self.current_idx += 1
        entry = self.history[self.current_idx]
        self.spec = copy.deepcopy(entry["spec"])
        msg = f"Redid to version {entry['version']}"
        self.diff_log.append(msg)
        return self.spec, msg

    def reset(self) -> Tuple[Dict[str, Any], str]:
        self.current_idx = 0
        entry = self.history[0]
        self.spec = copy.deepcopy(entry["spec"])
        msg = "Reset to initial design (version 1)"
        self.diff_log.append(msg)
        return self.spec, msg

    def get_summary(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "version": self.current_idx + 1,
            "total_versions": len(self.history),
            "can_undo": self.current_idx > 0,
            "can_redo": self.current_idx < len(self.history) - 1,
            "diff_log": self.diff_log[-5:],
            "spec": self.spec,
            "build_result": self.build_result,
        }

# Global in-memory session repository
_SESSIONS: Dict[str, CadSession] = {}

def get_or_create_session(session_id: Optional[str] = None, initial_spec: Optional[Dict[str, Any]] = None, prompt: str = "") -> CadSession:
    if session_id and session_id in _SESSIONS:
        return _SESSIONS[session_id]
    sid = session_id or str(uuid.uuid4())
    spec = initial_spec or layout(["esp32 devkit"])
    sess = CadSession(sid, spec, prompt)
    _SESSIONS[sid] = sess
    return sess

def get_session(session_id: str) -> Optional[CadSession]:
    return _SESSIONS.get(session_id)

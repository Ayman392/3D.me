import os
import math
import logging
from typing import Dict, Any, List, Tuple, Optional
import cadquery as cq

logger = logging.getLogger("3dme.parts")

# Standard clearance for M-series screw holes (clearance fit, mm)
SCREW_CLEARANCE = {
    "m2": 2.4,
    "m2.5": 2.9,
    "m3": 3.4,
    "m4": 4.5,
    "m5": 5.5,
    "m6": 6.6,
}


def resolve_screw_hole(d_or_name: Any) -> float:
    """Returns diameter in mm for a number or screw thread name (e.g. 'm3' -> 3.4 mm)."""
    if isinstance(d_or_name, (int, float)):
        return float(d_or_name)
    s = str(d_or_name).lower().strip()
    if s in SCREW_CLEARANCE:
        return SCREW_CLEARANCE[s]
    # Check if 'm3' style in string
    for k, v in SCREW_CLEARANCE.items():
        if k in s:
            return v
    try:
        return float(s)
    except ValueError:
        return 3.4  # Default to M3


# ----------------- Part Builders -----------------

def build_plate(spec: Dict[str, Any]) -> cq.Workplane:
    """Builds a flat rectangular plate with optional corner fillets and holes."""
    meas = spec.get("measurements", {})
    l = float(meas.get("length", meas.get("l", 60.0)))
    w = float(meas.get("width", meas.get("w", 40.0)))
    t = float(meas.get("thickness", meas.get("t", 3.0)))
    corner_r = float(spec.get("corner_radius", 0.0))

    plate = cq.Workplane("XY").box(l, w, t)

    # Vertical corner fillets
    if corner_r > 0.0:
        max_r = min(l, w) * 0.45
        safe_r = min(corner_r, max_r)
        try:
            plate = plate.edges("|Z").fillet(safe_r)
        except Exception as e:
            logger.warning(f"Failed to fillet plate corners: {e}")

    plate = apply_part_features(plate, spec, face_w=l, face_h=w, thickness=t)
    return plate


def build_bracket(spec: Dict[str, Any]) -> cq.Workplane:
    """
    Builds an L-shaped mounting bracket.
    leg1: length along X
    leg2: height along Z
    width: depth along Y
    thickness: wall thickness T
    fillet: inside corner fillet
    """
    meas = spec.get("measurements", {})
    leg1 = float(meas.get("leg1", 40.0))
    leg2 = float(meas.get("leg2", 25.0))
    width = float(meas.get("width", 25.0))
    t = float(meas.get("thickness", 3.0))
    fillet_r = float(meas.get("fillet", 2.0))

    # Construct L-profile wire on XZ plane
    pts = [
        (0.0, 0.0),
        (leg1, 0.0),
        (leg1, t),
        (t, t),
        (t, leg2),
        (0.0, leg2),
    ]

    bracket = cq.Workplane("XZ").polyline(pts).close().extrude(width)
    # Center bracket along Y axis so Y=0 is the centerline (XZ extrude normal is -Y)
    bracket = bracket.translate((0.0, width / 2.0, 0.0))

    # Inside corner fillet
    if fillet_r > 0.0:
        max_f = min(fillet_r, (leg1 - t) * 0.8, (leg2 - t) * 0.8, t * 1.5)
        if max_f > 0.2:
            try:
                # Target the inside corner edge at X=t, Z=t
                bracket = bracket.edges(cq.NearestToPointSelector((t, 0.0, t))).fillet(max_f)
            except Exception as e:
                logger.warning(f"Bracket inside fillet failed: {e}")

    bracket = apply_bracket_features(bracket, spec, leg1=leg1, leg2=leg2, width=width, thickness=t)
    return bracket


def build_spacer(spec: Dict[str, Any]) -> cq.Workplane:
    """Builds a cylindrical standoff or spacer with a concentric through-hole."""
    meas = spec.get("measurements", {})
    outer_d = float(meas.get("outer_d", 10.0))
    inner_d = float(meas.get("inner_d", 4.0))
    height = float(meas.get("height", meas.get("h", 15.0)))

    spacer = cq.Workplane("XY").circle(outer_d / 2.0).extrude(height)
    if inner_d > 0.0 and inner_d < outer_d:
        spacer = spacer.faces(">Z").workplane().circle(inner_d / 2.0).cutThruAll()

    return spacer


def build_mounting_plate(spec: Dict[str, Any]) -> cq.Workplane:
    """Builds a plate specifically configured for component/module mounting holes."""
    return build_plate(spec)


def build_clip(spec: Dict[str, Any]) -> cq.Workplane:
    """Builds an annular clip or snap ring with an optional opening gap."""
    meas = spec.get("measurements", {})
    inner_d = float(meas.get("inner_d", 20.0))
    outer_d = float(meas.get("outer_d", 26.0))
    height = float(meas.get("height", meas.get("h", 10.0)))
    gap = float(meas.get("gap", 0.0))

    if outer_d <= inner_d:
        outer_d = inner_d + 4.0

    clip = cq.Workplane("XY").circle(outer_d / 2.0).circle(inner_d / 2.0).extrude(height)

    # Cut opening gap if gap > 0
    if gap > 0.0:
        # Cut a slot on the +X side of width `gap`
        clip = clip.faces(">Z").workplane().center(outer_d / 2.0, 0.0).rect(outer_d, gap).cutThruAll()

    return clip


# ----------------- Feature Application -----------------

def apply_bracket_features(
    bracket: cq.Workplane,
    spec: Dict[str, Any],
    leg1: float,
    leg2: float,
    width: float,
    thickness: float
) -> cq.Workplane:
    """Applies holes, linear patterns, and cutouts specifically to bracket legs."""
    features = spec.get("features", [])
    
    # Check for direct linear pattern (e.g. 2 holes 30 mm apart along leg1)
    patterns = [f for f in features if f.get("type") == "linear_pattern"]
    holes = [f for f in features if f.get("type") in ("hole", "round", "slot")]

    # If linear pattern is specified on leg1
    for pat in patterns:
        count = int(pat.get("count", 2))
        pitch = float(pat.get("pitch", 30.0))
        d = resolve_screw_hole(pat.get("d", pat.get("size", 3.4)))
        target_leg = pat.get("leg", "leg1")

        if target_leg == "leg1":
            # Hole span is along leg1 (X axis) or along width (Y axis)
            # Center of leg1 active span: from X=thickness to X=leg1
            x_min = thickness + 1.5
            x_max = leg1 - 1.5
            x_center = (x_min + x_max) / 2.0

            # Determine whether pitch fits along X or Y
            if pitch <= (leg1 - thickness - 3.0):
                # Pattern along X (length of leg1)
                total_span = (count - 1) * pitch
                x_start = x_center - (total_span / 2.0)
                for i in range(count):
                    hx = x_start + i * pitch
                    cyl = cq.Workplane("XY").transformed(offset=cq.Vector(hx, 0.0, -10.0)).circle(d / 2.0).extrude(thickness + 20.0)
                    bracket = bracket.cut(cyl)
            elif pitch <= (width - 3.0):
                # Pattern along Y (width of leg1)
                total_span = (count - 1) * pitch
                y_start = -(total_span / 2.0)
                for i in range(count):
                    hy = y_start + i * pitch
                    cyl = cq.Workplane("XY").transformed(offset=cq.Vector(x_center, hy, -10.0)).circle(d / 2.0).extrude(thickness + 20.0)
                    bracket = bracket.cut(cyl)

    # Individual holes on bracket
    for h in holes:
        htype = h.get("type", "round")
        d = resolve_screw_hole(h.get("d", 3.4))
        hx = float(h.get("x", (thickness + leg1) / 2.0))
        hy = float(h.get("y", 0.0))
        
        try:
            cyl = cq.Workplane("XY").transformed(offset=cq.Vector(hx, hy, -10.0)).circle(d / 2.0).extrude(thickness + 20.0)
            bracket = bracket.cut(cyl)
        except Exception as e:
            logger.warning(f"Failed to cut bracket hole at ({hx}, {hy}): {e}")

    return bracket


def apply_part_features(
    part: cq.Workplane,
    spec: Dict[str, Any],
    face_w: float,
    face_h: float,
    thickness: float
) -> cq.Workplane:
    """Applies holes, slots, and patterns to flat plate surfaces."""
    features = spec.get("features", [])

    for f in features:
        ftype = f.get("type", "hole")

        if ftype == "linear_pattern":
            count = int(f.get("count", 2))
            pitch = float(f.get("pitch", 30.0))
            d = resolve_screw_hole(f.get("d", 3.4))
            axis = f.get("axis", "x").lower()

            total_span = (count - 1) * pitch
            for i in range(count):
                offset_val = -(total_span / 2.0) + i * pitch
                hx = offset_val if axis == "x" else 0.0
                hy = offset_val if axis == "y" else 0.0
                try:
                    part = (
                        part.faces(">Z")
                        .workplane()
                        .transformed(offset=cq.Vector(hx, hy, 0.0))
                        .circle(d / 2.0)
                        .cutThruAll()
                    )
                except Exception as e:
                    logger.warning(f"Pattern hole cut failed at ({hx}, {hy}): {e}")

        elif ftype in ("hole", "round"):
            d = resolve_screw_hole(f.get("d", 3.4))
            hx = float(f.get("x", 0.0))
            hy = float(f.get("y", 0.0))
            csk = f.get("countersink", False)
            cs_d = float(f.get("cs_d", d * 1.8))
            cs_angle = float(f.get("cs_angle", 90.0))

            try:
                if csk:
                    part = (
                        part.faces(">Z")
                        .workplane()
                        .transformed(offset=cq.Vector(hx, hy, 0.0))
                        .cskHole(d, cs_d, cs_angle)
                    )
                else:
                    part = (
                        part.faces(">Z")
                        .workplane()
                        .transformed(offset=cq.Vector(hx, hy, 0.0))
                        .circle(d / 2.0)
                        .cutThruAll()
                    )
            except Exception as e:
                logger.warning(f"Failed to cut hole at ({hx}, {hy}): {e}")

        elif ftype == "slot":
            sl_len = float(f.get("length", 10.0))
            sl_w = float(f.get("width", 4.0))
            hx = float(f.get("x", 0.0))
            hy = float(f.get("y", 0.0))
            try:
                part = (
                    part.faces(">Z")
                    .workplane()
                    .transformed(offset=cq.Vector(hx, hy, 0.0))
                    .slot2D(sl_len, sl_w)
                    .cutThruAll()
                )
            except Exception as e:
                logger.warning(f"Slot cut failed at ({hx}, {hy}): {e}")

    return part


# ----------------- Part Feasibility Checks -----------------

def check_part(spec: Dict[str, Any], printer: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
    """
    Validates printability of replacement parts:
    - Minimum wall around holes >= 1.5 mm
    - Hole diameter >= 1.5 mm
    - Part size within printer bed
    - Thin features under nozzle limit (< 0.8 mm -> warn)
    """
    issues = []
    ptype = spec.get("part_type", "plate").lower()
    meas = spec.get("measurements", {})
    features = spec.get("features", [])

    if printer is None:
        printer = {"bed": [220.0, 220.0, 250.0], "nozzle": 0.4}

    bed_x, bed_y, bed_z = printer.get("bed", [220.0, 220.0, 250.0])
    nozzle = float(printer.get("nozzle", 0.4))

    # 1. Dimensions extraction and Bed limits
    dim_x, dim_y, dim_z = 0.0, 0.0, 0.0
    thickness = 3.0

    if ptype in ("plate", "mounting_plate"):
        dim_x = float(meas.get("length", meas.get("l", 60.0)))
        dim_y = float(meas.get("width", meas.get("w", 40.0)))
        dim_z = float(meas.get("thickness", meas.get("t", 3.0)))
        thickness = dim_z
    elif ptype == "bracket":
        dim_x = float(meas.get("leg1", 40.0))
        dim_y = float(meas.get("width", 25.0))
        dim_z = float(meas.get("leg2", 25.0))
        thickness = float(meas.get("thickness", 3.0))
    elif ptype in ("spacer", "clip", "clip_ring", "ring"):
        od = float(meas.get("outer_d", 20.0))
        dim_x, dim_y = od, od
        dim_z = float(meas.get("height", meas.get("h", 15.0)))
        if ptype in ("clip", "clip_ring", "ring"):
            id_val = float(meas.get("inner_d", 16.0))
            thickness = (od - id_val) / 2.0
    else:
        dim_x = float(meas.get("length", 50.0))
        dim_y = float(meas.get("width", 50.0))
        dim_z = float(meas.get("thickness", 5.0))
        thickness = dim_z

    # Bed limit checks
    if dim_x > bed_x:
        issues.append({
            "level": "error",
            "msg": f"Part length {dim_x:.1f} mm exceeds printer bed ({bed_x:.1f} mm) by {dim_x - bed_x:.1f} mm on X axis"
        })
    if dim_y > bed_y:
        issues.append({
            "level": "error",
            "msg": f"Part width {dim_y:.1f} mm exceeds printer bed ({bed_y:.1f} mm) by {dim_y - bed_y:.1f} mm on Y axis"
        })
    if dim_z > bed_z:
        issues.append({
            "level": "error",
            "msg": f"Part height {dim_z:.1f} mm exceeds printer bed ({bed_z:.1f} mm) by {dim_z - bed_z:.1f} mm on Z axis"
        })

    # Thin feature warning
    if thickness < 0.8:
        issues.append({
            "level": "warn",
            "msg": f"Part wall/thickness {thickness:.1f} mm is very thin (< 0.8 mm); recommend >= 1.2 mm for structural integrity with a {nozzle:.1f} mm nozzle."
        })

    # 2. Hole and feature checks
    # Collect all individual holes
    all_holes = []
    for f in features:
        ftype = f.get("type", "hole")
        if ftype == "linear_pattern":
            count = int(f.get("count", 2))
            pitch = float(f.get("pitch", 30.0))
            d = resolve_screw_hole(f.get("d", 3.4))
            total_span = (count - 1) * pitch
            target_leg = f.get("leg", "leg1")

            if ptype == "bracket":
                x_center = (thickness + dim_x) / 2.0
                if pitch <= (dim_x - thickness - 3.0):
                    x_start = x_center - (total_span / 2.0)
                    for i in range(count):
                        all_holes.append({"x": x_start + i * pitch, "y": 0.0, "d": d, "face": "leg1"})
                else:
                    y_start = -(total_span / 2.0)
                    for i in range(count):
                        all_holes.append({"x": x_center, "y": y_start + i * pitch, "d": d, "face": "leg1"})
            else:
                axis = f.get("axis", "x").lower()
                for i in range(count):
                    offset_val = -(total_span / 2.0) + i * pitch
                    hx = offset_val if axis == "x" else 0.0
                    hy = offset_val if axis == "y" else 0.0
                    all_holes.append({"x": hx, "y": hy, "d": d, "face": "top"})

        elif ftype in ("hole", "round", "slot"):
            d = resolve_screw_hole(f.get("d", f.get("width", 3.4)))
            hx = float(f.get("x", 0.0))
            hy = float(f.get("y", 0.0))
            all_holes.append({"x": hx, "y": hy, "d": d, "face": f.get("face", "top")})

    for idx, h in enumerate(all_holes):
        d = h["d"]
        hx = h["x"]
        hy = h["y"]
        r = d / 2.0

        # Minimum hole diameter
        if d < 1.5:
            issues.append({
                "level": "error",
                "msg": f"Hole diameter {d:.1f} mm is below the 1.5 mm minimum limit."
            })

        # Clearance to edges
        if ptype == "bracket":
            # For bracket leg1: valid span is from X=thickness to X=leg1, and Y from -width/2 to +width/2
            margin_x_left = (hx - r) - thickness
            margin_x_right = dim_x - (hx + r)
            margin_y_top = (dim_y / 2.0) - (abs(hy) + r)
            min_margin = min(margin_x_left, margin_x_right, margin_y_top)

            if min_margin < 1.5:
                issues.append({
                    "level": "error",
                    "msg": f"Hole at ({hx:.1f}, {hy:.1f}) is too close to bracket edge ({min_margin:.1f} mm < 1.5 mm minimum wall requirement)."
                })
        elif ptype in ("plate", "mounting_plate"):
            margin_x = (dim_x / 2.0) - (abs(hx) + r)
            margin_y = (dim_y / 2.0) - (abs(hy) + r)
            min_margin = min(margin_x, margin_y)

            if min_margin < 1.5:
                issues.append({
                    "level": "error",
                    "msg": f"Hole at ({hx:.1f}, {hy:.1f}) is too close to plate edge ({min_margin:.1f} mm < 1.5 mm minimum wall requirement)."
                })

    # Inter-hole distance check
    for i in range(len(all_holes)):
        for j in range(i + 1, len(all_holes)):
            h1 = all_holes[i]
            h2 = all_holes[j]
            center_dist = math.hypot(h1["x"] - h2["x"], h1["y"] - h2["y"])
            edge_dist = center_dist - (h1["d"] / 2.0 + h2["d"] / 2.0)
            if edge_dist < 1.5:
                issues.append({
                    "level": "error",
                    "msg": f"Holes are too close together ({edge_dist:.1f} mm wall between holes < 1.5 mm minimum requirement)."
                })

    return issues


def build_part(spec: Dict[str, Any]) -> cq.Workplane:
    """Dispatches to the specific parametric builder for the requested part type."""
    ptype = spec.get("part_type", "plate").lower()
    if ptype == "plate":
        return build_plate(spec)
    elif ptype == "bracket":
        return build_bracket(spec)
    elif ptype == "spacer" or ptype == "standoff":
        return build_spacer(spec)
    elif ptype == "mounting_plate":
        return build_mounting_plate(spec)
    elif ptype in ("clip", "ring", "clip_ring"):
        return build_clip(spec)
    else:
        # Fallback to plate
        return build_plate(spec)

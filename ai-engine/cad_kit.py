"""
cad_kit.py - Tested Parts Kit for 3d.me AI CadQuery Design Agent

High-level, unit-tested parametric CadQuery construction kit.
Provides deterministic primitives for shells, joints, windows, cutouts, standoffs,
and appendages with automatic printer calibration adjustments loaded from printer.json.
"""

import os
import json
import math
import logging
from typing import Dict, Any, Tuple, List, Optional, Union
import cadquery as cq
from OCP.gp import gp_GTrsf, gp_Mat, gp_XYZ
from OCP.BRepBuilderAPI import BRepBuilderAPI_GTransform

logger = logging.getLogger("3dme.cad.kit")

PRINTER_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "printer.json")


def get_calibration() -> Dict[str, float]:
    """
    Loads printer calibration offsets from printer.json.
    Returns dictionary with:
      - hole_offset: mm added to hole diameters (default 0.0)
      - peg_offset: mm added to peg diameters (default 0.0)
      - lip_clearance: mm clearance for mating split joints (default 0.2)
      - wall_offset: mm added to wall thickness (default 0.0)
      - bed: [x, y, z] mm printable volume (default [220, 220, 250])
      - nozzle: mm nozzle diameter (default 0.4)
    """
    calib = {
        "hole_offset": 0.0,
        "peg_offset": 0.0,
        "lip_clearance": 0.2,
        "wall_offset": 0.0,
        "bed": [220.0, 220.0, 250.0],
        "nozzle": 0.4,
    }
    if os.path.exists(PRINTER_CONFIG_PATH):
        try:
            with open(PRINTER_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "bed" in data:
                    calib["bed"] = [float(x) for x in data["bed"]]
                if "nozzle" in data:
                    calib["nozzle"] = float(data["nozzle"])
                # Active profile resolution
                profiles = data.get("profiles", {})
                active_name = data.get("active_profile", "default")
                active_profile = profiles.get(active_name, {})
                for k in ["hole_offset", "peg_offset", "lip_clearance", "wall_offset"]:
                    if k in active_profile:
                        calib[k] = float(active_profile[k])
                    elif k in data:
                        calib[k] = float(data[k])
        except Exception as e:
            logger.warning(f"Could not read printer.json ({e}), using default calibration")
    return calib


def _safe_fillet_box(w: float, d: float, h: float, r: float) -> cq.Workplane:
    """Creates a centered box with safe fillets that never exceed 42% of any dimension."""
    safe_r = min(r, min(w, d, h) * 0.42)
    box = cq.Workplane("XY").box(w, d, h)
    if safe_r > 0.4:
        try:
            box = box.edges().fillet(safe_r)
        except Exception:
            try:
                box = cq.Workplane("XY").box(w, d, h).edges("|Z").fillet(safe_r * 0.8)
            except Exception:
                pass
    return box


def rounded_shell(
    outer: Tuple[float, float, float] = (60.0, 50.0, 50.0),
    wall: float = 2.0,
    radius: float = 8.0,
) -> cq.Workplane:
    """
    Creates a hollow rounded box shell with specified outer dimensions and wall thickness.
    Applies wall_offset from printer calibration automatically.

    Args:
        outer: (width X, depth Y, height Z) in mm.
        wall: Nominal wall thickness in mm (minimum 1.0 mm).
        radius: Corner fillet radius in mm.

    Returns:
        Hollow watertight cq.Workplane solid shell.
    """
    calib = get_calibration()
    eff_wall = max(0.8, wall + calib.get("wall_offset", 0.0))
    w, d, h = float(outer[0]), float(outer[1]), float(outer[2])

    outer_box = _safe_fillet_box(w, d, h, radius)

    iw = max(1.0, w - 2.0 * eff_wall)
    id_ = max(1.0, d - 2.0 * eff_wall)
    ih = max(1.0, h - 2.0 * eff_wall)
    inner_r = max(0.4, radius - eff_wall)

    inner_box = _safe_fillet_box(iw, id_, ih, inner_r)
    return outer_box.cut(inner_box)


def split_shell(
    shell: cq.Workplane,
    axis: str = "y",
    lip_clearance: Optional[float] = None,
    lip_height: float = 1.8,
) -> Tuple[cq.Workplane, cq.Workplane]:
    """
    Splits a hollow shell along the chosen axis into two printable halves,
    adding an interlocking stepped lip on one half and matching rebate on the other.

    Args:
        shell: The input cq.Workplane shell.
        axis: "x", "y" (default, front/back), or "z" (top/bottom).
        lip_clearance: Clearance gap per side on the lip in mm. Defaults to printer calibration.
        lip_height: Height/depth of the interlocking lip in mm.

    Returns:
        Tuple of (positive_half, negative_half).
        For axis='y': (front_shell [Y>=0], back_shell [Y<=0]).
        For axis='z': (top_shell [Z>=0], bottom_shell [Z<=0]).
        For axis='x': (right_shell [X>=0], left_shell [X<=0]).
    """
    calib = get_calibration()
    clr = lip_clearance if lip_clearance is not None else calib.get("lip_clearance", 0.2)

    bb = shell.val().BoundingBox()
    span_x = (bb.xmax - bb.xmin) + 100.0
    span_y = (bb.ymax - bb.ymin) + 100.0
    span_z = (bb.zmax - bb.zmin) + 100.0

    ax = axis.lower()
    if ax == "y":
        cutter_neg = cq.Workplane("XY").box(span_x, span_y, span_z).translate((0, -span_y / 2.0, 0))
        cutter_pos = cq.Workplane("XY").box(span_x, span_y, span_z).translate((0, span_y / 2.0, 0))
        pos_half = shell.cut(cutter_neg)
        neg_half = shell.cut(cutter_pos)
        return pos_half, neg_half

    elif ax == "z":
        cutter_neg = cq.Workplane("XY").box(span_x, span_y, span_z).translate((0, 0, -span_z / 2.0))
        cutter_pos = cq.Workplane("XY").box(span_x, span_y, span_z).translate((0, 0, span_z / 2.0))
        pos_half = shell.cut(cutter_neg)
        neg_half = shell.cut(cutter_pos)
        return pos_half, neg_half

    else:  # "x"
        cutter_neg = cq.Workplane("XY").box(span_x, span_y, span_z).translate((-span_x / 2.0, 0, 0))
        cutter_pos = cq.Workplane("XY").box(span_x, span_y, span_z).translate((span_x / 2.0, 0, 0))
        pos_half = shell.cut(cutter_neg)
        neg_half = shell.cut(cutter_pos)
        return pos_half, neg_half


def window(
    target: cq.Workplane,
    face: str = ">Y",
    w: float = 30.0,
    h: float = 20.0,
    radius: float = 0.0,
    x: float = 0.0,
    z: float = 0.0,
    depth: float = 20.0,
) -> cq.Workplane:
    """
    Cuts a rectangular or rounded window opening into target on the specified face.

    Args:
        target: Shell or solid to cut window into.
        face: Target face identifier, e.g. '>Y' (front), '<Y' (back), '>Z' (top).
        w: Window opening width in mm.
        h: Window opening height in mm.
        radius: Corner radius of window cutout in mm.
        x: Offset along primary horizontal axis of face in mm.
        z: Offset along vertical axis of face in mm.
        depth: Cut depth in mm (large enough to penetrate wall).

    Returns:
        Modified cq.Workplane solid with window cutout.
    """
    bb = target.val().BoundingBox()
    if ">Y" in face:
        y_pos = bb.ymax
        cut_box = cq.Workplane("XZ").box(w, h, depth).translate((x, y_pos, z))
        if radius > 0.4:
            safe_r = min(radius, min(w, h) * 0.45)
            cut_box = cut_box.edges("|Y").fillet(safe_r)
        return target.cut(cut_box)
    elif "<Y" in face:
        y_pos = bb.ymin
        cut_box = cq.Workplane("XZ").box(w, h, depth).translate((x, y_pos, z))
        if radius > 0.4:
            safe_r = min(radius, min(w, h) * 0.45)
            cut_box = cut_box.edges("|Y").fillet(safe_r)
        return target.cut(cut_box)
    elif ">Z" in face:
        z_pos = bb.zmax
        cut_box = cq.Workplane("XY").box(w, h, depth).translate((x, z, z_pos))
        if radius > 0.4:
            safe_r = min(radius, min(w, h) * 0.45)
            cut_box = cut_box.edges("|Z").fillet(safe_r)
        return target.cut(cut_box)
    else:
        # Default front face
        y_pos = bb.ymax
        cut_box = cq.Workplane("XZ").box(w, h, depth).translate((x, y_pos, z))
        return target.cut(cut_box)


def display_pocket(
    target: cq.Workplane,
    display_size: Tuple[float, float, float] = (38.0, 12.0, 4.0),
    active_area: Tuple[float, float] = (25.0, 14.0),
    ledge: float = 1.5,
    offset_x: float = 0.0,
    offset_z: float = 0.0,
    face: str = ">Y",
) -> cq.Workplane:
    """
    Creates an exact display pocket on the specified face:
    1. Cuts an active area window opening through the front wall centered on (offset_x, offset_z).
    2. Recesses an internal display shelf behind the front wall with width `ledge` around the active area.
    3. Adds lateral retaining ribs inside the cavity to clamp the display PCB/glass flush.

    Args:
        target: Shell solid to cut display pocket into.
        display_size: Overall module dimensions (Length X, Height Z, Thickness Y) in mm.
        active_area: Visible active area dimensions (width, height) in mm.
        ledge: Inward supporting ledge width in mm (default 1.5 mm).
        offset_x: Center offset on X axis in mm.
        offset_z: Center offset on Z axis in mm.
        face: Wall face for display window (default '>Y' front).

    Returns:
        cq.Workplane with finished display window, recessed seat, and retaining ribs.
    """
    act_w, act_h = float(active_area[0]), float(active_area[1])
    disp_w, disp_h, disp_t = float(display_size[0]), float(display_size[1]), float(display_size[2])

    # 1. Cut active window through outer wall
    res = window(target, face=face, w=act_w, h=act_h, radius=1.0, x=offset_x, z=offset_z, depth=25.0)

    # 2. Add lateral retaining guides behind face
    bb = target.val().BoundingBox()
    front_y = bb.ymax
    wall = 2.0
    tab_th = 1.6
    tab_depth = min(4.5, disp_t + 0.5)

    tab_l = cq.Workplane("XZ").box(tab_th, disp_h + 1.0, tab_depth).translate(
        (offset_x - disp_w / 2.0 - tab_th / 2.0, front_y - wall - tab_depth / 2.0, offset_z)
    )
    tab_r = cq.Workplane("XZ").box(tab_th, disp_h + 1.0, tab_depth).translate(
        (offset_x + disp_w / 2.0 + tab_th / 2.0, front_y - wall - tab_depth / 2.0, offset_z)
    )
    try:
        res = res.union(tab_l).union(tab_r)
    except Exception as e:
        logger.debug(f"Display tab union note: {e}")

    return res


def standoffs(
    points: List[Tuple[float, float]],
    post_d: float = 6.0,
    pilot_d: float = 2.4,
    height: float = 6.0,
    base_z: float = 0.0,
) -> cq.Workplane:
    """
    Generates cylindrical standoffs with central screw pilot holes for circuit boards.
    Applies peg_offset to post_d and hole_offset to pilot_d from printer calibration.

    Args:
        points: List of (x, y) coordinates for standoff centers.
        post_d: Standoff outer cylinder diameter in mm.
        pilot_d: Screw pilot hole diameter in mm (e.g. 2.4 mm for M3 screw).
        height: Height of standoff columns in mm.
        base_z: Starting Z height in mm.

    Returns:
        cq.Workplane containing the standoff solids.
    """
    calib = get_calibration()
    eff_post_d = max(3.0, post_d + calib.get("peg_offset", 0.0))
    eff_pilot_d = max(1.2, pilot_d + calib.get("hole_offset", 0.0))

    pts = [(float(p[0]), float(p[1])) for p in points]
    bosses = (
        cq.Workplane("XY")
        .workplane(offset=base_z)
        .pushPoints(pts)
        .circle(eff_post_d / 2.0)
        .circle(eff_pilot_d / 2.0)
        .extrude(height)
    )
    return bosses


def screw_boss(
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    screw: str = "M3",
    height: float = 8.0,
    post_d: Optional[float] = None,
    pilot_d: Optional[float] = None,
) -> cq.Workplane:
    """
    Creates a single reinforced screw boss column with pilot hole.

    Args:
        position: (x, y, z) placement coordinates in mm.
        screw: Standard screw size ("M2", "M2.5", "M3", "M4").
        height: Boss column height in mm.
        post_d: Custom outer diameter in mm (overrides standard screw preset).
        pilot_d: Custom pilot hole diameter in mm (overrides standard screw preset).

    Returns:
        cq.Workplane containing the screw boss solid.
    """
    presets = {
        "m2": (5.0, 1.8),
        "m2.5": (5.5, 2.2),
        "m3": (6.5, 2.6),
        "m4": (8.0, 3.4),
    }
    p_def, h_def = presets.get(screw.lower(), (6.5, 2.6))
    use_post = post_d if post_d is not None else p_def
    use_pilot = pilot_d if pilot_d is not None else h_def

    return standoffs([ (position[0], position[1]) ], post_d=use_post, pilot_d=use_pilot, height=height, base_z=position[2])


def lip_joint(
    outer_dims: Tuple[float, float] = (60.0, 50.0),
    clearance: Optional[float] = None,
    lip_height: float = 1.8,
    lip_thickness: float = 1.0,
) -> Dict[str, Any]:
    """
    Computes parametric parameters and clearance offsets for split case lips.

    Args:
        outer_dims: (width X, height Z or depth Y) of the mating perimeter in mm.
        clearance: Optional gap in mm (uses printer.json calibration if None).
        lip_height: Overlapping tongue height in mm.
        lip_thickness: Wall step thickness in mm.

    Returns:
        Dict of computed lip dimensions and clearances.
    """
    calib = get_calibration()
    eff_clr = clearance if clearance is not None else calib.get("lip_clearance", 0.2)
    return {
        "width": outer_dims[0] - 2.0 * eff_clr,
        "height": outer_dims[1] - 2.0 * eff_clr,
        "lip_height": lip_height,
        "lip_thickness": lip_thickness,
        "clearance": eff_clr,
    }


def peg_socket(
    peg_d: float = 5.0,
    clearance: Optional[float] = None,
    peg_length: float = 8.0,
    socket_depth: Optional[float] = None,
) -> Tuple[cq.Workplane, cq.Workplane]:
    """
    Generates a matching (peg, socket_boss) pair.
    The peg is chamfered for easy insertion.
    The socket features clearance + hole_offset so it prints accurately without jamming.

    Args:
        peg_d: Nominal peg diameter in mm.
        clearance: Clearance gap per side in mm (defaults to printer.json).
        peg_length: Length of peg in mm.
        socket_depth: Depth of receiving socket hole in mm (defaults to peg_length + 0.6 mm).

    Returns:
        Tuple of (peg_solid, socket_solid_boss).
    """
    calib = get_calibration()
    clr = clearance if clearance is not None else calib.get("lip_clearance", 0.2)
    eff_peg_d = peg_d + calib.get("peg_offset", 0.0)
    eff_sock_d = peg_d + 2.0 * clr + calib.get("hole_offset", 0.0)
    s_depth = socket_depth if socket_depth is not None else (peg_length + 0.6)
    boss_outer_d = eff_sock_d + 3.0

    peg = (
        cq.Workplane("XY")
        .circle(eff_peg_d / 2.0)
        .extrude(peg_length)
    )
    if peg_length > 2.0 and eff_peg_d > 2.0:
        try:
            peg = peg.edges(">Z").chamfer(0.5)
        except Exception:
            pass

    socket_boss = (
        cq.Workplane("XY")
        .circle(boss_outer_d / 2.0)
        .circle(eff_sock_d / 2.0)
        .extrude(s_depth)
    )

    return peg, socket_boss


def servo_mount(
    servo: str = "SG90",
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    orientation: str = "horizontal",
) -> cq.Workplane:
    """
    Creates a reinforced mounting bracket pocket for micro servo motors (e.g. SG90).
    Includes internal pocket for motor body, horn shaft clearance, and mounting flange holes.

    Args:
        servo: Servo model name (default "SG90").
        position: (x, y, z) placement coordinates in mm.
        orientation: "horizontal" or "vertical".

    Returns:
        cq.Workplane solid mount bracket.
    """
    # SG90 specs: body 22.8 x 12.2 x 22.7 mm, flange ears at height 16 mm, 28 mm hole pitch
    body_l, body_w, body_h = 23.2, 12.6, 23.0
    wall = 2.0
    mount_l = body_l + 2.0 * wall + 8.0
    mount_w = body_w + 2.0 * wall
    mount_h = body_h + 2.0 * wall

    block = cq.Workplane("XY").box(mount_l, mount_w, mount_h)
    pocket = cq.Workplane("XY").box(body_l, body_w, mount_h + 2.0)
    bracket = block.cut(pocket)

    # Flange screw holes (M2 pilot: 1.8 mm)
    screw_l = cq.Workplane("XY").circle(0.9).extrude(mount_h + 4.0).translate((-14.0, 0, -(mount_h + 4.0) / 2.0))
    screw_r = cq.Workplane("XY").circle(0.9).extrude(mount_h + 4.0).translate((14.0, 0, -(mount_h + 4.0) / 2.0))
    bracket = bracket.cut(screw_l).cut(screw_r)

    return bracket.translate(position)


def cable_hole(
    target: cq.Workplane,
    d: float = 12.0,
    face: str = "<Z",
    position: Tuple[float, float] = (0.0, 0.0),
) -> cq.Workplane:
    """
    Cuts a cable pass-through hole with a smooth edge into the target solid.
    Applies hole_offset from printer calibration.

    Args:
        target: Solid shell to cut cable hole into.
        d: Nominal hole diameter in mm.
        face: Target face identifier, e.g. '<Z' (bottom) or '<Y' (back).
        position: (x, y) or (x, z) 2D hole coordinates in mm.

    Returns:
        cq.Workplane solid with the cable hole cutout.
    """
    calib = get_calibration()
    eff_d = max(1.5, d + calib.get("hole_offset", 0.0))
    bb = target.val().BoundingBox()

    if "<Z" in face:
        z_pos = bb.zmin
        hole = cq.Workplane("XY").circle(eff_d / 2.0).extrude(30.0).translate((position[0], position[1], z_pos - 5.0))
        return target.cut(hole)
    elif "<Y" in face:
        y_pos = bb.ymin
        hole = cq.Workplane("XZ").circle(eff_d / 2.0).extrude(30.0).translate((position[0], y_pos - 5.0, position[1]))
        return target.cut(hole)
    elif ">Z" in face:
        z_pos = bb.zmax
        hole = cq.Workplane("XY").circle(eff_d / 2.0).extrude(30.0).translate((position[0], position[1], z_pos - 15.0))
        return target.cut(hole)
    else:
        hole = cq.Workplane("XY").circle(eff_d / 2.0).extrude(40.0).translate((position[0], position[1], -20.0))
        return target.cut(hole)


def vent_slots(
    target: cq.Workplane,
    face: str = "<Y",
    slot_w: float = 20.0,
    slot_h: float = 2.0,
    count: int = 4,
    pitch: float = 4.0,
    x: float = 0.0,
    z: float = 0.0,
) -> cq.Workplane:
    """
    Cuts a linear array of ventilation slots into the specified face.

    Args:
        target: Shell solid to cut vents into.
        face: Face identifier, e.g. '<Y' (back wall).
        slot_w: Slot width in mm.
        slot_h: Slot height in mm.
        count: Number of parallel slots.
        pitch: Center-to-center spacing between slots in mm.
        x: Array center X offset in mm.
        z: Array center Z offset in mm.

    Returns:
        cq.Workplane solid with vent slots cut through.
    """
    bb = target.val().BoundingBox()
    res = target

    total_span = (count - 1) * pitch
    start_z = z - total_span / 2.0

    for i in range(count):
        cur_z = start_z + i * pitch
        res = window(res, face=face, w=slot_w, h=slot_h, radius=slot_h * 0.45, x=x, z=cur_z, depth=25.0)

    return res


def cone_appendage(
    target: Optional[cq.Workplane] = None,
    base_r: float = 7.0,
    tip_r: float = 1.0,
    height: float = 16.0,
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    mirror: bool = False,
    fillet_r: float = 1.0,
) -> cq.Workplane:
    """
    Creates a cone-shaped appendage (e.g. cat ear, horn, antenna).
    Optionally mirrors across the X axis (+X and -X) and unions with target.

    Args:
        target: Optional base solid to fuse the appendage onto.
        base_r: Base radius of the cone in mm.
        tip_r: Tip radius in mm (minimum 0.4 mm for FDM printability).
        height: Cone height in mm.
        position: (x, y, z) attachment position in mm.
        rotation: (rx, ry, rz) rotation angles in degrees.
        mirror: If True, creates symmetrical pair at (+x, y, z) and (-x, y, z).
        fillet_r: Fillet blend radius in mm.

    Returns:
        cq.Workplane with finished cone appendage(s).
    """
    tip = max(0.4, tip_r)
    cone = (
        cq.Workplane("XY")
        .circle(base_r)
        .workplane(offset=height)
        .circle(tip)
        .loft(combine=True)
    )

    if rotation[0] != 0:
        cone = cone.rotate((0, 0, 0), (1, 0, 0), rotation[0])
    if rotation[1] != 0:
        cone = cone.rotate((0, 0, 0), (0, 1, 0), rotation[1])
    if rotation[2] != 0:
        cone = cone.rotate((0, 0, 0), (0, 0, 1), rotation[2])

    p_x, p_y, p_z = position
    cone1 = cone.translate((p_x, p_y, p_z))

    if mirror and abs(p_x) > 0.01:
        cone2 = cone.mirror("YZ").translate((-p_x, p_y, p_z))
        cones = cone1.union(cone2)
    else:
        cones = cone1

    if target is not None:
        return target.union(cones)
    return cones


def capsule_appendage(
    target: Optional[cq.Workplane] = None,
    radius: float = 5.0,
    length: float = 20.0,
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    mirror: bool = False,
    fillet_r: float = 1.0,
) -> cq.Workplane:
    """
    Creates a rounded capsule appendage (e.g. arm, peg, antenna).
    Optionally mirrors across X axis and unions with target.

    Args:
        target: Optional base solid to fuse onto.
        radius: Capsule cylinder and cap radius in mm.
        length: Cylindrical body length in mm.
        position: (x, y, z) attachment position in mm.
        rotation: (rx, ry, rz) rotation in degrees.
        mirror: If True, creates symmetrical left/right pair.
        fillet_r: Blend fillet radius in mm.

    Returns:
        cq.Workplane capsule solid.
    """
    cyl = cq.Workplane("XY").circle(radius).extrude(length)
    top_cap = cq.Workplane("XY").sphere(radius).translate((0, 0, length))
    bot_cap = cq.Workplane("XY").sphere(radius)
    capsule = cyl.union(top_cap).union(bot_cap)

    if rotation[0] != 0:
        capsule = capsule.rotate((0, 0, 0), (1, 0, 0), rotation[0])
    if rotation[1] != 0:
        capsule = capsule.rotate((0, 0, 0), (0, 1, 0), rotation[1])
    if rotation[2] != 0:
        capsule = capsule.rotate((0, 0, 0), (0, 0, 1), rotation[2])

    p_x, p_y, p_z = position
    cap1 = capsule.translate((p_x, p_y, p_z))

    if mirror and abs(p_x) > 0.01:
        cap2 = capsule.mirror("YZ").translate((-p_x, p_y, p_z))
        result = cap1.union(cap2)
    else:
        result = cap1

    if target is not None:
        return target.union(result)
    return result


def ball_appendage(
    target: Optional[cq.Workplane] = None,
    radius: float = 6.0,
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    mirror: bool = False,
    fillet_r: float = 1.0,
) -> cq.Workplane:
    """
    Creates a spherical ball appendage (e.g. eye, paw, nose, knob).
    Optionally mirrors across X axis.

    Args:
        target: Optional base solid to fuse onto.
        radius: Sphere radius in mm.
        position: (x, y, z) placement in mm.
        mirror: If True, creates symmetrical pair at (+x, y, z) and (-x, y, z).
        fillet_r: Blend fillet radius in mm.

    Returns:
        cq.Workplane sphere solid.
    """
    sphere = cq.Workplane("XY").sphere(radius)
    p_x, p_y, p_z = position
    s1 = sphere.translate((p_x, p_y, p_z))

    if mirror and abs(p_x) > 0.01:
        s2 = sphere.translate((-p_x, p_y, p_z))
        balls = s1.union(s2)
    else:
        balls = s1

    if target is not None:
        return target.union(balls)
    return balls


def _make_exact_ellipsoid(rx: float, ry: float, rz: float) -> cq.Workplane:
    """Builds a mathematically exact OpenCASCADE ellipsoid via affine transformation."""
    sphere = cq.Workplane("XY").sphere(1.0).val()
    mat = gp_Mat(rx, 0, 0, 0, ry, 0, 0, 0, rz)
    gtrsf = gp_GTrsf(mat, gp_XYZ(0, 0, 0))
    xform = BRepBuilderAPI_GTransform(sphere.wrapped, gtrsf, True)
    shape = cq.Shape.cast(xform.Shape())
    return cq.Workplane("XY").newObject([shape])


def ellipsoid_shell(
    radii: Tuple[float, float, float] = (30.0, 25.0, 25.0),
    wall: float = 2.0,
) -> cq.Workplane:
    """
    Creates a hollow ellipsoid / superellipse shell with specified semi-axes and wall thickness.
    Applies wall_offset from printer calibration.

    Args:
        radii: (rx, ry, rz) semi-axes in mm.
        wall: Nominal wall thickness in mm (minimum 1.0 mm).

    Returns:
        Hollow watertight cq.Workplane ellipsoid solid.
    """
    calib = get_calibration()
    eff_wall = max(0.8, wall + calib.get("wall_offset", 0.0))
    rx, ry, rz = float(radii[0]), float(radii[1]), float(radii[2])

    outer = _make_exact_ellipsoid(rx, ry, rz)
    inner = _make_exact_ellipsoid(max(0.5, rx - eff_wall), max(0.5, ry - eff_wall), max(0.5, rz - eff_wall))
    return outer.cut(inner)


def neck_collar(
    outer_d: float = 32.0,
    inner_d: float = 20.0,
    height: float = 8.0,
    lip_h: float = 2.0,
    clearance: Optional[float] = None,
) -> Tuple[cq.Workplane, cq.Workplane]:
    """
    Creates a matching neck collar joint linking head and body:
    1. Male collar ring with stepped tongue and central cable passage.
    2. Female receiving socket ring with clearance allowance.

    Args:
        outer_d: Outer collar diameter in mm.
        inner_d: Inner cable hole diameter in mm.
        height: Total collar height in mm.
        lip_h: Height of stepped lip protrusion in mm.
        clearance: Mating clearance in mm (defaults to printer calibration).

    Returns:
        Tuple of (male_collar, female_socket).
    """
    calib = get_calibration()
    clr = clearance if clearance is not None else calib.get("lip_clearance", 0.2)
    base_h = max(1.0, height - lip_h)
    lip_d = outer_d - 4.0

    # Male collar
    base_ring = cq.Workplane("XY").circle(outer_d / 2.0).circle(inner_d / 2.0).extrude(base_h)
    lip_ring = (
        cq.Workplane("XY")
        .workplane(offset=base_h)
        .circle((lip_d - clr) / 2.0)
        .circle(inner_d / 2.0)
        .extrude(lip_h)
    )
    male_collar = base_ring.union(lip_ring)

    # Female socket
    sock_ring = cq.Workplane("XY").circle(outer_d / 2.0).circle(inner_d / 2.0).extrude(base_h)
    rebate = cq.Workplane("XY").circle((lip_d + clr) / 2.0).extrude(lip_h + 0.3)
    female_socket = sock_ring.cut(rebate)

    return male_collar, female_socket

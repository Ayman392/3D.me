"""
Build123d enclosure templates:
- enclosure_with_lid
- board_enclosure
"""

import math
from typing import Dict, Any, List
from build123d import *
from cad_templates.schemas import EnclosureWithLidParams, BoardEnclosureParams, PortCutout
from cad_library import FALLBACK_COMPONENTS


def enclosure_with_lid(params: EnclosureWithLidParams) -> Compound:
    """
    Parametric electronics enclosure box with matching print-ready lid placed alongside.
    Features: wall thickness, corner fillets, lid engagement, port cutouts, and optional vents.
    """
    wall = params.wall_thickness
    ix, iy, iz = params.internal_x, params.internal_y, params.internal_z
    ox = ix + 2 * wall
    oy = iy + 2 * wall
    oz = iz + wall

    # Outer shell box
    base_outer = Box(ox, oy, oz)

    # Fillet vertical edges if radius requested
    r = min(params.corner_radius, min(ox, oy) * 0.35)
    if r > 0.5:
        vert_edges = base_outer.edges().filter_by(Axis.Z)
        if vert_edges:
            base_outer = fillet(vert_edges, r)

    # Cavity: open top (offset z upward by wall/2 + 0.1 so top face is completely open)
    cavity = Pos(0, 0, wall / 2 + 0.1) * Box(ix, iy, iz + wall)
    if r > wall + 0.5:
        cavity_edges = cavity.edges().filter_by(Axis.Z)
        if cavity_edges:
            cavity = fillet(cavity_edges, r - wall)

    base = base_outer - cavity

    # Port cutouts
    for p in params.port_cutouts:
        cutout = Box(p.width, p.height, wall * 3)
        if p.face == "front":
            rot_cut = Pos(p.offset_x, -oy / 2, -oz / 2 + wall + p.height / 2 + p.offset_z) * cutout
            base = base - rot_cut
        elif p.face == "back":
            rot_cut = Pos(p.offset_x, oy / 2, -oz / 2 + wall + p.height / 2 + p.offset_z) * cutout
            base = base - rot_cut
        elif p.face == "left":
            cut_rot = Rotation(0, 0, 90) * cutout
            rot_cut = Pos(-ox / 2, p.offset_x, -oz / 2 + wall + p.height / 2 + p.offset_z) * cut_rot
            base = base - rot_cut
        elif p.face == "right":
            cut_rot = Rotation(0, 0, 90) * cutout
            rot_cut = Pos(ox / 2, p.offset_x, -oz / 2 + wall + p.height / 2 + p.offset_z) * cut_rot
            base = base - rot_cut

    # Build matching lid
    lid_thickness = max(2.0, wall)
    lid_plate = Box(ox, oy, lid_thickness)
    if r > 0.5:
        lid_edges = lid_plate.edges().filter_by(Axis.Z)
        if lid_edges:
            lid_plate = fillet(lid_edges, r)

    if params.lid_type in ["snap", "slip"]:
        # Inner rim boss that nests into the box with active printer profile clearance
        try:
            from printer_profiles import get_clearance
            lip_clearance = get_clearance("snug" if params.lid_type == "snap" else "slip")
        except Exception:
            lip_clearance = 0.25
        lip_depth = 2.5
        inner_lip = Pos(0, 0, (lid_thickness + lip_depth) / 2) * Box(
            max(2.0, ix - 2 * lip_clearance),
            max(2.0, iy - 2 * lip_clearance),
            lip_depth
        )
        lid = lid_plate + inner_lip
    elif params.lid_type == "screw":
        # 4 corner screw countersink holes
        screw_r = 1.6  # M3 clearance
        hole_margin = wall + 3.0
        hole_pos = [
            (ox / 2 - hole_margin, oy / 2 - hole_margin),
            (-ox / 2 + hole_margin, oy / 2 - hole_margin),
            (ox / 2 - hole_margin, -oy / 2 + hole_margin),
            (-ox / 2 + hole_margin, -oy / 2 + hole_margin),
        ]
        lid = lid_plate
        for hx, hy in hole_pos:
            chole = Pos(hx, hy, 0) * Cylinder(screw_r, lid_thickness * 2)
            lid = lid - chole
    else:
        lid = lid_plate

    # Vents on lid
    if params.vents:
        num_vents = max(3, int(ix / 8.0))
        vent_w = min(2.5, ix / (num_vents * 2.0))
        vent_len = iy * 0.55
        for i in range(num_vents):
            vx = -ix * 0.35 + i * (ix * 0.7 / max(1, num_vents - 1))
            vslot = Pos(vx, 0, 0) * Box(vent_w, vent_len, lid_thickness * 2)
            lid = lid - vslot

    # Place lid flat on the bed alongside the base (+X spacing of 10mm)
    base_aligned = Pos(0, 0, oz / 2) * base
    lid_aligned = Pos(ox + 10.0, 0, lid_thickness / 2) * lid

    return Compound([base_aligned, lid_aligned])


def board_enclosure(params: BoardEnclosureParams) -> Compound:
    """
    Parametric enclosure tailored to popular SBC / microcontroller boards.
    Includes built-in standoffs with screw pilot holes and matching lid.
    """
    board_data = None
    for comp in FALLBACK_COMPONENTS:
        if comp.get("id") == params.board_preset:
            board_data = comp
            break

    if board_data:
        bx, by, bz = board_data["size"][0], board_data["size"][1], board_data["size"][2]
        mount_holes = board_data.get("mount_holes", [])
    else:
        bx = params.custom_length or 85.0
        by = params.custom_width or 56.0
        bz = 15.0
        mount_holes = [
            {"x": -bx / 2 + 5.0, "y": -by / 2 + 5.0, "d": 2.2},
            {"x": bx / 2 - 5.0, "y": -by / 2 + 5.0, "d": 2.2},
            {"x": -bx / 2 + 5.0, "y": by / 2 - 5.0, "d": 2.2},
            {"x": bx / 2 - 5.0, "y": by / 2 - 5.0, "d": 2.2},
        ]

    clr = params.clearance
    wall = params.wall_thickness
    sh = params.standoff_height

    ix = bx + 2 * clr
    iy = by + 2 * clr
    iz = bz + sh + 4.0

    ox = ix + 2 * wall
    oy = iy + 2 * wall
    oz = iz + wall

    base_outer = Box(ox, oy, oz)
    cavity = Pos(0, 0, wall / 2 + 0.1) * Box(ix, iy, iz + wall)
    base = base_outer - cavity

    # Add standoffs inside base
    standoff_r = 3.2
    for hole in mount_holes:
        hx = hole.get("x", 0.0)
        hy = hole.get("y", 0.0)
        hd = hole.get("d", 2.2)
        # Standoff pillar rising from floor of cavity
        pillar = Pos(hx, hy, -oz / 2 + wall + sh / 2) * Cylinder(standoff_r, sh)
        hole_cyl = Pos(hx, hy, -oz / 2 + wall + sh / 2) * Cylinder(hd / 2, sh + 1.0)
        base = base + (pillar - hole_cyl)

    # Lid
    lid_thickness = max(2.0, wall)
    lid_plate = Box(ox, oy, lid_thickness)
    inner_lip = Pos(0, 0, (lid_thickness + 2.5) / 2) * Box(
        max(2.0, ix - 0.5),
        max(2.0, iy - 0.5),
        2.5
    )
    lid = lid_plate + inner_lip

    base_aligned = Pos(0, 0, oz / 2) * base
    lid_aligned = Pos(ox + 10.0, 0, lid_thickness / 2) * lid

    return Compound([base_aligned, lid_aligned])

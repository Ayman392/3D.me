"""
Build123d bracket templates:
- bracket_l
- bracket_flat_plate
"""

import math
from typing import List, Tuple
from build123d import *
from cad_templates.schemas import BracketLParams, BracketFlatPlateParams


def bracket_l(params: BracketLParams) -> Solid:
    """
    Parametric heavy-duty structural L-bracket with mounting holes and optional gusset web.
    """
    a1 = params.arm1_length
    a2 = params.arm2_length
    w = params.width
    t = params.thickness

    # Horizontal arm (Arm 1) along +X, bottom at Z=0
    arm1 = Pos(a1 / 2, 0, t / 2) * Box(a1, w, t)

    # Vertical arm (Arm 2) along +Z, left face at X=0
    arm2 = Pos(t / 2, 0, a2 / 2) * Box(t, w, a2)

    bracket = arm1 + arm2

    # Optional diagonal reinforcement gusset
    if params.gusset and a1 > 20 and a2 > 20:
        gusset_size = min(a1 - t - 5.0, a2 - t - 5.0, 30.0)
        if gusset_size > 8.0:
            gusset_thick = min(t, w * 0.3)
            # Extrude right triangle profile in XZ plane
            with BuildSketch(Plane.XZ) as s:
                with Locations((t, t)):
                    Polygon([
                        (0, 0),
                        (gusset_size, 0),
                        (0, gusset_size)
                    ])
            g_solid = extrude(s.sketch, amount=gusset_thick, both=True)
            bracket = bracket + g_solid

    # Holes in Arm 1 (vertical holes through Z)
    if params.hole_count_arm1 > 0 and params.hole_diameter_arm1 > 0:
        hr1 = params.hole_diameter_arm1 / 2
        start_x = t + 8.0
        end_x = a1 - 8.0
        n1 = params.hole_count_arm1
        for i in range(n1):
            hx = start_x if n1 == 1 else start_x + i * (end_x - start_x) / (n1 - 1)
            hole = Pos(hx, 0, t / 2) * Cylinder(hr1, t * 3)
            bracket = bracket - hole

    # Holes in Arm 2 (horizontal holes through X)
    if params.hole_count_arm2 > 0 and params.hole_diameter_arm2 > 0:
        hr2 = params.hole_diameter_arm2 / 2
        start_z = t + 8.0
        end_z = a2 - 8.0
        n2 = params.hole_count_arm2
        for i in range(n2):
            hz = start_z if n2 == 1 else start_z + i * (end_z - start_z) / (n2 - 1)
            hole = Pos(t / 2, 0, hz) * Rotation(0, 90, 0) * Cylinder(hr2, t * 3)
            bracket = bracket - hole

    return bracket


def bracket_flat_plate(params: BracketFlatPlateParams) -> Solid:
    """
    Parametric flat mounting plate or adapter with corner fillets, bolt hole patterns, or slots.
    """
    l = params.length
    w = params.width
    t = params.thickness

    plate = Pos(0, 0, t / 2) * Box(l, w, t)

    # Corner fillets
    r = min(params.corner_radius, min(l, w) * 0.35)
    if r > 0.5:
        vert_edges = plate.edges().filter_by(Axis.Z)
        if vert_edges:
            plate = fillet(vert_edges, r)

    hd = params.hole_diameter
    hr = hd / 2.0
    margin = max(r, 6.0)

    if hd > 0.5:
        if params.hole_pattern == "corners":
            positions = [
                (l / 2 - margin, w / 2 - margin),
                (-l / 2 + margin, w / 2 - margin),
                (l / 2 - margin, -w / 2 + margin),
                (-l / 2 + margin, -w / 2 + margin),
            ]
            for hx, hy in positions:
                hole = Pos(hx, hy, t / 2) * Cylinder(hr, t * 2)
                plate = plate - hole
        elif params.hole_pattern == "center":
            hole = Pos(0, 0, t / 2) * Cylinder(hr, t * 2)
            plate = plate - hole
        elif params.hole_pattern == "grid":
            for hx in [-l / 3, 0, l / 3]:
                for hy in [-w / 3, 0, w / 3]:
                    hole = Pos(hx, hy, t / 2) * Cylinder(hr, t * 2)
                    plate = plate - hole
        elif params.hole_pattern == "slots":
            slot_len = max(5.0, params.slot_length or 15.0)
            for hy in [-w / 4, w / 4]:
                # Build slot via two holes and bridging box
                c1 = Pos(-slot_len / 2, hy, t / 2) * Cylinder(hr, t * 2)
                c2 = Pos(slot_len / 2, hy, t / 2) * Cylinder(hr, t * 2)
                bridge = Pos(0, hy, t / 2) * Box(slot_len, hd, t * 2)
                slot_cutout = c1 + c2 + bridge
                plate = plate - slot_cutout

    return plate

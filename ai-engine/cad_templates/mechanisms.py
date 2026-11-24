"""
Build123d mechanism & hardware templates:
- knob
- battery_cover
- gasket_from_profile
- spacer_washer
- cable_clip
- wall_hook
"""

import math
from build123d import *
from cad_templates.schemas import (
    KnobParams,
    BatteryCoverParams,
    GasketFromProfileParams,
    SpacerWasherParams,
    CableClipParams,
    WallHookParams,
)


def knob(params: KnobParams) -> Solid:
    """
    Control knob for potentiometers and rotary encoders.
    Features: D-shaft or round shaft bore, knurled perimeter grip, indicator notch, and set screw hole.
    """
    od = params.outer_diameter
    r = od / 2.0
    h = params.height
    sd = params.shaft_diameter
    sr = sd / 2.0

    # Main knob cylindrical body
    body = Pos(0, 0, h / 2) * Cylinder(r, h)

    # Perimeter grip flutes / knurling ribs
    if params.knurl_ribs > 0:
        flute_r = max(0.8, r * 0.08)
        for i in range(params.knurl_ribs):
            angle = i * (360.0 / params.knurl_ribs)
            rad = math.radians(angle)
            fx = (r + flute_r * 0.2) * math.cos(rad)
            fy = (r + flute_r * 0.2) * math.sin(rad)
            flute = Pos(fx, fy, h / 2) * Cylinder(flute_r, h + 1.0)
            body = body - flute

    # Pointer notch on top
    if params.pointer_notch:
        notch = Pos(0, r - 2.0, h - 0.75) * Box(1.5, 4.0, 2.0)
        body = body - notch

    # Shaft bore hole in bottom
    bore_depth = h * 0.75
    shaft_cyl = Cylinder(sr, bore_depth)

    if params.shaft_type == "d_shaft":
        flat_d = params.d_shaft_flat_depth
        flat_box = Pos(0, sr - flat_d / 2, 0) * Box(sd * 1.5, flat_d, bore_depth + 1.0)
        shaft_bore = shaft_cyl - flat_box
    else:
        shaft_bore = shaft_cyl

    body = body - Pos(0, 0, bore_depth / 2) * shaft_bore

    # Set screw hole
    if params.set_screw_hole:
        set_r = params.set_screw_diameter / 2.0
        set_screw = Pos(0, r / 2, bore_depth / 2) * Rotation(90, 0, 0) * Cylinder(set_r, r * 1.5)
        body = body - set_screw

    return body


def battery_cover(params: BatteryCoverParams) -> Solid:
    """
    Replacement battery compartment door with retaining tab, snap latch, and grip ribs.
    """
    l = params.length
    w = params.width
    t = params.thickness
    lip_d = params.retaining_lip_depth
    latch_w = params.snap_latch_width

    # Main cover plate
    plate = Pos(0, 0, t / 2) * Box(l, w, t)

    # Rear retaining tab (locates under the housing wall)
    rear_tab = Pos(-l / 2 - lip_d / 2, 0, t * 0.3) * Box(lip_d, w * 0.7, t * 0.6)

    # Front snap latch cantilever with catch hook
    latch_len = 8.0
    latch_arm = Pos(l / 2 + latch_len / 2, 0, t * 0.4) * Box(latch_len, latch_w, t * 0.8)
    latch_hook = Pos(l / 2 + latch_len - 0.5, 0, t * 0.4 + 1.0) * Box(1.2, latch_w, 2.0)

    cover = plate + rear_tab + latch_arm + latch_hook

    # Thumb grip traction ribs on exterior top face
    if params.finger_grip_ribs > 0:
        for i in range(params.finger_grip_ribs):
            rx = -l * 0.2 + i * 3.5
            rib = Pos(rx, 0, t + 0.35) * Box(1.2, w * 0.6, 0.7)
            cover = cover + rib

    return cover


def gasket_from_profile(params: GasketFromProfileParams) -> Solid:
    """
    Parametric sealing gasket ring with bolt holes.
    """
    t = params.thickness
    cw = params.cross_section_width

    if params.shape == "circular":
        od = params.diameter
        id_dim = max(4.0, od - 2 * cw)
        outer = Pos(0, 0, t / 2) * Cylinder(od / 2, t)
        inner = Pos(0, 0, t / 2) * Cylinder(id_dim / 2, t + 1.0)
        gasket = outer - inner

        if params.bolt_hole_count > 0 and params.bolt_hole_diameter > 0:
            b_r = params.bolt_hole_diameter / 2.0
            pcd = (od + id_dim) / 2.0
            for i in range(params.bolt_hole_count):
                angle = i * (360.0 / params.bolt_hole_count)
                rad = math.radians(angle)
                hx = (pcd / 2.0) * math.cos(rad)
                hy = (pcd / 2.0) * math.sin(rad)
                hole = Pos(hx, hy, t / 2) * Cylinder(b_r, t * 2)
                gasket = gasket - hole
    else:
        l = params.length
        w = params.width
        il = max(4.0, l - 2 * cw)
        iw = max(4.0, w - 2 * cw)
        outer = Pos(0, 0, t / 2) * Box(l, w, t)
        inner = Pos(0, 0, t / 2) * Box(il, iw, t + 1.0)
        gasket = outer - inner

        if params.bolt_hole_count > 0 and params.bolt_hole_diameter > 0:
            b_r = params.bolt_hole_diameter / 2.0
            # Place holes at corners
            margin = cw / 2.0
            positions = [
                (l / 2 - margin, w / 2 - margin),
                (-l / 2 + margin, w / 2 - margin),
                (l / 2 - margin, -w / 2 + margin),
                (-l / 2 + margin, -w / 2 + margin),
            ]
            for hx, hy in positions[:params.bolt_hole_count]:
                hole = Pos(hx, hy, t / 2) * Cylinder(b_r, t * 2)
                gasket = gasket - hole

    return gasket


def spacer_washer(params: SpacerWasherParams) -> Solid:
    """
    Precision dimensional spacer, bushing, or washer.
    """
    od = params.outer_diameter
    id_dim = params.inner_diameter
    t = params.thickness

    outer = Pos(0, 0, t / 2) * Cylinder(od / 2, t)
    inner = Pos(0, 0, t / 2) * Cylinder(id_dim / 2, t + 1.0)
    washer = outer - inner
    return washer


def cable_clip(params: CableClipParams) -> Solid:
    """
    Parametric cable routing clip with retention arch and screw mounting tab.
    """
    cd = params.cable_diameter
    cr = cd / 2.0
    cw = params.clip_width
    wt = params.wall_thickness

    # Outer cylindrical arch
    arch_outer = Pos(0, 0, cr + wt) * Rotation(90, 0, 0) * Cylinder(cr + wt, cw)
    arch_inner = Pos(0, 0, cr + wt) * Rotation(90, 0, 0) * Cylinder(cr, cw + 1.0)
    arch = arch_outer - arch_inner

    # Cut opening slot on top for snapping cable in
    opening_w = cd * 0.75
    top_slot = Pos(0, 0, cr * 2 + wt) * Box(opening_w, cw + 2.0, wt * 3)
    clip_body = arch - top_slot

    # Mounting base tab
    tab_len = max(12.0, cd * 1.5)
    tab = Pos(cr + wt + tab_len / 2, 0, wt / 2) * Box(tab_len, cw, wt)

    clip = clip_body + tab

    # Screw hole in tab
    if params.mounting == "screw_hole" and params.screw_hole_diameter > 0:
        sh_r = params.screw_hole_diameter / 2.0
        sh_pos = cr + wt + tab_len / 2
        hole = Pos(sh_pos, 0, wt / 2) * Cylinder(sh_r, wt * 3)
        clip = clip - hole

    return clip


def wall_hook(params: WallHookParams) -> Solid:
    """
    Parametric wall utility hook with mounting backplate, forward arm, and retaining lip.
    """
    hd = params.hook_depth
    hw = params.hook_width
    bh = params.backplate_height
    bt = params.backplate_thickness
    lh = params.lip_height

    # Backplate against the wall
    backplate = Pos(0, 0, bh / 2) * Box(bt, hw, bh)

    # Forward horizontal hook arm
    arm = Pos(hd / 2, 0, bt / 2) * Box(hd, hw, bt)

    # Upward retaining lip at hook tip
    lip = Pos(hd - bt / 2, 0, lh / 2) * Box(bt, hw, lh)

    hook = backplate + arm + lip

    # Screw mounting holes in backplate
    if params.screw_hole_count > 0 and params.screw_hole_diameter > 0:
        shr = params.screw_hole_diameter / 2.0
        n = params.screw_hole_count
        start_z = bh * 0.35
        end_z = bh * 0.85
        for i in range(n):
            hz = start_z if n == 1 else start_z + i * (end_z - start_z) / (n - 1)
            hole = Pos(0, 0, hz) * Rotation(0, 90, 0) * Cylinder(shr, bt * 3)
            hook = hook - hole

    return hook

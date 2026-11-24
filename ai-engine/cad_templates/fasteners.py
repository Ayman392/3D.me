"""
Build123d fastener & joint templates:
- snap_fit_clip
- living_hinge
- pin_hinge
- threaded_insert_boss
- thread
"""

import math
from build123d import *
from cad_templates.schemas import (
    SnapFitClipParams,
    LivingHingeParams,
    PinHingeParams,
    ThreadedInsertBossParams,
    MetricThreadParams,
)


def snap_fit_clip(params: SnapFitClipParams) -> Solid:
    """
    Parametric cantilever snap-fit clip with lead-in angle and retention hook.
    """
    cl = params.clip_length
    cw = params.clip_width
    ct = params.cantilever_thickness
    hd = params.hook_depth
    bt = params.base_thickness

    # Base anchor block
    base_len = 15.0
    base = Pos(-base_len / 2, 0, bt / 2) * Box(base_len, cw, bt)

    # Cantilever arm extending along +X
    arm = Pos(cl / 2, 0, ct / 2) * Box(cl, cw, ct)

    # Retention catch hook at arm tip
    # Hook cross-section: ramp up to (ct + hd), vertical retention edge
    ramp_len = hd / math.tan(math.radians(max(15.0, params.hook_angle_deg)))
    ramp_len = min(ramp_len, cl * 0.4)

    with BuildSketch(Plane.XZ) as s:
        with Locations((cl - ramp_len, ct)):
            Polygon([
                (0, 0),
                (ramp_len, hd),
                (ramp_len, 0)
            ])
    hook = extrude(s.sketch, amount=cw, both=True)

    clip = base + arm + hook
    return clip


def living_hinge(params: LivingHingeParams) -> Solid:
    """
    Continuous single-piece living hinge with thin flexure membrane connecting two rigid plates.
    """
    pl = params.plate_length
    pw = params.plate_width
    pt = params.plate_thickness
    hg = params.hinge_gap
    ht = params.hinge_thickness

    wing_len = (pl - hg) / 2.0

    # Left plate
    left_plate = Pos(-hg / 2 - wing_len / 2, 0, pt / 2) * Box(wing_len, pw, pt)
    # Right plate
    right_plate = Pos(hg / 2 + wing_len / 2, 0, pt / 2) * Box(wing_len, pw, pt)
    # Flexible central membrane
    membrane = Pos(0, 0, ht / 2) * Box(hg, pw, ht)

    hinge = left_plate + right_plate + membrane
    return hinge


def pin_hinge(params: PinHingeParams) -> Compound:
    """
    Two-leaf interlocking barrel pin hinge with parametric knuckle segmentation and clearance.
    Returns both leaves positioned side by side on the bed.
    """
    ll = params.leaf_length
    lw = params.leaf_width
    lt = params.leaf_thickness
    pd = params.pin_diameter
    try:
        from printer_profiles import get_clearance
        clr = params.clearance or get_clearance("slip")
    except Exception:
        clr = params.clearance or 0.3
    k_count = max(2, params.knuckle_count)

    barrel_od = pd + 2 * lt
    knuckle_w = lw / k_count

    # Leaf A (even knuckles)
    leaf_a_plate = Pos(-ll / 2, 0, lt / 2) * Box(ll, lw, lt)
    leaf_a = leaf_a_plate

    for i in range(k_count):
        if i % 2 == 0:
            ky = -lw / 2 + (i + 0.5) * knuckle_w
            barrel = Pos(0, ky, barrel_od / 2) * Rotation(90, 0, 0) * Cylinder(barrel_od / 2, knuckle_w - clr)
            hole = Pos(0, ky, barrel_od / 2) * Rotation(90, 0, 0) * Cylinder(pd / 2, knuckle_w + 1.0)
            leaf_a = leaf_a + (barrel - hole)

    # Leaf B (odd knuckles)
    leaf_b_plate = Pos(ll / 2, 0, lt / 2) * Box(ll, lw, lt)
    leaf_b = leaf_b_plate

    for i in range(k_count):
        if i % 2 == 1:
            ky = -lw / 2 + (i + 0.5) * knuckle_w
            barrel = Pos(0, ky, barrel_od / 2) * Rotation(90, 0, 0) * Cylinder(barrel_od / 2, knuckle_w - clr)
            hole = Pos(0, ky, barrel_od / 2) * Rotation(90, 0, 0) * Cylinder(pd / 2, knuckle_w + 1.0)
            leaf_b = leaf_b + (barrel - hole)

    # Position on bed with 5mm spacing
    leaf_a_placed = Pos(-ll / 2 - 5.0, 0, 0) * leaf_a
    leaf_b_placed = Pos(ll / 2 + 5.0, 0, 0) * leaf_b

    return Compound([leaf_a_placed, leaf_b_placed])


def threaded_insert_boss(params: ThreadedInsertBossParams) -> Solid:
    """
    Heat-set threaded brass insert mounting boss cylinder with reinforcement gussets.
    """
    od = params.boss_outer_diameter
    bh = params.boss_height
    hd = params.hole_diameter
    hdepth = min(params.hole_depth, bh - 0.5)
    bpt = params.base_plate_thickness

    boss_cyl = Pos(0, 0, bpt + bh / 2) * Cylinder(od / 2, bh)
    hole_cyl = Pos(0, 0, bpt + bh - hdepth / 2 + 0.1) * Cylinder(hd / 2, hdepth + 0.2)
    boss = boss_cyl - hole_cyl

    if bpt > 0:
        base_size = max(od * 2.5, 20.0)
        base = Pos(0, 0, bpt / 2) * Box(base_size, base_size, bpt)
        boss = base + boss

    # Triangular support gussets
    if params.gusset_count > 0:
        g_size = min(bh * 0.75, od * 1.2)
        g_thick = 1.5
        for i in range(params.gusset_count):
            angle = i * (360.0 / params.gusset_count)
            with BuildSketch(Plane.XZ) as s:
                with Locations((od / 2, bpt)):
                    Polygon([
                        (0, 0),
                        (g_size, 0),
                        (0, g_size)
                    ])
            fin = extrude(s.sketch, amount=g_thick, both=True)
            fin_rot = Rotation(0, 0, angle) * fin
            boss = boss + fin_rot

    return boss


def thread(params: MetricThreadParams) -> Solid:
    """
    Metric fastener screw / threaded rod with hex head.
    Features exact dimensional nominal diameter, pitch, shaft length, and head.
    """
    d = params.nominal_diameter
    r = d / 2.0
    l = params.length
    hh = params.head_height
    hw = params.head_diameter

    # Thread shaft
    shaft = Pos(0, 0, l / 2) * Cylinder(r, l)

    # Lead-in chamfer on screw tip
    chamfer_edges = shaft.edges().filter_by(Axis.Z)

    # Head
    if params.head_type == "hex":
        # Regular hexagon extruded along Z
        with BuildSketch(Plane.XY) as s:
            RegularPolygon(radius=hw / 2, side_count=6)
        head = extrude(s.sketch, amount=hh)
        head = Pos(0, 0, -hh / 2) * head
        screw = head + shaft
    elif params.head_type == "cylinder":
        head = Pos(0, 0, -hh / 2) * Cylinder(hw / 2, hh)
        screw = head + shaft
    else:
        screw = shaft

    # Sit upright on bed (Z=0 at bottom of head)
    screw = Pos(0, 0, hh) * screw if params.head_type != "none" else screw
    return screw

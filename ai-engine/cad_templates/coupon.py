"""
3d.me Stepped Calibration Coupon & Fit-Test Slicer (Phase 4)
Generates high-precision stepped test coupon with 0.1 mm increments
and extracts 5 mm fit-test joint slices for 5-minute pre-print tolerance verification.
"""

import math
from build123d import *


def build_stepped_calibration_coupon() -> Solid:
    """
    Builds stepped calibration coupon:
    - Base plate: 80.0 x 45.0 x 3.0 mm
    - Stepped holes: 3.0, 3.1, 3.2, 3.3, 3.4 mm (0.1 mm steps)
    - Stepped pegs: 2.8, 2.9, 3.0, 3.1, 3.2 mm (0.1 mm steps, 6 mm height)
    - Stepped clearance gap slots: 0.15, 0.20, 0.25, 0.30, 0.35 mm
    """
    base_l = 80.0
    base_w = 45.0
    base_t = 3.0

    coupon = Pos(0, 0, base_t / 2) * Box(base_l, base_w, base_t)

    # 1. Stepped Holes (Row at Y = -12 mm)
    hole_sizes = [3.0, 3.1, 3.2, 3.3, 3.4]
    start_x = -28.0
    step_x = 14.0
    for i, d in enumerate(hole_sizes):
        hx = start_x + i * step_x
        hole = Pos(hx, -12.0, base_t / 2) * Cylinder(d / 2.0, base_t * 2)
        coupon = coupon - hole

    # 2. Stepped Pegs (Row at Y = 3 mm)
    peg_sizes = [2.8, 2.9, 3.0, 3.1, 3.2]
    peg_h = 6.0
    for i, d in enumerate(peg_sizes):
        px = start_x + i * step_x
        peg = Pos(px, 3.0, base_t + peg_h / 2) * Cylinder(d / 2.0, peg_h)
        coupon = coupon + peg

    # 3. Stepped Clearance Gap Slots (Row at Y = 16 mm)
    slot_gaps = [0.15, 0.20, 0.25, 0.30, 0.35]
    for i, gap in enumerate(slot_gaps):
        sx = start_x + i * step_x
        slot = Pos(sx, 16.0, base_t / 2) * Box(gap, 8.0, base_t * 2)
        coupon = coupon - slot

    return coupon


def generate_fit_test_slice(
    solid: Solid,
    center_z: float = 0.0,
    slice_thickness_mm: float = 5.0
) -> Solid:
    """
    Extracts a thin horizontal cross-section slice (5.0 mm thick) around critical joint features.
    Enables rapid 5-minute print verification before running full multi-hour prints.
    """
    bbox = solid.bounding_box()
    # Cutting bounding box extending across X and Y, with slice_thickness_mm height around center_z
    cutter_w = bbox.size.X * 1.5
    cutter_d = bbox.size.Y * 1.5
    cutter = Pos(0, 0, center_z) * Box(cutter_w, cutter_d, slice_thickness_mm)

    slice_solid = solid & cutter
    # Re-ground slice to sit on Z=0
    slice_bbox = slice_solid.bounding_box()
    grounded = Pos(0, 0, -slice_bbox.min.Z) * slice_solid
    return grounded

"""
Unit tests for Trace-a-Flat-Part mode (Phase 3)
Verifies synthetic 50x30 mm part with 5.0 mm hole on A4 background achieves < 0.3 mm accuracy.
"""

import cv2
import numpy as np
import pytest
from cad_trace import trace_flat_part, generate_1to1_svg, generate_dxf


def create_synthetic_a4_part_image(
    part_w_mm: float = 50.0,
    part_h_mm: float = 30.0,
    hole_dia_mm: float = 5.0,
    dpi: int = 150
) -> bytes:
    """Creates a synthetic white A4 sheet with a centered black test part and hole."""
    px_per_mm = dpi / 25.4
    a4_w = int(210.0 * px_per_mm)
    a4_h = int(297.0 * px_per_mm)

    img = np.ones((a4_h, a4_w, 3), dtype=np.uint8) * 255

    pw = int(part_w_mm * px_per_mm)
    ph = int(part_h_mm * px_per_mm)
    cx, cy = a4_w // 2, a4_h // 2

    # Black rectangle part
    x1, y1 = cx - pw // 2, cy - ph // 2
    x2, y2 = cx + pw // 2, cy + ph // 2
    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 0), -1)

    # White hole
    hr = int((hole_dia_mm / 2.0) * px_per_mm)
    cv2.circle(img, (cx, cy), hr, (255, 255, 255), -1)

    _, encoded = cv2.imencode(".png", img)
    return encoded.tobytes()


def test_trace_accuracy_under_point_three_mm():
    """Validates that dimensional errors on rectangle and hole diameter are strictly < 0.3 mm."""
    target_w = 50.0
    target_h = 30.0
    target_hole = 5.0

    img_bytes = create_synthetic_a4_part_image(target_w, target_h, target_hole, dpi=150)
    result = trace_flat_part(img_bytes, thickness_mm=3.0, simplify_tolerance_mm=0.20)

    assert result["status"] == "completed"
    bbox = result["bbox_mm"]

    # Accuracy checks (< 0.3 mm)
    error_x = abs(bbox["x"] - target_w)
    error_y = abs(bbox["y"] - target_h)
    error_z = abs(bbox["z"] - 3.0)

    assert error_x < 0.3, f"X error {error_x:.3f} mm exceeds 0.3 mm tolerance (got {bbox['x']})"
    assert error_y < 0.3, f"Y error {error_y:.3f} mm exceeds 0.3 mm tolerance (got {bbox['y']})"
    assert error_z < 0.01, f"Z thickness error {error_z:.3f} mm"

    # Hole detection and diameter check
    assert len(result["holes"]) == 1, f"Expected 1 hole, got {len(result['holes'])}"
    hole = result["holes"][0]
    assert hole["type"] == "circle"
    hole_error = abs(hole["diameter"] - target_hole)
    assert hole_error < 0.3, f"Hole diameter error {hole_error:.3f} mm exceeds 0.3 mm (got {hole['diameter']})"


def test_1to1_svg_and_dxf_generation():
    outer_pts = [(-25.0, -15.0), (25.0, -15.0), (25.0, 15.0), (-25.0, 15.0)]
    holes = [{"type": "circle", "center": [0.0, 0.0], "radius": 2.5, "diameter": 5.0}]

    svg = generate_1to1_svg(outer_pts, holes, 50.0, 30.0)
    assert "<svg" in svg
    assert "calibration bar" in svg
    assert "Ø5.0mm" in svg

    dxf = generate_dxf(outer_pts, holes)
    assert "SECTION" in dxf
    assert "POLYLINE" in dxf
    assert "CIRCLE" in dxf

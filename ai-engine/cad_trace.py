"""
3d.me Trace-a-Flat-Part Engine (Phase 3)
Converts a photo of a physical flat part on A4 paper or reference background into
an accurate 2D profile, extruded 3D solid (STEP/STL/GLB), and 1:1 printable 2D outline (SVG/DXF).
"""

import io
import math
import os
import time
import uuid
import logging
from typing import Dict, Any, List, Tuple, Optional

import cv2
import numpy as np
import trimesh
from build123d import (
    BuildSketch,
    Plane,
    Polygon,
    Locations,
    Circle,
    Mode,
    extrude,
    export_stl,
    export_step,
    Solid
)

logger = logging.getLogger("3dme.cad.trace")

OUTPUTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

A4_WIDTH_MM = 210.0
A4_HEIGHT_MM = 297.0


def correct_perspective_a4(
    img: np.ndarray,
    target_dpi: int = 150
) -> Tuple[np.ndarray, float]:
    """
    Detects the 4 corners of an A4 sheet in the photo and warps to canonical top-down view.
    Returns (warped_image, px_per_mm).
    """
    px_per_mm = target_dpi / 25.4  # ~5.9 px/mm at 150 DPI
    target_w = int(A4_WIDTH_MM * px_per_mm)
    target_h = int(A4_HEIGHT_MM * px_per_mm)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    edged = cv2.Canny(blurred, 30, 120)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    paper_contour = None
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(cnt) > (img.shape[0] * img.shape[1] * 0.15):
            paper_contour = approx
            break

    if paper_contour is not None:
        pts = paper_contour.reshape(4, 2).astype(np.float32)
        # Order points: top-left, top-right, bottom-right, bottom-left
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1)

        rect = np.zeros((4, 2), dtype=np.float32)
        rect[0] = pts[np.argmin(s)]        # Top-left
        rect[2] = pts[np.argmax(s)]        # Bottom-right
        rect[1] = pts[np.argmin(diff)]     # Top-right
        rect[3] = pts[np.argmax(diff)]     # Bottom-left

        # Check orientation (portrait vs landscape)
        width_a = np.linalg.norm(rect[1] - rect[0])
        height_a = np.linalg.norm(rect[3] - rect[0])
        if width_a > height_a:
            target_w, target_h = target_h, target_w
            px_per_mm = target_w / A4_HEIGHT_MM

        dst = np.array([
            [0, 0],
            [target_w - 1, 0],
            [target_w - 1, target_h - 1],
            [0, target_h - 1]
        ], dtype=np.float32)

        M = cv2.getPerspectiveTransform(rect, dst)
        warped = cv2.warpPerspective(img, M, (target_w, target_h))
        return warped, px_per_mm

    # If paper edge not found, assume image is already cropped top-down to A4
    h, w = img.shape[:2]
    aspect = max(h, w) / min(h, w)
    if 1.35 <= aspect <= 1.50:
        px_per_mm = max(h, w) / A4_HEIGHT_MM
    else:
        px_per_mm = min(h, w) / A4_WIDTH_MM
    return img, px_per_mm


def extract_contours_and_holes(
    warped_img: np.ndarray,
    px_per_mm: float,
    simplify_tolerance_mm: float = 0.25
) -> Tuple[List[Tuple[float, float]], List[Dict[str, Any]]]:
    """
    Segments the part from the white A4 background.
    Extracts outer perimeter polygon and detects inner circular or polygonal holes.
    """
    gray = cv2.cvtColor(warped_img, cv2.COLOR_BGR2GRAY) if len(warped_img.shape) == 3 else warped_img

    # Adaptive or Otsu threshold: part is darker than white paper
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Clean small pepper noise
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

    # Use RETR_CCOMP to get two-level hierarchy (outer contours + their inner holes)
    contours, hierarchy = cv2.findContours(thresh, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not contours or hierarchy is None:
        raise ValueError("No part contour detected on background.")

    # Find the largest outer contour (hierarchy[0][i][3] == -1 indicates root/outer contour)
    outer_idx = -1
    max_area = 0
    img_area = warped_img.shape[0] * warped_img.shape[1]

    for i, cnt in enumerate(contours):
        if hierarchy[0][i][3] == -1:
            area = cv2.contourArea(cnt)
            # Must not be the entire canvas
            if area > max_area and area < (img_area * 0.95):
                max_area = area
                outer_idx = i

    if outer_idx == -1:
        outer_idx = int(np.argmax([cv2.contourArea(c) for c in contours]))

    outer_cnt = contours[outer_idx]

    # Simplify outer contour
    epsilon = simplify_tolerance_mm * px_per_mm
    approx_outer = cv2.approxPolyDP(outer_cnt, epsilon, True)

    # Compute centroid of outer contour to center coordinates
    M = cv2.moments(outer_cnt)
    cx = M["m10"] / max(1.0, M["m00"])
    cy = M["m01"] / max(1.0, M["m00"])

    # Convert outer contour to centered millimeter points
    outer_pts_mm: List[Tuple[float, float]] = []
    for pt in approx_outer.reshape(-1, 2):
        x_mm = (pt[0] - cx) / px_per_mm
        # Invert Y so standard Cartesian coordinates (+Y up)
        y_mm = -(pt[1] - cy) / px_per_mm
        outer_pts_mm.append((round(float(x_mm), 3), round(float(y_mm), 3)))

    # Find child contours (holes inside this outer contour)
    holes: List[Dict[str, Any]] = []
    child_idx = hierarchy[0][outer_idx][2]
    while child_idx != -1:
        hole_cnt = contours[child_idx]
        hole_area = cv2.contourArea(hole_cnt)
        if hole_area > (3.0 * px_per_mm):  # Filter dust specs < ~0.5mm²
            peri = cv2.arcLength(hole_cnt, True)
            circularity = (4 * math.pi * hole_area) / max(1.0, (peri * peri))

            (hx_px, hy_px), radius_px = cv2.minEnclosingCircle(hole_cnt)
            hx_mm = round(float((hx_px - cx) / px_per_mm), 3)
            hy_mm = round(float(-(hy_px - cy) / px_per_mm), 3)
            dia_mm = round(float((radius_px * 2.0) / px_per_mm), 3)

            if circularity >= 0.75:
                holes.append({
                    "type": "circle",
                    "center": [hx_mm, hy_mm],
                    "diameter": dia_mm,
                    "radius": round(dia_mm / 2.0, 3)
                })
            else:
                # Polygonal hole
                approx_hole = cv2.approxPolyDP(hole_cnt, epsilon, True)
                hole_pts: List[Tuple[float, float]] = []
                for pt in approx_hole.reshape(-1, 2):
                    px_m = (pt[0] - cx) / px_per_mm
                    py_m = -(pt[1] - cy) / px_per_mm
                    hole_pts.append((round(float(px_m), 3), round(float(py_m), 3)))
                holes.append({
                    "type": "polygon",
                    "center": [hx_mm, hy_mm],
                    "points": hole_pts
                })

        child_idx = hierarchy[0][child_idx][0]  # Next sibling hole

    return outer_pts_mm, holes


def build_solid_from_trace(
    outer_pts: List[Tuple[float, float]],
    holes: List[Dict[str, Any]],
    thickness_mm: float = 3.0
) -> Solid:
    """
    Extrudes the traced 2D profile with inner holes into a watertight 3D solid using Build123d.
    """
    if len(outer_pts) < 3:
        raise ValueError("Outer contour has fewer than 3 vertices.")

    with BuildSketch(Plane.XY) as s:
        Polygon(outer_pts)
        for h in holes:
            if h["type"] == "circle":
                with Locations((h["center"][0], h["center"][1])):
                    Circle(radius=h["radius"], mode=Mode.SUBTRACT)
            elif h["type"] == "polygon" and len(h.get("points", [])) >= 3:
                with Locations((0, 0)):
                    Polygon(h["points"], mode=Mode.SUBTRACT)

    solid = extrude(s.sketch, amount=thickness_mm)
    return solid


def generate_1to1_svg(
    outer_pts: List[Tuple[float, float]],
    holes: List[Dict[str, Any]],
    width_mm: float,
    height_mm: float
) -> str:
    """
    Generates a 1:1 scale printable SVG file with exact millimeter dimensions,
    center crosshairs, and a 50mm reference calibration bar.
    """
    margin = 15.0
    view_w = width_mm + 2 * margin
    view_h = height_mm + 2 * margin
    min_x = -width_mm / 2 - margin
    min_y = -height_mm / 2 - margin

    pts_str = " ".join(f"{x},{-y}" for x, y in outer_pts)

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{view_w}mm" height="{view_h}mm" viewBox="{min_x} {min_y} {view_w} {view_h}">',
        '  <style>',
        '    .part { fill: #f3f4f6; stroke: #111827; stroke-width: 0.35; }',
        '    .hole { fill: #ffffff; stroke: #dc2626; stroke-width: 0.3; }',
        '    .calib { stroke: #2563eb; stroke-width: 0.5; }',
        '    .label { font-family: monospace; font-size: 2.8px; fill: #374151; }',
        '  </style>',
        '  <!-- 1:1 Scale Print Verification Template -->',
        f'  <polygon points="{pts_str}" class="part" />'
    ]

    for h in holes:
        if h["type"] == "circle":
            cx, cy = h["center"]
            r = h["radius"]
            svg_lines.append(f'  <circle cx="{cx}" cy="{-cy}" r="{r}" class="hole" />')
            svg_lines.append(f'  <text x="{cx}" y="{-cy + 1.0}" text-anchor="middle" class="label">Ø{h["diameter"]}mm</text>')
        elif h["type"] == "polygon":
            h_pts_str = " ".join(f"{x},{-y}" for x, y in h["points"])
            svg_lines.append(f'  <polygon points="{h_pts_str}" class="hole" />')

    # Calibration scale bar (50.0 mm)
    bar_x = min_x + 5.0
    bar_y = min_y + 8.0
    svg_lines.append(f'  <line x1="{bar_x}" y1="{bar_y}" x2="{bar_x + 50.0}" y2="{bar_y}" class="calib" />')
    svg_lines.append(f'  <line x1="{bar_x}" y1="{bar_y - 2}" x2="{bar_x}" y2="{bar_y + 2}" class="calib" />')
    svg_lines.append(f'  <line x1="{bar_x + 50.0}" y1="{bar_y - 2}" x2="{bar_x + 50.0}" y2="{bar_y + 2}" class="calib" />')
    svg_lines.append(f'  <text x="{bar_x + 25.0}" y="{bar_y - 2.5}" text-anchor="middle" class="label">50.0 mm calibration bar</text>')

    svg_lines.append('</svg>')
    return "\n".join(svg_lines)


def generate_dxf(
    outer_pts: List[Tuple[float, float]],
    holes: List[Dict[str, Any]]
) -> str:
    """Generates standard DXF ASCII format containing 2D POLYLINE and CIRCLE entities."""
    lines = [
        "0\nSECTION\n2\nENTITIES"
    ]

    # Outer polyline
    lines.append("0\nPOLYLINE\n8\n0\n66\n1\n70\n1")
    for x, y in outer_pts:
        lines.append(f"0\nVERTEX\n8\n0\n10\n{x}\n20\n{y}\n30\n0.0")
    lines.append("0\nSEQEND")

    # Hole entities
    for h in holes:
        if h["type"] == "circle":
            cx, cy = h["center"]
            r = h["radius"]
            lines.append(f"0\nCIRCLE\n8\n0\n10\n{cx}\n20\n{cy}\n30\n0.0\n40\n{r}")

    lines.append("0\nENDSEC\n0\nEOF")
    return "\n".join(lines)


def trace_flat_part(
    image_bytes: bytes,
    thickness_mm: float = 3.0,
    simplify_tolerance_mm: float = 0.25
) -> Dict[str, Any]:
    """
    Main trace pipeline:
    1. Corrects perspective with A4 homography
    2. Extracts outer boundary contour and inner holes
    3. Extrudes 3D solid with Build123d
    4. Exports STEP, STL, GLB, 1:1 printable SVG, and DXF
    """
    start_time = time.time()
    job_id = f"trace_{uuid.uuid4().hex[:10]}"

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes.")

    warped, px_per_mm = correct_perspective_a4(img)
    outer_pts, holes = extract_contours_and_holes(
        warped, px_per_mm, simplify_tolerance_mm=simplify_tolerance_mm
    )

    solid = build_solid_from_trace(outer_pts, holes, thickness_mm=thickness_mm)
    bbox = solid.bounding_box()

    # Export filenames
    stl_filename = f"{job_id}.stl"
    step_filename = f"{job_id}.step"
    glb_filename = f"{job_id}.glb"
    svg_filename = f"{job_id}_1to1.svg"
    dxf_filename = f"{job_id}.dxf"

    stl_path = os.path.join(OUTPUTS_DIR, stl_filename)
    step_path = os.path.join(OUTPUTS_DIR, step_filename)
    glb_path = os.path.join(OUTPUTS_DIR, glb_filename)
    svg_path = os.path.join(OUTPUTS_DIR, svg_filename)
    dxf_path = os.path.join(OUTPUTS_DIR, dxf_filename)

    export_stl(solid, stl_path)
    export_step(solid, step_path)

    mesh = trimesh.load(stl_path)
    mesh.export(glb_path)

    svg_content = generate_1to1_svg(outer_pts, holes, bbox.size.X, bbox.size.Y)
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

    dxf_content = generate_dxf(outer_pts, holes)
    with open(dxf_path, "w", encoding="utf-8") as f:
        f.write(dxf_content)

    return {
        "job_id": job_id,
        "status": "completed",
        "thickness_mm": thickness_mm,
        "px_per_mm": round(px_per_mm, 2),
        "volume_mm3": round(solid.volume, 2),
        "bbox_mm": {
            "x": round(bbox.size.X, 2),
            "y": round(bbox.size.Y, 2),
            "z": round(bbox.size.Z, 2)
        },
        "outer_points_count": len(outer_pts),
        "holes": holes,
        "glb_url": f"/outputs/{glb_filename}",
        "stl_url": f"/outputs/{stl_filename}",
        "step_url": f"/outputs/{step_filename}",
        "svg_url": f"/outputs/{svg_filename}",
        "dxf_url": f"/outputs/{dxf_filename}",
        "download_url": f"/download/{job_id}",
        "generation_time": round(time.time() - start_time, 2)
    }

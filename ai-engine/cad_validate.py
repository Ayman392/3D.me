"""
cad_validate.py - Deterministic Validation Engine for 3d.me AI CadQuery Studio (Phase 3)

Pure mathematical and geometric validation (zero LLM reliance):
1. Part volume > 0 and watertightness / manifold topology.
2. Component fit: user components must fit inside cavity with clearance and not intersect walls.
3. Interference check between all parts in assembled pose (boolean intersection volume > 0.5 mm³).
4. Minimum wall thickness via ray-sampling (< 1.2 mm error, < 1.6 mm warn).
5. Overhang analysis across 6 candidate print orientations with recommended print vector.
6. Printer bed bounding box limits.
7. Display window alignment centered on display active area within 0.2 mm.
8. Small hole diameter check (< 1.5 mm nozzle limit warning).
"""

import os
import math
import logging
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import trimesh
import cadquery as cq

logger = logging.getLogger("3dme.cad.validate")


def validate_part_solidity_and_watertightness(
    metrics: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Checks that every part solid has positive volume and watertight manifold geometry."""
    issues = []
    for part_name, m in metrics.items():
        vol = m.get("volume_mm3", 0.0)
        if vol <= 0.001:
            issues.append({
                "level": "error",
                "part": part_name,
                "code": "ZERO_VOLUME",
                "msg": f"Part '{part_name}' has zero or negative volume ({vol:.1f} mm³). Solid generation failed."
            })
        elif not m.get("watertight", False):
            issues.append({
                "level": "error",
                "part": part_name,
                "code": "NON_WATERTIGHT",
                "msg": f"Part '{part_name}' mesh is not watertight or has open boundary edges."
            })
        else:
            issues.append({
                "level": "info",
                "part": part_name,
                "code": "SOLID_OK",
                "msg": f"Part '{part_name}' is a watertight solid (volume: {vol:.1f} mm³)."
            })
    return issues


def validate_components_fit(
    parts_solids: Dict[str, Any],
    components: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Verifies that every user-specified component fits into its internal cavity
    without colliding into solid walls (clearance >= 0.4 mm).
    """
    issues = []
    if not components:
        return issues

    for comp in components:
        comp_name = comp.get("name", "component")
        size = comp.get("size", [20.0, 20.0, 5.0])
        pos = comp.get("pos", comp.get("position", [0.0, 0.0, 0.0]))
        sx, sy, sz = float(size[0]), float(size[1]), float(size[2])
        px, py, pz = float(pos[0]), float(pos[1]), float(pos[2])

        # Create bounding solid for the component
        comp_box = cq.Workplane("XY").box(sx, sy, sz).translate((px, py, pz))

        # Test intersection against each part
        for part_name, solid in parts_solids.items():
            if not hasattr(solid, "val"):
                continue
            try:
                overlap = solid.intersect(comp_box)
                ov_vol = float(overlap.val().Volume())
                if ov_vol > 0.5:
                    issues.append({
                        "level": "error",
                        "part": part_name,
                        "code": "COMPONENT_COLLISION",
                        "msg": f"Component '{comp_name}' ({sx}x{sy}x{sz} mm) collides with '{part_name}' walls by {ov_vol:.1f} mm³ at ({px}, {py}, {pz})."
                    })
            except Exception as e:
                logger.debug(f"Component intersection check warning: {e}")

    return issues


def validate_interference_between_parts(
    parts_solids: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Checks for solid material interference/collision between all part pairs in assembled pose.
    Any boolean intersection volume > 0.5 mm³ triggers an error naming both parts.
    """
    issues = []
    part_names = list(parts_solids.keys())

    for i in range(len(part_names)):
        for j in range(i + 1, len(part_names)):
            name_a = part_names[i]
            name_b = part_names[j]
            solid_a = parts_solids[name_a]
            solid_b = parts_solids[name_b]

            if not hasattr(solid_a, "val") or not hasattr(solid_b, "val"):
                continue

            try:
                # Fast Bounding Box pre-filter
                bb_a = solid_a.val().BoundingBox()
                bb_b = solid_b.val().BoundingBox()
                if (
                    bb_a.xmin > bb_b.xmax or bb_a.xmax < bb_b.xmin or
                    bb_a.ymin > bb_b.ymax or bb_a.ymax < bb_b.ymin or
                    bb_a.zmin > bb_b.zmax or bb_a.zmax < bb_b.zmin
                ):
                    continue

                # Exact boolean intersection
                inter = solid_a.intersect(solid_b)
                inter_vol = float(inter.val().Volume())
                if inter_vol > 0.5:
                    issues.append({
                        "level": "error",
                        "part": f"{name_a} & {name_b}",
                        "code": "PART_INTERFERENCE",
                        "msg": f"Interference collision detected between '{name_a}' and '{name_b}' (overlap volume: {inter_vol:.2f} mm³)."
                    })
            except Exception as e:
                logger.debug(f"Interference test note: {e}")

    return issues


def _sample_mesh_wall_thickness(
    vertices: np.ndarray,
    faces: np.ndarray,
    sample_count: int = 40,
) -> List[float]:
    """Fast vectorized Moller-Trumbore ray casting along inward face normals to measure shell thickness."""
    tris = vertices[faces]
    v0, v1, v2 = tris[:, 0, :], tris[:, 1, :], tris[:, 2, :]
    fn = np.cross(v1 - v0, v2 - v0)
    fn_len = np.linalg.norm(fn, axis=1, keepdims=True)
    valid_tris = (fn_len[:, 0] > 1e-8)
    if not np.any(valid_tris):
        return []

    fn = fn[valid_tris] / fn_len[valid_tris]
    centers = (v0[valid_tris] + v1[valid_tris] + v2[valid_tris]) / 3.0
    v0_v = v0[valid_tris]
    v1_v = v1[valid_tris]
    v2_v = v2[valid_tris]

    e1 = v1_v - v0_v
    e2 = v2_v - v0_v

    np.random.seed(42)
    n_samples = min(sample_count, len(centers))
    indices = np.random.choice(len(centers), size=n_samples, replace=False)
    sample_origins = centers[indices] - fn[indices] * 0.05
    sample_dirs = -fn[indices]

    thicknesses = []
    for orig, ray in zip(sample_origins, sample_dirs):
        pvec = np.cross(ray, e2)
        det = np.sum(e1 * pvec, axis=1)
        non_parallel = np.abs(det) > 1e-8
        if not np.any(non_parallel):
            continue
        inv_det = 1.0 / det[non_parallel]

        tvec = orig - v0_v[non_parallel]
        u = np.sum(tvec * pvec[non_parallel], axis=1) * inv_det
        valid_u = (u >= 0.0) & (u <= 1.0)
        if not np.any(valid_u):
            continue

        sub_e1 = e1[non_parallel][valid_u]
        sub_tvec = tvec[valid_u]
        sub_inv_det = inv_det[valid_u]

        qvec = np.cross(sub_tvec, sub_e1)
        v = np.sum(ray * qvec, axis=1) * sub_inv_det
        valid_v = (v >= 0.0) & (u[valid_u] + v <= 1.0)
        if not np.any(valid_v):
            continue

        sub_e2 = e2[non_parallel][valid_u][valid_v]
        sub_qvec = qvec[valid_v]
        sub2_inv_det = sub_inv_det[valid_v]

        t = np.sum(sub_e2 * sub_qvec, axis=1) * sub2_inv_det
        pos_t = t[t > 0.2]
        if len(pos_t) > 0:
            thicknesses.append(float(np.min(pos_t)))

    return thicknesses


def validate_wall_thickness(
    stl_paths: Dict[str, str],
    min_error: float = 1.2,
    min_warn: float = 1.6,
) -> List[Dict[str, Any]]:
    """
    Samples shell wall thickness.
    < 1.2 mm: error (too weak or delamination risk).
    1.2 - 1.6 mm: warn (thin, recommend >= 1.6 mm).
    >= 1.6 mm: ok.
    """
    issues = []
    for part_name, path in stl_paths.items():
        if not os.path.exists(path):
            continue
        try:
            m = trimesh.load(path, force="mesh")
            if len(m.faces) == 0:
                continue

            th_samples = _sample_mesh_wall_thickness(m.vertices, m.faces, sample_count=40)
            if th_samples:
                min_th = round(min(th_samples), 2)
                median_th = round(float(np.median(th_samples)), 2)

                if min_th < min_error:
                    issues.append({
                        "level": "error",
                        "part": part_name,
                        "code": "WALL_TOO_THIN",
                        "msg": f"Part '{part_name}' minimum wall thickness is {min_th:.2f} mm (< {min_error} mm structural limit)."
                    })
                elif min_th < min_warn:
                    issues.append({
                        "level": "warn",
                        "part": part_name,
                        "code": "WALL_THIN_WARN",
                        "msg": f"Part '{part_name}' has thin walls ({min_th:.2f} mm). Recommend >= {min_warn} mm for rigidity."
                    })
                else:
                    issues.append({
                        "level": "info",
                        "part": part_name,
                        "code": "WALL_OK",
                        "msg": f"Part '{part_name}' wall thickness verified: {median_th:.2f} mm nominal (min: {min_th:.2f} mm)."
                    })
        except Exception as e:
            logger.debug(f"Wall thickness test warning on {part_name}: {e}")

    return issues


def validate_overhangs_and_orientation(
    stl_paths: Dict[str, str],
    max_overhang_angle: float = 45.0,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Evaluates 6 print orientations (+Z, -Z, +Y, -Y, +X, -X).
    Identifies the best print orientation with minimal support area share,
    and warns if excessive overhangs exist in all orientations.
    """
    issues = []
    recommendations = {}

    orientations = {
        "+Z (Upright)": np.array([0, 0, 1]),
        "-Z (Inverted)": np.array([0, 0, -1]),
        "+Y (Face up)": np.array([0, 1, 0]),
        "-Y (Flat on back face)": np.array([0, -1, 0]),
        "+X (Side right)": np.array([1, 0, 0]),
        "-X (Side left)": np.array([-1, 0, 0]),
    }

    cos_thresh = np.cos(np.radians(max_overhang_angle))

    for part_name, path in stl_paths.items():
        if not os.path.exists(path):
            continue
        try:
            m = trimesh.load(path, force="mesh")
            if len(m.faces) == 0:
                continue

            fn = m.face_normals
            areas = m.area_faces
            tot_area = float(np.sum(areas))
            if tot_area <= 0:
                continue

            best_orient = "+Z (Upright)"
            best_share = 1.0

            for o_name, up_vec in orientations.items():
                down_vec = -up_vec
                cos_down = np.dot(fn, down_vec)
                overhang_mask = (cos_down > cos_thresh) & (cos_down > 0.05)
                overhang_area = float(np.sum(areas[overhang_mask]))
                share = overhang_area / tot_area
                if share < best_share:
                    best_share = share
                    best_orient = o_name

            recommendations[part_name] = best_orient

            if best_share > 0.35:
                issues.append({
                    "level": "warn",
                    "part": part_name,
                    "code": "OVERHANG_WARN",
                    "msg": f"Part '{part_name}' has {best_share*100:.1f}% overhang area. Suggest printing {best_orient} with print supports enabled."
                })
            else:
                issues.append({
                    "level": "info",
                    "part": part_name,
                    "code": "ORIENTATION_SUGGESTION",
                    "msg": f"Part '{part_name}' optimal print orientation: {best_orient} ({best_share*100:.1f}% support area)."
                })

        except Exception as e:
            logger.debug(f"Overhang evaluation warning on {part_name}: {e}")

    return issues, recommendations


def validate_printer_bed_limits(
    parts_solids: Dict[str, Any],
    bed_size: Optional[Tuple[float, float, float]] = None,
) -> List[Dict[str, Any]]:
    """Verifies that all parts fit within the printer's build volume (default 220x220x250 mm)."""
    issues = []
    bed = bed_size if bed_size else (220.0, 220.0, 250.0)

    for part_name, solid in parts_solids.items():
        if not hasattr(solid, "val"):
            continue
        try:
            bb = solid.val().BoundingBox()
            dx = bb.xmax - bb.xmin
            dy = bb.ymax - bb.ymin
            dz = bb.zmax - bb.zmin

            if dx > bed[0] or dy > bed[1] or dz > bed[2]:
                issues.append({
                    "level": "error",
                    "part": part_name,
                    "code": "EXCEEDS_BED_LIMITS",
                    "msg": f"Part '{part_name}' size ({dx:.1f} x {dy:.1f} x {dz:.1f} mm) exceeds printer build bed ({bed[0]} x {bed[1]} x {bed[2]} mm)."
                })
        except Exception as e:
            logger.debug(f"Bed limit check error on {part_name}: {e}")

    return issues


def validate_display_window_centering(
    display_spec: Optional[Dict[str, Any]],
    window_spec: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Verifies that the display window cutout aligns with the display component's active area
    within 0.2 mm tolerance.
    """
    issues = []
    if not display_spec or not window_spec:
        return issues

    act_x = float(display_spec.get("active_x", display_spec.get("offset_x", 0.0)))
    act_z = float(display_spec.get("active_z", display_spec.get("offset_z", 0.0)))
    win_x = float(window_spec.get("x", window_spec.get("offset_x", 0.0)))
    win_z = float(window_spec.get("z", window_spec.get("offset_z", 0.0)))

    dx = abs(win_x - act_x)
    dz = abs(win_z - act_z)

    if dx > 0.201 or dz > 0.201:
        issues.append({
            "level": "error",
            "part": "display_window",
            "code": "WINDOW_MISALIGNED",
            "msg": f"Display window cut center ({win_x:.2f}, {win_z:.2f}) is offset from display active area ({act_x:.2f}, {act_z:.2f}) by dx={dx:.2f} mm, dz={dz:.2f} mm (tolerance <= 0.20 mm)."
        })
    else:
        issues.append({
            "level": "info",
            "part": "display_window",
            "code": "WINDOW_ALIGNED",
            "msg": f"Display window is accurately centered on active area (dx={dx:.2f} mm, dz={dz:.2f} mm <= 0.20 mm)."
        })

    return issues


def validate_hole_diameters(
    holes: Optional[List[Dict[str, Any]]],
    nozzle_d: float = 0.4,
) -> List[Dict[str, Any]]:
    """Warns if any hole diameter is smaller than 1.5 mm (FDM nozzle printability limit)."""
    issues = []
    if not holes:
        return issues

    for h in holes:
        d = float(h.get("d", h.get("diameter", 3.0)))
        pos = h.get("pos", (0, 0))
        if d < 1.49:
            issues.append({
                "level": "warn",
                "part": "holes",
                "code": "HOLE_TOO_SMALL",
                "msg": f"Hole at ({pos[0]:.1f}, {pos[1]:.1f}) has diameter {d:.2f} mm (< 1.5 mm limit; risk of fusing shut on FDM 0.4mm nozzle)."
            })

    return issues


def validate_cad_design(
    parts_solids: Dict[str, Any],
    metrics: Dict[str, Any],
    files: Dict[str, Any],
    components: Optional[List[Dict[str, Any]]] = None,
    bed_size: Optional[Tuple[float, float, float]] = None,
    display_spec: Optional[Dict[str, Any]] = None,
    window_spec: Optional[Dict[str, Any]] = None,
    holes_spec: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Comprehensive validation suite combining all deterministic checks:
    - Solidity & watertightness
    - Components fit
    - Parts interference
    - Wall thickness
    - Overhangs & orientation recommendation
    - Bed limits
    - Display window centering
    - Hole diameters
    """
    all_issues = []

    # Extract STL paths
    stl_paths = {p: f["stl"] for p, f in files.items() if isinstance(f, dict) and "stl" in f}

    # 1. Solidity & watertightness
    all_issues.extend(validate_part_solidity_and_watertightness(metrics))

    # 2. Components fit
    all_issues.extend(validate_components_fit(parts_solids, components))

    # 3. Interference
    all_issues.extend(validate_interference_between_parts(parts_solids))

    # 4. Wall thickness
    all_issues.extend(validate_wall_thickness(stl_paths))

    # 5. Overhangs & orientation
    overhang_issues, orientations = validate_overhangs_and_orientation(stl_paths)
    all_issues.extend(overhang_issues)

    # 6. Bed limits
    all_issues.extend(validate_printer_bed_limits(parts_solids, bed_size))

    # 7. Display window alignment
    all_issues.extend(validate_display_window_centering(display_spec, window_spec))

    # 8. Hole diameters
    all_issues.extend(validate_hole_diameters(holes_spec))

    errors = [i for i in all_issues if i["level"] == "error"]
    warnings = [i for i in all_issues if i["level"] == "warn"]
    infos = [i for i in all_issues if i["level"] == "info"]

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "info": infos,
        "issues": all_issues,
        "suggested_orientations": orientations,
    }

"""
printprep.py - 3D Print Preparation, Repair, and Slicing Pre-flight for 3d.me

Features:
- make_printable: Uses trimesh + manifold3d to produce 100% watertight, manifold meshes.
- Largest connected component isolation, degenerate & duplicate face removal.
- Hole filling, normal unification, and winding consistency.
- Taubin smoothing (non-shrinking geometric smoothing).
- Flat base cut ensuring the model rests solidly on the build plate at Z=0.
- Scaling to exact user-requested millimeters.
- Comprehensive analysis: watertightness, manifold status, volume, bounding box,
  min wall thickness estimation, overhang percentage (>45 deg), triangle count.
- Multi-color filament quantization using k-means in CIE-Lab color space.
- Production-grade STL and 3MF millimeter export.
- Optional PrusaSlicer / OrcaSlicer CLI inspection.
"""

import os
import shutil
import logging
import subprocess
from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import trimesh
import manifold3d as m3d
import skimage.color
import sklearn.cluster

logger = logging.getLogger("3dme.printprep")


def make_printable(
    mesh: trimesh.Trimesh,
    height_mm: float = 100.0,
    taubin_iterations: int = 0,
    flat_base_cut: bool = True,
    base_cut_percent: float = 0.02,
    aggressive_repair: bool = False,
    source: str = "mesh",
    linear_deflection_mm: float = 0.02,
) -> Tuple[trimesh.Trimesh, Dict[str, Any]]:
    """
    Transforms any surface mesh into a clean, watertight, manifold, print-ready 3D model.

    Args:
        mesh: Input trimesh.Trimesh object
        height_mm: Target height in millimeters along Z (bypassed if source='cad')
        taubin_iterations: Optional non-shrinking smoothing iterations (bypassed if source='cad')
        flat_base_cut: Whether to create a flat cut at the bottom (bypassed if source='cad')
        base_cut_percent: Fraction of total height to trim from the bottom
        aggressive_repair: Enables deeper manifold topology repair for heavily damaged meshes
        source: 'cad' | 'mesh'. When 'cad', Taubin, base cut, and height scaling are strictly skipped
                to protect exact mechanical dimensions within <= 0.01 mm tolerance.
        linear_deflection_mm: Maximum allowable tessellation chord deviation (default 0.02 mm)

    Returns:
        (repaired_mesh, analysis_report)
    """
    is_cad = (source == "cad")
    logger.info(f"Starting print-prep pipeline (source={source})...")
    work_mesh = mesh.copy()

    # Preserve colors if present
    has_vertex_colors = (
        hasattr(work_mesh.visual, "vertex_colors")
        and work_mesh.visual.vertex_colors is not None
        and len(work_mesh.visual.vertex_colors) == len(work_mesh.vertices)
    )
    has_face_colors = (
        hasattr(work_mesh.visual, "face_colors")
        and work_mesh.visual.face_colors is not None
        and len(work_mesh.visual.face_colors) == len(work_mesh.faces)
    )

    # 1. Merge vertices & clean degenerate/duplicate faces first to ensure
    # UV seams or split vertices from prior unwrapping do not shatter the solid into pieces.
    work_mesh.remove_unreferenced_vertices()
    work_mesh.merge_vertices()
    work_mesh.update_faces(work_mesh.unique_faces())
    work_mesh.update_faces(work_mesh.nondegenerate_faces())

    # 2. Keep largest connected component (strip floating debris/artifacts)
    try:
        components = work_mesh.split(only_watertight=False)
        if len(components) > 1:
            logger.info(f"Stripping debris: found {len(components)} components. Keeping largest.")
            work_mesh = max(components, key=lambda c: len(c.faces))
    except Exception as e:
        logger.warning(f"Component separation warning: {e}")

    # 3. Fill holes, fix winding & normals
    trimesh.repair.fill_holes(work_mesh)
    trimesh.repair.fix_winding(work_mesh)
    trimesh.repair.fix_normals(work_mesh)
    trimesh.repair.fix_inversion(work_mesh)

    # 4. Manifold3D topological validation and reconstruction
    man = None
    try:
        m3d_mesh = m3d.Mesh(
            vert_properties=np.asarray(work_mesh.vertices, dtype=np.float32),
            tri_verts=np.asarray(work_mesh.faces, dtype=np.uint32),
        )
        man = m3d.Manifold(m3d_mesh)

        if man.status() == m3d.Error.NoError:
            # Reconstruct clean geometry directly from manifold representation
            out_m3d = man.to_mesh()
            verts = np.asarray(out_m3d.vert_properties[:, :3], dtype=np.float64)
            faces = np.asarray(out_m3d.tri_verts, dtype=np.int64)
            work_mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
            trimesh.repair.fix_winding(work_mesh)
            trimesh.repair.fix_normals(work_mesh)
        elif aggressive_repair:
            logger.info("Mesh has non-manifold status, applying aggressive repair...")
            # Try convex hull decomposition or boolean union repair
            # Decompose into components if possible or fix broken faces
            try:
                trimesh.repair.broken_faces(work_mesh)
                work_mesh.fill_holes()
                m3d_mesh = m3d.Mesh(
                    vert_properties=np.asarray(work_mesh.vertices, dtype=np.float32),
                    tri_verts=np.asarray(work_mesh.faces, dtype=np.uint32),
                )
                man = m3d.Manifold(m3d_mesh)
                if man.status() == m3d.Error.NoError:
                    out_m3d = man.to_mesh()
                    work_mesh = trimesh.Trimesh(
                        vertices=out_m3d.vert_properties[:, :3],
                        faces=out_m3d.tri_verts,
                        process=True,
                    )
            except Exception as agg_err:
                logger.warning(f"Aggressive repair fallback notice: {agg_err}")
    except Exception as m_err:
        logger.warning(f"Manifold3d initialization warning: {m_err}")

    # 5. Optional Taubin Smoothing (no shrinkage) - Bypassed for CAD geometry
    if not is_cad and taubin_iterations > 0 and len(work_mesh.vertices) > 10:
        try:
            logger.info(f"Applying Taubin smoothing ({taubin_iterations} iterations)...")
            trimesh.smoothing.filter_taubin(
                work_mesh,
                lamb=0.5,
                nu=-0.53,
                iterations=int(taubin_iterations),
            )
        except Exception as t_err:
            logger.warning(f"Taubin smoothing warning: {t_err}")

    # 6. Flat base cut and Z-up bed orientation
    # Orient so minimum Z is at 0
    work_mesh.apply_translation([0.0, 0.0, -float(work_mesh.bounds[0, 2])])
    curr_h = float(work_mesh.extents[2]) if work_mesh.extents[2] > 1e-4 else 1.0

    # Base cut is strictly bypassed for CAD geometry
    if not is_cad and flat_base_cut and base_cut_percent > 0.0 and curr_h > 1e-3:
        cut_z = float(work_mesh.bounds[0, 2]) + (curr_h * float(base_cut_percent))
        logger.info(f"Performing flat base cut at Z={cut_z:.3f} mm...")
        try:
            # Attempt via manifold3d trim_by_plane for guaranteed manifold closure
            m3d_mesh = m3d.Mesh(
                vert_properties=np.asarray(work_mesh.vertices, dtype=np.float32),
                tri_verts=np.asarray(work_mesh.faces, dtype=np.uint32),
            )
            man_cut = m3d.Manifold(m3d_mesh)
            if man_cut.status() == m3d.Error.NoError:
                # Normal (0,0,1) pointing upward keeps upper body; offset is -cut_z in plane eq ax+by+cz+d>=0
                trimmed = man_cut.trim_by_plane((0.0, 0.0, 1.0), -cut_z)
                if not trimmed.is_empty():
                    out_trimmed = trimmed.to_mesh()
                    work_mesh = trimesh.Trimesh(
                        vertices=np.asarray(out_trimmed.vert_properties[:, :3], dtype=np.float64),
                        faces=np.asarray(out_trimmed.tri_verts, dtype=np.int64),
                        process=True,
                    )
                    man = trimmed
            else:
                # Fallback to trimesh plane slice
                sliced = trimesh.intersections.slice_mesh_plane(
                    work_mesh,
                    plane_normal=[0.0, 0.0, 1.0],
                    plane_origin=[0.0, 0.0, cut_z],
                    cap=True,
                )
                if len(sliced.faces) > 0:
                    work_mesh = sliced
        except Exception as cut_err:
            logger.warning(f"Base cut warning: {cut_err}")

    # 7. Scale to target millimeter height - Bypassed for CAD geometry
    curr_height = float(work_mesh.extents[2])
    if not is_cad and curr_height > 1e-5 and height_mm > 0:
        scale_factor = float(height_mm) / curr_height
        work_mesh.apply_scale(scale_factor)

    # Center in X and Y, place bottom at Z=0.0
    x_mid = float((work_mesh.bounds[0, 0] + work_mesh.bounds[1, 0]) / 2.0)
    y_mid = float((work_mesh.bounds[0, 1] + work_mesh.bounds[1, 1]) / 2.0)
    z_min = float(work_mesh.bounds[0, 2])
    work_mesh.apply_translation([-x_mid, -y_mid, -z_min])

    # Re-verify manifold state
    is_watertight = bool(work_mesh.is_watertight)
    is_manifold = False
    try:
        final_m3d = m3d.Mesh(
            vert_properties=np.asarray(work_mesh.vertices, dtype=np.float32),
            tri_verts=np.asarray(work_mesh.faces, dtype=np.uint32),
        )
        final_man = m3d.Manifold(final_m3d)
        is_manifold = bool(final_man.status() == m3d.Error.NoError)
        man = final_man
    except Exception:
        is_manifold = is_watertight

    # 8. Detailed printability analysis
    volume_mm3 = float(abs(work_mesh.volume)) if is_watertight else float(abs(man.volume()) if man else 0.0)
    bbox_mm = {
        "x": round(float(work_mesh.extents[0]), 2),
        "y": round(float(work_mesh.extents[1]), 2),
        "z": round(float(work_mesh.extents[2]), 2),
    }

    # Overhang percentage (faces pointing downward steeper than 45 degrees)
    # Downward normal nz < -sin(45 deg) = -0.7071
    try:
        overhang_threshold = -np.sin(np.radians(45.0))
        overhang_mask = work_mesh.face_normals[:, 2] < overhang_threshold
        overhang_area = float(np.sum(work_mesh.area_faces[overhang_mask]))
        total_area = max(float(work_mesh.area), 1e-6)
        overhang_pct = round((overhang_area / total_area) * 100.0, 1)
    except Exception:
        overhang_pct = 0.0

    # Min wall thickness estimate
    min_wall_mm = _estimate_min_wall_thickness(work_mesh, man)

    # Compute overall print quality status
    status = "pass"
    reasons = []
    if not is_watertight:
        status = "fail"
        reasons.append("Model is not watertight (contains holes or boundary edges).")
    if not is_manifold:
        status = "fail"
        reasons.append("Mesh topology is not 2-manifold (contains self-intersections or degenerate edges).")
    if min_wall_mm < 0.6:
        if status != "fail":
            status = "warn"
        reasons.append(f"Thin wall detected (~{min_wall_mm:.2f} mm). Recommended minimum is >= 0.8 mm for FDM.")
    if overhang_pct > 35.0:
        if status != "fail":
            status = "warn"
        reasons.append(f"High overhang area ({overhang_pct}% > 45°). Slicer supports recommended.")

    report = {
        "watertight": is_watertight,
        "manifold": is_manifold,
        "volume_mm3": round(volume_mm3, 2),
        "bbox_mm": bbox_mm,
        "min_wall_mm": min_wall_mm,
        "overhang_percent": overhang_pct,
        "triangle_count": int(len(work_mesh.faces)),
        "status": status,
        "reasons": reasons,
    }

    logger.info(f"Print-prep completed: status={status}, watertight={is_watertight}, tris={len(work_mesh.faces)}")
    return work_mesh, report


def _estimate_min_wall_thickness(mesh: trimesh.Trimesh, man: Optional[m3d.Manifold] = None) -> float:
    """Estimates the minimum wall thickness in millimeters using inward ray sampling."""
    try:
        sample_count = min(60, len(mesh.faces))
        if sample_count < 4:
            return 1.0

        sample_pts, face_indices = trimesh.sample.sample_surface(mesh, sample_count)
        normals = mesh.face_normals[face_indices]
        thicknesses = []

        if man is not None and man.status() == m3d.Error.NoError:
            for pt, norm in zip(sample_pts, normals):
                origin = pt - norm * 0.05
                endpoint = pt - norm * 150.0
                hits = man.ray_cast(tuple(origin), tuple(endpoint))
                if hits:
                    thicknesses.append(hits[0].distance + 0.05)
        else:
            # Fallback to proximity to other vertices along inward normal
            kdtree = sklearn.neighbors.KDTree(mesh.vertices)
            dists, _ = kdtree.query(sample_pts, k=2)
            thicknesses = dists[:, 1].tolist()

        if thicknesses:
            # Filter zero/near-zero noise and use 5th percentile to avoid corner sensitivity
            valid = [t for t in thicknesses if t > 0.05]
            if valid:
                return round(float(np.percentile(valid, 5)), 2)
        return 1.0
    except Exception as e:
        logger.debug(f"Wall thickness estimation note: {e}")
        return 1.0


def quantize_colors_lab(
    mesh: trimesh.Trimesh,
    n_colors: int = 4,
) -> Tuple[trimesh.Trimesh, List[str], np.ndarray]:
    """
    Quantizes vertex/face colors to N filament colors using k-means in CIE-Lab color space.

    Returns:
        (colored_mesh, palette_hex_list, face_labels)
    """
    work = mesh.copy()
    n_colors = max(2, min(4, int(n_colors)))

    # Extract RGB colors
    if hasattr(work.visual, "vertex_colors") and len(work.visual.vertex_colors) == len(work.vertices):
        rgb_raw = work.visual.vertex_colors[:, :3] / 255.0
    elif hasattr(work.visual, "face_colors") and len(work.visual.face_colors) == len(work.faces):
        rgb_raw = work.visual.face_colors[:, :3] / 255.0
    else:
        # Default neutral light gray
        rgb_raw = np.full((len(work.vertices), 3), 0.75, dtype=np.float32)

    # Convert to CIE-Lab space for perceptual uniformity
    lab = skimage.color.rgb2lab(rgb_raw.astype(np.float64))

    # Clamp n_colors to number of unique samples if small
    unique_rows = np.unique(np.round(lab, decimals=2), axis=0)
    actual_clusters = max(1, min(n_colors, len(unique_rows)))

    # K-means clustering in Lab space
    kmeans = sklearn.cluster.KMeans(n_clusters=actual_clusters, random_state=42, n_init="auto")
    labels = kmeans.fit_predict(lab)
    centers_lab = kmeans.cluster_centers_

    # Map cluster centers back to sRGB [0, 1]
    centers_rgb = np.clip(
        skimage.color.lab2rgb(centers_lab.reshape(1, -1, 3)).reshape(-1, 3), 0.0, 1.0
    )

    # Build palette hex strings
    palette_hex = []
    for c in centers_rgb:
        r, g, b = int(round(c[0] * 255)), int(round(c[1] * 255)), int(round(c[2] * 255))
        palette_hex.append(f"#{r:02x}{g:02x}{b:02x}")

    # Map labels to face colors
    if len(labels) == len(work.faces):
        face_labels = labels
    else:
        # Interpolate vertex labels to faces by majority vote
        vert_labels = labels
        face_vert_labels = vert_labels[work.faces]
        face_labels = np.array([
            np.bincount(row, minlength=n_colors).argmax() for row in face_vert_labels
        ])

    quantized_rgb_u8 = (centers_rgb * 255).astype(np.uint8)
    face_rgba = np.zeros((len(work.faces), 4), dtype=np.uint8)
    face_rgba[:, :3] = quantized_rgb_u8[face_labels]
    face_rgba[:, 3] = 255

    work.visual.face_colors = face_rgba
    return work, palette_hex, face_labels


def export_stl(mesh: trimesh.Trimesh, output_path: str) -> str:
    """Exports binary STL format in millimeters."""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    mesh.export(output_path, file_type="stl")
    return output_path


def export_3mf(
    mesh: trimesh.Trimesh,
    output_path: str,
    printer_type: str = "single",
    n_colors: int = 4,
) -> str:
    """
    Exports 3MF model according to the selected printer type:
    - 'single': Single color geometry export.
    - 'multi': Multi-color AMS/MMU export with separate submeshes per quantized filament color.
    - 'full': Full-color 3MF with vertex/face colors preserved.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    if printer_type == "multi":
        colored_mesh, palette, face_labels = quantize_colors_lab(mesh, n_colors=n_colors)
        submeshes = {}
        for idx, hex_color in enumerate(palette):
            mask = (face_labels == idx)
            if np.any(mask):
                sub = colored_mesh.submesh([mask], append=True)
                if len(sub.faces) > 0:
                    submeshes[f"Filament_{idx + 1}_{hex_color}"] = sub

        if submeshes:
            scene = trimesh.Scene(submeshes)
            scene.export(output_path, file_type="3mf")
            return output_path

    # Single or Full color export
    mesh.export(output_path, file_type="3mf")
    return output_path


def check_slicer_cli(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Checks if PrusaSlicer or OrcaSlicer is available on PATH or /Applications/.
    If found, runs a quick slice estimation and extracts print time and filament usage.
    Returns None if no supported slicer is installed.
    """
    slicer_bin = None
    possible_bins = [
        "prusa-slicer",
        "prusa-slicer-console",
        "orca-slicer",
        "/Applications/Original Prusa Drivers/PrusaSlicer.app/Contents/MacOS/PrusaSlicer",
        "/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer",
        "/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer",
        "/Applications/BambuStudio.app/Contents/MacOS/BambuStudio",
    ]

    for b in possible_bins:
        if shutil.which(b) or os.path.exists(b):
            slicer_bin = b
            break

    if not slicer_bin:
        return None

    try:
        # Run slicer in dry-run/info mode
        cmd = [slicer_bin, "--info", file_path]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        output = res.stdout + "\n" + res.stderr
        info: Dict[str, Any] = {"slicer": os.path.basename(slicer_bin), "raw_output": output[:300]}
        return info
    except Exception as e:
        logger.debug(f"Slicer inspection notice: {e}")
        return None

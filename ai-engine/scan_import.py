import io
import os
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import trimesh

try:
    import fast_simplification
    HAS_FAST_SIMPLIFICATION = True
except ImportError:
    HAS_FAST_SIMPLIFICATION = False

logger = logging.getLogger("scan_import")

MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB
ALLOWED_EXTENSIONS = {".glb", ".gltf", ".obj", ".stl"}


def get_decimation_status() -> Dict[str, Any]:
    return {
        "available": True,
        "engine": "fast_simplification" if HAS_FAST_SIMPLIFICATION else "trimesh_quadric",
        "description": "Fast quadric mesh decimation active."
    }


def load_and_validate_mesh(file_bytes: bytes, filename: str) -> trimesh.Trimesh:
    """
    Validates file size, extension, and loads mesh using trimesh.
    Merges multi-geometry scenes into a single Trimesh.
    Rejects empty or non-mesh files.
    """
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File size ({len(file_bytes) / (1024 * 1024):.1f} MB) exceeds maximum allowed limit of 100 MB.")

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file format '{ext}'. Allowed formats: .glb, .gltf, .obj, .stl")

    try:
        # Load mesh or scene
        loaded = trimesh.load(io.BytesIO(file_bytes), file_type=ext.lstrip("."))
    except Exception as e:
        raise ValueError(f"Failed to parse 3D file: {e}")

    # Extract mesh from scene if needed
    if isinstance(loaded, trimesh.Scene):
        meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not meshes:
            raise ValueError("Uploaded file contains an empty scene without valid 3D polygon geometry.")
        if len(meshes) == 1:
            mesh = meshes[0]
        else:
            mesh = trimesh.util.concatenate(meshes)
    elif isinstance(loaded, trimesh.Trimesh):
        mesh = loaded
    else:
        raise ValueError("Uploaded file does not contain a valid 3D polygon mesh.")

    if len(mesh.vertices) == 0 or len(mesh.faces) == 0:
        raise ValueError("Mesh contains 0 vertices or 0 faces.")

    return mesh


def compute_mesh_stats(mesh: trimesh.Trimesh) -> Dict[str, Any]:
    """Computes geometric stats for the mesh."""
    # Count loose components
    try:
        components = mesh.split(only_watertight=False)
        loose_count = len(components)
    except Exception:
        loose_count = 1

    extents = [round(float(x), 3) for x in mesh.extents]
    return {
        "vertices": int(len(mesh.vertices)),
        "triangles": int(len(mesh.faces)),
        "bounding_box": extents,
        "watertight": bool(mesh.is_watertight),
        "loose_components": loose_count,
    }


def detect_units(mesh: trimesh.Trimesh) -> Tuple[str, float, Optional[str]]:
    """
    Detects suspected units based on bounding box extent.
    Returns: (units_suspected, suggested_scale_factor, unit_hint)
    """
    largest = max(mesh.extents) if len(mesh.extents) > 0 else 0.0

    if largest < 2.0:
        return (
            "meters",
            1000.0,
            f"Model appears to be in meters (largest dimension {largest:.3f} < 2). Suggested conversion: 1000x to millimeters."
        )
    elif largest > 5000.0:
        return (
            "micrometers",
            0.001,
            f"Model appears to be in micrometers (largest dimension {largest:.1f} > 5000). Suggested conversion: 0.001x to millimeters."
        )
    else:
        return ("millimeters", 1.0, None)


def remove_floating_components(mesh: trimesh.Trimesh, threshold_pct: float = 5.0) -> Tuple[trimesh.Trimesh, int]:
    """
    Removes small disconnected floating fragments whose face count is below threshold_pct% of the largest component.
    """
    components = mesh.split(only_watertight=False)
    if len(components) <= 1:
        return mesh, 0

    # Rank by number of faces
    components.sort(key=lambda c: len(c.faces), reverse=True)
    max_faces = len(components[0].faces)
    min_faces = int(max_faces * (threshold_pct / 100.0))

    kept = [c for c in components if len(c.faces) >= min_faces]
    removed_count = len(components) - len(kept)

    if not kept:
        kept = [components[0]]
        removed_count = len(components) - 1

    if len(kept) == 1:
        new_mesh = kept[0]
    else:
        new_mesh = trimesh.util.concatenate(kept)

    return new_mesh, removed_count


def center_and_ground_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """
    Centers the mesh on origin (X=0, Y=0) and aligns its bottom base to Z=0.
    """
    bounds = mesh.bounds
    center_x = (bounds[0][0] + bounds[1][0]) / 2.0
    center_y = (bounds[0][1] + bounds[1][1]) / 2.0
    min_z = bounds[0][2]

    mesh.apply_translation([-center_x, -center_y, -min_z])
    return mesh


def decimate_mesh(mesh: trimesh.Trimesh, target_triangles: int) -> trimesh.Trimesh:
    """
    Decimates mesh down to target_triangles using fast_simplification or trimesh quadric decimation.
    """
    current_faces = len(mesh.faces)
    if target_triangles >= current_faces:
        return mesh

    if HAS_FAST_SIMPLIFICATION:
        try:
            reduction = max(0.01, min(0.99, 1.0 - (float(target_triangles) / current_faces)))
            v_out, f_out = fast_simplification.simplify(
                mesh.vertices,
                mesh.faces,
                target_reduction=reduction
            )
            return trimesh.Trimesh(vertices=v_out, faces=f_out, process=True)
        except Exception as e:
            logger.warning(f"fast_simplification failed ({e}), falling back to trimesh quadric: {e}")

    try:
        return mesh.simplify_quadric_decimation(target_triangles)
    except Exception as e:
        logger.warning(f"trimesh simplify_quadric_decimation failed: {e}")
        return mesh


def apply_cleanup(
    original_mesh: trimesh.Trimesh,
    remove_floating: bool = False,
    floating_threshold_pct: float = 5.0,
    fill_holes: bool = False,
    center_and_ground: bool = False,
    decimate: bool = False,
    target_triangles: Optional[int] = None
) -> Tuple[trimesh.Trimesh, List[str]]:
    """
    Applies selected cleanup operations to a COPY of the mesh.
    Returns the cleaned Trimesh copy and a log of changes made.
    """
    mesh = original_mesh.copy()
    logs: List[str] = []

    # 1. Floating fragments removal
    if remove_floating:
        mesh, removed = remove_floating_components(mesh, threshold_pct=floating_threshold_pct)
        if removed > 0:
            logs.append(f"Removed {removed} small floating component(s) (<{floating_threshold_pct}% size).")

    # 2. Hole filling
    if fill_holes:
        try:
            trimesh.repair.fill_holes(mesh)
            logs.append("Attempted hole repair / mesh sealing.")
        except Exception as e:
            logger.warning(f"fill_holes error: {e}")

    # 3. Center and ground
    if center_and_ground:
        mesh = center_and_ground_mesh(mesh)
        logs.append("Centered model at (X=0, Y=0) and set base at Z=0.")

    # 4. Decimation
    if decimate and target_triangles and target_triangles < len(mesh.faces):
        orig_count = len(mesh.faces)
        mesh = decimate_mesh(mesh, target_triangles)
        logs.append(f"Decimated mesh from {orig_count:,} to {len(mesh.faces):,} triangles.")

    return mesh, logs

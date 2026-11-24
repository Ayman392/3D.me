"""
test_printprep.py - Unit and regression tests for printprep.py module.
"""

import os
import tempfile
import pytest
import numpy as np
import trimesh

from printprep import make_printable, quantize_colors_lab, export_stl, export_3mf


def create_broken_mesh():
    """
    Creates a deliberately broken mesh:
    - Open holes (missing faces)
    - Flipped normals (reversed winding on faces)
    - Disconnected floating debris (tiny sphere far from origin)
    - Duplicate & unreferenced vertices
    """
    box = trimesh.creation.box(extents=(30.0, 30.0, 30.0))

    # Add floating debris
    debris = trimesh.creation.icosphere(radius=1.5)
    debris.apply_translation([100.0, 100.0, 100.0])

    # Remove 2 faces to create an open boundary hole
    broken_faces = list(box.faces[2:])

    # Invert the winding of one face to create flipped normal
    inverted_face = list(box.faces[0])
    inverted_face[0], inverted_face[1] = inverted_face[1], inverted_face[0]
    broken_faces.append(inverted_face)

    # Combine box with holes + flipped normal + debris
    broken_box = trimesh.Trimesh(vertices=box.vertices, faces=broken_faces, process=False)
    combined = trimesh.util.concatenate([broken_box, debris])
    return combined


def test_broken_mesh_becomes_watertight_and_manifold():
    """Verifies that make_printable repairs a heavily broken mesh to be 100% watertight and manifold."""
    broken = create_broken_mesh()
    assert not broken.is_watertight, "Initial test mesh must be broken/non-watertight"

    repaired, report = make_printable(
        mesh=broken,
        height_mm=50.0,
        taubin_iterations=2,
        flat_base_cut=True,
        base_cut_percent=0.02,
    )

    # Verify geometric validity
    assert repaired.is_watertight, "Repaired mesh must be strictly watertight"
    assert report["watertight"] is True
    assert report["triangle_count"] > 0
    assert report["volume_mm3"] > 0.0

    # Verify height scaling
    assert pytest.approx(repaired.extents[2], rel=1e-2) == 50.0

    # Verify Z-up resting on build plate
    assert pytest.approx(repaired.bounds[0, 2], abs=1e-3) == 0.0


def test_color_quantization_lab():
    """Tests k-means Lab color quantization into 2-4 distinct filament colors."""
    box = trimesh.creation.box()
    # Apply synthetic color gradient
    colors = np.random.randint(0, 255, size=(len(box.vertices), 4), dtype=np.uint8)
    box.visual.vertex_colors = colors

    quantized, palette, face_labels = quantize_colors_lab(box, n_colors=3)
    assert len(palette) == 3
    for hex_code in palette:
        assert hex_code.startswith("#")
        assert len(hex_code) == 7
    assert len(face_labels) == len(box.faces)


def test_export_stl_and_3mf():
    """Verifies exporting to STL and 3MF formats."""
    box = trimesh.creation.box(extents=(20, 20, 20))
    repaired, _ = make_printable(box, height_mm=25.0)

    with tempfile.TemporaryDirectory() as tmpdir:
        stl_path = os.path.join(tmpdir, "test.stl")
        mf_path = os.path.join(tmpdir, "test.3mf")

        export_stl(repaired, stl_path)
        assert os.path.exists(stl_path)
        assert os.path.getsize(stl_path) > 0

        export_3mf(repaired, mf_path, printer_type="multi", n_colors=2)
        assert os.path.exists(mf_path)
        assert os.path.getsize(mf_path) > 0


def test_cad_geometry_protection():
    """
    Phase 7 Regression Test:
    Asserts that CAD models passed through printprep(source='cad') have their
    exact dimensions and volume preserved within <= 0.01 mm and <= 0.1%.
    Smoothing, base cutting, and height scaling MUST be skipped.
    """
    initial_w, initial_d, initial_h = 50.0, 30.0, 15.0
    cad_mesh = trimesh.creation.box(extents=(initial_w, initial_d, initial_h))
    initial_volume = cad_mesh.volume

    repaired, report = make_printable(
        cad_mesh,
        height_mm=120.0,        # Must NOT scale to 120 mm!
        flat_base_cut=True,     # Must NOT trim bottom!
        base_cut_percent=0.05,
        taubin_iterations=5,    # Must NOT run Taubin smoothing!
        source="cad"
    )

    # Check extents within 0.01 mm
    assert abs(repaired.extents[0] - initial_w) < 0.01, f"Width altered: {repaired.extents[0]}"
    assert abs(repaired.extents[1] - initial_d) < 0.01, f"Depth altered: {repaired.extents[1]}"
    assert abs(repaired.extents[2] - initial_h) < 0.01, f"Height altered: {repaired.extents[2]}"

    # Check volume within 0.1%
    vol_delta = abs(repaired.volume - initial_volume) / initial_volume
    assert vol_delta < 0.001, f"Volume changed by {vol_delta*100:.3f}%"

    # Must be grounded on Z=0
    assert abs(repaired.bounds[0, 2]) < 1e-4


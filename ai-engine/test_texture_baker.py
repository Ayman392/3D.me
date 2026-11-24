"""
test_texture_baker.py - Unit tests for UV parameterization and PBR texture baking.
"""

import os
import tempfile
import pytest
import numpy as np
import trimesh
from PIL import Image

from texture_baker import bake_pbr_texture


def test_bake_pbr_texture_basic():
    """Tests baking a texture from a synthetic reference image onto a 3D box."""
    box = trimesh.creation.box(extents=(30.0, 30.0, 30.0))
    ref_image = Image.new("RGBA", (256, 256), color=(255, 128, 50, 255))

    textured = bake_pbr_texture(box, ref_image, tex_size=512)

    assert textured is not None
    assert textured.visual.kind == "texture", "Mesh visual kind must be 'texture'"
    assert hasattr(textured.visual, "uv"), "Mesh visual must contain UV coordinates"
    assert len(textured.visual.uv) == len(textured.vertices)
    assert hasattr(textured.visual, "material")
    assert isinstance(textured.visual.material, trimesh.visual.material.PBRMaterial)


def test_bake_pbr_texture_glb_roundtrip():
    """Verifies that an exported GLB contains valid geometry and PBR material."""
    sphere = trimesh.creation.icosphere(subdivisions=2, radius=15.0)
    ref_image = Image.new("RGBA", (128, 128), color=(0, 180, 240, 255))

    textured = bake_pbr_texture(sphere, ref_image, tex_size=512)

    with tempfile.TemporaryDirectory() as tmpdir:
        glb_path = os.path.join(tmpdir, "test_baked.glb")
        textured.export(glb_path)

        assert os.path.exists(glb_path)
        assert os.path.getsize(glb_path) > 1024

        scene = trimesh.load(glb_path)
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        assert len(geoms) > 0
        loaded_mesh = geoms[0]
        assert loaded_mesh.visual.kind == "texture"
        assert hasattr(loaded_mesh.visual, "material")


def test_bake_pbr_texture_with_printprep_conversion():
    """Verifies that textured mesh converts cleanly to vertex colors for multi-color slicing."""
    box = trimesh.creation.box(extents=(20.0, 20.0, 20.0))
    ref_image = Image.new("RGBA", (128, 128), color=(200, 50, 50, 255))

    textured = bake_pbr_texture(box, ref_image, tex_size=512)
    colored = textured.visual.to_color()

    assert colored.kind == "vertex"
    assert len(colored.vertex_colors) == len(textured.vertices)

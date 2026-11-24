"""
texture_baker.py - UV Unwrapping and PBR Texture Projection Engine

Bakes high-resolution 2D reference images onto 3D meshes using xatlas parameterization
and vectorized barycentric camera projection. Replaces blurry marching cubes vertex colors
with crisp 1024x1024 / 2048x2048 PBR diffuse textures.
"""

import os
import logging
from typing import Optional, Union
import numpy as np
import trimesh
import xatlas
import cv2
from PIL import Image

logger = logging.getLogger("3dme.texture_baker")


def bake_pbr_texture(
    mesh: trimesh.Trimesh,
    ref_image: Union[str, Image.Image],
    tex_size: int = 1024,
    shadow_factor: float = 0.78,
    roughness: float = 0.55,
    metallic: float = 0.08,
) -> trimesh.Trimesh:
    """
    Unwraps mesh into non-overlapping UV atlas using xatlas, projects reference image
    from the canonical camera view onto the 3D surface, and bakes a high-resolution
    PBR material with baseColorTexture.

    Args:
        mesh: Input trimesh.Trimesh instance.
        ref_image: Path to reference image or PIL Image object.
        tex_size: Resolution of square texture atlas (1024 or 2048).
        shadow_factor: Ambient attenuation for faces angled away from camera (0.0 to 1.0).
        roughness: PBR roughness factor.
        metallic: PBR metallic factor.

    Returns:
        New trimesh.Trimesh with UV coordinates and PBRMaterial texture.
    """
    if len(mesh.vertices) < 3 or len(mesh.faces) < 1:
        logger.warning("Mesh has insufficient geometry for texture baking.")
        return mesh

    # 1. Load and prepare reference image
    try:
        if isinstance(ref_image, str):
            img = Image.open(ref_image).convert("RGBA")
        elif isinstance(ref_image, Image.Image):
            img = ref_image.convert("RGBA")
        else:
            logger.warning("Invalid reference image type provided.")
            return mesh
    except Exception as e:
        logger.error(f"Failed to load reference image: {e}")
        return mesh

    img_arr = np.array(img)
    h_img, w_img, _ = img_arr.shape

    # 2. Parameterize UVs via xatlas
    try:
        vmapping, indices, uvs = xatlas.parametrize(
            np.asarray(mesh.vertices, dtype=np.float32),
            np.asarray(mesh.faces, dtype=np.uint32),
        )
        unwrapped = trimesh.Trimesh(
            vertices=mesh.vertices[vmapping],
            faces=indices,
            process=False,
        )
    except Exception as e:
        logger.warning(f"xatlas parameterization failed ({e}), keeping original visual.")
        return mesh

    # 3. Rasterize UV triangles into 2D index map
    tex_size = max(512, min(2048, int(tex_size)))
    index_map = np.full((tex_size, tex_size), -1, dtype=np.int32)

    # Invert Y for standard texture coordinate convention (V=0 at bottom)
    tri_uvs = np.clip(uvs[indices] * (tex_size - 1), 0, tex_size - 1).astype(np.int32)
    tri_uvs_img = tri_uvs.copy()
    tri_uvs_img[:, :, 1] = (tex_size - 1) - tri_uvs_img[:, :, 1]

    for i in range(len(tri_uvs_img)):
        cv2.fillConvexPoly(index_map, tri_uvs_img[i], i)

    # 4. Vectorized barycentric coordinates for all mapped texels
    valid_mask = index_map >= 0
    y_coords, x_coords = np.where(valid_mask)
    if len(y_coords) == 0:
        logger.warning("No valid UV texels were rasterized.")
        return mesh

    f_indices = index_map[y_coords, x_coords]
    f_uvs = tri_uvs_img[f_indices].astype(np.float32)
    p = np.stack([x_coords, y_coords], axis=-1).astype(np.float32)

    v0 = f_uvs[:, 1] - f_uvs[:, 0]
    v1 = f_uvs[:, 2] - f_uvs[:, 0]
    v2 = p - f_uvs[:, 0]

    d00 = (v0 * v0).sum(axis=-1)
    d01 = (v0 * v1).sum(axis=-1)
    d11 = (v1 * v1).sum(axis=-1)
    d20 = (v2 * v0).sum(axis=-1)
    d21 = (v2 * v1).sum(axis=-1)

    denom = d00 * d11 - d01 * d01
    denom[np.abs(denom) < 1e-8] = 1e-8

    v_coord = (d11 * d20 - d01 * d21) / denom
    w_coord = (d00 * d21 - d01 * d20) / denom
    u_coord = 1.0 - v_coord - w_coord

    u_coord = np.clip(u_coord, 0.0, 1.0)
    v_coord = np.clip(v_coord, 0.0, 1.0)
    w_coord = np.clip(w_coord, 0.0, 1.0)
    total_w = u_coord + v_coord + w_coord
    total_w[total_w < 1e-8] = 1.0
    u_coord /= total_w
    v_coord /= total_w
    w_coord /= total_w

    # 5. Interpolate 3D surface coordinates for texels
    tri_verts = unwrapped.vertices[unwrapped.faces[f_indices]]
    pos_3d = (
        u_coord[:, None] * tri_verts[:, 0]
        + v_coord[:, None] * tri_verts[:, 1]
        + w_coord[:, None] * tri_verts[:, 2]
    )

    # 6. Camera projection: front camera looks along +X towards origin
    # Y is horizontal span (left-to-right), Z is vertical span (bottom-to-top)
    bounds = unwrapped.bounds
    min_pt, max_pt = bounds[0], bounds[1]
    span_y = max(float(max_pt[1] - min_pt[1]), 1e-4)
    span_z = max(float(max_pt[2] - min_pt[2]), 1e-4)

    margin = 0.08
    norm_y = (pos_3d[:, 1] - min_pt[1]) / span_y
    norm_z = (pos_3d[:, 2] - min_pt[2]) / span_z

    px_x = np.clip(
        (margin + norm_y * (1.0 - 2.0 * margin)) * (w_img - 1), 0, w_img - 1
    ).astype(np.int32)
    px_y = np.clip(
        ((1.0 - margin) - norm_z * (1.0 - 2.0 * margin)) * (h_img - 1), 0, h_img - 1
    ).astype(np.int32)

    # Sample colors from reference image
    sampled_colors = img_arr[px_y, px_x, :3].astype(np.float32)

    # 7. Normal-based lighting & backface attenuation
    # +X normal component indicates front-facing face
    f_normals = unwrapped.face_normals[f_indices]
    front_facing = f_normals[:, 0] > 0.0
    sampled_colors[~front_facing] *= float(shadow_factor)

    # 8. Populate texture image array
    texture_arr = np.zeros((tex_size, tex_size, 3), dtype=np.uint8)
    texture_arr[y_coords, x_coords] = np.clip(sampled_colors, 0, 255).astype(np.uint8)

    # 9. Seam dilation to eliminate black UV boundary artifacts
    mask_filled = (valid_mask.astype(np.uint8)) * 255
    kernel = np.ones((5, 5), np.uint8)
    dilated_mask = cv2.dilate(mask_filled, kernel, iterations=3)
    border_pixels = (dilated_mask > 0) & (~valid_mask)
    if np.any(border_pixels):
        dilated_tex = cv2.dilate(texture_arr, kernel, iterations=3)
        texture_arr[border_pixels] = dilated_tex[border_pixels]

    # 10. Construct Trimesh PBR Material & Visuals
    texture_pil = Image.fromarray(texture_arr)
    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=texture_pil,
        roughnessFactor=float(roughness),
        metallicFactor=float(metallic),
    )
    unwrapped.visual = trimesh.visual.TextureVisuals(
        uv=uvs,
        material=material,
    )

    logger.info(
        f"PBR texture baked successfully ({tex_size}x{tex_size}, "
        f"{len(unwrapped.vertices)} vertices, {len(unwrapped.faces)} faces)."
    )
    return unwrapped

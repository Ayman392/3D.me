import gc
import logging
import os
import shutil
import time
import uuid
from typing import Dict, Any, Optional

import numpy as np
from PIL import Image
import torch
import trimesh
import rembg

from model import TripoSRModelManager, get_segmentation_session
from tsr.utils import remove_background, resize_foreground

logger = logging.getLogger("meshforge.generator")

class GenerationError(Exception):
    pass

class TripoSRGenerator:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.model_manager = TripoSRModelManager()
        self.rembg_session = get_segmentation_session()

    def process(
        self,
        job_id: str,
        input_image_path: str,
        quality: str = "Standard",
        progress_callback=None
    ) -> Dict[str, Any]:
        """
        Runs the full 12-step generation pipeline:
        Image -> Preprocessing -> TripoSR -> Mesh Extraction -> GLB Export -> Validation -> Cleanup
        """
        start_time = time.time()
        temp_dir = os.path.join(self.output_dir, f"temp_{job_id}")
        os.makedirs(temp_dir, exist_ok=True)

        try:
            if progress_callback:
                progress_callback(10, "Preprocessing image...")

            logger.info(f"[{job_id}] Opening and validating image: {input_image_path}")
            try:
                raw_image = Image.open(input_image_path)
                raw_image.verify()
                raw_image = Image.open(input_image_path)
            except Exception as e:
                raise GenerationError(f"Invalid or corrupted image format: {e}")

            # Preprocessing: background removal + crisp alpha hardening + clean centered padding
            logger.info(f"[{job_id}] Removing background and optimizing silhouette...")
            rgba_image = remove_background(raw_image, self.rembg_session)
            
            # Robust foreground extraction & alpha contrast enhancement
            arr = np.array(rgba_image).astype(np.float32) / 255.0
            if arr.shape[-1] == 4:
                rgb = arr[:, :, :3]
                alpha = arr[:, :, 3]
                
                # Filter faint background noise and harden foreground silhouette
                alpha_stretched = np.clip((alpha - 0.20) / 0.55, 0.0, 1.0)
                alpha_smooth = alpha_stretched * alpha_stretched * (3.0 - 2.0 * alpha_stretched)
                
                fg_mask = alpha > 0.35
                if np.count_nonzero(fg_mask) > 100:
                    y_idx, x_idx = np.where(fg_mask)
                    y1, y2 = y_idx.min(), y_idx.max()
                    x1, x2 = x_idx.min(), x_idx.max()
                    
                    fg_rgb = rgb[y1:y2+1, x1:x2+1]
                    fg_alpha = alpha_smooth[y1:y2+1, x1:x2+1, None]
                    
                    h, w = fg_rgb.shape[:2]
                    max_dim = max(h, w)
                    target_dim = max(int(max_dim / 0.85), max_dim + 16)
                    
                    pad_y0 = (target_dim - h) // 2
                    pad_y1 = target_dim - h - pad_y0
                    pad_x0 = (target_dim - w) // 2
                    pad_x1 = target_dim - w - pad_x0
                    
                    padded_rgb = np.pad(fg_rgb, ((pad_y0, pad_y1), (pad_x0, pad_x1), (0, 0)), mode="constant", constant_values=0.5)
                    padded_alpha = np.pad(fg_alpha, ((pad_y0, pad_y1), (pad_x0, pad_x1), (0, 0)), mode="constant", constant_values=0.0)
                    
                    # Composite onto neutral 50% gray
                    img_arr = padded_rgb * padded_alpha + (1.0 - padded_alpha) * 0.5
                else:
                    img_arr = rgb * alpha[:, :, None] + (1.0 - alpha[:, :, None]) * 0.5
            else:
                img_arr = arr[:, :, :3]
            
            processed_image = Image.fromarray((img_arr * 255.0).astype(np.uint8)).resize((512, 512), Image.Resampling.LANCZOS)
            processed_img_path = os.path.join(temp_dir, "preprocessed.png")
            processed_image.save(processed_img_path)

            if progress_callback:
                progress_callback(30, "Loading local AI model...")

            # Get model instance
            model = self.model_manager.load_model()
            device = self.model_manager.device

            # Quality mapping (Preview: 128 res, Final: 256 res)
            quality_lower = quality.lower()
            if quality_lower in ("preview", "draft", "128"):
                mc_resolution = 128
            elif quality_lower in ("final", "standard", "256"):
                mc_resolution = 256
            elif quality_lower in ("high", "320"):
                mc_resolution = 320
            else: # Standard default
                mc_resolution = 256

            if progress_callback:
                progress_callback(45, f"Running TripoSR inference on {device.upper()}...")

            logger.info(f"[{job_id}] Running forward pass on device: {device}...")
            t_forward = time.time()
            try:
                with torch.no_grad():
                    scene_codes = model([processed_image], device=device)
            except torch.cuda.OutOfMemoryError as e:
                logger.warning(f"Device memory error on {device}, retrying on CPU: {e}")
                model = self.model_manager.load_model(force_cpu=True)
                device = "cpu"
                with torch.no_grad():
                    scene_codes = model([processed_image], device=device)
            except Exception as e:
                # If MPS fails for any reason, try CPU fallback
                if device != "cpu":
                    logger.warning(f"MPS inference failed ({e}), falling back to CPU...")
                    model = self.model_manager.load_model(force_cpu=True)
                    device = "cpu"
                    with torch.no_grad():
                        scene_codes = model([processed_image], device=device)
                else:
                    raise GenerationError(f"Model inference failed: {e}")

            logger.info(f"[{job_id}] Forward pass finished in {time.time() - t_forward:.2f}s")

            if progress_callback:
                progress_callback(70, f"Extracting 3D geometry (resolution {mc_resolution})...")

            logger.info(f"[{job_id}] Extracting mesh with resolution {mc_resolution}...")
            t_extract = time.time()
            try:
                meshes = model.extract_mesh(scene_codes, has_vertex_color=True, resolution=mc_resolution)
            except Exception as e:
                logger.error(f"Mesh extraction failed on {device}: {e}")
                # Retry on CPU if needed
                if device != "cpu":
                    logger.warning("Retrying mesh extraction with CPU scene codes...")
                    model = self.model_manager.load_model(force_cpu=True)
                    scene_codes_cpu = scene_codes.to("cpu")
                    meshes = model.extract_mesh(scene_codes_cpu, has_vertex_color=True, resolution=mc_resolution)
                else:
                    raise GenerationError(f"Mesh extraction failed: {e}")

            mesh = meshes[0]
            logger.info(f"[{job_id}] Mesh extracted in {time.time() - t_extract:.2f}s! Vertices: {len(mesh.vertices)}, Faces: {len(mesh.faces)}")

            if progress_callback:
                progress_callback(85, "Baking high-resolution PBR texture map...")

            # Bake PBR UV texture from input image onto extracted 3D mesh
            try:
                from texture_baker import bake_pbr_texture
                mesh = bake_pbr_texture(
                    mesh=mesh,
                    ref_image=input_image_path,
                    tex_size=1024,
                )
            except Exception as tex_err:
                logger.warning(f"Texture baking notice ({tex_err}), preserving vertex visual.")

            # Output paths
            glb_filename = f"{job_id}.glb"
            glb_path = os.path.join(self.output_dir, glb_filename)

            # Export GLB
            mesh.export(glb_path)

            # Validate generated GLB
            if not os.path.exists(glb_path) or os.path.getsize(glb_path) == 0:
                raise GenerationError("GLB export failed or generated empty file")

            try:
                scene = trimesh.load(glb_path)
                if not hasattr(scene, "geometry") and not isinstance(scene, trimesh.Trimesh):
                    raise GenerationError("Exported GLB does not contain valid geometry")
            except Exception as e:
                raise GenerationError(f"GLB validation failed: {e}")

            file_size = os.path.getsize(glb_path)
            total_duration = time.time() - start_time
            logger.info(f"[{job_id}] Successfully generated GLB ({file_size / 1024:.2f} KB) in {total_duration:.2f}s")

            if progress_callback:
                progress_callback(100, "Completed!")

            return {
                "job_id": job_id,
                "status": "completed",
                "glb_path": glb_path,
                "glb_filename": glb_filename,
                "file_size": file_size,
                "vertex_count": len(mesh.vertices),
                "face_count": len(mesh.faces),
                "generation_time": round(total_duration, 2),
                "device": device,
                "quality": quality,
            }

        except Exception as e:
            logger.error(f"[{job_id}] Generation failed: {e}", exc_info=True)
            raise e
        finally:
            # Clean up temporary directory
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
            # Memory optimization: release temporary PyTorch/mesh resources
            self.model_manager.release_memory()
            gc.collect()

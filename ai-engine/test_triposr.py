import os
import sys
import time
import numpy as np

os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

import torch
from PIL import Image
import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground

def test_inference():
    print("Testing Apple Silicon detection...")
    has_mps = torch.backends.mps.is_built() and torch.backends.mps.is_available()
    device = "mps" if has_mps else "cpu"
    print(f"Selected device: {device} (MPS built: {torch.backends.mps.is_built()}, MPS available: {torch.backends.mps.is_available()})")

    print("Loading TripoSR model from stabilityai/TripoSR...")
    t0 = time.time()
    try:
        model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model.renderer.set_chunk_size(8192)
        model.to(device)
        print(f"Model loaded successfully in {time.time() - t0:.2f}s on {device}")
    except Exception as e:
        print(f"Failed to load on {device}, trying cpu fallback: {e}")
        device = "cpu"
        model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model.renderer.set_chunk_size(8192)
        model.to(device)
        print(f"Model loaded successfully on CPU fallback in {time.time() - t0:.2f}s")

    test_img_path = "/tmp/triposr_inspect/examples/chair.png"
    print(f"Testing with image: {test_img_path}")
    raw_img = Image.open(test_img_path)

    # Process image (Composite RGBA over 0.5 gray background as required by TripoSR)
    print("Preprocessing image...")
    img = remove_background(raw_img)
    img = resize_foreground(img, 0.85)
    img_arr = np.array(img).astype(np.float32) / 255.0
    if img_arr.shape[-1] == 4:
        img_arr = img_arr[:, :, :3] * img_arr[:, :, 3:4] + (1 - img_arr[:, :, 3:4]) * 0.5
    img = Image.fromarray((img_arr * 255.0).astype(np.uint8))

    print(f"Running TripoSR forward pass on {device}...")
    t_gen_start = time.time()
    with torch.no_grad():
        scene_codes = model([img], device=device)
    print(f"Forward pass completed in {time.time() - t_gen_start:.2f}s")

    print("Extracting mesh at mc_resolution=256...")
    t_mesh_start = time.time()
    meshes = model.extract_mesh(scene_codes, True, resolution=256)
    mesh = meshes[0]
    gen_duration = time.time() - t_gen_start
    print(f"Mesh extracted in {time.time() - t_mesh_start:.2f}s! Total generation time: {gen_duration:.2f}s")
    print(f"Vertices: {len(mesh.vertices)}, Faces: {len(mesh.faces)}")

    out_glb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs", "test_chair.glb")
    os.makedirs(os.path.dirname(out_glb_path), exist_ok=True)
    mesh.export(out_glb_path)
    file_size_kb = os.path.getsize(out_glb_path) / 1024
    print(f"GLB exported to: {out_glb_path} ({file_size_kb:.2f} KB)")
    print("SUCCESS: Full Image -> 3D -> GLB test completed!")

if __name__ == "__main__":
    test_inference()

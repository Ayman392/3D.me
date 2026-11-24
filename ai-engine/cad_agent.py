"""
cad_agent.py - Autonomous AI CadQuery Design Agent (Phase 4)

Manages the autonomous design loop:
1. BRIEF: Analyzes prompt, components, photo analysis, and identifies missing measurements.
2. CODE: Generates free-form CadQuery code utilizing cad_kit primitives.
3. RUN: Executes in safe subprocess sandbox with timeout.
4. VALIDATE: Runs deterministic validators for solidity, fit, interference, walls, bed, and alignment.
5. RENDER & CRITIQUE: Offscreen multi-view renders and vision qualitative critique.
6. FIX: Auto-repairs errors and validator issues over up to 5 iterations.
7. Saves iteration history and produces a plain-English log.
"""

import os
import math
import re
import json
import time
import uuid
import logging
from typing import Dict, Any, List, Tuple, Optional
import httpx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np
import trimesh
import cadquery as cq

import cad_kit
import cad_sandbox
import cad_validate

logger = logging.getLogger("3dme.cad.agent")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_CODE_MODEL = os.environ.get("OLLAMA_CODE_MODEL", "qwen2.5-coder:7b")
OLLAMA_VISION_MODEL = os.environ.get("OLLAMA_VISION_MODEL", "qwen2.5vl:7b")

OUTPUTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
PROJECTS_DIR = os.path.join(OUTPUTS_DIR, "projects")
os.makedirs(PROJECTS_DIR, exist_ok=True)

# In-memory agent jobs tracking
agent_jobs: Dict[str, Dict[str, Any]] = {}


def call_code_llm(
    prompt: str,
    system_prompt: str,
    provider: str = "ollama",
    api_key: Optional[str] = None,
) -> str:
    """
    Invokes the local Qwen2.5-Coder model via Ollama.
    Enforces keep_alive=0 on Ollama so memory unloads immediately.
    """
    url = f"{OLLAMA_HOST}/api/chat"
    payload = {
        "model": OLLAMA_CODE_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "keep_alive": 0,
    }
    try:
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code == 404:
                raise RuntimeError(
                    f"Ollama model '{OLLAMA_CODE_MODEL}' is not installed. Run 'ollama pull {OLLAMA_CODE_MODEL}'"
                )
            if resp.status_code != 200:
                raise RuntimeError(f"Ollama HTTP {resp.status_code}: {resp.text}")
            data = resp.json()
            return data["message"]["content"]
    except httpx.ConnectError:
        raise RuntimeError(
            f"Cannot connect to local Ollama at {OLLAMA_HOST}. Ensure Ollama is running ('ollama serve')."
        )


def call_vision_critique(
    prompt: str,
    image_paths: List[str],
    provider: str = "ollama",
    api_key: Optional[str] = None,
    send_images: bool = True,
) -> str:
    """
    Asks local vision model (qwen2.5vl:7b) for QUALITATIVE differences between reference and generated renders.
    Instructs the model to never output numerical dimensions.
    """
    if not send_images or not image_paths:
        return "No image comparison requested."

    import base64
    b64_images = []
    for p in image_paths:
        if os.path.exists(p):
            with open(p, "rb") as f:
                b64_images.append(base64.b64encode(f.read()).decode("utf-8"))

    if not b64_images:
        return "No render images available for critique."

    sys_p = (
        "You are a CAD quality inspector comparing a generated 3D model render to the user's reference photo. "
        "List ONLY QUALITATIVE differences: missing features (e.g. 'ears are missing', 'hole at bottom is absent'), "
        "wrong general shapes or misplaced cutouts. NEVER mention or invent numerical measurements or dimensions."
    )

    payload = {
        "model": OLLAMA_VISION_MODEL,
        "messages": [
            {"role": "system", "content": sys_p},
            {"role": "user", "content": prompt, "images": b64_images},
        ],
        "stream": False,
        "keep_alive": 0,
    }
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
            if resp.status_code == 200:
                return resp.json()["message"]["content"]
            return "Vision critique skipped."
    except Exception as e:
        logger.debug(f"Ollama vision critique skipped: {e}")
        return "Vision critique skipped."


def extract_python_code(llm_output: str) -> str:
    """Extracts Python code enclosed in markdown triple backticks."""
    match = re.search(r"```python\s*(.*?)\s*```", llm_output, re.DOTALL)
    if match:
        return match.group(1).strip()
    match_any = re.search(r"```\s*(.*?)\s*```", llm_output, re.DOTALL)
    if match_any:
        return match_any.group(1).strip()
    return llm_output.strip()


def render_offscreen_views(
    stl_paths: Dict[str, str],
    output_dir: str,
) -> Dict[str, str]:
    """
    Renders offscreen isometric, front, and side views using Matplotlib on macOS ARM64.
    Returns dictionary mapping view names to PNG file paths.
    """
    rendered_views = {}
    if not stl_paths:
        return rendered_views

    # Load all parts into one scene for rendering
    combined_mesh = trimesh.Trimesh()
    for name, path in stl_paths.items():
        if os.path.exists(path):
            try:
                sub = trimesh.load(path, force="mesh")
                combined_mesh = trimesh.util.concatenate([combined_mesh, sub])
            except Exception:
                pass

    if len(combined_mesh.faces) == 0:
        return rendered_views

    # Downsample triangles if mesh is dense for instantaneous rendering
    max_faces = 2000
    stride = max(1, len(combined_mesh.faces) // max_faces)
    faces_subset = combined_mesh.faces[::stride]
    verts_subset = combined_mesh.vertices[faces_subset]

    views = {
        "iso": (25, 45),
        "front": (0, 90),
        "side": (0, 0),
        "top": (90, -90),
    }

    scale = combined_mesh.vertices.flatten()

    for view_name, (elev, azim) in views.items():
        img_path = os.path.join(output_dir, f"render_{view_name}.png")
        fig = plt.figure(figsize=(5, 5), facecolor="#0b0c0f")
        ax = fig.add_subplot(111, projection="3d")
        ax.set_facecolor("#0b0c0f")
        ax.axis("off")

        poly = Poly3DCollection(
            verts_subset,
            alpha=0.92,
            facecolor="#242834",
            edgecolor="#ff7700",
            linewidths=0.25,
        )
        ax.add_collection3d(poly)
        ax.auto_scale_xyz(scale, scale, scale)
        ax.view_init(elev=elev, azim=azim)

        plt.savefig(img_path, bbox_inches="tight", pad_inches=0.05, dpi=90)
        plt.close(fig)
        rendered_views[view_name] = img_path

    return rendered_views


def generate_design_brief(
    prompt: str,
    components: Optional[List[Dict[str, Any]]] = None,
    user_measurements: Optional[Dict[str, float]] = None,
    photo_features: Optional[List[str]] = None,
    provider: str = "ollama",
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Step 1: BRIEF
    Analyzes prompt and user inputs to produce a structured design brief.
    Identifies any missing measurements that the user must take with calipers.
    """
    user_meas = user_measurements or {}
    comps = components or []
    features_desc = ", ".join(photo_features) if photo_features else "None"

    sys_prompt = (
        "You are a mechanical design expert. Given a user request, extract the parts to create, "
        "the embedded components, and determine what measurements are needed. "
        "CRITICAL: If a dimension is missing (e.g. wall thickness, shell dimensions, hole spacing) "
        "and not provided by the user, add it to 'missing_measurements' so the user can verify with calipers. "
        "Output ONLY a valid JSON object with keys:\n"
        "{\n"
        '  "parts": ["head_front", "head_back"],\n'
        '  "dimensions": {"width": 64.0, "height": 50.0, "depth": 50.0, "wall": 2.0, "corner_radius": 8.0},\n'
        '  "features": ["front window", "two cone ears", "bottom hole"],\n'
        '  "missing_measurements": [\n'
        '    {"key": "wall_thickness", "label": "Wall Thickness", "hint": "Measure shell wall in mm", "default": 2.0}\n'
        "  ]\n"
        "}"
    )

    user_content = (
        f"User Prompt: {prompt}\n"
        f"Components in library: {[c.get('name') for c in comps]}\n"
        f"User-typed measurements: {json.dumps(user_meas)}\n"
        f"Photo features: {features_desc}\n"
    )

    try:
        raw_resp = call_code_llm(user_content, sys_prompt, provider=provider, api_key=api_key)
        # Parse JSON
        clean_json = raw_resp
        match = re.search(r"```json\s*(.*?)\s*```", raw_resp, re.DOTALL)
        if match:
            clean_json = match.group(1).strip()
        brief_data = json.loads(clean_json)
        return brief_data
    except Exception as e:
        logger.warning(f"LLM brief parsing note ({e}), using fallback rule-based brief")
        # Rule-based fallback brief
        return {
            "parts": ["front_shell", "back_shell"],
            "dimensions": {
                "width": user_meas.get("width", 64.0),
                "height": user_meas.get("height", 50.0),
                "depth": user_meas.get("depth", 50.0),
                "wall": user_meas.get("wall", 2.0),
                "corner_radius": user_meas.get("corner_radius", 8.0),
            },
            "features": ["rounded shell", "split halves", "interlocking lip joint"],
            "missing_measurements": []
        }


def generate_cadquery_code(
    brief: Dict[str, Any],
    components: Optional[List[Dict[str, Any]]] = None,
    user_measurements: Optional[Dict[str, float]] = None,
    previous_code: Optional[str] = None,
    feedback: Optional[str] = None,
    provider: str = "ollama",
    api_key: Optional[str] = None,
) -> str:
    """
    Step 2 & 6: CODE / FIX
    Generates Python CadQuery code using cad_kit primitives.
    Applies exact user numbers and addresses previous feedback/errors.
    """
    sys_prompt = (
        "You are an expert CadQuery engineer. Write safe, pure CadQuery code defining 3D printable parts.\n"
        "You have access to the pre-tested 'cad_kit' library:\n"
        "- cad_kit.rounded_shell(outer=(w, d, h), wall=2.0, radius=8.0) -> hollow shell\n"
        "- cad_kit.split_shell(shell, axis='y', lip_clearance=0.2) -> (front_half, back_half)\n"
        "- cad_kit.window(target, face='>Y', w=34, h=22, radius=1.0, x=0, z=2) -> shell with cut\n"
        "- cad_kit.display_pocket(target, display_size=(38,12,4), active_area=(25,14), ledge=1.5, offset_x=0, offset_z=0)\n"
        "- cad_kit.standoffs(points=[(-15,-10),(15,-10),...], post_d=6.0, pilot_d=2.4, height=6.0)\n"
        "- cad_kit.screw_boss(position=(x,y,z), screw='M3', height=8.0)\n"
        "- cad_kit.peg_socket(peg_d=5.0, clearance=0.2, peg_length=8.0) -> (peg, socket)\n"
        "- cad_kit.cable_hole(target, d=12.0, face='<Z', position=(x,y))\n"
        "- cad_kit.vent_slots(target, face='<Y', slot_w=20, slot_h=2, count=4, pitch=4)\n"
        "- cad_kit.cone_appendage(target=None, base_r=7, tip_r=1, height=16, position=(18,0,23), mirror=True)\n"
        "- cad_kit.capsule_appendage(target=None, radius=5, length=18, position=(30,0,-6), rotation=(0,75,0), mirror=True)\n"
        "- cad_kit.ball_appendage(target=None, radius=6, position=(x,y,z), mirror=True)\n"
        "- cad_kit.ellipsoid_shell(radii=(rx, ry, rz), wall=2.0)\n"
        "- cad_kit.neck_collar(outer_d=32, inner_d=20, height=8, lip_h=2)\n\n"
        "MANDATORY RULES:\n"
        "1. MUST define 'parts = {\"part_name\": cq_solid, ...}' at module scope.\n"
        "2. ONLY import 'cadquery as cq', 'math', and 'cad_kit'. No other imports.\n"
        "3. Every dimension typed by the user MUST be used EXACTLY as specified.\n"
        "4. Appendages (ears, arms) MUST be attached to the exterior wall and must NEVER protrude into the hollow interior cavity.\n"
        "5. Output ONLY clean Python code enclosed in ```python ... ```."
    )

    prompt = (
        f"Design Brief: {json.dumps(brief, indent=2)}\n"
        f"Components: {json.dumps(components or [], indent=2)}\n"
        f"User measurements: {json.dumps(user_measurements or {}, indent=2)}\n"
    )

    if previous_code:
        prompt += f"\nPrevious Code:\n```python\n{previous_code}\n```\n"

    if feedback:
        prompt += f"\nFIX FEEDBACK (You must resolve these errors in the revised code):\n{feedback}\n"

    raw_output = call_code_llm(prompt, sys_prompt, provider=provider, api_key=api_key)
    return extract_python_code(raw_output)


def run_design_agent_loop(
    project_id: str,
    prompt: str,
    components: Optional[List[Dict[str, Any]]] = None,
    user_measurements: Optional[Dict[str, float]] = None,
    photo_features: Optional[List[str]] = None,
    provider: str = "ollama",
    api_key: Optional[str] = None,
    max_iterations: int = 5,
    reference_photo_path: Optional[str] = None,
    send_preview_images: bool = False,
    existing_code: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main autonomous agent loop. Runs up to max_iterations (default 5):
    Code -> Sandbox Run -> Deterministic Validation -> Render -> Critique -> Fix.
    Stops early as soon as 0 errors remain.
    """
    job_id = f"des_{uuid.uuid4().hex[:10]}"
    project_dir = os.path.join(PROJECTS_DIR, project_id)
    iter_base_dir = os.path.join(project_dir, "iterations")
    os.makedirs(iter_base_dir, exist_ok=True)

    iteration_log = []
    current_code = existing_code
    best_result = None
    feedback = ""

    # Step 1: Brief
    brief = generate_design_brief(
        prompt=prompt,
        components=components,
        user_measurements=user_measurements,
        photo_features=photo_features,
        provider=provider,
        api_key=api_key,
    )

    missing = brief.get("missing_measurements", [])
    # If there are missing measurements and user hasn't provided them yet
    user_meas = user_measurements or {}
    unresolved_missing = [m for m in missing if m.get("key") not in user_meas]

    if unresolved_missing and not existing_code:
        return {
            "status": "awaiting_measurements",
            "job_id": job_id,
            "project_id": project_id,
            "brief": brief,
            "missing_measurements": unresolved_missing,
            "message": f"Please verify {len(unresolved_missing)} caliper measurement(s) to proceed.",
            "iterations": [],
        }

    for iter_idx in range(1, max_iterations + 1):
        iter_dir = os.path.join(iter_base_dir, f"iter_{iter_idx}")
        os.makedirs(iter_dir, exist_ok=True)

        log_entry = {
            "iteration": iter_idx,
            "status": "running",
            "message": f"Iteration {iter_idx}: Generating CadQuery code...",
            "errors": [],
            "warnings": [],
            "duration_s": 0.0,
        }

        # Step 2: Generate or Revise Code
        t0 = time.time()
        try:
            current_code = generate_cadquery_code(
                brief=brief,
                components=components,
                user_measurements=user_measurements,
                previous_code=current_code,
                feedback=feedback if iter_idx > 1 else None,
                provider=provider,
                api_key=api_key,
            )
        except Exception as e:
            log_entry["status"] = "failed"
            log_entry["message"] = f"Code generation failed: {e}"
            log_entry["errors"].append(str(e))
            iteration_log.append(log_entry)
            break

        # Save script
        script_path = os.path.join(iter_dir, "script.py")
        with open(script_path, "w", encoding="utf-8") as sf:
            sf.write(current_code)

        # Step 3: Run in Sandbox with Qwen2.5-Coder Retry Loop (up to 3 attempts)
        sandbox_success = False
        max_sub_retries = 3
        current_attempt = 1

        while current_attempt <= max_sub_retries:
            log_entry["message"] = f"Iteration {iter_idx} (Attempt {current_attempt}/{max_sub_retries}): Executing code in sandbox..."
            sandbox_res = cad_sandbox.execute_cadquery_script(current_code, output_dir=iter_dir, timeout=60.0)

            if sandbox_res["success"]:
                sandbox_success = True
                break

            err_msg = sandbox_res.get("error", "Unknown execution error")
            tb = sandbox_res.get("traceback", "")
            log_entry["errors"].append(f"Attempt {current_attempt} build error: {err_msg}")

            if current_attempt < max_sub_retries:
                logger.info(f"Sandbox build failed (attempt {current_attempt}), feeding traceback to Qwen2.5-Coder...")
                fix_feedback = (
                    f"Sandboxed execution failed with error:\n{err_msg}\n"
                    f"Traceback:\n{tb}\n"
                    f"Please analyze the traceback, fix the error, and return the complete corrected Python script."
                )
                try:
                    current_code = generate_cadquery_code(
                        brief=brief,
                        components=components,
                        user_measurements=user_measurements,
                        previous_code=current_code,
                        feedback=fix_feedback,
                        provider="ollama",
                    )
                    with open(script_path, "w", encoding="utf-8") as sf:
                        sf.write(current_code)
                except Exception as fix_err:
                    log_entry["errors"].append(f"Retry generation failed: {fix_err}")
                    break
            current_attempt += 1

        if not sandbox_success:
            err_msg = sandbox_res.get("error", "Unknown execution error")
            log_entry["status"] = "syntax_or_runtime_error"
            log_entry["message"] = f"Attempt {iter_idx} failed after {max_sub_retries} retries: {err_msg}"
            iteration_log.append(log_entry)
            continue

        # Step 4: Deterministic Validation
        log_entry["message"] = f"Iteration {iter_idx}: Running deterministic geometric validators..."
        files = sandbox_res.get("files", {})
        metrics = sandbox_res.get("metrics", {})

        # Re-import parts in scope for interference & fit checks
        val_scope = {"cq": cq, "cadquery": cq, "cad_kit": cad_kit, "math": math}
        try:
            exec(current_code, val_scope)
            parts_solids = val_scope.get("parts", {})
        except Exception:
            parts_solids = {}

        stl_paths = {p: f["stl"] for p, f in files.items() if isinstance(f, dict) and "stl" in f}
        val_results = cad_validate.validate_cad_design(
            parts_solids=parts_solids,
            metrics=metrics,
            files=files,
            components=components,
        )

        errors = val_results["errors"]
        warnings = val_results["warnings"]
        log_entry["errors"] = [e["msg"] for e in errors]
        log_entry["warnings"] = [w["msg"] for w in warnings]

        # Step 5: Offscreen Multi-View Rendering
        renders = render_offscreen_views(stl_paths, output_dir=iter_dir)
        log_entry["renders"] = renders

        # Optional qualitative vision critique
        if reference_photo_path and send_preview_images and "iso" in renders:
            critique = call_vision_critique(
                prompt="Compare this 3D render to the reference photo. Point out any missing qualitative features.",
                image_paths=[renders["iso"], reference_photo_path],
                provider=provider,
                api_key=api_key,
                send_images=send_preview_images,
            )
            log_entry["vision_critique"] = critique

        duration = round(time.time() - t0, 2)
        log_entry["duration_s"] = duration

        best_result = {
            "status": "success" if len(errors) == 0 else "needs_fix",
            "iteration": iter_idx,
            "parts": sandbox_res["parts"],
            "files": files,
            "metrics": metrics,
            "code": current_code,
            "validation": val_results,
            "renders": renders,
            "duration_s": duration,
        }

        # Step 6: Check completion condition
        if len(errors) == 0:
            log_entry["status"] = "success"
            log_entry["message"] = f"Iteration {iter_idx}: All checks passed! Solid is watertight and verified."
            iteration_log.append(log_entry)
            break
        else:
            log_entry["status"] = "validation_error"
            log_entry["message"] = f"Iteration {iter_idx}: Found {len(errors)} feasibility error(s). Auto-repairing..."
            feedback = "Feasibility validator errors:\n" + "\n".join(f"- {e['msg']}" for e in errors)
            iteration_log.append(log_entry)

    # Copy latest build files into project root for quick serving
    if best_result and best_result.get("files"):
        for name, p_files in best_result["files"].items():
            if isinstance(p_files, dict):
                for ext, src_path in p_files.items():
                    dst_path = os.path.join(project_dir, os.path.basename(src_path))
                    try:
                        shutil.copy2(src_path, dst_path)
                    except Exception:
                        pass

    final_status = "success" if (best_result and len(best_result["validation"]["errors"]) == 0) else "failed"

    return {
        "status": final_status,
        "job_id": job_id,
        "project_id": project_id,
        "brief": brief,
        "iterations": iteration_log,
        "best_result": best_result,
        "total_iterations": len(iteration_log),
    }

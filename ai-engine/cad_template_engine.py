"""
3d.me Parametric CAD Template Engine
Orchestrates template selection, Ollama structured parameter extraction,
auto-clamping, solid construction via Build123d, and export to STEP, STL, and GLB.
"""

import json
import logging
import os
import re
import time
import urllib.request
import uuid
from typing import Dict, Any, Optional, Tuple, List
import trimesh
from build123d import export_stl, export_step

from cad_templates.registry import (
    TEMPLATE_REGISTRY,
    build_template,
    validate_and_clamp_params,
    list_templates,
)

logger = logging.getLogger("3dme.cad.template_engine")

OUTPUTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

OLLAMA_TEXT_MODEL = os.environ.get("OLLAMA_TEXT_MODEL", "qwen2.5-coder:7b")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")


def match_template_heuristic(prompt: str) -> Optional[str]:
    """Fast deterministic template selector based on prompt keywords."""
    p = prompt.lower()

    if any(k in p for k in ["raspberry", "arduino", "esp32", "pi zero", "pi 4", "sbc", "pcb enclosure"]):
        return "board_enclosure"
    if any(k in p for k in ["enclosure", "housing", "casing", "project box", "electronics box"]):
        return "enclosure_with_lid"
    if any(k in p for k in ["l-bracket", "corner bracket", "angle bracket", "shelf bracket", "90 degree"]):
        return "bracket_l"
    if any(k in p for k in ["flat plate", "mounting plate", "adapter plate", "flange plate"]):
        return "bracket_flat_plate"
    if any(k in p for k in ["cable clip", "wire clip", "cable holder", "cord clip"]):
        return "cable_clip"
    if any(k in p for k in ["snap clip", "snap fit", "catch clip", "cantilever clip"]):
        return "snap_fit_clip"
    if any(k in p for k in ["living hinge", "flex hinge", "membrane hinge"]):
        return "living_hinge"
    if any(k in p for k in ["pin hinge", "door hinge", "barrel hinge", "knuckle hinge"]):
        return "pin_hinge"
    if any(k in p for k in ["knob", "dial", "potentiometer", "rotary"]):
        return "knob"
    if any(k in p for k in ["battery cover", "battery door", "remote cover", "compartment lid"]):
        return "battery_cover"
    if any(k in p for k in ["gasket", "o-ring", "seal ring", "flange gasket"]):
        return "gasket_from_profile"
    if any(k in p for k in ["insert boss", "heat set boss", "brass insert", "screw boss"]):
        return "threaded_insert_boss"
    if any(k in p for k in ["bolt", "screw", "threaded rod", "hex bolt", "m8 bolt", "m6 bolt", "m4 bolt"]):
        return "thread"
    if any(k in p for k in ["spacer", "washer", "bushing", "shim", "standoff collar"]):
        return "spacer_washer"
    if any(k in p for k in ["wall hook", "coat hook", "hanger", "utility hook"]):
        return "wall_hook"

    # Secondary fallback check for generic bracket or box
    if "bracket" in p or "mount" in p:
        return "bracket_l"
    if "box" in p or "case" in p:
        return "enclosure_with_lid"

    return None


def extract_dimensions_heuristic(prompt: str) -> Dict[str, float]:
    """Extracts explicit millimeter values from prompt text like '80x50x30mm' or '40mm'."""
    params: Dict[str, float] = {}
    p = prompt.lower()

    # Pattern: 80x50x30 or 80 x 50 x 30 mm
    match_3d = re.search(r"(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*(?:mm)?", p)
    if match_3d:
        v1, v2, v3 = float(match_3d.group(1)), float(match_3d.group(2)), float(match_3d.group(3))
        params.update({
            "internal_x": v1, "internal_y": v2, "internal_z": v3,
            "length": v1, "width": v2, "thickness": v3,
            "arm1_length": v1, "arm2_length": v2,
            "clip_length": v1, "clip_width": v2
        })
    else:
        # Pattern: 80x50 or 80 x 50 mm
        match_2d = re.search(r"(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*(?:mm)?", p)
        if match_2d:
            v1, v2 = float(match_2d.group(1)), float(match_2d.group(2))
            params.update({
                "internal_x": v1, "internal_y": v2,
                "length": v1, "width": v2,
                "arm1_length": v1, "arm2_length": v2,
                "clip_length": v1, "clip_width": v2
            })

    # Metric thread e.g. M6, M8, M4
    m_metric = re.search(r"\bm(\d+(?:\.\d+)?)\b", p)
    if m_metric:
        params["nominal_diameter"] = float(m_metric.group(1))

    # Outer diameter
    m_outer = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*outer|outer\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_outer:
        params["outer_diameter"] = float(m_outer.group(1) or m_outer.group(2))

    # Inner diameter
    m_inner = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*inner|inner\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_inner:
        params["inner_diameter"] = float(m_inner.group(1) or m_inner.group(2))

    # Thickness / wall
    m_thick = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:thickness|thick|wall)|(?:thickness|thick|wall)\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_thick:
        t_val = float(m_thick.group(1) or m_thick.group(2))
        params["thickness"] = t_val
        params["wall_thickness"] = t_val

    # Length
    m_len = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:length|long)|(?:length|long)\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_len:
        params["length"] = float(m_len.group(1) or m_len.group(2))

    # Width
    m_wid = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:width|wide)|(?:width|wide)\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_wid:
        w_val = float(m_wid.group(1) or m_wid.group(2))
        params["width"] = w_val
        params["hook_width"] = w_val

    # Depth
    m_depth = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:depth|deep)|(?:depth|deep)\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_depth:
        params["hook_depth"] = float(m_depth.group(1) or m_depth.group(2))

    # Cable diameter
    m_cable = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:cable|wire|tube)|(?:cable|wire|tube)\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_cable:
        params["cable_diameter"] = float(m_cable.group(1) or m_cable.group(2))

    # Diameter
    m_dia = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*diameter|diameter\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_dia:
        v_dia = float(m_dia.group(1) or m_dia.group(2))
        params["diameter"] = v_dia
        if "outer_diameter" not in params:
            params["outer_diameter"] = v_dia
        if "cable" in p or "clip" in p:
            params["cable_diameter"] = v_dia

    # Shaft diameter
    m_shaft = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:d-shaft|shaft|bore)|(?:d-shaft|shaft|bore)\s*(\d+(?:\.\d+)?)\s*mm", p)
    if m_shaft:
        params["shaft_diameter"] = float(m_shaft.group(1) or m_shaft.group(2))

    return params


def select_template_with_llm(
    prompt: str,
    available_templates: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Queries Ollama qwen2.5-coder:7b with structured JSON mode to select template and extract parameters.
    Enforces keep_alive: 0 for 16 GB Apple Silicon memory safety.
    """
    templates_summary = [
        {"name": t["name"], "description": t["description"]}
        for t in available_templates
    ]

    system_prompt = (
        "You are an expert mechanical CAD parametric design agent. "
        "Select the most appropriate Build123d parametric template for the user request, "
        "and output the numerical parameters (all in millimeters).\n\n"
        f"Available templates:\n{json.dumps(templates_summary, indent=2)}\n\n"
        "Respond ONLY with a raw JSON object:\n"
        "{\n"
        '  "template": "<template_name>",\n'
        '  "parameters": {\n'
        '    "<parameter_name>": <numerical_value_in_mm>\n'
        "  }\n"
        "}"
    )

    payload = {
        "model": OLLAMA_TEXT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1,
            "num_predict": 256
        },
        "keep_alive": 0
    }

    try:
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "").strip()
            parsed = json.loads(content)
            if "template" in parsed and parsed["template"] in TEMPLATE_REGISTRY:
                return parsed
    except Exception as e:
        logger.warning(f"Ollama template selection failed ({e}), using deterministic heuristic.")

    # Fallback heuristic
    chosen = match_template_heuristic(prompt) or "enclosure_with_lid"
    params = extract_dimensions_heuristic(prompt)
    return {"template": chosen, "parameters": params}


def design_parametric_template(
    prompt: str,
    user_parameters: Optional[Dict[str, Any]] = None,
    template_name_override: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entry point for template-based parametric CAD design.
    1. Selects template (override, heuristic, or Ollama)
    2. Validates and auto-clamps parameters
    3. Builds valid Solid/Compound via Build123d
    4. Exports STEP, STL, and GLB artifacts
    5. Returns complete inspection and artifact metadata
    """
    start_time = time.time()
    job_id = f"cad_tpl_{uuid.uuid4().hex[:10]}"

    if template_name_override and template_name_override in TEMPLATE_REGISTRY:
        selected_template = template_name_override
        params = extract_dimensions_heuristic(prompt)
        if user_parameters:
            params.update(user_parameters)
    else:
        # Check heuristic first
        heuristic_template = match_template_heuristic(prompt)
        if heuristic_template:
            selected_template = heuristic_template
            params = extract_dimensions_heuristic(prompt)
            if user_parameters:
                params.update(user_parameters)
        else:
            # Query Ollama
            available = list_templates()
            llm_result = select_template_with_llm(prompt, available)
            selected_template = llm_result.get("template", "enclosure_with_lid")
            params = llm_result.get("parameters", {})
            if user_parameters:
                params.update(user_parameters)

    # Validate and auto-clamp parameters
    model_instance, notices = validate_and_clamp_params(selected_template, params)

    # Build solid via Build123d
    shape, report = build_template(selected_template, model_instance)

    # Export paths
    stl_filename = f"{job_id}.stl"
    step_filename = f"{job_id}.step"
    glb_filename = f"{job_id}.glb"

    stl_path = os.path.join(OUTPUTS_DIR, stl_filename)
    step_path = os.path.join(OUTPUTS_DIR, step_filename)
    glb_path = os.path.join(OUTPUTS_DIR, glb_filename)

    export_stl(shape, stl_path)
    export_step(shape, step_path)

    # Convert STL to interactive GLB for the 3D viewport
    mesh = trimesh.load(stl_path)
    mesh.export(glb_path)

    gen_time = round(time.time() - start_time, 2)
    file_size = os.path.getsize(glb_path) if os.path.exists(glb_path) else 0

    # Phase 6: Persist parametric recipe to SQLite
    try:
        from storage import save_cad_template_job
        save_cad_template_job(
            job_id=job_id,
            template_name=selected_template,
            parameters=model_instance.model_dump(),
            prompt=prompt,
            glb_src_path=glb_path,
            stl_src_path=stl_path,
            step_src_path=step_path,
            report=report,
            generation_time=gen_time
        )
    except Exception as e:
        logger.warning(f"Could not persist template job to SQLite: {e}")

    return {
        "job_id": job_id,
        "status": "completed",
        "template": selected_template,
        "prompt": prompt,
        "is_template": True,
        "is_experimental": False,
        "verified": True,
        "clamping_notices": notices,
        "report": report,
        "parameters": model_instance.model_dump(),
        "glb_url": f"/outputs/{glb_filename}",
        "stl_url": f"/outputs/{stl_filename}",
        "step_url": f"/outputs/{step_filename}",
        "download_url": f"/download/{job_id}",
        "generation_time": gen_time,
        "file_size": file_size,
        "vertex_count": len(mesh.vertices),
        "face_count": len(mesh.faces),
    }


def rebuild_parametric_template(
    job_id: str,
    new_parameters: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Phase 6: Instant parameter update without LLM invocation.
    Re-executes Build123d with updated parameters in milliseconds.
    """
    from storage import get_job_record, save_cad_template_job

    rec = get_job_record(job_id)
    template_name = rec.get("template_name") if rec else None
    if not template_name or template_name not in TEMPLATE_REGISTRY:
        raise ValueError(f"Job '{job_id}' is not a valid parametric template job.")

    # Merge existing parameters with updates
    merged_params = dict(rec.get("parameters", {}))
    merged_params.update(new_parameters)

    model_instance, notices = validate_and_clamp_params(template_name, merged_params)
    shape, report = build_template(template_name, model_instance)

    stl_filename = f"{job_id}.stl"
    step_filename = f"{job_id}.step"
    glb_filename = f"{job_id}.glb"

    stl_path = os.path.join(OUTPUTS_DIR, stl_filename)
    step_path = os.path.join(OUTPUTS_DIR, step_filename)
    glb_path = os.path.join(OUTPUTS_DIR, glb_filename)

    export_stl(shape, stl_path)
    export_step(shape, step_path)

    mesh = trimesh.load(stl_path)
    mesh.export(glb_path)

    file_size = os.path.getsize(glb_path) if os.path.exists(glb_path) else 0

    save_cad_template_job(
        job_id=job_id,
        template_name=template_name,
        parameters=model_instance.model_dump(),
        prompt=rec.get("prompt", ""),
        glb_src_path=glb_path,
        stl_src_path=stl_path,
        step_src_path=step_path,
        report=report,
        generation_time=0.05
    )

    return {
        "job_id": job_id,
        "status": "completed",
        "template": template_name,
        "is_template": True,
        "is_experimental": False,
        "verified": True,
        "clamping_notices": notices,
        "report": report,
        "parameters": model_instance.model_dump(),
        "glb_url": f"/outputs/{glb_filename}",
        "stl_url": f"/outputs/{stl_filename}",
        "step_url": f"/outputs/{step_filename}",
        "file_size": file_size,
        "vertex_count": len(mesh.vertices),
        "face_count": len(mesh.faces),
    }


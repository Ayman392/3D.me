import copy
import json
import logging
import math
import os
import re
import base64
import threading
import uuid
from typing import Dict, Any, List, Optional, Literal, Union
import httpx
import zipfile
import cadquery as cq
from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator, ConfigDict

import cad_build
import cad_edit
import cad_project
import cad_parts
import cad_robot
import cad_robot_build
import cad_config
import cad_vision
import cad_library
import cad_kit
import cad_sandbox
import cad_validate
import cad_agent
import cad_calibration
from cad_design import BOARDS, get_printer_config, resolve, layout, check, get_presets

logger = logging.getLogger("3dme.cad")

router = APIRouter(prefix="/cad", tags=["cad"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
PRINTER_JSON_PATH = os.path.join(BASE_DIR, "printer.json")

# Dedicated mutex so CAD build and TripoSR inference never run concurrently
cad_lock = threading.Lock()

# ----------------- Models -----------------

class StandoffSpec(BaseModel):
    x: float
    y: float
    hole_d: float = 2.1
    height: float = 4.0

class CutoutSpec(BaseModel):
    face: Literal["front", "back", "left", "right"]
    x: float = 0.0
    z: float = Field(ge=0.0, description="Height above floor in mm")
    w: float = Field(gt=0.0, description="Width along wall in mm")
    h: float = Field(gt=0.0, description="Height in mm")

class WindowSpec(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    face: Literal["front", "back", "left", "right", "top", "bottom"] = "front"
    shape: Literal["rect", "round"] = "rect"
    w: float = Field(default=20.0, gt=0.0)
    h: float = Field(default=15.0, gt=0.0)
    d: Optional[float] = None
    x: float = 0.0
    z: float = 0.0
    corner_radius: float = Field(default=0.0, ge=0.0)

class AppendageSpec(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    type: Literal["cone", "capsule", "ball", "cylinder"] = "cone"
    face: Literal["top", "bottom", "left", "right", "front", "back"] = "top"
    x: float = 0.0
    z: float = 0.0
    y: float = 0.0
    base_d: float = Field(default=12.0, gt=0.0)
    tip_d: float = Field(default=3.0, ge=0.0)
    length: float = Field(default=20.0, ge=0.0)
    tilt_deg: float = 0.0
    mirror: bool = False
    ball_tip: bool = False
    ball_d: float = 8.0
    fillet: float = 1.0

class BodySpec(BaseModel):
    shape: str = "rounded_box"
    corner_radius: float = Field(default=12.0, ge=0.0)

class CadSpec(BaseModel):
    model_config = ConfigDict(extra="allow")

    mode: Optional[str] = "enclosure"
    part_type: Optional[str] = None
    measurements: Optional[Dict[str, Any]] = None
    features: Optional[List[Dict[str, Any]]] = None
    inner: Optional[List[float]] = None
    wall: float = Field(default=2.4, ge=0.4, le=10.0)
    corner_radius: float = Field(default=12.0, ge=0.0, le=40.0)
    body: Optional[BodySpec] = None
    split: str = Field(default="back")
    standoffs: List[StandoffSpec] = Field(default_factory=list)
    cutouts: List[CutoutSpec] = Field(default_factory=list)
    windows: List[WindowSpec] = Field(default_factory=list)
    appendages: List[AppendageSpec] = Field(default_factory=list)
    components: Optional[List[Any]] = Field(default_factory=list)
    project_id: Optional[str] = None
    overall_height_mm: Optional[float] = None
    parts: Optional[List[Dict[str, Any]]] = None
    joints: Optional[List[Dict[str, Any]]] = None
    print: Optional[Dict[str, Any]] = None

    @field_validator("inner")
    @classmethod
    def validate_inner(cls, v: Optional[List[float]]) -> Optional[List[float]]:
        if v is None:
            return v
        for dim in v:
            if dim <= 0.0:
                raise ValueError("Inner dimensions must be positive")
            if dim > 400.0:
                raise ValueError(f"Inner dimension {dim} mm exceeds the 400 mm limit")
        return v

class DesignRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    mode: Optional[str] = None
    project_id: Optional[str] = None
    scale_source: Optional[str] = None
    dimensions_confirmed: bool = False
    measurements: Optional[Dict[str, float]] = None

class InspectRequest(BaseModel):
    prompt: Optional[str] = ""
    template: Optional[str] = None
    parameters: Optional[Dict[str, float]] = None
    image_base64: Optional[str] = None
    reference_object: Optional[str] = None
    caliper_measurements: Optional[Dict[str, float]] = None
    scale_confirmed: bool = False

class EditRequest(BaseModel):
    prompt: Optional[str] = None
    ops: Optional[List[Dict[str, Any]]] = None
    explanation: Optional[str] = None
    project_id: Optional[str] = None

class BuildRequest(BaseModel):
    spec: Optional[Dict[str, Any]] = None
    project_id: Optional[str] = None

class SessionCreateRequest(BaseModel):
    prompt: Optional[str] = None
    spec: Optional[Dict[str, Any]] = None
    mode: Optional[str] = None
    project_id: Optional[str] = None

class ProjectCreateRequest(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = "Untitled Project"
    spec: Optional[Dict[str, Any]] = None
    version_history: Optional[List[Dict[str, Any]]] = None

class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    spec: Optional[Dict[str, Any]] = None
    version_history: Optional[List[Dict[str, Any]]] = None
    last_build_id: Optional[str] = None

class ThumbnailRequest(BaseModel):
    image_base64: str

class PrinterConfig(BaseModel):
    bed: List[float] = Field(..., min_length=3, max_length=3)
    nozzle: float = Field(default=0.4, gt=0.0)

# Helper: Call local Ollama
def _call_ollama(system_prompt: str, user_prompt: str, timeout: float = 60.0) -> Dict[str, Any]:
    ollama_url = cad_config.OLLAMA_CHAT_ENDPOINT
    payload = {
        "model": cad_config.OLLAMA_TEXT_MODEL,
        "stream": False,
        "keep_alive": 0,
        "format": "json",
        "options": {
            "num_predict": 384,
            "temperature": 0.1,
        },
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    }
    try:
        with httpx.Client(timeout=timeout) as client:
            res = client.post(ollama_url, json=payload)
            if res.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Ollama returned HTTP {res.status_code}: {res.text}"
                )
            return res.json()
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.NetworkError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Ollama is unreachable at {ollama_url}. Please ensure Ollama is installed and running ('ollama serve'). Model: {cad_config.OLLAMA_TEXT_MODEL}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with local Ollama: {e}"
        )

def _clean_json_str(s: str) -> str:
    s = s.strip()
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1:
        return s[start:end+1]
    return s

# ----------------- Endpoints -----------------

@router.get("/boards")
def get_boards():
    """Returns component library names, sizes, screens, and specs (backward-compatible view)."""
    boards_dict = cad_library.get_boards_dict()
    return [
        {
            "key": k,
            "id": v.get("id", k),
            "name": v["name"],
            "size": v["size"],
            "pilot": v.get("pilot", 2.1),
            "holes": v.get("holes", []),
            "screen": v.get("screen"),
            "note": v.get("note"),
            "category": v.get("category", "board"),
            "source": v.get("source", "approximate"),
        }
        for k, v in boards_dict.items()
    ]

@router.get("/library")
def list_library_components(search: Optional[str] = None, category: Optional[str] = None):
    """Lists components from the part library with optional search and category filters."""
    return cad_library.list_components(search=search, category=category)

@router.post("/library", status_code=status.HTTP_201_CREATED)
def create_library_component(item: cad_library.ComponentItem):
    """Adds a new component to the library with validation and atomic write."""
    try:
        return cad_library.add_component(item)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.put("/library/{comp_id}")
def update_library_component(comp_id: str, item: cad_library.ComponentItem):
    """Updates an existing library component."""
    try:
        return cad_library.update_component(comp_id, item)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/library/{comp_id}")
def delete_library_component(comp_id: str):
    """Deletes a component from the library."""
    try:
        cad_library.delete_component(comp_id)
        return {"status": "deleted", "id": comp_id}
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/library/import")
async def import_library(request: Request):
    """Imports components from a JSON file (multipart) or JSON payload and merges them into the library."""
    content_type = request.headers.get("content-type", "")
    raw_items = []
    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if file and hasattr(file, "read"):
            try:
                content = await file.read()
                raw_items = json.loads(content.decode("utf-8"))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid JSON file: {e}")
        else:
            raise HTTPException(status_code=400, detail="No file uploaded.")
    else:
        try:
            body = await request.json()
            if isinstance(body, list):
                raw_items = body
            elif isinstance(body, dict) and "items" in body:
                raw_items = body["items"]
            else:
                raise HTTPException(status_code=400, detail="JSON payload must be a list or have an 'items' array.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}")

    if not isinstance(raw_items, list):
        raise HTTPException(status_code=400, detail="Import payload must be a JSON array of components.")

    try:
        res = cad_library.import_components(raw_items)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {e}")

@router.get("/library/export")
def export_library():
    """Exports all library components as a JSON array."""
    components = cad_library.export_components()
    return JSONResponse(
        content=components,
        headers={"Content-Disposition": 'attachment; filename="components.json"'}
    )

@router.get("/printer")
def get_printer():
    """Reads current 3D printer settings from printer.json."""
    return get_printer_config(PRINTER_JSON_PATH)

@router.put("/printer")
def update_printer(config: PrinterConfig):
    """Updates 3D printer bed size and nozzle in printer.json."""
    data = config.model_dump()
    try:
        with open(PRINTER_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return data
    except Exception as e:
        logger.error(f"Failed to update printer config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not write printer.json: {e}"
        )

class TemplateDesignRequest(BaseModel):
    prompt: str = ""
    template: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    project_id: Optional[str] = None

@router.get("/templates")
def get_cad_templates():
    """Returns all available Build123d parametric CAD templates with schemas."""
    from cad_templates.registry import list_templates
    return list_templates()

@router.post("/template/design")
def design_cad_template(req: TemplateDesignRequest):
    """
    Parametric CAD template design endpoint.
    Uses Build123d to construct verified solids, clamping parameters and exporting STEP, STL, and GLB.
    """
    from cad_template_engine import design_parametric_template
    with cad_lock:
        try:
            result = design_parametric_template(
                prompt=req.prompt,
                user_parameters=req.parameters,
                template_name_override=req.template
            )
            return result
        except Exception as e:
            logger.exception("Template CAD design failed")
            raise HTTPException(status_code=400, detail=str(e))

class RebuildParamsRequest(BaseModel):
    parameters: Dict[str, Any]

@router.put("/jobs/{job_id}/params")
@router.post("/jobs/{job_id}/rebuild")
def update_job_params_endpoint(job_id: str, req: RebuildParamsRequest):
    """
    Phase 6: Instant parameter update without LLM invocation.
    Re-executes Build123d with updated parameters in milliseconds.
    """
    from cad_template_engine import rebuild_parametric_template
    with cad_lock:
        try:
            return rebuild_parametric_template(job_id, req.parameters)
        except Exception as e:
            logger.exception("Rebuild failed")
            raise HTTPException(status_code=400, detail=str(e))

@router.get("/jobs/{job_id}/export/step")
def export_step_endpoint(job_id: str):
    """Phase 6: First-class STEP file export for FreeCAD, Fusion 360, SolidWorks."""
    from storage import get_job_record, MODELS_DIR
    rec = get_job_record(job_id)
    step_fn = rec.get("step_filename") if rec else f"{job_id}.step"
    path = os.path.join(MODELS_DIR, step_fn)
    if not os.path.exists(path):
        path = os.path.join(OUTPUTS_DIR, f"{job_id}.step")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="STEP file not found for this job.")
    return FileResponse(path, media_type="application/step", filename=f"{job_id}.step")

@router.get("/jobs/{job_id}/export/stl")
def export_stl_endpoint(job_id: str):
    from storage import get_job_record, MODELS_DIR
    rec = get_job_record(job_id)
    stl_fn = rec.get("stl_filename") if rec else f"{job_id}.stl"
    path = os.path.join(MODELS_DIR, stl_fn)
    if not os.path.exists(path):
        path = os.path.join(OUTPUTS_DIR, f"{job_id}.stl")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="STL file not found for this job.")
    return FileResponse(path, media_type="model/stl", filename=f"{job_id}.stl")

@router.post("/inspect")
def inspect_dimensions_endpoint(req: InspectRequest):
    """
    Phase 2: Inspects proposed dimensions and requires confirmation.
    Returns dimension table with confidence and source tags (measured / estimated / user).
    """
    import base64
    from cad_measure import detect_reference_scale, build_dimension_confirmation_table
    from cad_template_engine import match_template_heuristic, extract_dimensions_heuristic

    scale_source = "unconfirmed"
    px_scale = None

    if req.caliper_measurements and len(req.caliper_measurements) > 0:
        scale_source = "caliper"
    elif req.image_base64:
        try:
            b64_clean = req.image_base64.split(",")[-1]
            img_bytes = base64.b64decode(b64_clean)
            px_scale, detected_ref, conf = detect_reference_scale(
                img_bytes, reference_type=req.reference_object or "credit_card"
            )
            if px_scale and px_scale > 0:
                scale_source = detected_ref
        except Exception as e:
            logger.warning(f"Could not process inspection image: {e}")
    elif req.scale_confirmed:
        scale_source = "manual_spec"

    template = req.template or match_template_heuristic(req.prompt or "") or "enclosure_with_lid"
    params = extract_dimensions_heuristic(req.prompt or "")
    if req.parameters:
        params.update(req.parameters)
    if req.caliper_measurements:
        params.update(req.caliper_measurements)

    result = build_dimension_confirmation_table(
        template_name=template,
        raw_parameters=params,
        scale_source=scale_source,
        px_per_mm=px_scale,
        user_confirmed=req.scale_confirmed
    )
    return result

class TraceRequest(BaseModel):
    image_base64: str
    thickness_mm: float = 3.0
    simplify_tolerance_mm: float = 0.25

@router.post("/trace")
def trace_part_endpoint(req: TraceRequest):
    """
    Phase 3: Trace-a-flat-part mode.
    Converts a photo of a flat part on A4 paper into an accurate 3D model,
    with 1:1 printable SVG and DXF outline export.
    """
    import base64
    from cad_trace import trace_flat_part
    with cad_lock:
        try:
            b64_clean = req.image_base64.split(",")[-1]
            img_bytes = base64.b64decode(b64_clean)
            result = trace_flat_part(
                image_bytes=img_bytes,
                thickness_mm=req.thickness_mm,
                simplify_tolerance_mm=req.simplify_tolerance_mm
            )
            return result
        except Exception as e:
            logger.exception("Trace flat part failed")
            raise HTTPException(status_code=400, detail=str(e))

@router.post("/design")
def design_case(req: DesignRequest):
    """
    Parses character-shell, classic case, or replacement part prompt using Ollama (qwen2.5-coder:7b).
    Computes dimensions and geometry deterministically.
    """
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    # Phase 2: Mandatory scale check for functional CAD
    has_trusted_scale = (
        req.dimensions_confirmed is True
        or (req.scale_source in ["caliper", "reference_object", "aruco", "credit_card", "a4", "manual_spec"])
        or (req.measurements and len(req.measurements) > 0)
        or (bool(re.search(r"\b\d+(\.\d+)?\s*(mm|cm)\b", req.prompt)))
    )
    if not has_trusted_scale:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Design rejected: required dimensions are unconfirmed. Scale is mandatory for functional parts. Confirm dimensions via /cad/inspect first."
        )

    lower_prompt = req.prompt.lower()
    part_keywords = ["bracket", "spacer", "standoff", "mounting plate", "clip", "ring", "plate"]
    is_part = (req.mode == "part") or (
        any(k in lower_prompt for k in part_keywords) and not any(k in lower_prompt for k in ["head case", "cat-style", "robot head", "raspberry pi", "esp32", "arduino"])
    )

    if is_part:
        system_prompt = (
            "You are an expert mechanical replacement part CAD designer. Given a user prompt (e.g. 'bracket 40 x 25 x 3 mm with 2 M3 holes 30 mm apart'), "
            "return ONLY a JSON object matching this schema:\n"
            "{\n"
            '  "mode": "part",\n'
            '  "part_type": "bracket",\n'
            '  "measurements": {"leg1": 40.0, "leg2": 25.0, "width": 25.0, "thickness": 3.0, "fillet": 2.0},\n'
            '  "features": [\n'
            '    {"type": "linear_pattern", "count": 2, "pitch": 30.0, "d": 3.4, "leg": "leg1"}\n'
            '  ]\n'
            "}\n"
            "Rules:\n"
            "- Available part types: 'bracket', 'plate', 'spacer', 'mounting_plate', 'clip'.\n"
            "- Bracket measurements: leg1, leg2, width, thickness, fillet.\n"
            "- Plate / Mounting plate measurements: length, width, thickness.\n"
            "- Spacer / Standoff measurements: outer_d, inner_d, height.\n"
            "- Clip / Ring measurements: inner_d, outer_d, height, gap.\n"
            "- Always extract exact user-provided numbers.\n"
            "- Return ONLY valid JSON."
        )
    else:
        system_prompt = (
            "You are an expert character-shell CAD designer. Given a user prompt (e.g., 'cat-style head case for an ESP32 and a 0.96in OLED, big window for the screen, stubby arms, small hole at the bottom front'), "
            "return ONLY a JSON object matching this schema:\n"
            "{\n"
            '  "components": ["esp32 devkit", "0.96in oled ssd1306"],\n'
            '  "split": "back",\n'
            '  "wall": 2.4,\n'
            '  "presets": ["cat ears", "stubby arms"],\n'
            '  "windows": [\n'
            '    {"id": "screen_win", "face": "front", "shape": "rect", "w": 40.0, "h": 25.0, "x": 0.0, "z": 0.0, "corner_radius": 4.0},\n'
            '    {"id": "mouth_hole", "face": "front", "shape": "round", "w": 3.0, "h": 3.0, "x": 0.0, "z": -10.0}\n'
            '  ],\n'
            '  "appendages": []\n'
            "}\n"
            "Rules:\n"
            "- Available component names: 'raspberry pi 4b', 'raspberry pi zero 2w', 'arduino uno', 'esp32 devkit', '0.96in oled ssd1306', 'sg90 servo'.\n"
            "- Available presets: 'cat ears', 'stubby arms', 'antenna', 'feet'. Put requested presets in 'presets'.\n"
            "- Leave 'appendages' as [] if covered by presets. Only add custom appendages if not covered by presets.\n"
            "- Window shape: 'rect' or 'round'.\n"
            "- Return ONLY valid JSON."
        )

    data = _call_ollama(system_prompt, req.prompt)
    content = data.get("message", {}).get("content", "")
    try:
        parsed = json.loads(_clean_json_str(content))
    except Exception:
        # Retry once on invalid JSON
        logger.warning(f"Ollama returned invalid JSON, retrying once. Content: {content}")
        data = _call_ollama(system_prompt, req.prompt)
        content = data.get("message", {}).get("content", "")
        try:
            parsed = json.loads(_clean_json_str(content))
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"LLM did not return valid JSON after retry: {e}"
            )

    if is_part or parsed.get("mode") == "part" or parsed.get("part_type"):
        part_type = parsed.get("part_type", "bracket")
        measurements = parsed.get("measurements", {"leg1": 40.0, "leg2": 25.0, "width": 25.0, "thickness": 3.0, "fillet": 2.0})
        features = parsed.get("features", [])
        spec = {
            "mode": "part",
            "part_type": part_type,
            "measurements": measurements,
            "features": features,
            "project_id": req.project_id,
        }
        issues = cad_parts.check_part(spec)
        sess = cad_edit.get_or_create_session(req.session_id, spec, req.prompt)
        return {
            "session_id": sess.session_id,
            "spec": spec,
            "issues": issues,
            "diff_log": sess.diff_log[-5:],
        }

    components = parsed.get("components", ["esp32 devkit"])
    wall = float(parsed.get("wall", 2.4))
    split = parsed.get("split", "back")

    layout_res = layout(components, wall=wall, split=split)
    outer_l = layout_res["inner"][0] + 2 * wall
    outer_w = layout_res["inner"][1] + 2 * wall
    outer_h = layout_res["inner"][2] + 2 * wall

    # Apply any requested presets
    available_presets = get_presets(outer_l, outer_w, outer_h)
    req_presets = parsed.get("presets", [])
    for p_name in req_presets:
        p_clean = p_name.lower().strip()
        for pk, pv in available_presets.items():
            if p_clean in pk or pk in p_clean:
                # check not already added
                if not any(a.get("id") == pv["id"] for a in layout_res["appendages"]):
                    layout_res["appendages"].append(copy.deepcopy(pv))

    # Append direct appendages
    for app in parsed.get("appendages", []):
        if not any(a.get("id") == app.get("id") for a in layout_res["appendages"]):
            layout_res["appendages"].append(app)

    # Append custom windows
    for win in parsed.get("windows", []):
        if not any(w.get("id") == win.get("id") for w in layout_res["windows"]):
            face = win.get("face", "front")
            face_w = outer_l if face in ("front", "back") else outer_w
            face_h = outer_h
            win_w = float(win.get("w", win.get("d", 10.0)))
            win_h = float(win.get("h", win.get("d", 10.0)))
            max_x = max(0.0, face_w / 2.0 - win_w / 2.0 - 2.5)
            max_z = max(0.0, face_h / 2.0 - win_h / 2.0 - 2.5)
            win["x"] = max(-max_x, min(max_x, float(win.get("x", 0.0))))
            win["z"] = max(-max_z, min(max_z, float(win.get("z", 0.0))))
            layout_res["windows"].append(win)

    spec = layout_res
    issues = check(spec)

    # Update or create session if requested
    sess = cad_edit.get_or_create_session(req.session_id, spec, req.prompt)

    return {
        "session_id": sess.session_id,
        "spec": spec,
        "issues": issues,
        "diff_log": sess.diff_log[-5:],
    }

# ----------------- Session Endpoints -----------------

@router.post("/session")
def create_session(req: SessionCreateRequest):
    """Initializes a new CAD session from a prompt, initial spec, or mode."""
    sid = str(uuid.uuid4())
    if req.spec:
        initial_spec = req.spec.model_dump() if hasattr(req.spec, "model_dump") else dict(req.spec)
    elif req.prompt:
        d_res = design_case(DesignRequest(prompt=req.prompt, mode=req.mode, project_id=req.project_id))
        initial_spec = d_res["spec"]
    elif req.mode == "part":
        initial_spec = {
            "mode": "part",
            "part_type": "bracket",
            "measurements": {"leg1": 40.0, "leg2": 25.0, "width": 25.0, "thickness": 3.0, "fillet": 2.0},
            "features": [{"type": "linear_pattern", "count": 2, "pitch": 30.0, "d": 3.4, "leg": "leg1"}],
            "project_id": req.project_id,
        }
    else:
        initial_spec = layout(["esp32 devkit", "0.96in oled ssd1306"])
        if req.project_id:
            initial_spec["project_id"] = req.project_id

    sess = cad_edit.get_or_create_session(sid, initial_spec, req.prompt or "")
    if sess.spec.get("mode") == "robot":
        issues = cad_robot.check_robot(sess.spec)
    elif sess.spec.get("mode") == "part" or sess.spec.get("part_type"):
        issues = cad_parts.check_part(sess.spec)
    else:
        issues = check(sess.spec)

    summary = sess.get_summary()
    summary["issues"] = issues
    return summary

@router.get("/session/{session_id}")
def get_session_status(session_id: str):
    """Retrieves session state, diff log, and version history."""
    sess = cad_edit.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    summary = sess.get_summary()
    if sess.spec.get("mode") == "robot":
        summary["issues"] = cad_robot.check_robot(sess.spec)
    elif sess.spec.get("mode") == "part" or sess.spec.get("part_type"):
        summary["issues"] = cad_parts.check_part(sess.spec)
    else:
        summary["issues"] = check(sess.spec)
    return summary

@router.post("/session/{session_id}/edit")
def edit_session(session_id: str, req: EditRequest):
    """
    Applies incremental natural language edits ('ears 4 mm taller', 'make leg1 50 mm')
    or structured operations atomically to the current session.
    """
    sess = cad_edit.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    ops = req.ops
    explanation = "Applied manual edits"

    # If natural language prompt was provided, translate to ops with Ollama
    if req.prompt and req.prompt.strip():
        if sess.spec.get("mode") == "part" or sess.spec.get("part_type"):
            system_prompt = (
                f"You are an expert mechanical replacement part CAD modifier. Current design: {json.dumps(sess.spec)}.\n"
                "Return ONLY JSON: {\"ops\": [...], \"explanation\": \"one sentence summary\"}.\n"
                "Supported ops:\n"
                "- {\"op\": \"set_measurement\", \"key\": \"leg1\", \"d_val\": 10.0} (e.g. 'make leg1 10 mm longer')\n"
                "- {\"op\": \"set_measurement\", \"key\": \"leg1\", \"value\": 50.0} (e.g. 'make leg1 50 mm')\n"
                "- {\"op\": \"set_measurement\", \"key\": \"width\", \"value\": 30.0}\n"
                "- {\"op\": \"set_measurement\", \"key\": \"thickness\", \"value\": 4.0}\n"
                "- {\"op\": \"set_pattern\", \"d_pitch\": 5.0} (e.g. 'holes 5 mm further apart')\n"
                "- {\"op\": \"set_pattern\", \"pitch\": 35.0} (e.g. 'holes 35 mm apart')\n"
                "- {\"op\": \"set_pattern\", \"d\": 4.5} (e.g. 'make holes M4')\n"
                "- {\"op\": \"set_fillet\", \"fillet\": 3.0}\n"
                "- {\"op\": \"add_hole\", \"d\": 3.4, \"x\": 10.0, \"y\": 0.0}\n"
                "- {\"op\": \"remove_hole\", \"index\": 0}\n"
                "Rules:\n"
                "- Always use exact relative deltas for relative requests.\n"
                "- Return ONLY valid JSON."
            )
        elif sess.spec.get("mode") == "robot":
            current_robot_summary = {
                "overall_height_mm": sess.spec.get("overall_height_mm", 120.0),
                "wall": sess.spec.get("wall", 2.0),
                "parts": [{"kind": p.get("kind"), "w": p.get("w"), "h": p.get("h"), "d": p.get("d"), "length": p.get("length")} for p in sess.spec.get("parts", [])],
                "display": (next((p for p in sess.spec.get("parts", []) if p.get("kind") == "head"), {})).get("display", {}),
            }
            system_prompt = (
                f"You are an expert character robot CAD modifier. Current robot spec: {json.dumps(current_robot_summary)}.\n"
                "Return ONLY JSON: {\"ops\": [...], \"explanation\": \"one sentence summary\"}.\n"
                "Supported ops:\n"
                "- {\"op\": \"set_part\", \"part\": \"head\", \"d_w\": 6.0} (e.g. 'make the head 6 mm wider')\n"
                "- {\"op\": \"set_arm_mode\", \"mode\": \"servo\"} (e.g. 'change arms to servo mount')\n"
                "- {\"op\": \"move_display\", \"dz\": 3.0} (e.g. 'move the display 3 mm up')\n"
                "- {\"op\": \"set_wall\", \"wall\": 2.4} (e.g. 'thicker walls 2.4 mm')\n"
                "- {\"op\": \"set_part\", \"part\": \"body\", \"has_speaker_holes\": true} (e.g. 'add speaker holes to back body')\n"
                "- {\"op\": \"set_overall_height\", \"height\": 140.0} (e.g. 'make robot 140 mm tall')\n"
                "- {\"op\": \"set_part\", \"part\": \"ear_pod\", \"d_length\": 2.0} (e.g. 'longer ear pegs')\n"
                "- {\"op\": \"preset\", \"name\": \"chibi_robot\"}\n"
                "Rules:\n"
                "- Always use exact relative deltas (d_w, d_h, d_d, dx, dz, d_length) for relative requests.\n"
                "- Never invent arbitrary numbers.\n"
                "- Return ONLY valid JSON."
            )
        else:
            current_spec_summary = {
                "inner": sess.spec.get("inner"),
                "wall": sess.spec.get("wall"),
                "corner_radius": sess.spec.get("corner_radius"),
                "windows": [{"id": w.get("id"), "face": w.get("face"), "w": w.get("w"), "h": w.get("h")} for w in sess.spec.get("windows", [])],
                "appendages": [{"id": a.get("id"), "name": a.get("name"), "type": a.get("type"), "face": a.get("face"), "length": a.get("length"), "tilt_deg": a.get("tilt_deg")} for a in sess.spec.get("appendages", [])],
            }

            system_prompt = (
                f"You are an expert character-shell CAD modifier. Current design: {json.dumps(current_spec_summary)}.\n"
                "Return ONLY JSON: {\"ops\": [...], \"explanation\": \"one sentence summary\"}.\n"
                "Supported ops:\n"
                "- {\"op\": \"set_appendage\", \"id\": \"ears\", \"d_length\": 4.0} (e.g. 'ears 4 mm taller')\n"
                "- {\"op\": \"set_appendage\", \"id\": \"arms\", \"d_tilt\": -15.0} (e.g. 'arms tilted down 15 degrees')\n"
                "- {\"op\": \"set_window\", \"id\": \"window_id\", \"d_w\": 6.0} (e.g. 'window 6 mm wider')\n"
                "- {\"op\": \"apply_preset\", \"name\": \"antenna\"} (e.g. 'add antenna on top')\n"
                "- {\"op\": \"add_appendage\", ...}\n"
                "- {\"op\": \"remove_appendage\", \"id\": \"...\"}\n"
                "- {\"op\": \"set_wall\", \"wall\": 2.4}\n"
                "Rules:\n"
                "- Always use exact relative deltas (d_length, d_tilt, d_w, d_h, dx, dz) for relative requests.\n"
                "- Never invent arbitrary absolute dimensions when relative changes are requested.\n"
                "- Return ONLY valid JSON."
            )

        data = _call_ollama(system_prompt, req.prompt)
        content = data.get("message", {}).get("content", "")
        try:
            parsed = json.loads(_clean_json_str(content))
        except Exception:
            data = _call_ollama(system_prompt, req.prompt)
            content = data.get("message", {}).get("content", "")
            try:
                parsed = json.loads(_clean_json_str(content))
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"LLM returned invalid JSON: {e}")

        ops = parsed.get("ops", [])
        explanation = parsed.get("explanation", req.prompt)

    if not ops:
        raise HTTPException(status_code=400, detail="No edit operations could be derived from input.")

    try:
        new_spec, diffs = cad_edit.apply_ops(sess.spec, ops)
    except cad_edit.EditError as ee:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Edit rejected: {ee}"
        )

    ver = sess.push_version(new_spec, diffs, req.prompt or explanation)
    if new_spec.get("mode") == "part" or new_spec.get("part_type"):
        issues = cad_parts.check_part(new_spec)
    else:
        issues = check(new_spec)

    summary = sess.get_summary()
    summary["issues"] = issues
    summary["diff"] = diffs
    summary["explanation"] = explanation
    return summary

@router.post("/session/{session_id}/undo")
def undo_session(session_id: str):
    sess = cad_edit.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        new_spec, msg = sess.undo()
    except cad_edit.EditError as ee:
        raise HTTPException(status_code=400, detail=str(ee))
    summary = sess.get_summary()
    if new_spec.get("mode") == "part" or new_spec.get("part_type"):
        summary["issues"] = cad_parts.check_part(new_spec)
    else:
        summary["issues"] = check(new_spec)
    summary["message"] = msg
    return summary

@router.post("/session/{session_id}/redo")
def redo_session(session_id: str):
    sess = cad_edit.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        new_spec, msg = sess.redo()
    except cad_edit.EditError as ee:
        raise HTTPException(status_code=400, detail=str(ee))
    summary = sess.get_summary()
    if new_spec.get("mode") == "part" or new_spec.get("part_type"):
        summary["issues"] = cad_parts.check_part(new_spec)
    else:
        summary["issues"] = check(new_spec)
    summary["message"] = msg
    return summary

@router.post("/session/{session_id}/reset")
def reset_session(session_id: str):
    sess = cad_edit.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    new_spec, msg = sess.reset()
    summary = sess.get_summary()
    if new_spec.get("mode") == "part" or new_spec.get("part_type"):
        summary["issues"] = cad_parts.check_part(new_spec)
    else:
        summary["issues"] = check(new_spec)
    summary["message"] = msg
    return summary

@router.post("/check")
def check_spec(spec: Union[CadSpec, Dict[str, Any]]):
    """Evaluates feasibility check rules without building."""
    spec_dict = spec.model_dump() if hasattr(spec, "model_dump") else dict(spec)
    if spec_dict.get("mode") == "part" or spec_dict.get("part_type"):
        issues = cad_parts.check_part(spec_dict)
    else:
        issues = check(spec_dict)
    return {"issues": issues}

@router.post("/build")
def build_case(body: Union[CadSpec, BuildRequest]):
    """
    Validates feasibility. If errors exist -> 422.
    Otherwise builds front shell and back cover (or single part) under lock, exports STEP/STL/GLB.
    """
    project_id = None
    if isinstance(body, BuildRequest):
        project_id = body.project_id
        if body.spec:
            spec_dict = body.spec.model_dump() if hasattr(body.spec, "model_dump") else dict(body.spec)
        else:
            spec_dict = {}
    elif hasattr(body, "model_dump"):
        spec_dict = body.model_dump()
        project_id = getattr(body, "project_id", None)
    else:
        spec_dict = dict(body)
        project_id = spec_dict.get("project_id")

    if spec_dict.get("mode") == "part" or spec_dict.get("part_type"):
        issues = cad_parts.check_part(spec_dict)
    else:
        issues = check(spec_dict)

    errors = [i for i in issues if i.get("level") == "error"]
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Cannot build CAD model with error-level feasibility issues.",
                "issues": issues,
                "errors": errors,
            }
        )

    build_id = str(uuid.uuid4())
    out_dir = os.path.join(OUTPUTS_DIR, "cad", build_id)
    os.makedirs(out_dir, exist_ok=True)

    with cad_lock:
        try:
            if spec_dict.get("mode") == "robot":
                import cad_robot_build
                exported = cad_robot_build.export_robot_spec(spec_dict, out_dir)
            else:
                base, lid = cad_build.build(spec_dict)
                inner_h = spec_dict.get("inner", [0, 0, 10])[2] if spec_dict.get("inner") else 10.0
                wall = spec_dict.get("wall", 2.0)
                exported = cad_build.export_all(
                    base=base,
                    lid=lid,
                    out_dir=out_dir,
                    inner_h=inner_h,
                    wall=wall,
                    spec=spec_dict,
                )
        except Exception as e:
            logger.error(f"CAD generation failed for {build_id}: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"CAD model construction failed: {e}"
            )

    files = {}
    for k, v in exported.items():
        if v:
            fname = os.path.basename(v)
            files[k] = f"/cad/{build_id}/{fname}"

    if project_id:
        try:
            cad_project.attach_build_files(project_id, build_id, exported)
        except Exception as e:
            logger.warning(f"Could not attach build files to project {project_id}: {e}")

    return {
        "id": build_id,
        "issues": issues,
        "files": files,
    }

# ----------------- Photo-to-Part Endpoints -----------------

@router.post("/analyze-photo", response_model=cad_vision.VisionAnalysisOutput)
async def analyze_photo_endpoint(
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    mode: Optional[str] = Form("part"),
):
    """
    Analyzes an uploaded photo of a broken/missing part or character robot with a vision-language model.
    Never outputs dimensions; identifies part/robot features, screen area, and caliper measurements needed.
    """
    content_type = (file.content_type or "").lower().strip()
    ext = os.path.splitext(file.filename or "")[1].lower().replace(".", "")
    if content_type not in ("image/jpeg", "image/jpg", "image/png", "image/webp") and ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{content_type or ext}'. Only JPG, PNG, and WebP images are supported."
        )

    image_bytes = await file.read()
    if len(image_bytes) > cad_config.MAX_PHOTO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded photo exceeds 15 MB size limit ({len(image_bytes) / 1024 / 1024:.1f} MB)."
        )

    target_project_id = project_id
    is_robot = (str(mode).lower().strip() == "robot")
    if target_project_id:
        try:
            target_project_id = cad_project.sanitize_project_id(target_project_id)
        except ValueError as ve:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    else:
        clean_name = os.path.splitext(file.filename or ("robot" if is_robot else "part"))[0].replace("_", " ").title()
        init_spec = {"mode": "robot"} if is_robot else {"mode": "part", "part_type": "bracket"}
        new_proj = cad_project.create_project({
            "name": f"{'Robot' if is_robot else 'Part'}: {clean_name}",
            "spec": init_spec,
        })
        target_project_id = new_proj["id"]

    saved_url = cad_project.save_reference_photo(target_project_id, image_bytes, ext=ext or "jpg")

    result = cad_vision.analyze_part_photo(image_bytes, project_id=target_project_id, mode="robot" if is_robot else "part")
    result.image_url = saved_url

    try:
        if is_robot and result.suggested_spec:
            updated_spec = dict(result.suggested_spec)
            updated_spec["photo_analysis"] = result.model_dump()
            cad_project.update_project(target_project_id, {
                "spec": updated_spec,
                "version_history": [{"version": 1, "description": "Analyzed robot photo: detected screen & proportions"}]
            })
        else:
            updated_spec = {
                "mode": "part",
                "part_type": result.part_type if result.part_type != "other" else "plate",
                "measurements": result.form_defaults or {},
                "features": [],
                "photo_analysis": result.model_dump(),
            }
            cad_project.update_project(target_project_id, {
                "spec": updated_spec,
                "version_history": [{"version": 1, "description": f"Analyzed photo: detected {result.part_type}"}]
            })
    except Exception as e:
        logger.warning(f"Could not auto-update project {target_project_id} spec: {e}")

    return result

@router.post("/estimate-scale", response_model=cad_vision.EstimateScaleResponse)
def estimate_scale_endpoint(req: cad_vision.EstimateScaleRequest):
    """
    Converts pixel measurements on an uploaded photo to estimated millimeters
    using a known reference object (coin, ruler, credit card).
    """
    try:
        return cad_vision.compute_scale_estimate(req)
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Estimate scale error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to estimate scale: {e}")

# ----------------- Project Endpoints -----------------

@router.get("/projects")
def list_projects_endpoint():
    """Returns all saved projects with summary metadata, sorted by updated timestamp desc."""
    return cad_project.list_projects()

@router.post("/projects")
def create_project_endpoint(req: ProjectCreateRequest):
    """Creates a new project."""
    try:
        data = req.model_dump()
        return cad_project.create_project(data)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error creating project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/{project_id}/duplicate")
def duplicate_project_endpoint(project_id: str):
    """Duplicates a project."""
    try:
        return cad_project.duplicate_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Source project not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error duplicating project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/{project_id}/thumbnail")
def upload_thumbnail_endpoint(project_id: str, req: ThumbnailRequest):
    """Saves a small PNG thumbnail for the project from base64 data URL."""
    try:
        cad_project.sanitize_project_id(project_id)
        data = req.image_base64
        if "," in data:
            data = data.split(",", 1)[1]
        image_bytes = base64.b64decode(data)
        url = cad_project.save_thumbnail(project_id, image_bytes)
        return {"thumbnail": url}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error saving thumbnail for {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.api_route("/projects/{project_id}/thumbnail.png", methods=["GET", "HEAD"])
def get_thumbnail_endpoint(project_id: str):
    """Serves the project's thumbnail image."""
    try:
        safe_id = cad_project.sanitize_project_id(project_id)
        p_dir = cad_project.get_project_dir(safe_id)
        thumb_path = os.path.join(p_dir, "thumbnail.png")
        if not os.path.exists(thumb_path):
            raise HTTPException(status_code=404, detail="Thumbnail not found")
        return FileResponse(thumb_path, media_type="image/png")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@router.api_route("/projects/{project_id}/files/{filename}", methods=["GET", "HEAD"])
def get_project_file_endpoint(project_id: str, filename: str):
    """Serves build files stored within the project directory."""
    try:
        safe_id = cad_project.sanitize_project_id(project_id)
        safe_filename = os.path.basename(filename)
        p_dir = cad_project.get_project_dir(safe_id)
        file_path = os.path.join(p_dir, safe_filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        media_type = "application/octet-stream"
        ext = os.path.splitext(safe_filename)[1].lower()
        if ext == ".glb":
            media_type = "model/gltf-binary"
        elif ext == ".stl":
            media_type = "model/stl"
        elif ext in (".step", ".stp"):
            media_type = "application/step"

        return FileResponse(file_path, media_type=media_type, filename=safe_filename)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@router.get("/projects/{project_id}")
def get_project_endpoint(project_id: str):
    """Retrieves full project details."""
    try:
        project = cad_project.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@router.put("/projects/{project_id}")
def update_project_endpoint(project_id: str, req: ProjectUpdateRequest):
    """Updates an existing project (name, spec, version history, or build id)."""
    try:
        data = req.model_dump(exclude_unset=True)
        return cad_project.update_project(project_id, data)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error updating project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/projects/{project_id}")
def delete_project_endpoint(project_id: str):
    """Deletes a project."""
    try:
        deleted = cad_project.delete_project(project_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "deleted", "id": project_id}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@router.api_route("/{id}/{filename}", methods=["GET", "HEAD"])
def get_cad_file(id: str, filename: str):
    """Serves CAD export files (GLB, STL, STEP) with safe filename sanitization."""
    safe_filename = os.path.basename(filename)
    safe_id = os.path.basename(id)
    file_path = os.path.join(OUTPUTS_DIR, "cad", safe_id, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CAD artifact '{safe_filename}' not found for build '{safe_id}'."
        )

    media_type = "application/octet-stream"
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext == ".glb":
        media_type = "model/gltf-binary"
    elif ext == ".stl":
        media_type = "model/stl"
    elif ext == ".zip":
        media_type = "application/zip"
    elif ext in (".step", ".stp"):
        media_type = "application/step"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=safe_filename
    )


# ----------------- Phase 4: Autonomous Design Agent Endpoints -----------------

class AgentDesignRequest(BaseModel):
    project_id: Optional[str] = None
    prompt: str
    components: Optional[List[Dict[str, Any]]] = None
    measurements: Optional[Dict[str, float]] = None
    user_measurements: Optional[Dict[str, float]] = None
    photo_features: Optional[List[str]] = None
    provider: str = "ollama"
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    send_preview_images: bool = False
    existing_code: Optional[str] = None

class AgentEditRequest(BaseModel):
    prompt: Optional[str] = None
    instruction: Optional[str] = None
    provider: str = "ollama"
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    send_preview_images: bool = False

class CalibrationMeasurementsRequest(BaseModel):
    profile_name: str = "default"
    measurements: Dict[str, Any]
    bed: Optional[List[float]] = None
    nozzle: Optional[float] = None


def _run_agent_design_task(job_id: str, req_data: Dict[str, Any]):
    job = cad_agent.agent_jobs.get(job_id)
    if not job:
        return
    with cad_lock:
        try:
            job["status"] = "processing"
            job["message"] = "Analyzing design brief, components, and measurements..."
            job["progress"] = 15

            meas = req_data.get("user_measurements") or req_data.get("measurements")
            result = cad_agent.run_design_agent_loop(
                project_id=req_data["project_id"],
                prompt=req_data["prompt"],
                components=req_data.get("components"),
                user_measurements=meas,
                photo_features=req_data.get("photo_features"),
                provider=req_data.get("provider", "ollama"),
                api_key=req_data.get("api_key"),
                max_iterations=5,
                send_preview_images=req_data.get("send_preview_images", False),
                existing_code=req_data.get("existing_code"),
            )

            job.update(result)
            job["progress"] = 100
            job["is_experimental"] = True
            job["label"] = "experimental / unverified"
            if "best_result" in job and isinstance(job["best_result"], dict):
                job["best_result"]["is_experimental"] = True
                job["best_result"]["label"] = "experimental / unverified"

            # Auto-save project with design spec and latest build
            if result.get("best_result"):
                cad_project.update_project(req_data["project_id"], {
                    "spec": {
                        "mode": "design",
                        "prompt": req_data["prompt"],
                        "code": result["best_result"].get("code"),
                        "validation": result["best_result"].get("validation"),
                        "metrics": result["best_result"].get("metrics"),
                        "files": result["best_result"].get("files"),
                        "renders": result["best_result"].get("renders"),
                    }
                })
        except Exception as e:
            logger.error(f"Design agent loop failed: {e}", exc_info=True)
            job.update({
                "status": "failed",
                "progress": 0,
                "error": str(e),
                "message": f"Design generation failed: {e}"
            })


@router.post("/agent/design")
def start_agent_design(req: AgentDesignRequest, background_tasks: BackgroundTasks):
    """Starts autonomous CadQuery design loop in background."""
    project_id = req.project_id
    if not project_id:
        project_id = f"proj_{uuid.uuid4().hex[:10]}"
        cad_project.create_project({"id": project_id, "name": "AI Design Companion", "spec": {"mode": "design"}})

    job_id = f"des_{uuid.uuid4().hex[:10]}"
    cad_agent.agent_jobs[job_id] = {
        "job_id": job_id,
        "status": "processing",
        "progress": 5,
        "message": "Initializing design agent...",
        "project_id": project_id,
        "prompt": req.prompt,
        "iterations": [],
    }

    req_dict = req.model_dump()
    req_dict["project_id"] = project_id
    background_tasks.add_task(_run_agent_design_task, job_id, req_dict)
    return {
        "job_id": job_id,
        "status": "processing",
        "project_id": project_id,
        "message": "Design agent started. Polling available on /cad/agent/jobs/{job_id}"
    }


@router.get("/agent/jobs/{job_id}")
def get_agent_job_status(job_id: str):
    """Retrieves live status, progress, iteration logs, and renders of a design agent job."""
    job = cad_agent.agent_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agent design job not found")
    return job


@router.post("/agent/design/{project_id}/edit")
def edit_agent_design(project_id: str, req: AgentEditRequest, background_tasks: BackgroundTasks):
    """Submits a natural language edit instruction on an existing design."""
    proj = cad_project.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    instruction = req.instruction or req.prompt
    if not instruction:
        raise HTTPException(status_code=400, detail="Missing edit instruction or prompt")

    existing_code = proj.get("spec", {}).get("code")
    if not existing_code:
        raise HTTPException(status_code=400, detail="Project has no existing code to edit.")

    job_id = f"edit_{uuid.uuid4().hex[:10]}"
    cad_agent.agent_jobs[job_id] = {
        "job_id": job_id,
        "status": "processing",
        "progress": 5,
        "message": f"Applying edit: '{instruction}'...",
        "project_id": project_id,
        "prompt": instruction,
        "iterations": [],
    }

    req_data = {
        "project_id": project_id,
        "prompt": instruction,
        "provider": req.provider,
        "api_key": req.api_key,
        "send_preview_images": req.send_preview_images,
        "existing_code": existing_code,
    }

    background_tasks.add_task(_run_agent_design_task, job_id, req_data)
    return {
        "job_id": job_id,
        "status": "processing",
        "project_id": project_id,
    }

    background_tasks.add_task(_run_agent_design_task, job_id, req_data)
    return {
        "job_id": job_id,
        "status": "processing",
        "project_id": project_id,
    }


# ----------------- Phase 5: Printer Calibration Endpoints -----------------

@router.get("/printers")
def list_printers_endpoint():
    """Returns stored printer tolerance profiles and active profile."""
    import printer_profiles
    return {
        "active_profile": printer_profiles.get_active_profile_id(),
        "profiles": printer_profiles.list_profiles()
    }

@router.post("/printers/{profile_id}/activate")
def activate_printer_endpoint(profile_id: str):
    """Sets the active printer profile."""
    import printer_profiles
    printer_profiles.set_active_profile_id(profile_id)
    return {
        "status": "success",
        "active_profile": profile_id,
        "profile": printer_profiles.get_active_profile()
    }

@router.post("/calibration/stepped-coupon")
def generate_stepped_calibration_coupon_endpoint():
    """Generates the 0.1mm-increment stepped hole & peg calibration test coupon."""
    from cad_templates.coupon import build_stepped_calibration_coupon
    from build123d import export_stl
    import trimesh

    coupon = build_stepped_calibration_coupon()
    stl_path = os.path.join(OUTPUTS_DIR, "stepped_coupon.stl")
    glb_path = os.path.join(OUTPUTS_DIR, "stepped_coupon.glb")

    export_stl(coupon, stl_path)
    mesh = trimesh.load(stl_path)
    mesh.export(glb_path)

    return {
        "status": "success",
        "stl_url": "/outputs/stepped_coupon.stl",
        "glb_url": "/outputs/stepped_coupon.glb",
        "message": "Stepped calibration coupon generated (0.1mm increments for holes and pegs)."
    }

@router.post("/calibration/coupon")
def generate_calibration_coupon_endpoint():
    """Generates the all-in-one printer calibration test coupon STL."""
    coupon = cad_calibration.build_calibration_coupon()
    out_path = os.path.join(OUTPUTS_DIR, "calibration_coupon.stl")
    cq.exporters.export(coupon, out_path, cq.exporters.ExportTypes.STL)
    return {
        "status": "success",
        "file": "/outputs/calibration_coupon.stl",
        "message": "Calibration coupon generated. Print with 0.2mm layer height and 0.4mm nozzle."
    }


@router.post("/calibration/measurements")
def submit_calibration_measurements_endpoint(req: CalibrationMeasurementsRequest):
    """Calculates exact calibration offsets from user caliper measurements and saves profile."""
    offsets = cad_calibration.compute_calibration_offsets(req.measurements)
    config = cad_calibration.save_printer_profile(
        profile_name=req.profile_name,
        offsets=offsets,
        bed=req.bed,
        nozzle=req.nozzle
    )
    return {
        "status": "success",
        "active_profile": config.get("active_profile"),
        "offsets": offsets,
        "config": config,
    }


@router.get("/calibration/profiles")
def get_calibration_profiles_endpoint():
    """Returns printer profiles and calibration offsets from printer.json."""
    return cad_calibration.load_printer_config()


# ----------------- Phase 6: Fit-Test Slicing Endpoints -----------------

@router.post("/projects/{project_id}/fit-test")
def generate_fit_test_endpoint(project_id: str):
    """
    Generates targeted 15mm-margin fit-test slices for critical regions
    (display pocket, lip seams, peg sockets, screw bosses).
    """
    proj = cad_project.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    code = proj.get("spec", {}).get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Project has no CAD code to slice.")

    scope = {"cq": cq, "cadquery": cq, "cad_kit": cad_kit, "math": math}
    try:
        exec(code, scope)
        parts_solids = scope.get("parts", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load parts from project code: {e}")

    if not parts_solids:
        raise HTTPException(status_code=400, detail="No solids found in project parts.")

    proj_dir = cad_project.get_project_dir(project_id)
    fit_dir = os.path.join(proj_dir, "fit_test")
    return cad_calibration.generate_fit_test_slices(project_id, parts_solids, output_dir=fit_dir)


@router.get("/projects/{project_id}/fit-test/{slice_id}")
def get_fit_test_slice_file(project_id: str, slice_id: str):
    """Serves a generated fit-test slice STL."""
    proj_dir = cad_project.get_project_dir(project_id)
    safe_slice = os.path.basename(slice_id).replace(".stl", "")
    stl_path = os.path.join(proj_dir, "fit_test", f"fit_test_{safe_slice}.stl")
    if not os.path.exists(stl_path):
        raise HTTPException(status_code=404, detail=f"Fit-test slice '{slice_id}' not found.")
    return FileResponse(stl_path, media_type="model/stl", filename=f"fit_test_{safe_slice}.stl")


@router.post("/projects/{project_id}/export")
def export_project_package(project_id: str):
    """
    Exports full project bundle (STLs, STEPs, GLB).
    MANDATORY GUARD: Refused with HTTP 422 if any error-level feasibility issue remains!
    """
    proj = cad_project.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    spec = proj.get("spec", {})
    val = spec.get("validation", {})
    errors = val.get("errors", [])
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Cannot export design while error-level feasibility issues exist. Please resolve errors first.",
                "errors": errors
            }
        )

    proj_dir = cad_project.get_project_dir(project_id)
    zip_path = os.path.join(proj_dir, f"{project_id}_export.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in os.listdir(proj_dir):
            if fname.endswith((".stl", ".step", ".stp", ".glb")):
                zf.write(os.path.join(proj_dir, fname), arcname=fname)

    return FileResponse(zip_path, media_type="application/zip", filename=f"{project_id}_export.zip")


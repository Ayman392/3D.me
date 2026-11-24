import io
import os
import re
import json
import math
import base64
import logging
from typing import Dict, Any, List, Optional, Literal, Tuple
import httpx
from PIL import Image
from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator

from cad_config import (
    OLLAMA_CHAT_ENDPOINT,
    OLLAMA_VISION_MODEL,
    MAX_PHOTO_LONG_EDGE,
    MAX_PHOTO_SIZE_BYTES,
)

logger = logging.getLogger("3dme.cad.vision")

# Known reference object dimensions in millimeters (exact standards)
REFERENCE_SIZES_MM: Dict[str, float] = {
    "us_quarter": 24.26,
    "eur_1": 23.25,
    "eur_2": 25.75,
    "us_penny": 19.05,
    "us_dime": 17.91,
    "credit_card": 85.60,
    "card": 85.60,
}

# Fixed set of supported part types
VALID_PART_TYPES = ("plate", "bracket", "spacer", "mounting_plate", "clip_ring", "robot", "other")

# Default measurement forms for UI prefill
DEFAULT_MEASUREMENT_FORMS: Dict[str, Dict[str, Any]] = {
    "bracket": {"leg1": 40.0, "leg2": 25.0, "width": 25.0, "thickness": 3.0, "fillet": 2.0},
    "plate": {"length": 60.0, "width": 40.0, "thickness": 3.0, "corner_radius": 0.0},
    "mounting_plate": {"length": 70.0, "width": 50.0, "thickness": 3.0, "corner_radius": 2.0},
    "spacer": {"outer_d": 12.0, "inner_d": 4.2, "height": 15.0},
    "clip_ring": {"outer_d": 26.0, "inner_d": 20.0, "height": 10.0, "gap": 4.0},
    "other": {"length": 50.0, "width": 50.0, "thickness": 3.0},
}

# Default caliper measurement checklists
DEFAULT_CHECKLISTS: Dict[str, List[Dict[str, str]]] = {
    "bracket": [
        {"key": "leg1", "label": "Leg 1 Length", "hint": "Outer length of bottom leg along X in mm"},
        {"key": "leg2", "label": "Leg 2 Height", "hint": "Outer height of vertical leg along Z in mm"},
        {"key": "width", "label": "Width / Depth", "hint": "Bracket depth along Y in mm"},
        {"key": "thickness", "label": "Wall Thickness", "hint": "Material thickness T in mm"},
        {"key": "fillet", "label": "Inside Bend Fillet", "hint": "Internal radius at bend in mm"},
    ],
    "plate": [
        {"key": "length", "label": "Length", "hint": "Overall length in mm"},
        {"key": "width", "label": "Width", "hint": "Overall width in mm"},
        {"key": "thickness", "label": "Thickness", "hint": "Plate thickness in mm"},
        {"key": "corner_radius", "label": "Corner Fillet", "hint": "Corner fillet radius in mm (0 if square)"},
    ],
    "mounting_plate": [
        {"key": "length", "label": "Length", "hint": "Overall length in mm"},
        {"key": "width", "label": "Width", "hint": "Overall width in mm"},
        {"key": "thickness", "label": "Thickness", "hint": "Plate thickness in mm"},
        {"key": "corner_radius", "label": "Corner Fillet", "hint": "Corner radius in mm"},
        {"key": "hole_pitch", "label": "Hole Spacing / Pitch", "hint": "Center-to-center distance between holes"},
        {"key": "hole_d", "label": "Hole Diameter", "hint": "Mounting hole diameter in mm"},
    ],
    "spacer": [
        {"key": "outer_d", "label": "Outer Diameter", "hint": "Outside cylinder diameter in mm"},
        {"key": "inner_d", "label": "Inner Diameter (Hole)", "hint": "Center through-hole diameter in mm"},
        {"key": "height", "label": "Height", "hint": "Total standoff length in mm"},
    ],
    "clip_ring": [
        {"key": "outer_d", "label": "Outer Diameter", "hint": "Outer ring diameter in mm"},
        {"key": "inner_d", "label": "Inner Diameter", "hint": "Inner ring diameter in mm"},
        {"key": "height", "label": "Height / Thickness", "hint": "Axial thickness in mm"},
        {"key": "gap", "label": "Opening Gap", "hint": "Slot opening width in mm (0 if continuous)"},
    ],
    "other": [
        {"key": "length", "label": "Length", "hint": "Main length in mm"},
        {"key": "width", "label": "Width", "hint": "Main width in mm"},
        {"key": "thickness", "label": "Thickness", "hint": "Main thickness in mm"},
    ],
}

VISION_SYSTEM_PROMPT = """You are an expert mechanical CAD vision assistant analyzing photos of real mechanical or replacement parts.
Identify the physical part and return a structured JSON breakdown for 3D modeling.

STRICT INSTRUCTIONS:
1. Identify the object type from this fixed list ONLY:
   - "plate": Flat rectangular or profiled sheet/plate
   - "bracket": L-shaped or angled mounting bracket with 2 legs/flanges
   - "spacer": Cylindrical sleeve, standoff, or tubular spacer with a central hole
   - "mounting_plate": Flat plate designed with an array/pattern of mounting holes
   - "clip_ring": C-clip, snap ring, circlip, or annular ring with or without an opening gap
   - "other": Part does not clearly match any of the above categories
2. Set confidence to "high", "medium", or "low". If unsure or the photo is ambiguous, set confidence to "low".
3. List visible features as short plain-English descriptive phrases (e.g. "L-shaped 90-degree bend", "Two round through-holes on bottom leg", "Inside corner fillet radius", "Opening slot gap").
4. List which measurements the user must take with calipers in measure_checklist.
5. STRICT RULE ON DIMENSIONS: NEVER output numeric dimensions or estimated numbers for lengths, widths, heights, diameters, or thicknesses (e.g. do NOT output '20mm', '5 cm', '10x20', or 'Ø3'). All dimensions must be measured by the user with calipers.
6. Return a valid JSON object matching this schema:
{
  "part_type": "bracket" | "plate" | "spacer" | "mounting_plate" | "clip_ring" | "other",
  "confidence": "high" | "medium" | "low",
  "features": ["Feature description 1", "Feature description 2"],
  "measure_checklist": [
    {"key": "leg1", "label": "Leg 1 Length", "hint": "Measure with calipers"}
  ],
  "notes": "Short observation about part condition or features"
}"""


ROBOT_VISION_SYSTEM_PROMPT = """You are an expert character robot CAD vision assistant analyzing photos of desktop robots, toy robots, or robot characters.
Detect the character's parts, face display screen, and relative proportions for 3D modeling.

STRICT INSTRUCTIONS:
1. Detect bounding boxes for visible parts from this fixed list:
   - "head": the robot head / top shell
   - "body": the robot body / main torso
   - "arm_left": character's left arm / limb
   - "arm_right": character's right arm / limb
   - "ear_left": ear pod or antenna on character's left side
   - "ear_right": ear pod or antenna on character's right side
   - "other": any base, foot, or secondary appendage
   Each bounding box must be normalized coordinates [x0, y0, x1, y1] clamped between 0.0 and 1.0.

2. Detect the face display area / screen:
   - "box": [x0, y0, x1, y1] normalized coordinates on the head
   - "shape": "rounded_rect" or "round"
   - "corner_radius_ratio": estimated corner roundness from 0.0 (sharp) to 0.5 (circular)

3. Proportion Ratios (computed relative to total character height):
   - "head_to_total": height of head / total height
   - "body_to_total": height of body / total height
   - "head_w_to_h": width of head / height of head
   - "body_w_to_h": width of body / height of body
   - "arm_to_total": length of arm / total height
   - "ear_to_total": size of ear / total height

4. Suggest mirror pairs:
   - e.g. ["arm", "ear_pod"]

5. STRICT RULE ON DIMENSIONS:
   NEVER output numeric millimeter/inch dimensions or numbers with units (e.g. do NOT output '50mm', '10 cm', 'Ø20'). All actual dimensions must be provided by the user with calipers.

6. Return ONLY valid JSON:
{
  "mode": "robot",
  "part_type": "robot",
  "confidence": "high" | "medium" | "low",
  "parts": [
    {"id": "head", "label": "Head", "box": [0.20, 0.08, 0.80, 0.48]},
    {"id": "body", "label": "Body", "box": [0.22, 0.48, 0.78, 0.88]}
  ],
  "display": {
    "box": [0.35, 0.18, 0.65, 0.35],
    "shape": "rounded_rect",
    "corner_radius_ratio": 0.2
  },
  "proportions": {
    "head_to_total": 0.45,
    "body_to_total": 0.45,
    "head_w_to_h": 1.18,
    "body_w_to_h": 1.05,
    "arm_to_total": 0.28,
    "ear_to_total": 0.15
  },
  "mirror_pairs": ["arm", "ear_pod"],
  "features": ["Character robot head with front face display", "Egg-shaped torso"],
  "measure_checklist": [
    {"key": "overall_height", "label": "Overall Robot Height", "hint": "Desired total height in mm (e.g. 120 mm)"},
    {"key": "screen_module", "label": "Display Module Size", "hint": "Module L, W, H measured with calipers"},
    {"key": "screen_active", "label": "Active Screen Area", "hint": "Visible display width & height measured with calipers"}
  ],
  "notes": "Short observation about character proportions"
}"""


# ----------------- Pydantic Models -----------------

class MeasureChecklistItem(BaseModel):
    key: str
    label: str
    hint: Optional[str] = None
    default: Optional[float] = None
    estimated_mm: Optional[float] = None


class RobotPartBox(BaseModel):
    id: str
    label: str
    box: List[float] = Field(..., min_length=4, max_length=4)


class RobotDisplayDetection(BaseModel):
    box: List[float] = Field(..., min_length=4, max_length=4)
    shape: str = "rounded_rect"
    corner_radius_ratio: float = 0.2
    confidence: Literal["low", "medium", "high"] = "medium"


class VisionAnalysisOutput(BaseModel):
    mode: Literal["part", "robot"] = "part"
    part_type: str = "other"
    confidence: Literal["low", "medium", "high"] = "medium"
    features: List[str] = Field(default_factory=list)
    measure_checklist: List[MeasureChecklistItem] = Field(default_factory=list)
    notes: Optional[str] = None
    form_defaults: Optional[Dict[str, Any]] = None
    project_id: Optional[str] = None
    image_url: Optional[str] = None
    # Robot assembly overlay fields
    parts: Optional[List[RobotPartBox]] = None
    display: Optional[RobotDisplayDetection] = None
    proportions: Optional[Dict[str, float]] = None
    mirror_pairs: Optional[List[str]] = None
    suggested_spec: Optional[Dict[str, Any]] = None

    @field_validator("part_type", mode="before")
    @classmethod
    def normalize_part_type(cls, v: Any) -> str:
        if isinstance(v, str):
            clean = v.lower().strip().replace("-", "_").replace(" ", "_")
            if "robot" in clean or "character" in clean:
                return "robot"
            if clean in ("clip", "ring", "snap_ring", "c_clip"):
                return "clip_ring"
            if clean in ("standoff", "bushing", "cylinder"):
                return "spacer"
            if clean in ("l_bracket", "angle_bracket", "corner_bracket"):
                return "bracket"
            if clean in VALID_PART_TYPES:
                return clean
        return "other"


class EstimateScaleRequest(BaseModel):
    reference: Literal["coin", "ruler", "card"] = "coin"
    coin_type: Optional[str] = "us_quarter"
    known_mm: Optional[float] = None
    ref_points: List[List[float]] = Field(..., min_length=2, max_length=2)
    target_points: List[List[float]] = Field(..., min_length=2, max_length=2)
    project_id: Optional[str] = None


class EstimateScaleResponse(BaseModel):
    estimated_mm: float
    mm_per_pixel: float
    reference_used: str
    known_reference_mm: float
    disclaimer: str = "estimate, +/- 5-10%, confirm with calipers"


# ----------------- Helper Functions -----------------

def strip_numeric_dimensions(text: str) -> str:
    """
    Enforces the design principle that the vision model never returns dimensions.
    Strips explicit numeric dimension measurements (e.g. '30 mm', '5.5mm', '10 x 20 mm', 'Ø3.4', '2 inches')
    from feature descriptions.
    """
    if not text or not isinstance(text, str):
        return ""
    # Strip unit-based dimensions: 30 mm, 5.5mm, 10 cm, 2.5 in, 1/4", etc.
    s = re.sub(r'(?i)\b\d+(\.\d+)?\s*(mm|cm|in|inch|inches|meters|m)\b', '', text)
    # Strip diameter prefixes: Ø 3.4, Ø3mm
    s = re.sub(r'(?i)[Øø]\s*\d+(\.\d+)?(\s*(mm|cm))?', '', s)
    # Strip dimension multiplies: 10x20, 40 x 25 x 3
    s = re.sub(r'\b\d+(\.\d+)?\s*[xX*×]\s*\d+(\.\d+)?(\s*[xX*×]\s*\d+(\.\d+)?)?', '', s)
    # Clean up whitespace and stray punctuation
    s = re.sub(r'\s+', ' ', s).strip(' ,.-;:')
    return s


def preprocess_and_downscale_image(image_bytes: bytes, max_long_edge: int = MAX_PHOTO_LONG_EDGE) -> Tuple[bytes, Tuple[int, int]]:
    """
    Downscales an uploaded image so that its longest edge is at most max_long_edge (1280 px).
    Converts to RGB JPEG for optimal vision-language model tokens.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not decode image file: {e}"
        )

    w, h = img.size
    if max(w, h) > max_long_edge:
        scale = max_long_edge / float(max(w, h))
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    return buf.getvalue(), img.size


def detect_display_contour_opencv(
    image_bytes: bytes,
    head_box: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """
    OpenCV fallback: if Ollama vision fails to detect the screen, find the largest
    dark rectangular contour on the head and return its bounding box as the display candidate with confidence 'low'.
    """
    try:
        import cv2
        import numpy as np

        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return {"box": [0.35, 0.18, 0.65, 0.35], "shape": "rounded_rect", "corner_radius_ratio": 0.2, "confidence": "low"}

        img_h, img_w = img.shape[:2]

        if head_box and len(head_box) == 4:
            x0 = int(max(0.0, min(1.0, head_box[0])) * img_w)
            y0 = int(max(0.0, min(1.0, head_box[1])) * img_h)
            x1 = int(max(0.0, min(1.0, head_box[2])) * img_w)
            y1 = int(max(0.0, min(1.0, head_box[3])) * img_h)
        else:
            x0, y0, x1, y1 = 0, 0, img_w, int(img_h * 0.6)

        if x1 - x0 < 10 or y1 - y0 < 10:
            return {"box": [0.35, 0.18, 0.65, 0.35], "shape": "rounded_rect", "corner_radius_ratio": 0.2, "confidence": "low"}

        roi = img[y0:y1, x0:x1]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        _, thresh = cv2.threshold(gray, 75, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        candidates = []
        for c in contours:
            rx, ry, rw, rh = cv2.boundingRect(c)
            area = cv2.contourArea(c)
            if rw > 15 and rh > 10 and area > 100:
                rect_area = rw * rh
                extent = area / float(rect_area) if rect_area > 0 else 0
                aspect = rw / float(rh)
                if extent > 0.55 and 0.4 <= aspect <= 4.0:
                    candidates.append((area, rx, ry, rw, rh))

        if candidates:
            candidates.sort(key=lambda item: item[0], reverse=True)
            _, rx, ry, rw, rh = candidates[0]
            norm_box = [
                round(float(x0 + rx) / img_w, 4),
                round(float(y0 + ry) / img_h, 4),
                round(float(x0 + rx + rw) / img_w, 4),
                round(float(y0 + ry + rh) / img_h, 4),
            ]
            return {
                "box": norm_box,
                "shape": "rounded_rect",
                "corner_radius_ratio": 0.2,
                "confidence": "low",
            }
    except Exception as e:
        logger.warning(f"OpenCV screen detection fallback failed: {e}")

    return {
        "box": [0.35, 0.18, 0.65, 0.35],
        "shape": "rounded_rect",
        "corner_radius_ratio": 0.2,
        "confidence": "low",
    }


def call_ollama_vision(
    image_base64: str,
    system_prompt: Optional[str] = None,
    user_prompt: Optional[str] = None,
    timeout: float = 60.0,
) -> Dict[str, Any]:
    """
    Calls local Ollama with qwen2.5vl:7b, keeping alive 0 so memory is freed immediately.
    Retries once on invalid JSON response.
    """
    sys_prompt = system_prompt or VISION_SYSTEM_PROMPT
    usr_prompt = user_prompt or "Analyze this photo of a mechanical part. Identify its part_type from the fixed list, list its visible features, and list caliper measurements needed."

    payload = {
        "model": OLLAMA_VISION_MODEL,
        "stream": False,
        "keep_alive": 0,
        "format": "json",
        "options": {
            "num_predict": 512,
            "temperature": 0.1,
        },
        "messages": [
            {"role": "system", "content": sys_prompt},
            {
                "role": "user",
                "content": usr_prompt,
                "images": [image_base64]
            }
        ]
    }

    last_error = None
    for attempt in range(2):
        try:
            with httpx.Client(timeout=timeout) as client:
                res = client.post(OLLAMA_CHAT_ENDPOINT, json=payload)
                if res.status_code == 404 or "not found" in res.text.lower():
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail=f"Local vision model '{OLLAMA_VISION_MODEL}' is not installed in Ollama. Please run: ollama pull {OLLAMA_VISION_MODEL}"
                    )
                if res.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Ollama returned HTTP {res.status_code}: {res.text}"
                    )

                data = res.json()
                content = data.get("message", {}).get("content", "").strip()

                if content.startswith("```"):
                    content = re.sub(r"^```(?:json)?\s*", "", content)
                    content = re.sub(r"\s*```$", "", content)

                parsed = json.loads(content)
                return parsed

        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.NetworkError):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Ollama is unreachable at {OLLAMA_CHAT_ENDPOINT}. Please ensure Ollama is installed and running ('ollama serve'). Local model: ollama pull {OLLAMA_VISION_MODEL}"
            )
        except HTTPException:
            raise
        except Exception as e:
            last_error = e
            logger.warning(f"Ollama vision call attempt {attempt + 1} failed: {e}")
            if attempt == 0:
                payload["messages"].append({
                    "role": "assistant",
                    "content": "Invalid response"
                })
                payload["messages"].append({
                    "role": "user",
                    "content": "Your previous response was not valid JSON. Please reply with ONLY a valid JSON object matching the requested schema."
                })

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Vision model returned invalid response after retry: {last_error}"
    )


def analyze_part_photo(
    image_bytes: bytes,
    project_id: Optional[str] = None,
    mode: str = "part",
) -> VisionAnalysisOutput:
    """
    Coordinates photo preprocessing, Ollama vision inference, output validation,
    number stripping from features, and default measurement form or robot spec synthesis.
    """
    if len(image_bytes) > MAX_PHOTO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image size ({len(image_bytes) / 1024 / 1024:.1f} MB) exceeds maximum limit of 15 MB."
        )

    # 1. Downscale to max 1280 px
    jpeg_bytes, _ = preprocess_and_downscale_image(image_bytes, max_long_edge=MAX_PHOTO_LONG_EDGE)
    img_b64 = base64.b64encode(jpeg_bytes).decode("utf-8")

    # 2. Select prompts based on mode
    is_robot = (mode == "robot")
    sys_prompt = ROBOT_VISION_SYSTEM_PROMPT if is_robot else VISION_SYSTEM_PROMPT
    usr_prompt = (
        "Analyze this photo of a character robot. Identify parts [head, body, arm_left, arm_right, ear_left, ear_right, other] with bounding boxes [x0,y0,x1,y1], face display screen area, and proportion ratios."
        if is_robot
        else "Analyze this photo of a mechanical part. Identify its part_type from the fixed list, list its visible features, and list caliper measurements needed."
    )

    # 3. Call Ollama vision model
    raw_output = call_ollama_vision(img_b64, system_prompt=sys_prompt, user_prompt=usr_prompt)
    if is_robot:
        raw_output["mode"] = "robot"
        raw_output["part_type"] = "robot"

    # 4. Validate with Pydantic
    try:
        validated = VisionAnalysisOutput.model_validate(raw_output)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Model output failed validation against PhotoAnalysisResult schema: {e}"
        )

    # 5. Strict stripping of any numeric dimensions from features
    sanitized_features = []
    for f in validated.features:
        cleaned = strip_numeric_dimensions(f)
        if cleaned:
            sanitized_features.append(cleaned)
    validated.features = sanitized_features

    # 6. Mode-specific post-processing
    if is_robot:
        # Check if head box was detected
        head_box = None
        if validated.parts:
            for p in validated.parts:
                if p.id == "head":
                    head_box = p.box
                    break

        # OpenCV Fallback for display screen detection if missing or low confidence
        if not validated.display or not validated.display.box:
            cv_screen = detect_display_contour_opencv(jpeg_bytes, head_box=head_box)
            validated.display = RobotDisplayDetection(**cv_screen)

        # Ensure default part boxes if none returned
        if not validated.parts:
            validated.parts = [
                RobotPartBox(id="head", label="Head", box=[0.20, 0.08, 0.80, 0.48]),
                RobotPartBox(id="body", label="Body", box=[0.22, 0.48, 0.78, 0.88]),
                RobotPartBox(id="arm_left", label="Arm Left", box=[0.08, 0.48, 0.22, 0.76]),
                RobotPartBox(id="arm_right", label="Arm Right", box=[0.78, 0.48, 0.92, 0.76]),
                RobotPartBox(id="ear_left", label="Ear Left", box=[0.10, 0.18, 0.22, 0.36]),
                RobotPartBox(id="ear_right", label="Ear Right", box=[0.78, 0.18, 0.90, 0.36]),
            ]

        # Calculate / ensure proportion ratios
        if not validated.proportions:
            validated.proportions = {
                "head_to_total": 0.45,
                "body_to_total": 0.45,
                "head_w_to_h": 1.18,
                "body_w_to_h": 1.05,
                "arm_to_total": 0.28,
                "ear_to_total": 0.15,
            }

        if not validated.mirror_pairs:
            validated.mirror_pairs = ["arm", "ear_pod"]

        if not validated.measure_checklist:
            validated.measure_checklist = [
                MeasureChecklistItem(key="overall_height", label="Overall Robot Height", hint="Desired total height in mm (default 120 mm)", default=120.0),
                MeasureChecklistItem(key="screen_w", label="Display Module Width (L)", hint="Display module outer width in mm", default=27.3),
                MeasureChecklistItem(key="screen_h", label="Display Module Height (W)", hint="Display module outer height in mm", default=27.8),
                MeasureChecklistItem(key="screen_t", label="Display Module Thickness", hint="Display module thickness in mm", default=4.0),
                MeasureChecklistItem(key="active_w", label="Active Visible Width", hint="Visible active screen width in mm", default=22.0),
                MeasureChecklistItem(key="active_h", label="Active Visible Height", hint="Visible active screen height in mm", default=11.0),
            ]

        # Synthesize suggested CAD robot specification using chibi proportions
        import cad_robot
        disp_dict = {
            "name": "Detected Display",
            "size": [27.3, 27.8, 4.0],
            "active_area": [22.0, 11.0],
            "shape": validated.display.shape if validated.display else "rect",
            "offset": [0.0, 0.0],
            "ledge": 1.5,
        }
        validated.suggested_spec = cad_robot.create_chibi_robot_spec(
            overall_height_mm=120.0,
            display=disp_dict,
        )
    else:
        # Populate prefill forms and fallback checklist if empty
        ptype = validated.part_type
        validated.form_defaults = DEFAULT_MEASUREMENT_FORMS.get(ptype, DEFAULT_MEASUREMENT_FORMS["other"])
        if not validated.measure_checklist:
            defaults = DEFAULT_CHECKLISTS.get(ptype, DEFAULT_CHECKLISTS["other"])
            validated.measure_checklist = [MeasureChecklistItem(**item) for item in defaults]

    validated.project_id = project_id
    return validated


def compute_scale_estimate(req: EstimateScaleRequest) -> EstimateScaleResponse:
    """
    Calculates physical millimeter distance between two image points using a known reference object.
    Pure Python math:
      pixel_dist_ref = hypot(ref_p2 - ref_p1)
      mm_per_pixel = known_mm / pixel_dist_ref
      target_pixel_dist = hypot(target_p2 - target_p1)
      estimated_mm = target_pixel_dist * mm_per_pixel
    """
    ref_name = req.reference
    known_mm: float = 0.0

    if req.known_mm and req.known_mm > 0.0:
        known_mm = float(req.known_mm)
        ref_label = f"Custom reference ({known_mm:.2f} mm)"
    elif ref_name == "coin":
        coin_key = (req.coin_type or "us_quarter").lower().strip()
        known_mm = REFERENCE_SIZES_MM.get(coin_key, 24.26)
        ref_label = f"Coin: {coin_key.replace('_', ' ').title()} ({known_mm:.2f} mm)"
    elif ref_name in ("card", "credit_card"):
        known_mm = REFERENCE_SIZES_MM["credit_card"]
        ref_label = f"Credit Card width ({known_mm:.2f} mm)"
    elif ref_name == "ruler":
        known_mm = float(req.known_mm or 10.0)
        ref_label = f"Ruler mark ({known_mm:.2f} mm)"
    else:
        known_mm = 24.26
        ref_label = f"Default coin ({known_mm:.2f} mm)"

    # Compute Euclidean pixel distance of reference points
    rp1, rp2 = req.ref_points[0], req.ref_points[1]
    ref_pixel_dist = math.hypot(rp2[0] - rp1[0], rp2[1] - rp1[1])
    if ref_pixel_dist < 1.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reference points are too close together (< 1 pixel). Please select distinct points across the reference object."
        )

    mm_per_pixel = known_mm / ref_pixel_dist

    # Compute Euclidean pixel distance of target feature points
    tp1, tp2 = req.target_points[0], req.target_points[1]
    target_pixel_dist = math.hypot(tp2[0] - tp1[0], tp2[1] - tp1[1])
    estimated_mm = round(target_pixel_dist * mm_per_pixel, 2)

    return EstimateScaleResponse(
        estimated_mm=estimated_mm,
        mm_per_pixel=round(mm_per_pixel, 5),
        reference_used=ref_label,
        known_reference_mm=round(known_mm, 2),
        disclaimer="estimate, +/- 5-10%, confirm with calipers"
    )

"""
cad_templates/registry.py
Template Registry, validation, and auto-clamping engine for Build123d parametric templates.
"""

import logging
from typing import Dict, Any, Tuple, List, Type, Callable, Optional, Union
from pydantic import BaseModel
from build123d import Compound, Solid

from cad_templates.schemas import (
    EnclosureWithLidParams,
    BoardEnclosureParams,
    BracketLParams,
    BracketFlatPlateParams,
    SnapFitClipParams,
    LivingHingeParams,
    PinHingeParams,
    KnobParams,
    BatteryCoverParams,
    GasketFromProfileParams,
    ThreadedInsertBossParams,
    MetricThreadParams,
    SpacerWasherParams,
    CableClipParams,
    WallHookParams,
)
from cad_templates.enclosures import enclosure_with_lid, board_enclosure
from cad_templates.brackets import bracket_l, bracket_flat_plate
from cad_templates.fasteners import (
    snap_fit_clip,
    living_hinge,
    pin_hinge,
    threaded_insert_boss,
    thread,
)
from cad_templates.mechanisms import (
    knob,
    battery_cover,
    gasket_from_profile,
    spacer_washer,
    cable_clip,
    wall_hook,
)

logger = logging.getLogger("3dme.cad.templates")

TEMPLATE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "enclosure_with_lid": {
        "schema": EnclosureWithLidParams,
        "builder": enclosure_with_lid,
        "description": "Electronics enclosure box with customizable wall, corners, lid type (snap/screw/slip), cutouts and vents."
    },
    "board_enclosure": {
        "schema": BoardEnclosureParams,
        "builder": board_enclosure,
        "description": "SBC enclosure with mounting standoffs and port openings for Pi 4, Pi Zero, Arduino Uno, ESP32, etc."
    },
    "bracket_l": {
        "schema": BracketLParams,
        "builder": bracket_l,
        "description": "Heavy duty 90-degree structural L-bracket with mounting holes and reinforcement gusset."
    },
    "bracket_flat_plate": {
        "schema": BracketFlatPlateParams,
        "builder": bracket_flat_plate,
        "description": "Flat mounting plate, adapter, or flange with corner fillets and hole/slot patterns."
    },
    "snap_fit_clip": {
        "schema": SnapFitClipParams,
        "builder": snap_fit_clip,
        "description": "Cantilever snap-fit clip with lead-in angle and retention hook for enclosure covers and panels."
    },
    "living_hinge": {
        "schema": LivingHingeParams,
        "builder": living_hinge,
        "description": "Continuous single-piece living hinge with thin flexible flexure membrane."
    },
    "pin_hinge": {
        "schema": PinHingeParams,
        "builder": pin_hinge,
        "description": "Two-leaf interlocking knuckle pin hinge with print-in-place clearance."
    },
    "knob": {
        "schema": KnobParams,
        "builder": knob,
        "description": "Rotary control knob with D-shaft / round bore, knurled perimeter grip, and set screw."
    },
    "battery_cover": {
        "schema": BatteryCoverParams,
        "builder": battery_cover,
        "description": "Replacement battery compartment door with retaining tab, snap latch, and grip ribs."
    },
    "gasket_from_profile": {
        "schema": GasketFromProfileParams,
        "builder": gasket_from_profile,
        "description": "Sealing gasket ring (rectangular or circular) with bolt holes."
    },
    "threaded_insert_boss": {
        "schema": ThreadedInsertBossParams,
        "builder": threaded_insert_boss,
        "description": "Heat-set threaded brass insert mounting boss cylinder with reinforcement gussets."
    },
    "thread": {
        "schema": MetricThreadParams,
        "builder": thread,
        "description": "Metric fastener screw / bolt with hex head and dimensional thread shaft."
    },
    "spacer_washer": {
        "schema": SpacerWasherParams,
        "builder": spacer_washer,
        "description": "Precision dimensional spacer, bushing, or washer with inner and outer diameters."
    },
    "cable_clip": {
        "schema": CableClipParams,
        "builder": cable_clip,
        "description": "Cable management clip with snap arch and screw mounting tab."
    },
    "wall_hook": {
        "schema": WallHookParams,
        "builder": wall_hook,
        "description": "Wall utility hook with mounting backplate, forward arm, and retaining lip."
    },
}


def list_templates() -> List[Dict[str, Any]]:
    """Returns list of registered templates with parameter schemas."""
    result = []
    for name, entry in TEMPLATE_REGISTRY.items():
        schema_cls: Type[BaseModel] = entry["schema"]
        result.append({
            "name": name,
            "description": entry["description"],
            "parameters": schema_cls.model_json_schema()
        })
    return result


def get_template_schema(template_name: str) -> Optional[Type[BaseModel]]:
    """Returns the Pydantic schema class for a template."""
    entry = TEMPLATE_REGISTRY.get(template_name)
    return entry["schema"] if entry else None


def validate_and_clamp_params(
    template_name: str,
    raw_params: Dict[str, Any]
) -> Tuple[BaseModel, List[str]]:
    """
    Validates input parameters against the template's schema.
    Rejects or auto-clamps out-of-range numerical values and returns:
      - Validated Pydantic model instance
      - List of clamping notices / changes applied
    """
    entry = TEMPLATE_REGISTRY.get(template_name)
    if not entry:
        raise ValueError(f"Unknown template: '{template_name}'. Valid templates: {list(TEMPLATE_REGISTRY.keys())}")

    schema_cls: Type[BaseModel] = entry["schema"]
    clamped_params = dict(raw_params)
    notices: List[str] = []

    # Inspect schema fields for bounds
    for field_name, field_info in schema_cls.model_fields.items():
        val = clamped_params.get(field_name)
        if val is None:
            continue

        if isinstance(val, (int, float)):
            # Check metadata attributes for ge, le, gt, lt
            ge_val = None
            le_val = None
            for meta in field_info.metadata:
                if hasattr(meta, "ge") and meta.ge is not None:
                    ge_val = meta.ge
                if hasattr(meta, "le") and meta.le is not None:
                    le_val = meta.le

            if ge_val is not None and val < ge_val:
                clamped_params[field_name] = ge_val
                notices.append(f"Clamped '{field_name}' from {val} to minimum allowable {ge_val} mm")
            elif le_val is not None and val > le_val:
                clamped_params[field_name] = le_val
                notices.append(f"Clamped '{field_name}' from {val} to maximum allowable {le_val} mm")

    model_instance = schema_cls(**clamped_params)
    return model_instance, notices


def build_template(
    template_name: str,
    params: Union[Dict[str, Any], BaseModel]
) -> Tuple[Union[Compound, Solid], Dict[str, Any]]:
    """
    Builds a parametric CAD template using Build123d.
    Returns (shape, report_dict).
    """
    entry = TEMPLATE_REGISTRY.get(template_name)
    if not entry:
        raise ValueError(f"Unknown template '{template_name}'.")

    if isinstance(params, dict):
        model_instance, notices = validate_and_clamp_params(template_name, params)
    else:
        model_instance = params
        notices = []

    builder: Callable[[BaseModel], Union[Compound, Solid]] = entry["builder"]
    shape = builder(model_instance)

    if not shape.is_valid:
        raise RuntimeError(f"Build123d shape for template '{template_name}' is topologically invalid.")

    vol = shape.volume
    if vol <= 0.0:
        raise RuntimeError(f"Build123d shape for template '{template_name}' has non-positive volume: {vol}")

    bbox = shape.bounding_box()
    report = {
        "template": template_name,
        "volume_mm3": round(vol, 2),
        "bbox_mm": {
            "x": round(bbox.size.X, 2),
            "y": round(bbox.size.Y, 2),
            "z": round(bbox.size.Z, 2),
        },
        "is_valid": True,
        "clamping_notices": notices,
        "parameters": model_instance.model_dump()
    }

    return shape, report

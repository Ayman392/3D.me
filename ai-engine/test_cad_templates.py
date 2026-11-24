"""
Unit tests for Build123d CAD templates (ai-engine/cad_templates/)
Validates all 15 templates: solid validity, volume > 0, closed shell, and bounding box geometry.
"""

import pytest
from cad_templates.registry import (
    TEMPLATE_REGISTRY,
    build_template,
    validate_and_clamp_params,
    list_templates,
)


def test_list_templates():
    templates = list_templates()
    assert len(templates) >= 15
    names = {t["name"] for t in templates}
    expected = {
        "enclosure_with_lid", "board_enclosure", "bracket_l", "bracket_flat_plate",
        "snap_fit_clip", "living_hinge", "pin_hinge", "knob", "battery_cover",
        "gasket_from_profile", "threaded_insert_boss", "thread",
        "spacer_washer", "cable_clip", "wall_hook"
    }
    assert expected.issubset(names)


@pytest.mark.parametrize("template_name", list(TEMPLATE_REGISTRY.keys()))
def test_all_templates_build_default(template_name):
    """Every template must build a valid, closed solid with volume > 0 and a valid bounding box."""
    schema_cls = TEMPLATE_REGISTRY[template_name]["schema"]
    default_instance = schema_cls()
    shape, report = build_template(template_name, default_instance)

    assert shape.is_valid, f"{template_name} failed topological validity check"
    assert report["volume_mm3"] > 0, f"{template_name} volume must be positive, got {report['volume_mm3']}"
    assert report["bbox_mm"]["x"] > 0
    assert report["bbox_mm"]["y"] > 0
    assert report["bbox_mm"]["z"] > 0


def test_auto_clamping_out_of_bounds():
    """Verify out-of-range numerical parameters are auto-clamped and reported."""
    raw_params = {
        "internal_x": 9999.0,  # exceeds max 300.0
        "wall_thickness": 0.1,  # below min 1.2
    }
    model_instance, notices = validate_and_clamp_params("enclosure_with_lid", raw_params)

    assert model_instance.internal_x == 300.0
    assert model_instance.wall_thickness == 1.2
    assert len(notices) == 2
    assert any("internal_x" in n for n in notices)
    assert any("wall_thickness" in n for n in notices)


def test_enclosure_with_lid_bounding_box():
    raw_params = {
        "internal_x": 100.0,
        "internal_y": 60.0,
        "internal_z": 40.0,
        "wall_thickness": 2.0,
    }
    shape, report = build_template("enclosure_with_lid", raw_params)
    # Base is ox=104, oy=64, oz=42
    # Lid is ox=104 placed beside with 10mm gap: total X is around 104*2 + 10 = ~218
    assert report["bbox_mm"]["x"] >= 200.0
    assert report["bbox_mm"]["y"] >= 60.0


def test_bracket_l_dimensions():
    raw_params = {
        "arm1_length": 60.0,
        "arm2_length": 40.0,
        "width": 25.0,
        "thickness": 4.0,
    }
    shape, report = build_template("bracket_l", raw_params)
    assert abs(report["bbox_mm"]["x"] - 60.0) < 1.0
    assert abs(report["bbox_mm"]["y"] - 25.0) < 1.0
    assert abs(report["bbox_mm"]["z"] - 40.0) < 1.0


def test_spacer_washer_dimensions():
    raw_params = {
        "outer_diameter": 20.0,
        "inner_diameter": 6.0,
        "thickness": 8.0,
    }
    shape, report = build_template("spacer_washer", raw_params)
    assert abs(report["bbox_mm"]["x"] - 20.0) < 0.5
    assert abs(report["bbox_mm"]["y"] - 20.0) < 0.5
    assert abs(report["bbox_mm"]["z"] - 8.0) < 0.5

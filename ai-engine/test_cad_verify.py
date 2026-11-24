"""
Unit tests for CAD Verification Gate v2 (Phase 5)
"""

import pytest
from build123d import Box, Pos
from cad_verify import (
    verify_cad_solid_v2,
    check_bounding_box_tolerance,
    check_brep_wall_thickness,
    check_multipart_interference,
    check_printability_overhangs,
)


def test_valid_solid_passes_gate():
    b = Box(50.0, 30.0, 10.0)
    scorecard = verify_cad_solid_v2(b, target_bbox={"x": 50.0, "y": 30.0, "z": 10.0})

    assert scorecard["status"] in ["pass", "warn"]
    assert scorecard["block_export"] is False
    assert any(c["name"] == "Topological Validity" and c["status"] == "pass" for c in scorecard["checks"])


def test_bounding_box_tolerance():
    b = Box(50.05, 30.02, 10.0)
    res = check_bounding_box_tolerance(b, target_bbox={"x": 50.0, "y": 30.0, "z": 10.0}, tolerance_mm=0.1)
    assert res["status"] == "pass"

    # Out of tolerance (delta 1.5mm)
    res_bad = check_bounding_box_tolerance(b, target_bbox={"x": 48.5, "y": 30.0, "z": 10.0}, tolerance_mm=0.1)
    assert res_bad["status"] == "warn"


def test_multipart_interference_detection():
    # 1. Separated parts (zero collision)
    part_a = Pos(0, 0, 0) * Box(20.0, 20.0, 10.0)
    part_b = Pos(30, 0, 0) * Box(20.0, 20.0, 10.0)
    res_ok = check_multipart_interference(part_a, part_b)
    assert res_ok["status"] == "pass"
    assert res_ok["interference_volume_mm3"] == 0.0

    # 2. Overlapping parts (physical collision)
    part_c = Pos(5, 0, 0) * Box(20.0, 20.0, 10.0)
    res_interfere = check_multipart_interference(part_a, part_c)
    assert res_interfere["status"] == "fail"
    assert res_interfere["interference_volume_mm3"] > 100.0


def test_interference_blocks_export():
    part_a = Pos(0, 0, 0) * Box(20.0, 20.0, 10.0)
    part_c = Pos(5, 0, 0) * Box(20.0, 20.0, 10.0)
    scorecard = verify_cad_solid_v2(part_a, mating_solid=part_c)

    assert scorecard["status"] == "fail"
    assert scorecard["block_export"] is True

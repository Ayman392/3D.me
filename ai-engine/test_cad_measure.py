"""
Unit tests for Dimension Inspection & Scale Confirmation (Phase 2)
"""

import pytest
from fastapi.testclient import TestClient
from app import app
from cad_measure import (
    REFERENCE_STANDARDS_MM,
    detect_aruco_scale,
    detect_reference_scale,
    build_dimension_confirmation_table,
)

client = TestClient(app)


def test_reference_standards():
    assert "credit_card" in REFERENCE_STANDARDS_MM
    assert REFERENCE_STANDARDS_MM["credit_card"]["width"] == 85.60
    assert REFERENCE_STANDARDS_MM["credit_card"]["height"] == 53.98
    assert REFERENCE_STANDARDS_MM["a4"]["width"] == 210.0


def test_dimension_table_unconfirmed():
    table = build_dimension_confirmation_table(
        template_name="bracket_l",
        raw_parameters={"arm1_length": 60.0, "arm2_length": 40.0},
        scale_source="unconfirmed",
        user_confirmed=False
    )
    assert table["can_generate"] is False
    assert table["unconfirmed_count"] > 0
    for feat in table["features"]:
        assert feat["source"] == "estimated"
        assert feat["confirmed"] is False


def test_dimension_table_caliper_confirmed():
    table = build_dimension_confirmation_table(
        template_name="bracket_l",
        raw_parameters={"arm1_length": 60.0, "arm2_length": 40.0},
        scale_source="caliper",
        user_confirmed=True
    )
    assert table["can_generate"] is True
    assert table["unconfirmed_count"] == 0
    for feat in table["features"]:
        assert feat["source"] == "user"
        assert feat["confirmed"] is True


def test_inspect_endpoint_returns_table():
    res = client.post("/cad/inspect", json={"prompt": "electronics enclosure with snap lid"})
    assert res.status_code == 200
    data = res.json()
    assert data["template"] == "enclosure_with_lid"
    assert data["can_generate"] is False
    assert len(data["features"]) >= 4


def test_cad_design_rejects_unconfirmed():
    res = client.post("/cad/design", json={"prompt": "make a replacement bracket"})
    assert res.status_code == 422
    assert "dimensions are unconfirmed" in res.json()["detail"].lower()

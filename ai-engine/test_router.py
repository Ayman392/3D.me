"""
Unit tests for 3d.me Intent Router (/route/classify)
"""

import pytest
from fastapi.testclient import TestClient
from app import app
from router import classify_intent, classify_intent_heuristic

client = TestClient(app)

def test_heuristic_functional_cases():
    test_cases = [
        "electronics enclosure with screw lid and port cutouts",
        "heavy duty L-bracket with M4 holes",
        "snap fit cable clip for desk 25mm thickness",
        "replacement knob for 6mm D-shaft",
        "box with 3mm wall thickness and mounting standoffs",
        "battery cover for tv remote",
        "gasket for sealing water pipe",
        "pin hinge mechanism with 2mm clearance"
    ]
    for prompt in test_cases:
        res = classify_intent_heuristic(prompt)
        assert res is not None, f"Failed to classify prompt: {prompt}"
        assert res["mode"] == "functional", f"Expected functional for '{prompt}', got: {res}"
        assert len(res["reason"]) > 0

def test_heuristic_decorative_cases():
    test_cases = [
        "cute dragon figurine with wings",
        "sculpture of a sleeping cat on a cushion",
        "fantasy miniature warrior character for dnd",
        "decorative bust statue of Marcus Aurelius",
        "stylized vinyl toy rabbit"
    ]
    for prompt in test_cases:
        res = classify_intent_heuristic(prompt)
        assert res is not None, f"Failed to classify prompt: {prompt}"
        assert res["mode"] == "decorative", f"Expected decorative for '{prompt}', got: {res}"
        assert len(res["reason"]) > 0

def test_router_classify_endpoint_functional():
    response = client.post("/route/classify", json={"prompt": "wall mount bracket for router with 4mm screw holes"})
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "functional"
    assert "bracket" in data["reason"].lower() or "functional" in data["reason"].lower()

def test_router_classify_endpoint_decorative():
    response = client.post("/route/classify", json={"prompt": "detailed miniature creature figurine"})
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "decorative"
    assert "figurine" in data["reason"].lower() or "decorative" in data["reason"].lower()

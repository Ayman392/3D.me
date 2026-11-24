import copy
import json
import math
import os
import sys
import tempfile
from unittest.mock import patch, MagicMock
import httpx
import numpy as np
import trimesh
from fastapi.testclient import TestClient

from cad_design import BOARDS, resolve, layout, check, get_presets
from cad_build import build, export_all
import cad_edit
import cad_parts
import cad_project
import cad_robot
import cad_robot_build
import cad_vision
import cad_library
from app import app

def test_reference_character_design():
    print("--- Running test_reference_character_design ---")
    # Outer about 80 x 60 x 55 mm, corner_radius 12, wall 2.4
    wall = 2.4
    outer_l, outer_w, outer_h = 80.0, 60.0, 55.0
    inner_l = outer_l - 2 * wall
    inner_w = outer_w - 2 * wall
    inner_h = outer_h - 2 * wall

    ref_spec = {
        "body": {"shape": "rounded_box", "corner_radius": 12.0},
        "inner": [inner_l, inner_w, inner_h],
        "wall": wall,
        "corner_radius": 12.0,
        "split": "back",
        "components": [
            {"id": "esp32", "name": "ESP32 DevKit", "size": [51.5, 28.5, 13.0], "qty": 1}
        ],
        "windows": [
            {
                "id": "front_win",
                "face": "front",
                "shape": "rect",
                "w": 50.0,
                "h": 38.0,
                "x": 0.0,
                "z": 0.0,
                "corner_radius": 6.0,
            },
            {
                "id": "bottom_hole",
                "face": "front",
                "shape": "round",
                "w": 3.0,
                "h": 3.0,
                "x": 0.0,
                "z": -20.0,
            },
        ],
        "appendages": [
            {
                "id": "ears",
                "name": "Ears",
                "type": "cone",
                "face": "top",
                "x": 20.0,
                "z": 0.0,
                "base_d": 16.0,
                "tip_d": 3.0,
                "length": 22.0,
                "tilt_deg": 10.0,
                "mirror": True,
            },
            {
                "id": "arms",
                "name": "Arms",
                "type": "cone",
                "face": "left",
                "x": 0.0,
                "z": 0.0,
                "base_d": 12.0,
                "tip_d": 8.0,
                "length": 22.0,
                "tilt_deg": 0.0,
                "mirror": True,
            },
        ],
    }

    issues = check(ref_spec)
    errors = [i for i in issues if i["level"] == "error"]
    warns = [i for i in issues if i["level"] == "warn"]
    print(f"Check: errors={len(errors)}, warnings={len(warns)}")
    assert len(errors) == 0, f"Expected 0 errors, got: {errors}"

    # Overhang warnings must appear for horizontal arms
    arm_warns = [w for w in warns if "overhang" in w["msg"].lower() and "arm" in w["msg"].lower()]
    assert len(arm_warns) > 0, "Expected overhang warning for horizontal arms"
    print(f"  ✓ Verified overhang warning: {arm_warns[0]['msg']}")

    # Build and export
    with tempfile.TemporaryDirectory() as td:
        shell, cover = build(ref_spec)
        files = export_all(shell, cover, td, inner_h=inner_h, wall=wall, spec=ref_spec)

        for expected in ["front_shell.stl", "back_cover.stl", "both.glb", "ghost.glb"]:
            fpath = os.path.join(td, expected)
            assert os.path.exists(fpath), f"{expected} does not exist"
            assert os.path.getsize(fpath) > 0, f"{expected} is empty"

        m_shell = trimesh.load(files["shell_stl"])
        m_cover = trimesh.load(files["cover_stl"])
        print(f"  Shell watertight: {m_shell.is_watertight}")
        print(f"  Cover watertight: {m_cover.is_watertight}")
        assert m_shell.is_watertight, "Front shell STL is not watertight"
        assert m_cover.is_watertight, "Back cover STL is not watertight"

    print("test_reference_character_design PASSED!\n")
    return ref_spec

def test_relative_edits_and_atomic_rollback(base_spec):
    print("--- Running test_relative_edits_and_atomic_rollback ---")
    spec = copy.deepcopy(base_spec)

    # 1. Relative edit: ears 4 mm taller (length 22 -> 26 mm)
    ops = [{"op": "set_appendage", "id": "ears", "d_length": 4.0}]
    new_spec, diffs = cad_edit.apply_ops(spec, ops)
    ear_app = next(a for a in new_spec["appendages"] if a["id"] == "ears")
    assert ear_app["length"] == 26.0, f"Expected length 26.0, got {ear_app['length']}"
    assert any("22.0 -> 26.0" in d for d in diffs)
    print("  ✓ Relative edit ('ears 4 mm taller') passed:", diffs)

    # 2. Mirrored add: add feet on bottom with mirror
    add_ops = [
        {
            "op": "add_appendage",
            "id": "feet",
            "name": "Feet",
            "type": "cylinder",
            "face": "bottom",
            "x": 18.0,
            "z": 0.0,
            "base_d": 12.0,
            "tip_d": 12.0,
            "length": 8.0,
            "mirror": True,
        }
    ]
    spec_with_feet, add_diffs = cad_edit.apply_ops(new_spec, add_ops)
    foot_app = next(a for a in spec_with_feet["appendages"] if a["id"] == "feet")
    assert foot_app["mirror"] is True
    print("  ✓ Mirrored add ('feet') passed:", add_diffs)

    # 3. Atomic rejection: if an edit produces an error (e.g. wall thickness 0.5 < 1.2), spec is NOT mutated
    bad_ops = [{"op": "set_wall", "wall": 0.5}]
    original_copy = copy.deepcopy(spec_with_feet)
    try:
        cad_edit.apply_ops(spec_with_feet, bad_ops)
        assert False, "Should have raised EditError for wall < 1.2"
    except cad_edit.EditError as ee:
        print("  ✓ Atomic rejection caught expected error:", ee)
    # Ensure original spec wasn't mutated
    assert spec_with_feet == original_copy, "Spec was mutated despite error in atomic apply_ops!"
    print("  ✓ Atomic rollback verified")

    # 4. Oversized design hitting printer bed error (>220 mm)
    oversized_spec = copy.deepcopy(spec)
    oversized_spec["inner"][0] = 250.0  # 250 + 2*2.4 = 254.8 > 220
    issues = check(oversized_spec)
    oversized_errors = [i for i in issues if i["level"] == "error"]
    assert len(oversized_errors) > 0
    assert any("exceeds printer bed" in e["msg"] for e in oversized_errors)
    print("  ✓ Oversized design bed check passed:", oversized_errors[0]["msg"])

    print("test_relative_edits_and_atomic_rollback PASSED!\n")

def test_session_undo_redo_reset(base_spec):
    print("--- Running test_session_undo_redo_reset ---")
    sid = "test-session-123"
    sess = cad_edit.get_or_create_session(sid, base_spec, "Initial design")
    assert sess.current_idx == 0
    assert len(sess.history) == 1

    # Edit 1: ears 4 mm taller
    s1, d1 = cad_edit.apply_ops(sess.spec, [{"op": "set_appendage", "id": "ears", "d_length": 4.0}])
    v1 = sess.push_version(s1, d1, "ears 4 mm taller")
    assert v1 == 2
    assert sess.spec["appendages"][0]["length"] == 26.0

    # Edit 2: arms tilted down 15 degrees
    s2, d2 = cad_edit.apply_ops(sess.spec, [{"op": "set_appendage", "id": "arms", "d_tilt": -15.0}])
    v2 = sess.push_version(s2, d2, "arms tilted down 15 degrees")
    assert v2 == 3
    assert sess.spec["appendages"][1]["tilt_deg"] == -15.0

    # Undo step 2
    undone_spec, msg = sess.undo()
    assert sess.current_idx == 1
    assert undone_spec["appendages"][1]["tilt_deg"] == 0.0
    print("  ✓ Undo step verified:", msg)

    # Redo step 2
    redone_spec, msg = sess.redo()
    assert sess.current_idx == 2
    assert redone_spec["appendages"][1]["tilt_deg"] == -15.0
    print("  ✓ Redo step verified:", msg)

    # Reset
    reset_spec, msg = sess.reset()
    assert sess.current_idx == 0
    assert reset_spec["appendages"][0]["length"] == 22.0
    print("  ✓ Reset verified:", msg)

    print("test_session_undo_redo_reset PASSED!\n")

def test_cad_api_endpoints():
    print("--- Running test_cad_api_endpoints with TestClient ---")
    client = TestClient(app)

    # 1. GET /cad/boards (check OLED & SG90 are present)
    resp = client.get("/cad/boards")
    assert resp.status_code == 200
    boards = resp.json()
    b_keys = [b["key"] for b in boards]
    assert "0.96in oled ssd1306" in b_keys
    assert "sg90 servo" in b_keys
    print("  ✓ GET /cad/boards includes OLED and SG90")

    # 2. POST /cad/session (mocked initial design)
    mock_plan = {
        "message": {
            "content": json.dumps({
                "components": ["esp32 devkit", "0.96in oled ssd1306"],
                "split": "back",
                "wall": 2.4,
                "presets": ["cat ears", "stubby arms"],
                "windows": [
                    {"id": "front_win", "face": "front", "shape": "rect", "w": 40.0, "h": 25.0, "x": 0.0, "z": 0.0, "corner_radius": 4.0}
                ],
                "appendages": []
            })
        }
    }
    with patch("httpx.Client.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_plan
        mock_post.return_value = mock_resp

        sess_resp = client.post("/cad/session", json={"prompt": "cat-style head case for an ESP32 and a 0.96in OLED"})
        assert sess_resp.status_code == 200
        sess_data = sess_resp.json()
        sid = sess_data["session_id"]
        assert "spec" in sess_data
        print(f"  ✓ POST /cad/session created session: {sid}")

        # 3. POST /cad/session/{id}/edit with natural language prompt (Mocked Ollama)
        mock_edit_resp = {
            "message": {
                "content": json.dumps({
                    "ops": [
                        {"op": "set_appendage", "id": "ears", "d_length": 4.0}
                    ],
                    "explanation": "Made the ears 4 mm taller."
                })
            }
        }
        mock_resp.json.return_value = mock_edit_resp
        edit_resp = client.post(f"/cad/session/{sid}/edit", json={"prompt": "ears 4 mm taller"})
        assert edit_resp.status_code == 200
        edit_data = edit_resp.json()
        assert edit_data["version"] == 2
        print(f"  ✓ POST /cad/session/{sid}/edit succeeded (v2): {edit_data['diff']}")

        # 4. POST /cad/session/{id}/undo
        undo_resp = client.post(f"/cad/session/{sid}/undo")
        assert undo_resp.status_code == 200
        assert undo_resp.json()["version"] == 1
        print("  ✓ POST /cad/session/undo returned to v1")

        # 5. POST /cad/build
        build_resp = client.post("/cad/build", json=edit_data["spec"])
        assert build_resp.status_code == 200
        b_data = build_resp.json()
        bid = b_data["id"]
        assert "files" in b_data
        assert "shell_stl" in b_data["files"]
        print(f"  ✓ POST /cad/build built character shell: {bid}")

        # 6. GET file artifact
        f_resp = client.get(f"/cad/{bid}/front_shell.stl")
        assert f_resp.status_code == 200
        assert len(f_resp.content) > 0
        print(f"  ✓ Served front_shell.stl ({len(f_resp.content)} bytes)")

    print("test_cad_api_endpoints PASSED!\n")

def test_project_crud():
    print("--- Running test_project_crud ---")
    client = TestClient(app)

    # 1. Create project
    create_payload = {
        "name": "Test Bracket Project",
        "spec": {
            "mode": "part",
            "part_type": "bracket",
            "measurements": {"leg1": 40.0, "leg2": 25.0, "width": 20.0, "thickness": 3.0}
        }
    }
    resp = client.post("/cad/projects", json=create_payload)
    assert resp.status_code == 200, f"Failed create: {resp.text}"
    p_data = resp.json()
    pid = p_data["id"]
    assert p_data["name"] == "Test Bracket Project"
    print(f"  ✓ Created project: {pid}")

    # 2. List projects
    resp = client.get("/cad/projects")
    assert resp.status_code == 200
    all_projs = resp.json()
    assert any(p["id"] == pid for p in all_projs)
    print(f"  ✓ Listed projects ({len(all_projs)} found)")

    # 3. Get project
    resp = client.get(f"/cad/projects/{pid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == pid
    print(f"  ✓ Retrieved project {pid}")

    # 4. Update project (rename and spec update)
    update_payload = {
        "name": "Renamed Bracket Project",
        "spec": {
            "mode": "part",
            "part_type": "bracket",
            "measurements": {"leg1": 50.0, "leg2": 30.0, "width": 20.0, "thickness": 3.0}
        }
    }
    resp = client.put(f"/cad/projects/{pid}", json=update_payload)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Bracket Project"
    assert resp.json()["spec"]["measurements"]["leg1"] == 50.0
    print(f"  ✓ Updated project {pid}")

    # 5. Duplicate project
    resp = client.post(f"/cad/projects/{pid}/duplicate")
    assert resp.status_code == 200
    dup_data = resp.json()
    dup_id = dup_data["id"]
    assert dup_id != pid
    assert "Copy" in dup_data["name"]
    print(f"  ✓ Duplicated project to {dup_id}")

    # 6. Save thumbnail
    import base64
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    b64_png = "data:image/png;base64," + base64.b64encode(fake_png).decode("utf-8")
    resp = client.post(f"/cad/projects/{pid}/thumbnail", json={"image_base64": b64_png})
    assert resp.status_code == 200
    assert "thumbnail" in resp.json()

    # 7. Get thumbnail
    resp = client.get(f"/cad/projects/{pid}/thumbnail.png")
    assert resp.status_code == 200
    assert resp.content == fake_png
    print(f"  ✓ Verified project thumbnail upload and download")

    # 8. Delete projects
    resp = client.delete(f"/cad/projects/{pid}")
    assert resp.status_code == 200
    resp = client.delete(f"/cad/projects/{dup_id}")
    assert resp.status_code == 200
    print(f"  ✓ Deleted test projects")

    # 9. Path traversal rejection
    resp = client.get("/cad/projects/..%2F..%2Fetc")
    assert resp.status_code in (400, 404)
    resp = client.get("/cad/projects/../test")
    assert resp.status_code in (400, 404)
    print("  ✓ Path traversal rejected")
    print("test_project_crud PASSED!\n")


def test_bracket_and_hole_precision():
    print("--- Running test_bracket_and_hole_precision ---")
    spec = {
        "mode": "part",
        "part_type": "bracket",
        "measurements": {
            "leg1": 40.0,
            "leg2": 25.0,
            "width": 20.0,
            "thickness": 3.0,
            "fillet": 2.0
        },
        "features": [
            {"type": "linear_pattern", "count": 2, "pitch": 30.0, "d": 3.0, "leg": "leg1"}
        ]
    }

    bracket = cad_parts.build_bracket(spec)

    # 1. B-Rep distance verification
    centers = []
    for e in bracket.val().Edges():
        if e.geomType() == "CIRCLE":
            c = e.Center()
            if abs(c.z) < 0.01:
                if not any(math.dist((c.x, c.y), (cx, cy)) < 0.1 for cx, cy in centers):
                    centers.append((c.x, c.y))
    assert len(centers) == 2, f"Expected 2 hole centers on Z=0, got {len(centers)}: {centers}"
    brep_dist = math.dist(centers[0], centers[1])
    print(f"  ✓ B-Rep hole spacing: {brep_dist:.6f} mm (error: {abs(brep_dist - 30.0):.6f} mm)")
    assert abs(brep_dist - 30.0) < 0.001, f"B-Rep hole distance {brep_dist} exceeds 0.001 mm error tolerance"

    # 2. Build and export STL with export_all
    with tempfile.TemporaryDirectory() as td:
        exported = export_all(bracket, None, td, spec=spec)
        stl_path = exported["part_stl"]
        assert os.path.exists(stl_path), "part_stl missing"

        m = trimesh.load(stl_path)
        assert m.is_watertight, "Exported STL bracket must be watertight"
        print(f"  ✓ STL is watertight: vertices={len(m.vertices)}, faces={len(m.faces)}")

        # Slice mesh along Z = 1.5 mm (mid-thickness of leg1)
        sec = m.section(plane_origin=[0, 0, 1.5], plane_normal=[0, 0, 1])
        assert sec is not None, "Failed to slice bracket STL"
        loops = sec.discrete
        hole_centroids = []
        for l in loops:
            pts = np.array(l)
            bbox = pts.max(axis=0) - pts.min(axis=0)
            if bbox[0] < 10.0 and bbox[1] < 10.0:
                hole_centroids.append(pts.mean(axis=0))

        assert len(hole_centroids) == 2, f"Expected 2 hole cross sections in STL slice, found {len(hole_centroids)}"
        stl_dist = float(np.linalg.norm(hole_centroids[0] - hole_centroids[1]))
        stl_diff = abs(stl_dist - 30.0)
        print(f"  ✓ STL hole spacing: {stl_dist:.5f} mm (difference from 30 mm: {stl_diff:.6f} mm)")
        assert stl_diff < 0.01, f"STL hole spacing error {stl_diff:.6f} mm exceeds 0.01 mm tolerance"

    print("test_bracket_and_hole_precision PASSED!\n")


def test_part_edge_clearance_error():
    print("--- Running test_part_edge_clearance_error ---")
    spec_too_close = {
        "mode": "part",
        "part_type": "bracket",
        "measurements": {
            "leg1": 40.0,
            "leg2": 25.0,
            "width": 20.0,
            "thickness": 3.0,
            "fillet": 2.0
        },
        "features": [
            {"type": "hole", "x": 4.0, "y": 0.0, "d": 3.0}
        ]
    }
    issues = cad_parts.check_part(spec_too_close)
    errors = [i for i in issues if i.get("level") == "error"]
    assert len(errors) > 0, "Expected error for hole too close to bracket edge"
    edge_err = next((e for e in errors if "too close" in e["msg"].lower() or "1.5 mm" in e["msg"]), None)
    assert edge_err is not None, f"Expected clearance error message, got: {errors}"
    print(f"  ✓ Verified edge clearance error: {edge_err['msg']}")

    # Plate edge clearance test
    plate_too_close = {
        "mode": "part",
        "part_type": "plate",
        "measurements": {"length": 50.0, "width": 50.0, "thickness": 3.0},
        "features": [
            {"type": "hole", "x": 24.5, "y": 0.0, "d": 3.0}
        ]
    }
    p_issues = cad_parts.check_part(plate_too_close)
    p_errors = [i for i in p_issues if i.get("level") == "error"]
    assert len(p_errors) > 0, "Expected error for plate hole too close to edge"
    print(f"  ✓ Verified plate edge clearance error: {p_errors[0]['msg']}")
    print("test_part_edge_clearance_error PASSED!\n")


def test_model_scale():
    print("--- Running test_model_scale ---")
    client = TestClient(app)

    # 1. Create a sample GLB box [50, 20, 10] in outputs/
    box = trimesh.creation.box(extents=[50.0, 20.0, 10.0])
    base_id = "test_scale_box"
    from app import OUTPUTS_DIR
    out_glb_path = os.path.join(OUTPUTS_DIR, f"{base_id}.glb")
    box.export(out_glb_path)

    try:
        # Scale X axis from 50.0 to 75.0 mm
        resp = client.post("/models/scale", json={
            "model_id": base_id,
            "axis": "x",
            "target_length_mm": 75.0
        })
        assert resp.status_code == 200, f"Scale failed: {resp.text}"
        data = resp.json()
        assert data["status"] == "success"
        assert data["axis"] == "x"
        assert data["scale_factor"] == 1.5
        assert data["warning"] == "Generated from one photo. Shape is approximate. Not for mating surfaces."
        print(f"  ✓ Verified scale factor: {data['scale_factor']} and disclaimer warning")

        # Check scaled GLB file on disk
        scaled_id = data["scaled_model_id"]
        scaled_path = os.path.join(OUTPUTS_DIR, f"{scaled_id}.glb")
        assert os.path.exists(scaled_path), f"Scaled GLB file missing: {scaled_path}"

        scaled_mesh = trimesh.load(scaled_path)
        x_extent = float(scaled_mesh.extents[0])
        print(f"  ✓ Scaled X extent: {x_extent:.5f} mm (diff: {abs(x_extent - 75.0):.6f} mm)")
        assert abs(x_extent - 75.0) < 0.01, f"Scaled extent {x_extent} differs from 75.0 mm by > 0.01 mm"

    finally:
        if os.path.exists(out_glb_path):
            os.remove(out_glb_path)
        scaled_file = os.path.join(OUTPUTS_DIR, f"{base_id}_scaled.glb")
        if os.path.exists(scaled_file):
            os.remove(scaled_file)

    print("test_model_scale PASSED!\n")

def test_analyze_photo_workflow():
    print("--- Running test_analyze_photo_workflow ---")
    client = TestClient(app)

    # 1. Assert system prompt strictly forbids numeric dimensions
    from cad_vision import VISION_SYSTEM_PROMPT, strip_numeric_dimensions
    assert "NEVER output numeric dimensions" in VISION_SYSTEM_PROMPT
    assert "All dimensions must be measured by the user with calipers" in VISION_SYSTEM_PROMPT
    print("  ✓ System prompt forbids numeric dimensions")

    # 2. Test stripping numeric dimensions from features
    dirty_feature = "L-shaped mounting bracket with 40 mm bottom leg, 25mm upright, and 2 Ø3.4mm holes"
    clean_feature = strip_numeric_dimensions(dirty_feature)
    assert "40 mm" not in clean_feature
    assert "25mm" not in clean_feature
    assert "3.4" not in clean_feature
    print(f"  ✓ Stripped numeric dimensions: '{dirty_feature}' -> '{clean_feature}'")

    # 3. Create a synthetic test image (JPEG, 400x300)
    import io
    from PIL import Image
    test_img = Image.new("RGB", (400, 300), color=(180, 180, 180))
    buf = io.BytesIO()
    test_img.save(buf, format="JPEG")
    jpeg_bytes = buf.getvalue()

    # 4. Mock valid Ollama vision response
    mock_vision_data = {
        "message": {
            "content": json.dumps({
                "part_type": "bracket",
                "confidence": "high",
                "features": [
                    "L-shaped 90-degree right angle bend",
                    "Two through-holes on bottom leg with 40mm spacing",
                    "Inside corner bend fillet"
                ],
                "measure_checklist": [
                    {"key": "leg1", "label": "Leg 1 Length", "hint": "Base leg along X"},
                    {"key": "leg2", "label": "Leg 2 Height", "hint": "Vertical leg along Z"},
                    {"key": "width", "label": "Width", "hint": "Depth along Y"},
                    {"key": "thickness", "label": "Thickness", "hint": "Wall thickness T"},
                    {"key": "fillet", "label": "Inside Fillet", "hint": "Bend radius"}
                ],
                "notes": "Sheet metal mounting bracket in good condition"
            })
        }
    }

    with patch("httpx.Client.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_vision_data
        mock_resp.text = json.dumps(mock_vision_data)
        mock_post.return_value = mock_resp

        # Call /cad/analyze-photo
        resp = client.post(
            "/cad/analyze-photo",
            files={"file": ("bracket_sample.jpg", jpeg_bytes, "image/jpeg")}
        )
        assert resp.status_code == 200, f"Failed analyze-photo: {resp.text}"
        data = resp.json()
        assert data["part_type"] == "bracket"
        assert data["confidence"] == "high"
        assert len(data["measure_checklist"]) == 5
        assert "image_url" in data
        assert "project_id" in data
        # Check that numbers were stripped from features
        for feat in data["features"]:
            assert "40mm" not in feat
        print("  ✓ Valid analyze-photo returned correct part_type, checklist, and stripped dimensions")

        # 5. Invalid JSON response triggers retry then 422
        bad_json_resp = MagicMock()
        bad_json_resp.status_code = 200
        bad_json_resp.json.return_value = {"message": {"content": "Not valid json at all!"}}
        bad_json_resp.text = "Not valid json at all!"
        mock_post.return_value = bad_json_resp

        err_resp = client.post(
            "/cad/analyze-photo",
            files={"file": ("bracket_sample.jpg", jpeg_bytes, "image/jpeg")}
        )
        assert err_resp.status_code == 422
        print("  ✓ Invalid JSON triggered retry then 422")

        # 6. Ollama offline returns 503 with pull instruction
        mock_post.side_effect = httpx.ConnectError("Connection refused")
        offline_resp = client.post(
            "/cad/analyze-photo",
            files={"file": ("bracket_sample.jpg", jpeg_bytes, "image/jpeg")}
        )
        assert offline_resp.status_code == 503
        assert "ollama pull qwen2.5vl:7b" in offline_resp.json()["detail"]
        print("  ✓ Ollama offline returned 503 with exact pull instruction")

    # 7. Unsupported file format rejected
    mock_post.side_effect = None
    bad_type_resp = client.post(
        "/cad/analyze-photo",
        files={"file": ("script.py", b"print(1)", "text/x-python")}
    )
    assert bad_type_resp.status_code == 400
    print("  ✓ Unsupported file type rejected with 400")

    # 8. Oversize file (>15 MB) rejected
    big_bytes = b"0" * (16 * 1024 * 1024)
    oversize_resp = client.post(
        "/cad/analyze-photo",
        files={"file": ("huge.jpg", big_bytes, "image/jpeg")}
    )
    assert oversize_resp.status_code == 400
    print("  ✓ Oversize file (>15 MB) rejected with 400")

    print("test_analyze_photo_workflow PASSED!\n")


def test_estimate_scale():
    print("--- Running test_estimate_scale ---")
    client = TestClient(app)

    # Synthetic test:
    # A US quarter (known diameter 24.26 mm) spans 200.0 pixels in the image.
    # A feature to measure spans 300.0 pixels.
    # Expected physical length: 300.0 * (24.26 / 200.0) = 36.39 mm.
    req_payload = {
        "reference": "coin",
        "coin_type": "us_quarter",
        "ref_points": [[100.0, 100.0], [300.0, 100.0]],    # distance = 200.0 px
        "target_points": [[50.0, 50.0], [50.0, 350.0]]      # distance = 300.0 px
    }
    resp = client.post("/cad/estimate-scale", json=req_payload)
    assert resp.status_code == 200, f"Estimate scale failed: {resp.text}"
    data = resp.json()
    estimated_mm = data["estimated_mm"]
    expected_mm = 300.0 * (24.26 / 200.0)  # 36.39 mm
    diff = abs(estimated_mm - expected_mm)
    print(f"  ✓ Estimated mm: {estimated_mm:.2f} mm (expected: {expected_mm:.2f} mm, diff: {diff:.4f} mm)")
    assert diff < 0.5, f"Estimated mm error {diff:.4f} mm exceeds 0.5 mm tolerance"
    assert data["disclaimer"] == "estimate, +/- 5-10%, confirm with calipers"

    # Test credit card reference (known 85.60 mm)
    card_payload = {
        "reference": "card",
        "ref_points": [[0.0, 0.0], [856.0, 0.0]],          # 856 px -> 0.1 mm/px
        "target_points": [[10.0, 10.0], [210.0, 10.0]]      # 200 px -> 20.0 mm
    }
    card_resp = client.post("/cad/estimate-scale", json=card_payload)
    assert card_resp.status_code == 200
    card_data = card_resp.json()
    assert abs(card_data["estimated_mm"] - 20.0) < 0.1
    print("  ✓ Credit card scale estimate verified")

    # Points too close together (< 1 px) rejected
    too_close_payload = {
        "reference": "coin",
        "coin_type": "us_quarter",
        "ref_points": [[100.0, 100.0], [100.2, 100.2]],
        "target_points": [[50.0, 50.0], [100.0, 50.0]]
    }
    close_resp = client.post("/cad/estimate-scale", json=too_close_payload)
    assert close_resp.status_code == 400
    print("  ✓ Coincident reference points (< 1 px) rejected with 400")

    print("test_estimate_scale PASSED!\n")


def test_photo_saved_in_project_and_path_traversal():
    print("--- Running test_photo_saved_in_project_and_path_traversal ---")
    client = TestClient(app)

    # 1. Create a project
    proj_resp = client.post("/cad/projects", json={"name": "Photo Test Project"})
    assert proj_resp.status_code == 200
    pid = proj_resp.json()["id"]

    # 2. Upload photo with project_id
    import io
    from PIL import Image
    test_img = Image.new("RGB", (200, 200), color=(100, 150, 200))
    buf = io.BytesIO()
    test_img.save(buf, format="JPEG")
    jpeg_bytes = buf.getvalue()

    mock_data = {
        "message": {
            "content": json.dumps({
                "part_type": "bracket",
                "confidence": "medium",
                "features": ["Flange", "Mounting surface"],
                "measure_checklist": []
            })
        }
    }
    with patch("httpx.Client.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_data
        mock_resp.text = json.dumps(mock_data)
        mock_post.return_value = mock_resp

        upload_resp = client.post(
            "/cad/analyze-photo",
            data={"project_id": pid},
            files={"file": ("reference.jpg", jpeg_bytes, "image/jpeg")}
        )
        assert upload_resp.status_code == 200
        data = upload_resp.json()
        assert data["project_id"] == pid

        # 3. Verify file exists on disk in outputs/projects/<id>/reference.jpg
        from cad_project import get_project_dir
        p_dir = get_project_dir(pid)
        ref_file = os.path.join(p_dir, "reference.jpg")
        assert os.path.exists(ref_file), f"Photo was not saved to {ref_file}"
        assert os.path.getsize(ref_file) > 0
        print(f"  ✓ Photo saved in project directory: {ref_file}")

        # 4. Path traversal attempt in project_id rejected
        bad_pid_resp = client.post(
            "/cad/analyze-photo",
            data={"project_id": "../traversal_attack"},
            files={"file": ("reference.jpg", jpeg_bytes, "image/jpeg")}
        )
        assert bad_pid_resp.status_code == 400
        print("  ✓ Path traversal project_id rejected with 400")

    # Clean up project
    client.delete(f"/cad/projects/{pid}")
    print("test_photo_saved_in_project_and_path_traversal PASSED!\n")

def test_reference_robot_build():
    print("--- Running test_reference_robot_build ---")
    import time
    t0 = time.time()
    spec = cad_robot.create_chibi_robot_spec(120.0)

    # 1. Feasibility check
    issues = cad_robot.check_robot(spec)
    errors = [i for i in issues if i["level"] == "error"]
    assert len(errors) == 0, f"Feasibility check failed with errors: {errors}"
    print(f"  ✓ Feasibility check passed (0 errors, {len(issues)} warnings)")

    # 2. Build assembly solids
    solids = cad_robot_build.build_robot_assembly_solids(spec)
    assert len(solids) > 0, "No solids returned from builder"
    print(f"  ✓ Built {len(solids)} solid geometries")

    # 3. Export to temp directory
    with tempfile.TemporaryDirectory() as tmp_dir:
        files = cad_robot_build.export_robot_spec(spec, tmp_dir)
        build_time = time.time() - t0
        print(f"  ✓ Exported robot assembly in {build_time:.2f}s (< 60s target on M1)")
        assert build_time < 60.0, f"Build took {build_time:.2f}s, expected < 60s"

        # 4. Watertightness check on all 9 STL files
        expected_stls = [
            "head_front.stl", "head_back.stl",
            "body_front.stl", "body_back.stl",
            "neck.stl",
            "arm_left.stl", "arm_right.stl",
            "ear_left.stl", "ear_right.stl"
        ]
        for stl_name in expected_stls:
            stl_path = os.path.join(tmp_dir, stl_name)
            assert os.path.exists(stl_path), f"Missing expected STL file: {stl_name}"
            mesh = trimesh.load(stl_path)
            mesh.process(validate=True)
            assert mesh.is_watertight, f"STL {stl_name} is not watertight!"
            assert mesh.volume > 0, f"STL {stl_name} has invalid volume: {mesh.volume}"
            print(f"  ✓ Watertight STL verified: {stl_name} (volume: {mesh.volume:.1f} mm³)")

        # 5. Check all.zip contains all 9 STLs
        zip_path = os.path.join(tmp_dir, "all.zip")
        assert os.path.exists(zip_path), "all.zip not generated"
        import zipfile
        with zipfile.ZipFile(zip_path, 'r') as z:
            names = z.namelist()
            for stl_name in expected_stls:
                assert stl_name in names, f"{stl_name} not found in all.zip"
        print(f"  ✓ Verified all.zip contains all 9 STL parts")

        # 6. Verify display window matches active area within 0.2 mm
        head_part = [p for p in spec["parts"] if p["kind"] == "head"][0]
        active_w, active_h = head_part["display"]["active_area"]
        assert head_part["display"]["ledge"] == 1.5
        print(f"  ✓ Display pocket ledge verified at 1.5 mm, active area {active_w}x{active_h} mm")

    print("test_reference_robot_build PASSED!\n")
    return spec

def test_robot_edits_and_undo(spec):
    print("--- Running test_robot_edits_and_undo ---")
    client = TestClient(app)

    # Create session with robot spec
    s_resp = client.post("/cad/session", json={"spec": spec, "mode": "robot"})
    assert s_resp.status_code == 200
    s_data = s_resp.json()
    sid = s_data["session_id"]
    print(f"  ✓ Session created: {sid} (mode: robot)")

    # 5 sequential edits
    edits = [
        ("make the head 6 mm wider", [{"op": "set_part", "kind": "head", "d_w": 6.0}], lambda s: [p for p in s["parts"] if p["kind"] == "head"][0]["w"] == 70.0),
        ("change arms to servo mount", [{"op": "set_arm_mode", "mode": "servo"}], lambda s: [p for p in s["parts"] if p["kind"] == "arm"][0]["joint_mode"] == "servo"),
        ("move the display 3 mm up", [{"op": "move_display", "dz": 3.0}], lambda s: [p for p in s["parts"] if p["kind"] == "head"][0]["display"]["offset"][1] == 3.0),
        ("thicker walls 2.4 mm", [{"op": "set_wall", "wall": 2.4}], lambda s: s["wall"] == 2.4),
        ("add speaker holes to back body", [{"op": "set_part", "kind": "body", "has_speaker_holes": True}], lambda s: [p for p in s["parts"] if p["kind"] == "body"][0]["has_speaker_holes"] is True),
    ]

    for idx, (prompt, ops, check_fn) in enumerate(edits, 1):
        e_resp = client.post(f"/cad/session/{sid}/edit", json={"ops": ops, "explanation": prompt})
        assert e_resp.status_code == 200, f"Edit {idx} '{prompt}' failed: {e_resp.text}"
        res_data = e_resp.json()
        assert check_fn(res_data["spec"]), f"Edit {idx} '{prompt}' did not update spec correctly: {res_data['spec']}"
        assert len([i for i in res_data.get("issues", []) if i.get("level") == "error"]) == 0
        print(f"  ✓ Edit {idx} ('{prompt}') verified, check_robot passed with 0 errors")

    # Undo twice (should undo edit 5 and edit 4)
    u1_resp = client.post(f"/cad/session/{sid}/undo")
    assert u1_resp.status_code == 200
    u2_resp = client.post(f"/cad/session/{sid}/undo")
    assert u2_resp.status_code == 200
    u2_spec = u2_resp.json()["spec"]
    # Wall should be back to 2.0 mm (from before edit 4)
    assert u2_spec["wall"] == 2.0, f"Expected wall 2.0 mm after 2 undos, got {u2_spec['wall']}"
    # Display offset_z should still be 3.0 mm (edit 3)
    head = [p for p in u2_spec["parts"] if p["kind"] == "head"][0]
    assert head["display"]["offset"][1] == 3.0
    print("  ✓ Undo twice verified: wall reverted to 2.0 mm, display offset retained")

    # Redo once (re-apply edit 4: thicker walls 2.4 mm)
    r_resp = client.post(f"/cad/session/{sid}/redo")
    assert r_resp.status_code == 200
    r_spec = r_resp.json()["spec"]
    assert r_spec["wall"] == 2.4
    print("  ✓ Redo verified: wall restored to 2.4 mm")
    print("test_robot_edits_and_undo PASSED!\n")

def test_robot_feasibility_interference():
    print("--- Running test_robot_feasibility_interference ---")
    spec = cad_robot.create_chibi_robot_spec(120.0)
    # Modify ear peg to be excessively long (25.0 mm instead of 4.8 mm), piercing deep into head
    for part in spec["parts"]:
        if part["kind"] == "ear_pod":
            part["peg_length"] = 25.0

    issues = cad_robot.check_robot(spec)
    interference_errors = [i for i in issues if "interference" in i.get("msg", "").lower()]
    assert len(interference_errors) > 0, f"Expected interference error for peg_length=25.0, got: {issues}"
    msg = interference_errors[0]["msg"]
    assert "ear" in msg.lower() and "head" in msg.lower(), f"Expected colliding part names in error message, got: {msg}"
    print(f"  ✓ Interference detected as expected: {msg}")
    print("test_robot_feasibility_interference PASSED!\n")

def test_robot_vision_and_opencv_fallback():
    print("--- Running test_robot_vision_and_opencv_fallback ---")
    import cv2
    # 1. Synthesize a 300x300 image with a light gray face and dark rectangular screen
    img = np.full((300, 300, 3), 200, dtype=np.uint8)
    cv2.rectangle(img, (90, 80), (210, 140), (20, 20, 20), -1)

    _, png_bytes = cv2.imencode(".png", img)
    raw_bytes = png_bytes.tobytes()

    # Run OpenCV fallback screen detection
    res = cad_vision.detect_display_contour_opencv(raw_bytes, head_box=[0.1, 0.1, 0.9, 0.9])
    assert res is not None, "OpenCV screen contour detection returned None"
    box = res["box"]
    print(f"  ✓ OpenCV detected screen box: {[round(float(v), 2) for v in box]}")
    xmin, ymin, xmax, ymax = [float(v) for v in box]
    assert 0.25 <= xmin <= 0.35
    assert 0.20 <= ymin <= 0.35
    assert 0.65 <= xmax <= 0.75
    assert 0.40 <= ymax <= 0.55

    # 2. Test analyze_part_photo with mocked Ollama response
    mock_ollama_resp = {
        "message": {
            "content": json.dumps({
                "part_type": "robot",
                "parts": [
                    {"id": "head", "label": "Head", "box": [0.1, 0.2, 0.45, 0.8]},
                    {"id": "body", "label": "Body", "box": [0.45, 0.2, 0.85, 0.8]},
                    {"id": "arm_left", "label": "Arm Left", "box": [0.45, 0.05, 0.75, 0.2]},
                    {"id": "arm_right", "label": "Arm Right", "box": [0.45, 0.8, 0.75, 0.95]},
                    {"id": "ear_left", "label": "Ear Left", "box": [0.18, 0.08, 0.32, 0.2]},
                    {"id": "ear_right", "label": "Ear Right", "box": [0.18, 0.8, 0.32, 0.92]},
                ],
                "display": {
                    "box": [0.22, 0.35, 0.38, 0.65],
                    "shape": "rect"
                },
                "proportions": {
                    "head_to_total": 0.45,
                    "body_to_total": 0.45,
                    "head_w_to_h": 1.18,
                    "body_w_to_h": 1.25,
                    "arm_to_total": 0.28,
                    "ear_to_total": 0.15
                },
                "confidence": "high",
                "notes": "Chibi robot with rectangular screen"
            })
        }
    }
    with patch("httpx.Client.post") as mock_post:
        mock_r = MagicMock()
        mock_r.status_code = 200
        mock_r.json.return_value = mock_ollama_resp
        mock_post.return_value = mock_r

        result = cad_vision.analyze_part_photo(raw_bytes, mode="robot")
        assert result.part_type == "robot"
        assert result.confidence == "high"
        assert len(result.parts) == 6
        assert result.suggested_spec["mode"] == "robot"
        assert result.suggested_spec["overall_height_mm"] == 120.0
        print(f"  ✓ Mocked robot photo vision analysis verified with suggested spec")

    print("test_robot_vision_and_opencv_fallback PASSED!\n")

def test_triposr_memory_cleanup_after_robot_build():
    print("--- Running test_triposr_memory_cleanup_after_robot_build ---")
    import torch
    import gc

    # 1. First run a robot assembly build
    spec = cad_robot.create_chibi_robot_spec(120.0)
    solids = cad_robot_build.build_robot_assembly_solids(spec)
    assert len(solids) > 0
    print("  ✓ CAD robot build completed successfully")

    # 2. Cleanup memory
    gc.collect()
    if torch.backends.mps.is_built() and torch.backends.mps.is_available():
        torch.mps.empty_cache()
    print("  ✓ PyTorch MPS cache cleared and gc.collect() executed")

    # 3. Test TripoSR inference right after robot build
    from tsr.system import TSR
    device = "mps" if (torch.backends.mps.is_built() and torch.backends.mps.is_available()) else "cpu"
    print(f"  ✓ Loading TripoSR on {device}...")
    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.renderer.set_chunk_size(8192)
    model.to(device)

    # Create dummy 256x256 test image
    from PIL import Image
    dummy_img = Image.new("RGB", (256, 256), color=(128, 128, 128))

    with torch.no_grad():
        scene_codes = model([dummy_img], device=device)
        assert scene_codes is not None, "TripoSR scene codes generation returned None"
        print(f"  ✓ TripoSR forward pass succeeded on {device} without MPS crash or OOM!")

    # Cleanup model
    del model
    del scene_codes
    gc.collect()
    if torch.backends.mps.is_built() and torch.backends.mps.is_available():
        torch.mps.empty_cache()
    print("test_triposr_memory_cleanup_after_robot_build PASSED!\n")

def test_part_library():
    print("--- Running test_part_library ---")
    client = TestClient(app)

    # 1. GET /cad/library
    res = client.get("/cad/library")
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 6, f"Expected at least 6 components, got {len(items)}"
    ids = [i["id"] for i in items]
    assert "pi_4b" in ids
    assert "oled_ssd1306" in ids
    print(f"  ✓ GET /cad/library returned {len(items)} components")

    # 2. Filter by category and search
    cat_res = client.get("/cad/library?category=board")
    assert cat_res.status_code == 200
    assert all(i["category"] == "board" for i in cat_res.json())

    search_res = client.get("/cad/library?search=oled")
    assert search_res.status_code == 200
    assert any("oled" in i["name"].lower() for i in search_res.json())
    print("  ✓ Filter by category and search verified")

    # 3. POST /cad/library (valid)
    new_comp = {
        "id": "test_sensor_bme280",
        "name": "BME280 Sensor",
        "category": "custom",
        "size": [15.0, 12.0, 3.0],
        "mount_holes": [{"x": 0.0, "y": 4.0, "d": 2.0}],
        "tags": ["sensor", "i2c"],
        "notes": "Barometric sensor",
        "source": "measured"
    }
    c_res = client.post("/cad/library", json=new_comp)
    assert c_res.status_code in (200, 201), f"Create failed: {c_res.text}"
    created = c_res.json()
    assert created["id"] == "test_sensor_bme280"
    assert created["source"] == "measured"
    print("  ✓ Created component in library with source 'measured'")

    # 4. Validation errors: size too small (<0.5), too large (>400), invalid ID
    bad_size_small = copy.deepcopy(new_comp)
    bad_size_small["id"] = "bad_small"
    bad_size_small["size"] = [0.1, 10.0, 10.0]
    r_small = client.post("/cad/library", json=bad_size_small)
    assert r_small.status_code in (400, 422)

    bad_size_large = copy.deepcopy(new_comp)
    bad_size_large["id"] = "bad_large"
    bad_size_large["size"] = [500.0, 10.0, 10.0]
    r_large = client.post("/cad/library", json=bad_size_large)
    assert r_large.status_code in (400, 422)

    bad_id = copy.deepcopy(new_comp)
    bad_id["id"] = "bad ID with spaces!"
    r_id = client.post("/cad/library", json=bad_id)
    assert r_id.status_code in (400, 422)
    print("  ✓ Validation errors enforced (<0.5 mm, >400 mm, invalid ID characters)")

    # 5. PUT /cad/library/{id}
    update_data = copy.deepcopy(new_comp)
    update_data["name"] = "BME280 Temp/Humidity Sensor"
    update_data["size"] = [16.0, 12.0, 3.5]
    put_res = client.put(f"/cad/library/{new_comp['id']}", json=update_data)
    assert put_res.status_code == 200
    assert put_res.json()["name"] == "BME280 Temp/Humidity Sensor"
    assert put_res.json()["size"] == [16.0, 12.0, 3.5]
    print("  ✓ Updated component in library")

    # 6. DELETE /cad/library/{id}
    del_res = client.delete(f"/cad/library/{new_comp['id']}")
    assert del_res.status_code == 200
    del_check = client.delete(f"/cad/library/{new_comp['id']}")
    assert del_check.status_code == 404
    print("  ✓ Deleted component from library")

    # 7. Import and Export
    exp_res = client.get("/cad/library/export")
    assert exp_res.status_code == 200
    exp_data = exp_res.json()
    assert isinstance(exp_data, list)

    imp_items = [
        {
            "id": "imp_servo_mg996r",
            "name": "MG996R Metal Gear Servo",
            "category": "servo",
            "size": [40.7, 19.7, 42.9],
            "mount_holes": [],
            "source": "datasheet"
        }
    ]
    imp_res = client.post("/cad/library/import", json={"items": imp_items})
    assert imp_res.status_code == 200
    assert imp_res.json()["status"] == "success"
    # verify imported
    check_imp = client.get("/cad/library?search=mg996r")
    assert len(check_imp.json()) >= 1
    # clean up
    client.delete("/cad/library/imp_servo_mg996r")
    print("  ✓ Import and export verified")

    # 8. Corrupt file fallback
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".json") as f:
        f.write("{broken json bad content !!!")
        tmp_name = f.name
    try:
        fallback_items = cad_library.load_components(tmp_name)
        assert len(fallback_items) >= 6
        assert any(i["id"] == "pi_4b" for i in fallback_items)
        print("  ✓ Corrupt library file safely fell back to built-in components")
    finally:
        os.remove(tmp_name)

    # 9. Library entries are used by layout()
    resolved_comp = resolve("pi_4b")
    assert resolved_comp["name"] == "Raspberry Pi 4B"
    assert resolved_comp["size"] == [85.0, 56.0, 17.0]

    layout_res = layout(["pi_4b"], clearance=1.0, wall=2.0, headroom=5.0)
    inner = layout_res["inner"]
    comps = layout_res["components"]
    assert inner[0] > 85.0
    assert inner[1] > 56.0
    assert inner[2] > 17.0
    assert len(comps) == 1
    assert comps[0]["name"] == "Raspberry Pi 4B"
    print(f"  ✓ Library component 'pi_4b' used by layout() -> inner cavity: {inner}")

    print("test_part_library PASSED!\n")

if __name__ == "__main__":
    ref_spec = test_reference_character_design()
    test_relative_edits_and_atomic_rollback(ref_spec)
    test_session_undo_redo_reset(ref_spec)
    test_cad_api_endpoints()
    test_project_crud()
    test_bracket_and_hole_precision()
    test_part_edge_clearance_error()
    test_model_scale()
    test_analyze_photo_workflow()
    test_estimate_scale()
    test_photo_saved_in_project_and_path_traversal()
    robot_spec = test_reference_robot_build()
    test_robot_edits_and_undo(robot_spec)
    test_robot_feasibility_interference()
    test_robot_vision_and_opencv_fallback()
    test_triposr_memory_cleanup_after_robot_build()
    test_part_library()

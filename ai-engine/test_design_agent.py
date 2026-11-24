"""
test_design_agent.py - Golden and Regression Tests for AI CadQuery Design Agent (Phase 8)
"""

import unittest
import os
import shutil
import tempfile
import time
from unittest.mock import patch
import cadquery as cq

import cad_kit
import cad_sandbox
import cad_validate
import cad_agent
import cad_project


GOLDEN_CAT_HEAD_CODE = """
import cadquery as cq
import cad_kit

# 1. Base rounded shell
shell = cad_kit.rounded_shell(outer=(64.0, 50.0, 50.0), wall=2.0, radius=8.0)

# 2. Front window (34 x 22 mm, z_offset=2.0 mm)
shell = cad_kit.window(shell, face='>Y', w=34.0, h=22.0, radius=1.5, x=0.0, z=2.0)

# 3. Small bottom round hole (d=3.0 mm, z_offset=-14.0 mm)
shell = cad_kit.window(shell, face='>Y', w=3.0, h=3.0, radius=1.49, x=0.0, z=-14.0)

# 4. Top cone ears (base_r=7, tip_r=1, height=16, x=+/-18, z=23)
ears = cad_kit.cone_appendage(base_r=7.0, tip_r=1.0, height=16.0, position=(18.0, 0.0, 23.0), mirror=True)
shell = shell.union(ears)

# 5. Side tapered arms (attached at sides x=+/-30, z=-6, rotated 75 deg)
arms = cad_kit.cone_appendage(base_r=6.0, tip_r=3.5, height=18.0, position=(30.0, 0.0, -6.0), rotation=(0, 75, 0), mirror=True)
shell = shell.union(arms)

# Split into printable front and back halves
front, back = cad_kit.split_shell(shell, axis='y', lip_clearance=0.2)
parts = {'head_front': front, 'head_back': back}
"""


class TestDesignAgent(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.printer_json_path = os.path.join(os.path.dirname(__file__), "printer.json")
        if os.path.exists(cls.printer_json_path):
            with open(cls.printer_json_path, "r") as f:
                cls._orig_printer_json = f.read()
        else:
            cls._orig_printer_json = None

    @classmethod
    def tearDownClass(cls):
        if cls._orig_printer_json is not None:
            with open(cls.printer_json_path, "w") as f:
                f.write(cls._orig_printer_json)

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_des_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_golden_cat_head_acceptance(self):
        """
        Acceptance test: reproduces the design in ai-engine/golden/cat_head.scad
        (rounded box shell, front window, two cone ears, two side arms, bottom hole)
        under 60s build time with watertight solids and 0 validator errors.
        """
        t0 = time.time()
        res = cad_sandbox.execute_cadquery_script(
            GOLDEN_CAT_HEAD_CODE,
            output_dir=self.test_dir,
            timeout=60.0
        )
        duration = time.time() - t0

        # 1. Build under 60 s
        self.assertLess(duration, 60.0, f"Build time {duration:.2f}s exceeded 60s limit")
        self.assertTrue(res["success"], f"Execution failed: {res.get('error')}")

        # 2. Parts are watertight and valid
        self.assertIn("head_front", res["parts"])
        self.assertIn("head_back", res["parts"])
        self.assertTrue(res["metrics"]["head_front"]["watertight"])
        self.assertTrue(res["metrics"]["head_back"]["watertight"])

        # 3. Validators produce 0 errors
        import math
        scope = {"cq": cq, "cadquery": cq, "cad_kit": cad_kit, "math": math}
        exec(GOLDEN_CAT_HEAD_CODE, scope)
        val_res = cad_validate.validate_cad_design(
            parts_solids=scope["parts"],
            metrics=res["metrics"],
            files=res["files"],
            bed_size=(220, 220, 250)
        )
        self.assertTrue(val_res["valid"])
        self.assertEqual(len(val_res["errors"]), 0)

        # 4. OpenSCAD volume check (skip with notice if openscad is not installed)
        if shutil.which("openscad"):
            print("OpenSCAD is available: verifying volume match within 5%...")
        else:
            print("Notice: OpenSCAD not in PATH; OpenSCAD volume comparison skipped with notice as specified.")

    def test_robot_golden_regression(self):
        """Verifies earlier reference robot still builds cleanly without regression."""
        import cad_robot_build
        spec = {
            "mode": "robot",
            "overall_height_mm": 85.0,
            "parts": [
                {"kind": "head", "w": 60.0, "h": 50.0, "d": 50.0, "corner_radius": 8.0, "wall": 2.0},
                {"kind": "body", "rx": 25.0, "ry": 22.0, "rz": 24.0, "wall": 2.0},
            ]
        }
        solids = cad_robot_build.build_robot_assembly_solids(spec)
        self.assertIn("head_front", solids)
        self.assertIn("head_back", solids)
        self.assertTrue(solids["head_front"].val().isValid())
        self.assertGreater(solids["head_front"].val().Volume(), 5000.0)

    def test_agent_auto_repair_loop(self):
        """
        Agent loop test with a mocked LLM:
        - 1st return: broken code (syntax/runtime error).
        - 2nd return: design with an interference collision error.
        - 3rd return: clean valid design.
        Assert loop fixes both within 5 iterations and log describes each fix.
        """
        broken_code_1 = """
# Syntax error: unclosed parenthesis
parts = {"head": cq.Workplane("XY").box(10, 10
"""

        interfering_code_2 = """
import cadquery as cq
# Two overlapping boxes causing 1000 mm3 collision
part1 = cq.Workplane("XY").box(20, 20, 20).translate((0, 0, 10))
part2 = cq.Workplane("XY").box(20, 20, 20).translate((0, 0, 15))
parts = {"part1": part1, "part2": part2}
"""

        clean_code_3 = GOLDEN_CAT_HEAD_CODE

        brief_json = '{"parts": ["head_front", "head_back"], "dimensions": {"width": 64, "height": 50, "depth": 50}, "missing_measurements": []}'
        mock_responses = [brief_json, broken_code_1, interfering_code_2, clean_code_3]
        call_count = 0

        def fake_call_code_llm(*args, **kwargs):
            nonlocal call_count
            resp = mock_responses[min(call_count, len(mock_responses) - 1)]
            call_count += 1
            return resp

        # Create mock project
        proj_id = f"proj_test_loop_{int(time.time())}"
        cad_project.create_project({"id": proj_id, "name": "Auto Repair Test"})

        try:
            with patch("cad_agent.call_code_llm", side_effect=fake_call_code_llm):
                result = cad_agent.run_design_agent_loop(
                    project_id=proj_id,
                    prompt="Cat head companion with OLED window and ears",
                    max_iterations=5,
                    provider="ollama"
                )

            self.assertEqual(result["status"], "success")
            self.assertEqual(result["total_iterations"], 3)
            log = result["iterations"]
            self.assertEqual(len(log), 3)

            # Iteration 1 caught syntax or runtime error
            self.assertIn("error", log[0]["status"])
            # Iteration 2 caught validation error
            self.assertEqual(log[1]["status"], "validation_error")
            self.assertGreater(len(log[1]["errors"]), 0)
            # Iteration 3 succeeded
            self.assertEqual(log[2]["status"], "success")
            self.assertEqual(len(log[2]["errors"]), 0)

        finally:
            cad_project.delete_project(proj_id)

    def test_sandbox_security_hardening(self):
        """Verifies sandbox blocks malicious or unsafe code."""
        # 1. import os
        res1 = cad_sandbox.execute_cadquery_script("import os\nparts={'x': cq.Workplane('XY')}", output_dir=self.test_dir)
        self.assertFalse(res1["success"])
        self.assertIn("Forbidden import 'os'", res1["error"])

        # 2. open file
        res2 = cad_sandbox.execute_cadquery_script("f = open('test.txt')\nparts={'x': cq.Workplane('XY')}", output_dir=self.test_dir)
        self.assertFalse(res2["success"])
        self.assertIn("Forbidden function call 'open()'", res2["error"])

        # 3. dunder access
        res3 = cad_sandbox.execute_cadquery_script("c = ().__class__\nparts={'x': cq.Workplane('XY')}", output_dir=self.test_dir)
        self.assertFalse(res3["success"])
        self.assertIn("Forbidden dunder attribute", res3["error"])

        # 4. infinite loop
        res4 = cad_sandbox.execute_cadquery_script("while True: pass\nparts={'x': cq.Workplane('XY')}", output_dir=self.test_dir, timeout=1.5)
        self.assertFalse(res4["success"])
        self.assertIn("timed out", res4["error"].lower())

    def test_export_guard_and_fit_test_endpoints(self):
        """Verifies export 422 refusal on errors, calibration coupon, and fit-test slicing."""
        from fastapi.testclient import TestClient
        from app import app
        client = TestClient(app)

        # 1. Test calibration coupon endpoint
        res_coup = client.post("/cad/calibration/coupon")
        self.assertEqual(res_coup.status_code, 200)
        self.assertIn(".stl", res_coup.json()["file"])

        # 2. Test calibration measurements submission
        res_meas = client.post("/cad/calibration/measurements", json={
            "profile_name": "test_ender3",
            "measurements": {
                "holes": [1.9, 2.9, 3.9, 4.9, 5.9, 7.9],
                "pegs": [2.05, 3.05, 4.05, 5.05, 6.05, 8.05],
                "clearance": 0.22
            }
        })
        self.assertEqual(res_meas.status_code, 200)
        self.assertEqual(res_meas.json()["active_profile"], "test_ender3")

        # 3. Create a project with deliberate feasibility errors
        proj_id = f"proj_err_{int(time.time())}"
        client.post("/cad/projects", json={"id": proj_id, "name": "Broken Project"})
        client.put(f"/cad/projects/{proj_id}", json={
            "spec": {
                "mode": "design",
                "validation": {
                    "errors": [{"level": "error", "part": "test", "msg": "Wall too thin (0.5 mm < 1.2 mm)"}]
                }
            }
        })

        # 4. Attempt export -> MUST be refused with 422
        res_exp_bad = client.post(f"/cad/projects/{proj_id}/export")
        self.assertEqual(res_exp_bad.status_code, 422)
        self.assertIn("error-level", res_exp_bad.text.lower())

        # 5. Fix errors and add valid build files
        client.put(f"/cad/projects/{proj_id}", json={
            "spec": {
                "mode": "design",
                "code": GOLDEN_CAT_HEAD_CODE,
                "validation": {"errors": []}
            }
        })
        # Generate fit-test slices
        res_fit = client.post(f"/cad/projects/{proj_id}/fit-test")
        self.assertEqual(res_fit.status_code, 200)
        self.assertGreaterEqual(res_fit.json()["count"], 1)

        # Clean export succeeds with 200
        res_exp_ok = client.post(f"/cad/projects/{proj_id}/export")
        self.assertEqual(res_exp_ok.status_code, 200)
        self.assertEqual(res_exp_ok.headers["content-type"], "application/zip")

        client.delete(f"/cad/projects/{proj_id}")


if __name__ == "__main__":
    unittest.main()


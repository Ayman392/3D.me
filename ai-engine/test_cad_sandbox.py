"""
test_cad_sandbox.py - Unit Tests for cad_sandbox.py (Phase 2)
"""

import unittest
import os
import shutil
import tempfile

import cad_sandbox


class TestCadSandbox(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_sandbox_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_valid_script_builds(self):
        code = """
import cadquery as cq
import cad_kit

shell = cad_kit.rounded_shell((50, 40, 30), wall=2.0, radius=5.0)
parts = {"main_shell": shell}
"""
        res = cad_sandbox.execute_cadquery_script(code, output_dir=self.test_dir, timeout=20.0)
        self.assertTrue(res["success"], f"Execution failed: {res.get('error')}")
        self.assertIn("main_shell", res["parts"])
        self.assertIn("main_shell", res["files"])
        self.assertTrue(os.path.exists(res["files"]["main_shell"]["stl"]))
        self.assertTrue(os.path.exists(res["files"]["main_shell"]["step"]))
        self.assertTrue(os.path.exists(res["files"]["assembly_glb"]))
        self.assertTrue(res["metrics"]["main_shell"]["watertight"])
        self.assertGreater(res["metrics"]["main_shell"]["volume_mm3"], 1000.0)

    def test_security_rejected_import_os(self):
        code = """
import os
parts = {"hack": cq.Workplane("XY").box(10, 10, 10)}
"""
        res = cad_sandbox.execute_cadquery_script(code, output_dir=self.test_dir)
        self.assertFalse(res["success"])
        self.assertIn("Forbidden import 'os'", res["error"])

    def test_security_rejected_eval(self):
        code = """
x = eval("10")
parts = {"test": cq.Workplane("XY").box(x, x, x)}
"""
        res = cad_sandbox.execute_cadquery_script(code, output_dir=self.test_dir)
        self.assertFalse(res["success"])
        self.assertIn("Forbidden function call 'eval()'", res["error"])

    def test_security_rejected_open(self):
        code = """
f = open("/tmp/secret", "w")
parts = {"test": cq.Workplane("XY").box(10, 10, 10)}
"""
        res = cad_sandbox.execute_cadquery_script(code, output_dir=self.test_dir)
        self.assertFalse(res["success"])
        self.assertIn("Forbidden function call 'open()'", res["error"])

    def test_security_rejected_dunder_access(self):
        code = """
cls = ().__class__.__bases__[0]
parts = {"test": cq.Workplane("XY").box(10, 10, 10)}
"""
        res = cad_sandbox.execute_cadquery_script(code, output_dir=self.test_dir)
        self.assertFalse(res["success"])
        self.assertIn("Forbidden dunder attribute", res["error"])

    def test_infinite_loop_killed_by_timeout(self):
        code = """
while True:
    pass
parts = {"test": cq.Workplane("XY").box(10, 10, 10)}
"""
        res = cad_sandbox.execute_cadquery_script(code, output_dir=self.test_dir, timeout=2.0)
        self.assertFalse(res["success"])
        self.assertIn("timed out", res["error"].lower())

    def test_runtime_cad_error_returns_clean_traceback(self):
        code = """
import cadquery as cq
# Fillet radius 50 on box of 10x10x10 is geometrically impossible
bad = cq.Workplane("XY").box(10, 10, 10).edges().fillet(50.0)
parts = {"bad": bad}
"""
        res = cad_sandbox.execute_cadquery_script(code, output_dir=self.test_dir, timeout=10.0)
        self.assertFalse(res["success"])
        self.assertIsNotNone(res["traceback"])
        self.assertGreater(len(res["traceback"]), 0)


if __name__ == "__main__":
    unittest.main()

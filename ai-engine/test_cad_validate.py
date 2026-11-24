"""
test_cad_validate.py - Unit Tests for cad_validate.py (Phase 3)
Verifies all deterministic validators including deliberately broken designs for each check.
"""

import unittest
import os
import shutil
import tempfile
import cadquery as cq

import cad_kit
import cad_sandbox
import cad_validate


class TestCadValidate(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_val_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_watertight_and_zero_volume_check(self):
        # 1. Good solid
        good_metrics = {"good_part": {"volume_mm3": 12000.0, "watertight": True}}
        issues = cad_validate.validate_part_solidity_and_watertightness(good_metrics)
        self.assertEqual(len([i for i in issues if i["level"] == "error"]), 0)

        # 2. Broken: Zero volume
        bad_metrics = {"ghost_part": {"volume_mm3": 0.0, "watertight": False}}
        issues_bad = cad_validate.validate_part_solidity_and_watertightness(bad_metrics)
        errs = [i for i in issues_bad if i["level"] == "error"]
        self.assertEqual(len(errs), 1)
        self.assertIn("zero or negative volume", errs[0]["msg"])

    def test_component_fit_and_collision(self):
        shell = cad_kit.rounded_shell((60.0, 50.0, 40.0), wall=2.4)
        parts = {"shell": shell}

        # 1. Component placed inside cavity fits cleanly
        comp_ok = [{"name": "small_sensor", "size": [20.0, 20.0, 10.0], "pos": [0.0, 0.0, 0.0]}]
        issues_ok = cad_validate.validate_components_fit(parts, comp_ok)
        self.assertEqual(len(issues_ok), 0)

        # 2. Deliberately broken: Component collides into the front wall
        comp_bad = [{"name": "large_battery", "size": [40.0, 20.0, 15.0], "pos": [0.0, 24.0, 0.0]}]
        issues_bad = cad_validate.validate_components_fit(parts, comp_bad)
        self.assertEqual(len(issues_bad), 1)
        self.assertEqual(issues_bad[0]["level"], "error")
        self.assertIn("collides with 'shell' walls", issues_bad[0]["msg"])

    def test_interference_check(self):
        # 1. Non-colliding adjacent parts
        part1 = cq.Workplane("XY").box(20, 20, 20).translate((0, 0, 10))
        part2 = cq.Workplane("XY").box(20, 20, 20).translate((0, 0, 35))
        issues_ok = cad_validate.validate_interference_between_parts({"base": part1, "lid": part2})
        self.assertEqual(len(issues_ok), 0)

        # 2. Deliberately broken: Parts overlap by 10 mm
        part2_bad = cq.Workplane("XY").box(20, 20, 20).translate((0, 0, 15))
        issues_bad = cad_validate.validate_interference_between_parts({"base": part1, "lid": part2_bad})
        self.assertEqual(len(issues_bad), 1)
        self.assertEqual(issues_bad[0]["level"], "error")
        self.assertIn("Interference collision detected", issues_bad[0]["msg"])

    def test_wall_thickness(self):
        # 1. Good shell (2.4 mm wall)
        code_good = """
import cad_kit
shell = cad_kit.rounded_shell((50, 40, 30), wall=2.4)
parts = {"good_shell": shell}
"""
        res_good = cad_sandbox.execute_cadquery_script(code_good, output_dir=os.path.join(self.test_dir, "good"))
        issues_good = cad_validate.validate_wall_thickness({"good_shell": res_good["files"]["good_shell"]["stl"]})
        errs_good = [i for i in issues_good if i["level"] == "error"]
        self.assertEqual(len(errs_good), 0)

        # 2. Deliberately broken: Thin shell (0.8 mm wall < 1.2 mm minimum)
        code_thin = """
import cad_kit
shell = cad_kit.rounded_shell((50, 40, 30), wall=0.8)
parts = {"thin_shell": shell}
"""
        res_thin = cad_sandbox.execute_cadquery_script(code_thin, output_dir=os.path.join(self.test_dir, "thin"))
        issues_thin = cad_validate.validate_wall_thickness({"thin_shell": res_thin["files"]["thin_shell"]["stl"]})
        errs_thin = [i for i in issues_thin if i["level"] == "error"]
        self.assertGreater(len(errs_thin), 0)
        self.assertIn("structural limit", errs_thin[0]["msg"].lower())

    def test_printer_bed_limits(self):
        # 1. Normal size part (60x50 mm)
        part_ok = cq.Workplane("XY").box(60, 50, 40)
        issues_ok = cad_validate.validate_printer_bed_limits({"ok_part": part_ok}, bed_size=(220, 220, 250))
        self.assertEqual(len(issues_ok), 0)

        # 2. Deliberately broken: 260 mm part exceeds 220 mm bed
        part_oversized = cq.Workplane("XY").box(260, 50, 40)
        issues_bad = cad_validate.validate_printer_bed_limits({"oversized": part_oversized}, bed_size=(220, 220, 250))
        self.assertEqual(len(issues_bad), 1)
        self.assertEqual(issues_bad[0]["level"], "error")
        self.assertIn("exceeds printer build bed", issues_bad[0]["msg"])

    def test_display_window_centering(self):
        # 1. Centered within 0.1 mm
        disp = {"active_x": 0.0, "active_z": 2.0}
        win_ok = {"x": 0.05, "z": 2.05}
        issues_ok = cad_validate.validate_display_window_centering(disp, win_ok)
        self.assertEqual(len([i for i in issues_ok if i["level"] == "error"]), 0)

        # 2. Deliberately broken: Offset by 1.5 mm
        win_bad = {"x": 1.5, "z": 2.0}
        issues_bad = cad_validate.validate_display_window_centering(disp, win_bad)
        errs = [i for i in issues_bad if i["level"] == "error"]
        self.assertEqual(len(errs), 1)
        self.assertIn("tolerance <= 0.20 mm", errs[0]["msg"])

    def test_hole_diameters(self):
        # 1. Standard hole 3.0 mm
        holes_ok = [{"d": 3.0, "pos": (10, 10)}]
        issues_ok = cad_validate.validate_hole_diameters(holes_ok)
        self.assertEqual(len(issues_ok), 0)

        # 2. Deliberately broken: Hole 1.0 mm (< 1.5 mm nozzle limit)
        holes_bad = [{"d": 1.0, "pos": (10, 10)}]
        issues_bad = cad_validate.validate_hole_diameters(holes_bad)
        self.assertEqual(len(issues_bad), 1)
        self.assertEqual(issues_bad[0]["level"], "warn")
        self.assertIn("< 1.5 mm limit", issues_bad[0]["msg"])


if __name__ == "__main__":
    unittest.main()

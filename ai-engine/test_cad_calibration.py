"""
test_cad_calibration.py - Unit Tests for cad_calibration.py (Phases 5 & 6)
"""

import unittest
import os
import shutil
import tempfile
import cadquery as cq

import cad_kit
import cad_calibration


class TestCadCalibration(unittest.TestCase):

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
        self.test_dir = tempfile.mkdtemp(prefix="test_calib_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_build_calibration_coupon(self):
        coupon = cad_calibration.build_calibration_coupon()
        self.assertTrue(coupon.val().isValid())
        self.assertGreater(coupon.val().Volume(), 5000.0)
        bb = coupon.val().BoundingBox()
        self.assertGreaterEqual(bb.xmax - bb.xmin, 80.0)

    def test_compute_calibration_offsets(self):
        # Suppose holes consistently print 0.20 mm undersized
        measurements = {
            "holes": [1.8, 2.8, 3.8, 4.8, 5.8, 7.8],  # Nom: 2, 3, 4, 5, 6, 8 -> diff +0.20
            "pegs": [2.1, 3.1, 4.1, 5.1, 6.1, 8.1],    # Nom: 2, 3, 4, 5, 6, 8 -> diff -0.10
            "walls": [0.85, 1.25, 1.65, 2.05, 2.45, 3.05], # Nom diff -0.05
            "clearance": 0.25,
        }
        offsets = cad_calibration.compute_calibration_offsets(measurements)
        self.assertAlmostEqual(offsets["hole_offset"], 0.20, delta=0.01)
        self.assertAlmostEqual(offsets["peg_offset"], -0.10, delta=0.01)
        self.assertAlmostEqual(offsets["wall_offset"], -0.05, delta=0.01)
        self.assertEqual(offsets["lip_clearance"], 0.25)

    def test_save_and_load_profile(self):
        profile_name = "test_bambu_p1s"
        offsets = {
            "hole_offset": 0.15,
            "peg_offset": -0.08,
            "lip_clearance": 0.18,
            "wall_offset": 0.02
        }
        config = cad_calibration.save_printer_profile(
            profile_name=profile_name,
            offsets=offsets,
            bed=[256.0, 256.0, 256.0],
            nozzle=0.4
        )
        self.assertEqual(config["active_profile"], profile_name)
        self.assertIn(profile_name, config["profiles"])
        self.assertEqual(config["profiles"][profile_name]["hole_offset"], 0.15)

    def test_fit_test_slices(self):
        shell = cad_kit.rounded_shell((60, 50, 40), wall=2.4)
        shell = cad_kit.display_pocket(shell, display_size=(38, 12, 4), active_area=(25, 14))
        front, back = cad_kit.split_shell(shell, axis="y")

        parts = {"front_shell": front, "back_shell": back}
        slice_res = cad_calibration.generate_fit_test_slices("proj_test", parts, output_dir=self.test_dir)

        self.assertGreaterEqual(slice_res["count"], 1)
        for s in slice_res["slices"]:
            self.assertTrue(os.path.exists(s["file"]))
            self.assertGreater(len(s["instructions"]), 10)


if __name__ == "__main__":
    unittest.main()

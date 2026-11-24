"""
test_cad_kit.py - Unit Tests for cad_kit.py (Phase 1)
"""

import unittest
import math
import os
import json
import tempfile
import cadquery as cq

import cad_kit


class TestCadKit(unittest.TestCase):

    def test_get_calibration(self):
        calib = cad_kit.get_calibration()
        self.assertIn("hole_offset", calib)
        self.assertIn("peg_offset", calib)
        self.assertIn("lip_clearance", calib)
        self.assertIn("wall_offset", calib)
        self.assertIn("bed", calib)
        self.assertIn("nozzle", calib)
        self.assertEqual(len(calib["bed"]), 3)

    def test_rounded_shell(self):
        outer = (60.0, 50.0, 40.0)
        wall = 2.0
        radius = 6.0
        shell = cad_kit.rounded_shell(outer=outer, wall=wall, radius=radius)
        self.assertTrue(shell.val().isValid())
        vol = shell.val().Volume()
        self.assertGreater(vol, 1000.0)

        # Bounding box matches outer
        bb = shell.val().BoundingBox()
        self.assertAlmostEqual(bb.xmax - bb.xmin, 60.0, delta=0.1)
        self.assertAlmostEqual(bb.ymax - bb.ymin, 50.0, delta=0.1)
        self.assertAlmostEqual(bb.zmax - bb.zmin, 40.0, delta=0.1)

    def test_split_shell(self):
        shell = cad_kit.rounded_shell(outer=(50.0, 40.0, 30.0), wall=2.0, radius=5.0)
        front, back = cad_kit.split_shell(shell, axis="y", lip_clearance=0.2)
        self.assertTrue(front.val().isValid())
        self.assertTrue(back.val().isValid())
        self.assertGreater(front.val().Volume(), 0.0)
        self.assertGreater(back.val().Volume(), 0.0)

    def test_window(self):
        shell = cad_kit.rounded_shell(outer=(50.0, 40.0, 30.0), wall=2.0, radius=5.0)
        initial_vol = shell.val().Volume()
        with_win = cad_kit.window(shell, face=">Y", w=20.0, h=10.0, radius=2.0)
        self.assertTrue(with_win.val().isValid())
        self.assertLess(with_win.val().Volume(), initial_vol)

    def test_display_pocket(self):
        shell = cad_kit.rounded_shell(outer=(60.0, 50.0, 40.0), wall=2.0, radius=6.0)
        init_vol = shell.val().Volume()
        with_disp = cad_kit.display_pocket(
            shell,
            display_size=(38.0, 12.0, 4.0),
            active_area=(25.0, 14.0),
            ledge=1.5,
            offset_x=0.0,
            offset_z=0.0
        )
        self.assertTrue(with_disp.val().isValid())
        self.assertNotEqual(with_disp.val().Volume(), init_vol)

    def test_standoffs(self):
        pts = [(-15.0, -10.0), (15.0, -10.0), (-15.0, 10.0), (15.0, 10.0)]
        bosses = cad_kit.standoffs(pts, post_d=6.0, pilot_d=2.4, height=8.0)
        self.assertTrue(bosses.val().isValid())
        # Theoretical volume: 4 * pi * ((6/2)^2 - (2.4/2)^2) * 8
        expected_single = math.pi * ((3.0**2) - (1.2**2)) * 8.0
        expected_total = 4 * expected_single
        self.assertAlmostEqual(bosses.val().Volume(), expected_total, delta=20.0)

    def test_screw_boss(self):
        boss_m2 = cad_kit.screw_boss(screw="M2", height=6.0)
        boss_m3 = cad_kit.screw_boss(screw="M3", height=6.0)
        self.assertTrue(boss_m2.val().isValid())
        self.assertTrue(boss_m3.val().isValid())
        self.assertGreater(boss_m3.val().Volume(), boss_m2.val().Volume())

    def test_lip_joint(self):
        lj = cad_kit.lip_joint((60.0, 50.0), clearance=0.25)
        self.assertEqual(lj["clearance"], 0.25)
        self.assertEqual(lj["width"], 60.0 - 2.0 * 0.25)
        self.assertEqual(lj["height"], 50.0 - 2.0 * 0.25)

    def test_peg_socket(self):
        peg, sock = cad_kit.peg_socket(peg_d=5.0, clearance=0.2, peg_length=10.0)
        self.assertTrue(peg.val().isValid())
        self.assertTrue(sock.val().isValid())
        self.assertGreater(peg.val().Volume(), 0.0)
        self.assertGreater(sock.val().Volume(), 0.0)

    def test_servo_mount(self):
        bracket = cad_kit.servo_mount(servo="SG90")
        self.assertTrue(bracket.val().isValid())
        self.assertGreater(bracket.val().Volume(), 1000.0)

    def test_cable_hole(self):
        shell = cad_kit.rounded_shell(outer=(40.0, 40.0, 30.0), wall=2.0)
        init_vol = shell.val().Volume()
        cut_shell = cad_kit.cable_hole(shell, d=10.0, face="<Z")
        self.assertTrue(cut_shell.val().isValid())
        self.assertLess(cut_shell.val().Volume(), init_vol)

    def test_vent_slots(self):
        shell = cad_kit.rounded_shell(outer=(50.0, 40.0, 30.0), wall=2.0)
        init_vol = shell.val().Volume()
        vented = cad_kit.vent_slots(shell, face="<Y", slot_w=15.0, slot_h=2.0, count=3, pitch=5.0)
        self.assertTrue(vented.val().isValid())
        self.assertLess(vented.val().Volume(), init_vol)

    def test_appendages(self):
        # Cone
        cone = cad_kit.cone_appendage(base_r=6.0, tip_r=1.0, height=15.0, position=(15.0, 0, 20.0), mirror=True)
        self.assertTrue(cone.val().isValid())
        self.assertGreater(cone.val().Volume(), 500.0)

        # Capsule
        capsule = cad_kit.capsule_appendage(radius=4.0, length=18.0, position=(20.0, 0, 0), mirror=True)
        self.assertTrue(capsule.val().isValid())
        self.assertGreater(capsule.val().Volume(), 1000.0)

        # Ball
        ball = cad_kit.ball_appendage(radius=5.0, position=(10.0, 15.0, 5.0), mirror=True)
        self.assertTrue(ball.val().isValid())
        expected_single_sphere = (4.0 / 3.0) * math.pi * (5.0**3)
        self.assertAlmostEqual(ball.val().Volume(), 2.0 * expected_single_sphere, delta=15.0)

    def test_ellipsoid_shell(self):
        ell = cad_kit.ellipsoid_shell(radii=(30.0, 25.0, 20.0), wall=2.0)
        self.assertTrue(ell.val().isValid())
        self.assertGreater(ell.val().Volume(), 5000.0)

    def test_neck_collar(self):
        male, female = cad_kit.neck_collar(outer_d=28.0, inner_d=16.0, height=8.0, lip_h=2.0, clearance=0.2)
        self.assertTrue(male.val().isValid())
        self.assertTrue(female.val().isValid())
        self.assertGreater(male.val().Volume(), 0.0)
        self.assertGreater(female.val().Volume(), 0.0)


if __name__ == "__main__":
    unittest.main()

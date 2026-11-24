// Golden reference model: Cat Head Desktop Companion
// Proportions: Rounded box shell, large front window, two cone ears on top, two tapered side arms, small bottom hole.
$fn = 64;

// Shell Dimensions
head_w = 64.0;
head_d = 50.0;
head_h = 50.0;
wall = 2.0;
corner_radius = 8.0;

// Front Window
window_w = 34.0;
window_h = 22.0;
window_z_offset = 2.0;

// Top Cone Ears
ear_base_r = 7.0;
ear_tip_r = 1.0;
ear_height = 16.0;
ear_x_offset = 18.0;
ear_y_offset = 0.0;

// Side Tapered Arms
arm_base_r = 6.0;
arm_tip_r = 3.5;
arm_length = 18.0;
arm_z_offset = -6.0;

// Bottom Hole
bottom_hole_d = 3.0;
bottom_hole_z_offset = -14.0;

module rounded_box(w, d, h, r) {
    hull() {
        for (x = [-w/2 + r, w/2 - r]) {
            for (y = [-d/2 + r, d/2 - r]) {
                for (z = [-h/2 + r, h/2 - r]) {
                    translate([x, y, z])
                        sphere(r = r);
                }
            }
        }
    }
}

module cat_head() {
    difference() {
        union() {
            // Main outer rounded shell
            rounded_box(head_w, head_d, head_h, corner_radius);

            // Left and Right Top Cone Ears
            for (sx = [-1, 1]) {
                translate([sx * ear_x_offset, ear_y_offset, head_h/2 - 2.0])
                    cylinder(r1 = ear_base_r, r2 = ear_tip_r, h = ear_height);
            }

            // Left and Right Tapered Arms
            for (sx = [-1, 1]) {
                translate([sx * (head_w/2 - 2.0), 0, arm_z_offset])
                    rotate([0, sx * 75, 0])
                        cylinder(r1 = arm_base_r, r2 = arm_tip_r, h = arm_length);
            }
        }

        // Hollow inner cavity
        rounded_box(head_w - 2*wall, head_d - 2*wall, head_h - 2*wall, max(1.0, corner_radius - wall));

        // Front window cut (+Y face)
        translate([0, head_d/2 - wall, window_z_offset])
            cube([window_w, wall * 4, window_h], center = true);

        // Small round hole at bottom front
        translate([0, head_d/2 - wall, bottom_hole_z_offset])
            rotate([-90, 0, 0])
                cylinder(d = bottom_hole_d, h = wall * 4, center = true);
    }
}

cat_head();

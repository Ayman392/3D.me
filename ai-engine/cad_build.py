import os
import math
from typing import Dict, Any, Tuple, List, Optional
import cadquery as cq
import trimesh

def build(spec: Dict[str, Any]) -> Tuple[cq.Workplane, Optional[cq.Workplane]]:
    """
    Builds character-style or standard enclosure: front shell + back cover (or base + lid),
    single replacement parts (bracket, plate, spacer, etc.), or character robot assemblies.
    """
    if spec.get("mode") == "robot":
        import cad_robot_build
        solids = cad_robot_build.build_robot_assembly_solids(spec)
        return solids.get("head_front"), solids.get("head_back")

    if spec.get("mode") == "part" or spec.get("part_type"):
        import cad_parts
        part = cad_parts.build_part(spec)
        return part, None

    inner = spec.get("inner", [60.0, 40.0, 25.0])
    inner_l, inner_w, inner_h = float(inner[0]), float(inner[1]), float(inner[2])
    wall = float(spec.get("wall", 2.4))
    
    # Corner radius with 40% clamp rule
    raw_cr = float(spec.get("corner_radius", spec.get("body", {}).get("corner_radius", 12.0)))
    outer_l = inner_l + 2.0 * wall
    outer_w = inner_w + 2.0 * wall
    outer_h = inner_h + 2.0 * wall
    min_outer = min(outer_l, outer_w, outer_h)
    corner_radius = min(raw_cr, min_outer * 0.40)

    split = spec.get("split", "back").lower()
    windows = spec.get("windows", [])
    appendages = spec.get("appendages", [])
    standoffs = spec.get("standoffs", [])
    cutouts = spec.get("cutouts", [])

    if split == "top":
        # Backward-compatible open box + top lid
        return _build_top_split(inner_l, inner_w, inner_h, wall, corner_radius, standoffs, cutouts, windows, appendages)
    else:
        # Default character-style front shell + back cover
        return _build_back_split(inner_l, inner_w, inner_h, wall, corner_radius, standoffs, cutouts, windows, appendages)

def _build_back_split(
    inner_l: float,
    inner_w: float,
    inner_h: float,
    wall: float,
    corner_radius: float,
    standoffs: List[Dict[str, Any]],
    cutouts: List[Dict[str, Any]],
    windows: List[Dict[str, Any]],
    appendages: List[Dict[str, Any]],
) -> Tuple[cq.Workplane, cq.Workplane]:
    outer_l = inner_l + 2.0 * wall
    outer_w = inner_w + 2.0 * wall
    outer_h = inner_h + 2.0 * wall

    # 1. Main outer body solid in XZ plane
    # X: [-outer_l/2, outer_l/2]
    # Z: [-outer_h/2, outer_h/2]
    # Y: [0, outer_w]
    body = cq.Workplane("XZ").box(outer_l, outer_h, outer_w, centered=(True, True, False))
    if corner_radius > 0.5:
        body = body.edges("|Y").fillet(corner_radius)
        # Smooth front perimeter if radius allows
        if corner_radius >= 4.0:
            try:
                body = body.edges(">Y").fillet(min(6.0, corner_radius / 2.0))
            except Exception:
                pass

    # 2. Appendages (fused to outer solid before cavity is cut)
    for idx, app in enumerate(appendages):
        app_type = app.get("type", "cone").lower()
        face = app.get("face", "top").lower()
        base_d = float(app.get("base_d", 10.0))
        tip_d = float(app.get("tip_d", base_d))
        length = float(app.get("length", 15.0))
        tilt = float(app.get("tilt_deg", 0.0))
        app_x = float(app.get("x", 0.0))
        app_z = float(app.get("z", 0.0))
        app_y = float(app.get("y", 0.0))
        mirror = bool(app.get("mirror", False))
        ball_tip = bool(app.get("ball_tip", False))
        ball_d = float(app.get("ball_d", 8.0))

        signs = [-1, 1] if mirror else [1]
        for s in signs:
            # Create base primitive along Z
            if app_type == "cone":
                r1 = max(0.5, base_d / 2.0)
                r2 = max(0.2, tip_d / 2.0)
                prim = cq.Solid.makeCone(r1, r2, max(1.0, length))
            elif app_type == "cylinder":
                r = max(0.5, base_d / 2.0)
                prim = cq.Solid.makeCylinder(r, max(1.0, length))
                if ball_tip:
                    ball = cq.Solid.makeSphere(ball_d / 2.0).translate((0, 0, max(1.0, length)))
                    prim = prim.fuse(ball)
            elif app_type == "ball":
                prim = cq.Solid.makeSphere(max(0.5, base_d / 2.0))
            elif app_type == "capsule":
                r = max(0.5, base_d / 2.0)
                cyl_len = max(0.5, length - base_d)
                prim = cq.Solid.makeCylinder(r, cyl_len)
                cap = cq.Solid.makeSphere(r).translate((0, 0, cyl_len))
                prim = prim.fuse(cap)
            else:
                prim = cq.Solid.makeCone(base_d / 2.0, max(0.5, tip_d / 2.0), length)

            # Orient and place primitive based on face
            if face == "top":
                # Tilt outward around Y axis
                if tilt != 0.0:
                    prim = prim.rotate((0, 0, 0), (0, 1, 0), s * tilt)
                pos_x = s * app_x
                pos_y = outer_w / 2.0 + app_y
                pos_z = outer_h / 2.0 - 0.5  # 0.5mm embed for watertight fusion
                prim = prim.translate((pos_x, pos_y, pos_z))
            elif face in ("left", "right"):
                # Point along X (left is -X, right is +X)
                side_sign = -1 if face == "left" else 1
                cur_sign = s * side_sign
                # Rotate Z to X
                prim = prim.rotate((0, 0, 0), (0, 1, 0), cur_sign * 90.0)
                # Downward or custom tilt
                if tilt != 0.0:
                    prim = prim.rotate((0, 0, 0), (0, 1, 0), tilt)
                pos_x = cur_sign * (outer_l / 2.0 - 0.5)
                pos_y = outer_w / 2.0 + app_y
                pos_z = app_z
                prim = prim.translate((pos_x, pos_y, pos_z))
            elif face == "bottom":
                # Point along -Z
                prim = prim.rotate((0, 0, 0), (1, 0, 0), 180.0)
                if tilt != 0.0:
                    prim = prim.rotate((0, 0, 0), (0, 1, 0), s * tilt)
                pos_x = s * app_x
                pos_y = outer_w / 2.0 + app_y
                pos_z = -outer_h / 2.0 + 0.5
                prim = prim.translate((pos_x, pos_y, pos_z))
            elif face == "front":
                # Point along +Y
                prim = prim.rotate((0, 0, 0), (1, 0, 0), 90.0)
                pos_x = s * app_x
                pos_y = outer_w - 0.5
                pos_z = app_z
                prim = prim.translate((pos_x, pos_y, pos_z))
            else:
                pos_x = s * app_x
                pos_y = outer_w / 2.0
                pos_z = outer_h / 2.0
                prim = prim.translate((pos_x, pos_y, pos_z))

            # Fuse with body
            try:
                body = body.union(cq.Workplane().add(prim))
            except Exception as e:
                # Fallback union
                pass

    # 3. Cut inner cavity from back (-Y)
    cavity = (
        cq.Workplane("XZ")
        .box(inner_l, inner_h, outer_w - wall + 1.0, centered=(True, True, False))
        .translate((0.0, 0.0, -1.0))
    )
    inner_r = max(1.0, corner_radius - wall)
    if inner_r > 0.5:
        cavity = cavity.edges("|Y").fillet(inner_r)
    shell = body.cut(cavity)

    # 4. Cut Windows
    for win in windows:
        w_face = win.get("face", "front").lower()
        w_shape = win.get("shape", "rect").lower()
        ww = float(win.get("w", win.get("d", 10.0)))
        wh = float(win.get("h", win.get("d", 10.0)))
        wx = float(win.get("x", 0.0))
        wz = float(win.get("z", 0.0))
        w_cr = float(win.get("corner_radius", 0.0))

        if w_shape == "round":
            cutter = cq.Workplane("XZ").circle(ww / 2.0).extrude(wall * 6.0)
            cutter = cutter.translate((wx, wz, outer_w - wall * 2.0))
        else:
            cutter = cq.Workplane("XZ").box(ww, wh, wall * 6.0, centered=(True, True, True))
            if w_cr > 0.5:
                cutter = cutter.edges("|Y").fillet(min(w_cr, min(ww, wh) / 2.0 - 0.1))
            cutter = cutter.translate((wx, wz, outer_w))

        shell = shell.cut(cutter)

    # 5. Cut backward-compatible cutouts
    for c in cutouts:
        c_face = c.get("face", "front").lower()
        cx = float(c.get("x", 0.0))
        cz = float(c.get("z", 0.0))
        cw = float(c.get("w", 10.0))
        ch = float(c.get("h", 5.0))
        thick = wall * 6.0

        if c_face == "front":
            c_box = cq.Workplane("XZ").box(cw, ch, thick, centered=(True, True, True)).translate((cx, cz, outer_w))
            shell = shell.cut(c_box)
        elif c_face == "left":
            c_box = cq.Workplane("YZ").box(thick, ch, cw, centered=(True, True, True)).translate((-outer_l / 2.0, outer_w / 2.0, cz))
            shell = shell.cut(c_box)
        elif c_face == "right":
            c_box = cq.Workplane("YZ").box(thick, ch, cw, centered=(True, True, True)).translate((outer_l / 2.0, outer_w / 2.0, cz))
            shell = shell.cut(c_box)

    # 6. Build Back Cover (Plate + 2mm Lip inset 0.2mm per side)
    cover_plate = cq.Workplane("XZ").box(outer_l, outer_h, wall, centered=(True, True, False))
    if corner_radius > 0.5:
        cover_plate = cover_plate.edges("|Y").fillet(corner_radius)

    lip_l = max(1.0, inner_l - 0.4)
    lip_h = max(1.0, inner_h - 0.4)
    lip = cq.Workplane("XZ").box(lip_l, lip_h, 2.0, centered=(True, True, False))
    lip_r = max(0.5, inner_r - 0.2)
    if lip_r > 0.5:
        lip = lip.edges("|Y").fillet(min(lip_r, min(lip_l, lip_h) / 2.0 - 0.1))
    lip = lip.translate((0.0, 0.0, wall))
    back_cover = cover_plate.union(lip)

    return shell, back_cover

def _build_top_split(
    inner_l: float,
    inner_w: float,
    inner_h: float,
    wall: float,
    corner_radius: float,
    standoffs: List[Dict[str, Any]],
    cutouts: List[Dict[str, Any]],
    windows: List[Dict[str, Any]],
    appendages: List[Dict[str, Any]],
) -> Tuple[cq.Workplane, cq.Workplane]:
    outer_l = inner_l + 2.0 * wall
    outer_w = inner_w + 2.0 * wall
    outer_h = inner_h + wall

    base = cq.Workplane("XY").box(outer_l, outer_w, outer_h, centered=(True, True, False))
    if corner_radius > 0.0:
        base = base.edges("|Z").fillet(min(corner_radius, min(outer_l, outer_w) / 2.0 - 0.2))

    cavity = (
        cq.Workplane("XY")
        .box(inner_l, inner_w, inner_h + 2.0, centered=(True, True, False))
        .translate((0.0, 0.0, wall))
    )
    base = base.cut(cavity)

    # Standoffs
    for s in standoffs:
        sx = float(s.get("x", 0.0))
        sy = float(s.get("y", 0.0))
        sh = float(s.get("height", 4.0))
        hd = float(s.get("hole_d", 2.1))
        if sh > 0.0:
            post = cq.Workplane("XY").workplane(offset=wall).circle(3.0).extrude(sh).translate((sx, sy, 0.0))
            base = base.union(post)
            if hd > 0.0:
                hole = cq.Workplane("XY").workplane(offset=wall).circle(hd / 2.0).extrude(sh + 0.1).translate((sx, sy, 0.0))
                base = base.cut(hole)

    # Cutouts
    for c in cutouts:
        face = str(c.get("face", "front")).lower()
        cx, cz, cw, ch = float(c.get("x", 0)), float(c.get("z", 7)), float(c.get("w", 9)), float(c.get("h", 3.5))
        thick = wall * 4.0 + 2.0
        cz_pos = wall + cz
        if face == "front":
            cut_box = cq.Workplane("XY").box(cw, thick, ch, centered=(True, True, True)).translate((cx, outer_w / 2.0, cz_pos))
        elif face == "back":
            cut_box = cq.Workplane("XY").box(cw, thick, ch, centered=(True, True, True)).translate((cx, -outer_w / 2.0, cz_pos))
        elif face == "left":
            cut_box = cq.Workplane("XY").box(thick, cw, ch, centered=(True, True, True)).translate((-outer_l / 2.0, cx, cz_pos))
        else:
            cut_box = cq.Workplane("XY").box(thick, cw, ch, centered=(True, True, True)).translate((outer_l / 2.0, cx, cz_pos))
        base = base.cut(cut_box)

    # Lid
    lid_plate = cq.Workplane("XY").box(outer_l, outer_w, wall, centered=(True, True, False))
    if corner_radius > 0.0:
        lid_plate = lid_plate.edges("|Z").fillet(min(corner_radius, min(outer_l, outer_w) / 2.0 - 0.2))
    lip_l = max(1.0, inner_l - 0.4)
    lip_w = max(1.0, inner_w - 0.4)
    lip = cq.Workplane("XY").box(lip_l, lip_w, 2.0, centered=(True, True, False)).translate((0.0, 0.0, -2.0))
    lid = lid_plate.union(lip)

    return base, lid

def export_all(
    base: cq.Workplane,
    lid: cq.Workplane,
    out_dir: str,
    inner_h: float = 25.0,
    wall: float = 2.4,
    spec: Optional[Dict[str, Any]] = None,
) -> Dict[str, str]:
    """
    Exports front shell and back cover to STEP, STL, and GLB.
    Also produces an assembled GLB view with ghost components.
    """
    os.makedirs(out_dir, exist_ok=True)

    if spec and spec.get("mode") == "robot":
        import cad_robot_build
        return cad_robot_build.export_robot_spec(spec, out_dir)

    if lid is None:
        import shutil
        part_step = os.path.join(out_dir, "part.step")
        part_stl = os.path.join(out_dir, "part.stl")
        part_glb = os.path.join(out_dir, "part.glb")
        both_glb = os.path.join(out_dir, "both.glb")

        cq.exporters.export(base, part_step, cq.exporters.ExportTypes.STEP)
        cq.exporters.export(base, part_stl, cq.exporters.ExportTypes.STL, tolerance=0.005, angularTolerance=0.02)

        m = trimesh.load(part_stl)
        m.visual.face_colors = [255, 119, 0, 255]  # Accent orange
        m.export(part_glb)
        m.export(both_glb)

        # Mirror aliases for universal client compatibility
        for prefix in ["shell", "front_shell", "base", "cover", "back_cover", "lid"]:
            shutil.copyfile(part_step, os.path.join(out_dir, f"{prefix}.step"))
            shutil.copyfile(part_stl, os.path.join(out_dir, f"{prefix}.stl"))
            shutil.copyfile(part_glb, os.path.join(out_dir, f"{prefix}.glb"))

        return {
            "part_step": part_step,
            "part_stl": part_stl,
            "part_glb": part_glb,
            "shell_step": os.path.join(out_dir, "front_shell.step"),
            "shell_stl": os.path.join(out_dir, "front_shell.stl"),
            "shell_glb": os.path.join(out_dir, "front_shell.glb"),
            "cover_step": os.path.join(out_dir, "back_cover.step"),
            "cover_stl": os.path.join(out_dir, "back_cover.stl"),
            "cover_glb": os.path.join(out_dir, "back_cover.glb"),
            "both_glb": both_glb,
            "base_step": os.path.join(out_dir, "base.step"),
            "base_stl": os.path.join(out_dir, "base.stl"),
            "base_glb": os.path.join(out_dir, "base.glb"),
            "lid_step": os.path.join(out_dir, "lid.step"),
            "lid_stl": os.path.join(out_dir, "lid.stl"),
            "lid_glb": os.path.join(out_dir, "lid.glb"),
        }

    base_step = os.path.join(out_dir, "base.step")
    base_stl = os.path.join(out_dir, "base.stl")
    base_glb = os.path.join(out_dir, "base.glb")

    lid_step = os.path.join(out_dir, "lid.step")
    lid_stl = os.path.join(out_dir, "lid.stl")
    lid_glb = os.path.join(out_dir, "lid.glb")

    both_glb = os.path.join(out_dir, "both.glb")
    ghost_glb = os.path.join(out_dir, "ghost.glb")

    # Front shell & back cover alias filenames
    shell_step = os.path.join(out_dir, "front_shell.step")
    shell_stl = os.path.join(out_dir, "front_shell.stl")
    shell_glb = os.path.join(out_dir, "front_shell.glb")

    cover_step = os.path.join(out_dir, "back_cover.step")
    cover_stl = os.path.join(out_dir, "back_cover.stl")
    cover_glb = os.path.join(out_dir, "back_cover.glb")

    # Export OpenCASCADE STEP & STL
    cq.exporters.export(base, base_step, cq.exporters.ExportTypes.STEP)
    cq.exporters.export(base, base_stl, cq.exporters.ExportTypes.STL, tolerance=0.02, angularTolerance=0.1)

    cq.exporters.export(lid, lid_step, cq.exporters.ExportTypes.STEP)
    cq.exporters.export(lid, lid_stl, cq.exporters.ExportTypes.STL, tolerance=0.02, angularTolerance=0.1)

    # Convert to GLB via trimesh
    m_base = trimesh.load(base_stl)
    m_base.visual.face_colors = [42, 46, 61, 255]  # Graphite 750
    m_base.export(base_glb)

    m_lid = trimesh.load(lid_stl)
    m_lid.visual.face_colors = [55, 62, 80, 255]
    m_lid.export(lid_glb)

    # Copy / save named aliases
    import shutil
    shutil.copyfile(base_step, shell_step)
    shutil.copyfile(base_stl, shell_stl)
    shutil.copyfile(base_glb, shell_glb)

    shutil.copyfile(lid_step, cover_step)
    shutil.copyfile(lid_stl, cover_stl)
    shutil.copyfile(lid_glb, cover_glb)

    # Build assembled scene + Ghost components
    split = spec.get("split", "back") if spec else "back"
    inner_w = float(spec.get("inner", [60, 40, 25])[1]) if spec else 40.0
    outer_w = inner_w + 2.0 * wall
    scene_geoms = [m_base]

    m_lid_assembled = trimesh.load(lid_stl)
    m_lid_assembled.visual.face_colors = [55, 62, 80, 255]

    if split == "top":
        m_lid_assembled.apply_translation([0.0, 0.0, inner_h + wall])
    else:
        # For back cover, positioned at back opening (Y=0)
        # Lip is at Y=wall..wall+2, plate at Y=0..wall
        pass

    scene_geoms.append(m_lid_assembled)

    # Ghost Components
    ghost_meshes = []
    if spec and spec.get("components"):
        for comp in spec["components"]:
            size = comp.get("size", [20, 20, 10])
            placed = comp.get("placed_center", [0, 0, 0])
            gbox = trimesh.creation.box(extents=size)
            # Position inside cavity
            # In back-split coordinate system: Y ranges from wall to outer_w - wall, center is outer_w / 2
            g_y = outer_w / 2.0 if split == "back" else placed[1]
            gbox.apply_translation([placed[0], g_y, placed[2]])
            # Cyan translucent color for ghost component
            gbox.visual.face_colors = [0, 210, 255, 170]
            ghost_meshes.append(gbox)
            scene_geoms.append(gbox)

    if ghost_meshes:
        ghost_scene = trimesh.Scene(ghost_meshes)
        ghost_scene.export(ghost_glb)

    scene = trimesh.Scene(scene_geoms)
    scene.export(both_glb)

    return {
        "base_step": base_step,
        "base_stl": base_stl,
        "base_glb": base_glb,
        "lid_step": lid_step,
        "lid_stl": lid_stl,
        "lid_glb": lid_glb,
        "shell_step": shell_step,
        "shell_stl": shell_stl,
        "shell_glb": shell_glb,
        "cover_step": cover_step,
        "cover_stl": cover_stl,
        "cover_glb": cover_glb,
        "both_glb": both_glb,
        "ghost_glb": ghost_glb,
    }

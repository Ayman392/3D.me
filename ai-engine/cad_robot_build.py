import os
import math
import shutil
import logging
import zipfile
from typing import Dict, Any, List, Tuple, Optional
import cadquery as cq
import trimesh

from cad_robot import get_part_by_kind

logger = logging.getLogger("3dme.cad.robot_build")

# Visual Material Color Constants (Graphite Aesthetic)
COLOR_BODY_GRAPHITE = [42, 46, 61, 255]       # Dark graphite #2a2e3d
COLOR_HEAD_GRAPHITE = [55, 62, 80, 255]       # Medium graphite #373e50
COLOR_NECK_METALLIC = [30, 32, 41, 255]       # Deep dark graphite #1e2029
COLOR_ARMS_GRAPHITE = [55, 62, 80, 255]       # Arm graphite
COLOR_EARS_ACCENT = [255, 119, 0, 255]        # Brand orange #ff7700
COLOR_DISPLAY_GLASS = [11, 14, 20, 230]       # Dark smoked display glass
COLOR_GHOST_CYAN = [0, 210, 255, 160]         # Translucent cyan ghost components


def _safe_fillet_box(w: float, d: float, h: float, r: float) -> cq.Workplane:
    """Creates a box and filleted edges with safety bounds to prevent OpenCASCADE kernel errors."""
    box = cq.Workplane("XY").box(w, d, h)
    safe_r = min(r, min(w, d, h) * 0.42)
    if safe_r > 0.4:
        try:
            box = box.edges().fillet(safe_r)
        except Exception:
            try:
                box = cq.Workplane("XY").box(w, d, h).edges("|Z").fillet(safe_r * 0.8)
            except Exception:
                pass
    return box


def build_head_solids(
    head_spec: Dict[str, Any],
    wall: float = 2.0,
    clearance: float = 0.2,
) -> Tuple[cq.Workplane, cq.Workplane]:
    """
    Builds head front and back halves with:
    - Display window cut on front face centered on active area
    - Internal 1.5 mm retaining ledge holding display module
    - Retaining tabs on inside wall
    - Left and right ear peg sockets with internal reinforcement boss
    - Bottom neck collar socket
    - Stepped lip joint on parting plane Y = 0 with 0.2 mm clearance
    """
    w = float(head_spec.get("w", 64.0))
    h = float(head_spec.get("h", 54.0))
    d = float(head_spec.get("d", 54.0))
    cr = float(head_spec.get("corner_radius", min(w, d, h) * 0.35))
    p_wall = float(head_spec.get("wall", wall))

    head_outer = _safe_fillet_box(w, d, h, cr)
    head_inner = _safe_fillet_box(w - 2.0 * p_wall, d - 2.0 * p_wall, h - 2.0 * p_wall, max(0.5, cr - p_wall))
    head_hollow = head_outer.cut(head_inner)

    # Display Pocket & Window
    disp = head_spec.get("display") or {}
    disp_size = disp.get("size", [27.3, 27.8, 4.0])
    act_size = disp.get("active_area", [22.0, 11.0])
    offset = disp.get("offset", [0.0, 0.0])

    act_w, act_h = float(act_size[0]), float(act_size[1])
    disp_w, disp_h, disp_t = float(disp_size[0]), float(disp_size[1]), float(disp_size[2])
    off_x, off_z = float(offset[0]), float(offset[1])
    front_y = d / 2.0

    # 1. Active area window cut through front wall
    win = cq.Workplane("XZ").box(act_w, act_h, p_wall * 3.0).translate((off_x, front_y - p_wall / 2.0, off_z))
    head_hollow = head_hollow.cut(win)

    # 2. Retaining tabs inside cavity
    tab_th = 1.6
    tab_depth = min(4.0, disp_t + 0.5)
    tab_l = cq.Workplane("XZ").box(tab_th, disp_h, tab_depth).translate(
        (off_x - disp_w / 2.0 - tab_th / 2.0, front_y - p_wall - tab_depth / 2.0, off_z)
    )
    tab_r = cq.Workplane("XZ").box(tab_th, disp_h, tab_depth).translate(
        (off_x + disp_w / 2.0 + tab_th / 2.0, front_y - p_wall - tab_depth / 2.0, off_z)
    )
    try:
        head_hollow = head_hollow.union(tab_l).union(tab_r)
    except Exception as e:
        logger.warning(f"Could not fuse display retaining tabs: {e}")

    # 3. Ear Peg Sockets on Left (-X) and Right (+X)
    peg_d = 4.0
    sock_d = peg_d + 2.0 * clearance  # 4.4 mm
    sock_depth = 5.2
    boss_d = sock_d + 2.0 * p_wall

    # Bosses inside walls to maintain watertight cavity
    boss_l = cq.Workplane("YZ").circle(boss_d / 2.0).extrude(sock_depth + 1.0).translate((-w / 2.0, 0, 0))
    boss_r = cq.Workplane("YZ").circle(boss_d / 2.0).extrude(-(sock_depth + 1.0)).translate((w / 2.0, 0, 0))
    try:
        head_hollow = head_hollow.union(boss_l).union(boss_r)
    except Exception as e:
        logger.warning(f"Could not fuse ear socket bosses: {e}")

    # Socket holes (extrude into interior of head)
    hole_l = cq.Workplane("YZ").circle(sock_d / 2.0).extrude(sock_depth).translate((-w / 2.0, 0, 0))
    hole_r = cq.Workplane("YZ").circle(sock_d / 2.0).extrude(-sock_depth).translate((w / 2.0, 0, 0))
    head_hollow = head_hollow.cut(hole_l).cut(hole_r)

    # 4. Neck Collar Socket on bottom face
    neck_socket_d = 20.4
    neck_socket_depth = 2.2
    neck_sock = cq.Workplane("XY").circle(neck_socket_d / 2.0).extrude(neck_socket_depth + 0.5).translate((0, 0, -h / 2.0 - 0.2))
    head_hollow = head_hollow.cut(neck_sock)

    # 5. Split into Front (Y >= 0) and Back (Y <= 0)
    cutter_back = cq.Workplane("XY").box(w + 50.0, d + 50.0, h + 50.0).translate((0, -(d + 50.0) / 2.0, 0))
    cutter_front = cq.Workplane("XY").box(w + 50.0, d + 50.0, h + 50.0).translate((0, (d + 50.0) / 2.0, 0))

    head_front = head_hollow.cut(cutter_back)
    head_back = head_hollow.cut(cutter_front)

    # 6. Lip Joint on Mating Rim
    lip_h = 1.8
    try:
        lip_outer = _safe_fillet_box(w - p_wall - 2.0 * clearance, d + 40.0, h - p_wall - 2.0 * clearance, max(0.5, cr - p_wall / 2.0 - clearance))
        lip_inner = _safe_fillet_box(w - 2.0 * p_wall, d + 40.0, h - 2.0 * p_wall, max(0.5, cr - p_wall))
        lip_ring = lip_outer.cut(lip_inner)
        lip_solid = lip_ring.intersect(cq.Workplane("XY").box(w + 40.0, lip_h, h + 40.0).translate((0, -lip_h / 2.0, 0)))
        head_front = head_front.union(lip_solid)

        rebate_outer = _safe_fillet_box(w - p_wall, d + 40.0, h - p_wall, max(0.5, cr - p_wall / 2.0))
        rebate_tool = rebate_outer.intersect(cq.Workplane("XY").box(w + 40.0, lip_h + 0.2, h + 40.0).translate((0, -(lip_h + 0.2) / 2.0, 0)))
        head_back = head_back.cut(rebate_tool)
    except Exception as e:
        logger.warning(f"Could not construct head lip joint: {e}")

    # Re-apply socket clearances through lip joint
    head_front = head_front.cut(neck_sock).cut(hole_l).cut(hole_r)
    head_back = head_back.cut(neck_sock).cut(hole_l).cut(hole_r)

    return head_front, head_back


def build_body_solids(
    body_spec: Dict[str, Any],
    wall: float = 2.0,
    clearance: float = 0.2,
    arm_mode: str = "fixed",
) -> Tuple[cq.Workplane, cq.Workplane]:
    """
    Builds body front and back halves with:
    - Egg shape profile
    - USB-C port cutout on back
    - Speaker perforations on back
    - Top neck collar socket
    - Arm sockets on shoulder
    - Standoffs for board
    - Stepped lip joint
    """
    w = float(body_spec.get("w", 68.0))
    h = float(body_spec.get("h", 54.0))
    d = float(body_spec.get("d", 54.0))
    top_r = float(body_spec.get("top_radius", w * 0.38))
    bot_r = float(body_spec.get("bottom_radius", w * 0.50))
    p_wall = float(body_spec.get("wall", wall))

    body_outer = cq.Workplane("XY").box(w, d, h)
    side_r = min(w * 0.28, d * 0.28)
    body_outer = body_outer.edges("|Z").fillet(side_r).edges(">Z").fillet(min(top_r, h * 0.35)).edges("<Z").fillet(min(bot_r, h * 0.40))

    in_w = w - 2.0 * p_wall
    in_d = d - 2.0 * p_wall
    in_h = h - 2.0 * p_wall
    body_inner = cq.Workplane("XY").box(in_w, in_d, in_h)
    body_inner = body_inner.edges("|Z").fillet(max(0.5, side_r - p_wall)).edges(">Z").fillet(max(0.5, min(top_r, h * 0.35) - p_wall)).edges("<Z").fillet(max(0.5, min(bot_r, h * 0.40) - p_wall))

    body_hollow = body_outer.cut(body_inner)

    # 1. USB-C Cutout
    if body_spec.get("has_usb_cutout", True):
        usb = cq.Workplane("XZ").box(10.0, 4.0, p_wall * 3.0).translate((0, -d / 2.0, -h / 2.0 + 6.0))
        body_hollow = body_hollow.cut(usb)

    # 2. Speaker Holes
    if body_spec.get("has_speaker_holes", True):
        for sx in [-4.0, 0.0, 4.0]:
            for sz in [-2.5, 2.5]:
                hole = cq.Workplane("XZ").circle(0.9).extrude(p_wall * 3.0).translate((sx, -d / 2.0 - p_wall, sz))
                body_hollow = body_hollow.cut(hole)

    # 3. Top Neck Collar Socket
    neck_socket_d = 20.4
    neck_socket_depth = 2.2
    neck_sock = cq.Workplane("XY").circle(neck_socket_d / 2.0).extrude(-neck_socket_depth - 0.5).translate((0, 0, h / 2.0 + 0.2))
    body_hollow = body_hollow.cut(neck_sock)

    # 4. Shoulder Arm Sockets at Z = h * 0.22
    shoulder_z = h * 0.22
    if arm_mode == "servo":
        shaft_l = cq.Workplane("YZ").circle(2.75).extrude(p_wall * 2.5).translate((-w / 2.0 - 0.2, 0, shoulder_z))
        shaft_r = cq.Workplane("YZ").circle(2.75).extrude(-p_wall * 2.5).translate((w / 2.0 + 0.2, 0, shoulder_z))
        body_hollow = body_hollow.cut(shaft_l).cut(shaft_r)
    else:
        sock_d = 6.4
        sock_depth = 5.2
        boss_d = sock_d + 2.0 * p_wall
        boss_l = cq.Workplane("YZ").circle(boss_d / 2.0).extrude(sock_depth + 1.0).translate((-w / 2.0, 0, shoulder_z))
        boss_r = cq.Workplane("YZ").circle(boss_d / 2.0).extrude(-(sock_depth + 1.0)).translate((w / 2.0, 0, shoulder_z))
        try:
            body_hollow = body_hollow.union(boss_l).union(boss_r)
        except Exception:
            pass
        hole_l = cq.Workplane("YZ").circle(sock_d / 2.0).extrude(sock_depth).translate((-w / 2.0, 0, shoulder_z))
        hole_r = cq.Workplane("YZ").circle(sock_d / 2.0).extrude(-sock_depth).translate((w / 2.0, 0, shoulder_z))
        body_hollow = body_hollow.cut(hole_l).cut(hole_r)

    # 5. Standoffs
    for sx, sy in [(-12.0, -8.0), (12.0, -8.0), (-12.0, 8.0), (12.0, 8.0)]:
        standoff = cq.Workplane("XY").circle(2.5).circle(1.0).extrude(4.0).translate((sx, sy, -h / 2.0 + p_wall))
        try:
            body_hollow = body_hollow.union(standoff)
        except Exception:
            pass

    # 6. Split Front and Back
    cutter_back = cq.Workplane("XY").box(w + 50.0, d + 50.0, h + 50.0).translate((0, -(d + 50.0) / 2.0, 0))
    cutter_front = cq.Workplane("XY").box(w + 50.0, d + 50.0, h + 50.0).translate((0, (d + 50.0) / 2.0, 0))

    body_front = body_hollow.cut(cutter_back)
    body_back = body_hollow.cut(cutter_front)

    # 7. Lip Joint
    lip_h = 1.8
    try:
        lip_outer = _safe_fillet_box(w - p_wall - 2.0 * clearance, d + 40.0, h - p_wall - 2.0 * clearance, max(0.5, side_r - p_wall / 2.0 - clearance))
        lip_inner = _safe_fillet_box(w - 2.0 * p_wall, d + 40.0, h - 2.0 * p_wall, max(0.5, side_r - p_wall))
        lip_ring = lip_outer.cut(lip_inner)
        lip_solid = lip_ring.intersect(cq.Workplane("XY").box(w + 40.0, lip_h, h + 40.0).translate((0, -lip_h / 2.0, 0)))
        body_front = body_front.union(lip_solid)

        rebate_outer = _safe_fillet_box(w - p_wall, d + 40.0, h - p_wall, max(0.5, side_r - p_wall / 2.0))
        rebate_tool = rebate_outer.intersect(cq.Workplane("XY").box(w + 40.0, lip_h + 0.2, h + 40.0).translate((0, -(lip_h + 0.2) / 2.0, 0)))
        body_back = body_back.cut(rebate_tool)
    except Exception as e:
        logger.warning(f"Could not construct body lip joint: {e}")

    # Re-apply socket clearances through lip joint
    arm_cut_l = shaft_l if arm_mode == "servo" else hole_l
    arm_cut_r = shaft_r if arm_mode == "servo" else hole_r
    body_front = body_front.cut(neck_sock).cut(arm_cut_l).cut(arm_cut_r)
    body_back = body_back.cut(neck_sock).cut(arm_cut_l).cut(arm_cut_r)

    return body_front, body_back


def build_neck_solid(neck_spec: Dict[str, Any]) -> cq.Workplane:
    """Builds neck collar ring linking head and body with central cable hole."""
    od = float(neck_spec.get("outer_d", 24.0))
    id_hole = float(neck_spec.get("cable_hole_d", neck_spec.get("inner_d", 12.0)))
    h = float(neck_spec.get("height", 8.0))
    lip_d = 20.0
    lip_h = 1.8

    main_ring = cq.Workplane("XY").circle(od / 2.0).circle(id_hole / 2.0).extrude(h)
    top_lip = cq.Workplane("XY").circle(lip_d / 2.0).circle(id_hole / 2.0).extrude(lip_h).translate((0, 0, h))
    bot_lip = cq.Workplane("XY").circle(lip_d / 2.0).circle(id_hole / 2.0).extrude(lip_h).translate((0, 0, -lip_h))

    return main_ring.union(top_lip).union(bot_lip)


def build_arm_solid(arm_spec: Dict[str, Any], side: str = "left") -> cq.Workplane:
    """Builds capsule arm with shoulder peg or servo socket."""
    length = float(arm_spec.get("length", 34.0))
    base_d = float(arm_spec.get("base_d", 14.0))
    tip_d = float(arm_spec.get("tip_d", 10.0))
    mode = arm_spec.get("joint_mode", "fixed")

    # Arm solid: base centered at (0, 0, 0), tip extends along -Z to -length
    cone = cq.Solid.makeCone(base_d / 2.0, tip_d / 2.0, length).rotate((0, 0, 0), (1, 0, 0), 180)
    tip_cap = cq.Solid.makeSphere(tip_d / 2.0).translate((0, 0, -length))
    base_cap = cq.Solid.makeSphere(base_d / 2.0)
    arm_solid = cq.Workplane("XY").newObject([cone.fuse(tip_cap).fuse(base_cap)])

    if mode == "servo":
        # Recessed horn socket
        horn_socket = cq.Workplane("YZ").circle(3.75).extrude(3.0)
        if side == "left":
            horn_socket = horn_socket.translate((base_d / 2.0 - 1.5, 0, 0))
        else:
            horn_socket = horn_socket.translate((-base_d / 2.0 - 1.5, 0, 0))
        arm_solid = arm_solid.cut(horn_socket)
    else:
        # Fixed mounting peg extending toward body
        peg_d = 6.0
        peg_len = 4.8
        peg = cq.Workplane("YZ").circle(peg_d / 2.0)
        if side == "left":
            peg = peg.extrude(peg_len).translate((base_d / 2.0, 0, 0))
        else:
            peg = peg.extrude(-peg_len).translate((-base_d / 2.0, 0, 0))
        arm_solid = arm_solid.union(peg)

    return arm_solid


def build_ear_solid(ear_spec: Dict[str, Any], side: str = "left") -> cq.Workplane:
    """Builds flattened disc ear pod with mounting peg."""
    w = float(ear_spec.get("w", 18.0))
    h = float(ear_spec.get("h", 18.0))
    d = float(ear_spec.get("d", 6.0))
    peg_d = float(ear_spec.get("peg_d", 4.0))
    peg_len = float(ear_spec.get("peg_length", 4.8))

    # Disc oriented in XY: thickness d along X, width w along Y, height h along Z
    ear = cq.Workplane("XY").box(d, w, h).edges().fillet(min(d, w, h) * 0.38)
    peg = cq.Workplane("YZ").circle(peg_d / 2.0)

    if side == "left":
        # Peg extends toward +X into head left wall
        peg = peg.extrude(peg_len).translate((d / 2.0, 0, 0))
    else:
        # Peg extends toward -X into head right wall
        peg = peg.extrude(-peg_len).translate((-d / 2.0, 0, 0))

    return ear.union(peg)


def build_robot_assembly_solids(spec: Dict[str, Any]) -> Dict[str, cq.Workplane]:
    """
    Builds all robot parts positioned in assembled 3D coordinates.
    Returns dictionary of positioned solid workplanes and local parts for export.
    """
    wall = float(spec.get("wall", 2.0))

    head_part = get_part_by_kind(spec, "head") or {}
    body_part = get_part_by_kind(spec, "body") or {}
    neck_part = get_part_by_kind(spec, "neck") or {}
    arm_part = get_part_by_kind(spec, "arm") or {}
    ear_part = get_part_by_kind(spec, "ear_pod") or {}

    head_w = float(head_part.get("w", 64.0))
    head_h = float(head_part.get("h", 54.0))

    body_w = float(body_part.get("w", 68.0))
    body_h = float(body_part.get("h", 54.0))

    neck_h = float(neck_part.get("height", 8.0))
    arm_mode = arm_part.get("joint_mode", "fixed")
    arm_base_d = float(arm_part.get("base_d", 14.0))
    ear_d = float(ear_part.get("d", 6.0))

    # Stack coordinates (Z=0 at bottom of body)
    z_body = body_h / 2.0
    z_head = body_h + neck_h + head_h / 2.0

    # 1. Build Local Solids (at origin)
    head_front_local, head_back_local = build_head_solids(head_part, wall=wall)
    body_front_local, body_back_local = build_body_solids(body_part, wall=wall, arm_mode=arm_mode)
    neck_local = build_neck_solid(neck_part)
    arm_left_local = build_arm_solid(arm_part, side="left")
    arm_right_local = build_arm_solid(arm_part, side="right")
    ear_left_local = build_ear_solid(ear_part, side="left")
    ear_right_local = build_ear_solid(ear_part, side="right")

    # 2. Position into Assembled Coordinates
    head_front = head_front_local.translate((0, 0, z_head))
    head_back = head_back_local.translate((0, 0, z_head))

    body_front = body_front_local.translate((0, 0, z_body))
    body_back = body_back_local.translate((0, 0, z_body))

    neck = neck_local.translate((0, 0, body_h))

    shoulder_z = z_body + body_h * 0.22
    # Place arm shoulder base just touching outer body wall with 0.2 mm clearance
    arm_x = body_w / 2.0 + arm_base_d / 2.0 + 0.2
    arm_left = arm_left_local.translate((-arm_x, 0, shoulder_z))
    arm_right = arm_right_local.translate((arm_x, 0, shoulder_z))

    # Place ear disc inner face right at outer head wall with 0.2 mm clearance
    ear_x = head_w / 2.0 + ear_d / 2.0 + 0.2
    ear_left = ear_left_local.translate((-ear_x, 0, z_head))
    ear_right = ear_right_local.translate((ear_x, 0, z_head))

    return {
        "head_front": head_front,
        "head_back": head_back,
        "body_front": body_front,
        "body_back": body_back,
        "neck": neck,
        "arm_left": arm_left,
        "arm_right": arm_right,
        "ear_left": ear_left,
        "ear_right": ear_right,
        # Local solids for individual STL/STEP export
        "_local_head_front": head_front_local,
        "_local_head_back": head_back_local,
        "_local_body_front": body_front_local,
        "_local_body_back": body_back_local,
        "_local_neck": neck_local,
        "_local_arm_left": arm_left_local,
        "_local_arm_right": arm_right_local,
        "_local_ear_left": ear_left_local,
        "_local_ear_right": ear_right_local,
    }


def export_robot_spec(spec: Dict[str, Any], out_dir: str) -> Dict[str, str]:
    """
    Exports:
    - STL, STEP, GLB per part half
    - Assembled preview GLB (positioned with distinct graphite & accent colors)
    - Exploded-view GLB (parts offset along axes so user sees how it fits together)
    - Download All (ZIP) containing all STLs with clean names
    """
    os.makedirs(out_dir, exist_ok=True)
    solids = build_robot_assembly_solids(spec)

    part_names = [
        ("head_front", "Head Front", COLOR_HEAD_GRAPHITE),
        ("head_back", "Head Back", COLOR_HEAD_GRAPHITE),
        ("body_front", "Body Front", COLOR_BODY_GRAPHITE),
        ("body_back", "Body Back", COLOR_BODY_GRAPHITE),
        ("neck", "Neck Collar", COLOR_NECK_METALLIC),
        ("arm_left", "Arm Left", COLOR_ARMS_GRAPHITE),
        ("arm_right", "Arm Right", COLOR_ARMS_GRAPHITE),
        ("ear_left", "Ear Pod Left", COLOR_EARS_ACCENT),
        ("ear_right", "Ear Pod Right", COLOR_EARS_ACCENT),
    ]

    files: Dict[str, str] = {}
    assembled_meshes: List[trimesh.Trimesh] = []
    exploded_meshes: List[trimesh.Trimesh] = []
    stl_files_for_zip: List[Tuple[str, str]] = []

    # 1. Export Individual Parts (STEP, STL, GLB)
    for key, label, color in part_names:
        local_key = f"_local_{key}"
        local_solid = solids.get(local_key, solids[key])

        step_path = os.path.join(out_dir, f"{key}.step")
        stl_path = os.path.join(out_dir, f"{key}.stl")
        glb_path = os.path.join(out_dir, f"{key}.glb")

        cq.exporters.export(local_solid, step_path, cq.exporters.ExportTypes.STEP)
        cq.exporters.export(local_solid, stl_path, cq.exporters.ExportTypes.STL, tolerance=0.02, angularTolerance=0.1)

        # Trimesh GLB & Clean Watertight STL
        mesh = trimesh.load(stl_path)
        mesh.process(validate=True)
        mesh.export(stl_path)
        mesh.visual.face_colors = color
        mesh.export(glb_path)

        files[f"{key}_step"] = step_path
        files[f"{key}_stl"] = stl_path
        files[f"{key}_glb"] = glb_path
        stl_files_for_zip.append((f"{key}.stl", stl_path))

        # Assembled mesh
        asm_solid = solids[key]
        asm_stl_tmp = os.path.join(out_dir, f"_tmp_{key}_asm.stl")
        cq.exporters.export(asm_solid, asm_stl_tmp, cq.exporters.ExportTypes.STL, tolerance=0.03, angularTolerance=0.1)
        asm_mesh = trimesh.load(asm_stl_tmp)
        asm_mesh.visual.face_colors = color
        assembled_meshes.append(asm_mesh)

        # Exploded mesh with axis shifts
        exp_mesh = trimesh.load(asm_stl_tmp)
        exp_mesh.visual.face_colors = color

        shift = [0.0, 0.0, 0.0]
        if "head" in key:
            shift[2] += 35.0
        if "neck" in key:
            shift[2] += 12.0
        if "front" in key:
            shift[1] += 32.0
        elif "back" in key:
            shift[1] -= 32.0

        if "arm_left" in key:
            shift[0] -= 28.0
        elif "arm_right" in key:
            shift[0] += 28.0

        if "ear_left" in key:
            shift[0] -= 22.0
            shift[2] += 35.0
        elif "ear_right" in key:
            shift[0] += 22.0
            shift[2] += 35.0

        exp_mesh.apply_translation(shift)
        exploded_meshes.append(exp_mesh)

        if os.path.exists(asm_stl_tmp):
            try:
                os.remove(asm_stl_tmp)
            except Exception:
                pass

    # 2. Add Display Glass & Ghost Components to Assembled & Exploded Scenes
    head_part = get_part_by_kind(spec, "head") or {}
    disp = head_part.get("display") or {}
    disp_act = disp.get("active_area", [22.0, 11.0])
    head_h = float(head_part.get("h", 54.0))
    head_d = float(head_part.get("d", 54.0))
    body_part = get_part_by_kind(spec, "body") or {}
    body_h = float(body_part.get("h", 54.0))
    neck_part = get_part_by_kind(spec, "neck") or {}
    neck_h = float(neck_part.get("height", 8.0))
    z_head = body_h + neck_h + head_h / 2.0

    glass_box = trimesh.creation.box(extents=[disp_act[0], 1.0, disp_act[1]])
    glass_box.apply_translation([0.0, head_d / 2.0 - 1.0, z_head])
    glass_box.visual.face_colors = COLOR_DISPLAY_GLASS
    assembled_meshes.append(glass_box)

    ghost_meshes: List[trimesh.Trimesh] = []
    for comp in spec.get("components", []):
        c_size = comp.get("size", [20, 20, 10])
        target = comp.get("target", "body")
        c_mesh = trimesh.creation.box(extents=c_size)
        if target == "head":
            c_mesh.apply_translation([0.0, head_d / 2.0 - 8.0, z_head])
        else:
            c_mesh.apply_translation([0.0, 0.0, body_h / 2.0])
        c_mesh.visual.face_colors = COLOR_GHOST_CYAN
        ghost_meshes.append(c_mesh)

    # 3. Export Assembled Scene GLB
    assembled_scene = trimesh.Scene(assembled_meshes)
    assembled_glb = os.path.join(out_dir, "assembled.glb")
    assembled_scene.export(assembled_glb)
    files["assembled_glb"] = assembled_glb
    files["both_glb"] = assembled_glb
    shutil.copyfile(assembled_glb, os.path.join(out_dir, "both.glb"))

    # 4. Export Exploded View GLB
    exploded_scene = trimesh.Scene(exploded_meshes)
    exploded_glb = os.path.join(out_dir, "exploded.glb")
    exploded_scene.export(exploded_glb)
    files["exploded_glb"] = exploded_glb

    # 5. Export Ghost View GLB
    ghost_scene = trimesh.Scene(assembled_meshes + ghost_meshes)
    ghost_glb = os.path.join(out_dir, "ghost.glb")
    ghost_scene.export(ghost_glb)
    files["ghost_glb"] = ghost_glb

    # 6. Generate "Download All (ZIP)"
    zip_path = os.path.join(out_dir, "all.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname, fpath in stl_files_for_zip:
            if os.path.exists(fpath):
                zf.write(fpath, arcname=fname)
    files["all_zip"] = zip_path

    # Aliases for default preview shell and cover
    files["shell_stl"] = files["head_front_stl"]
    files["shell_glb"] = files["head_front_glb"]
    files["cover_stl"] = files["head_back_stl"]
    files["cover_glb"] = files["head_back_glb"]

    return files

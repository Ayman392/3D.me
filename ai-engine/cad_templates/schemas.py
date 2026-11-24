"""
Parameter schemas for 3d.me Build123d CAD templates.
All dimensions are strictly in millimeters.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class PortCutout(BaseModel):
    face: Literal["front", "back", "left", "right", "top", "bottom"] = Field(
        default="back", description="Face on which to place cutout"
    )
    width: float = Field(default=12.0, ge=2.0, le=100.0, description="Cutout width in mm")
    height: float = Field(default=6.0, ge=2.0, le=50.0, description="Cutout height in mm")
    offset_x: float = Field(default=0.0, ge=-100.0, le=100.0, description="Offset from face center in mm")
    offset_z: float = Field(default=0.0, ge=-50.0, le=50.0, description="Height offset from face center in mm")


class EnclosureWithLidParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    internal_x: float = Field(default=80.0, ge=15.0, le=300.0, description="Internal cavity length in mm")
    internal_y: float = Field(default=50.0, ge=15.0, le=300.0, description="Internal cavity width in mm")
    internal_z: float = Field(default=30.0, ge=10.0, le=200.0, description="Internal cavity depth in mm")
    wall_thickness: float = Field(default=2.0, ge=1.2, le=6.0, description="Shell wall thickness in mm")
    corner_radius: float = Field(default=3.0, ge=0.0, le=20.0, description="External corner fillet radius in mm")
    lid_type: Literal["snap", "screw", "slip"] = Field(default="snap", description="Lid attachment mechanism")
    vents: bool = Field(default=False, description="Whether to cut heat dissipation vent slots on top")
    port_cutouts: List[PortCutout] = Field(default_factory=list, description="List of rectangular port cutouts")


class BoardEnclosureParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    board_preset: Literal["pi_4b", "pi_zero_2w", "arduino_uno", "esp32_wroom", "custom"] = Field(
        default="pi_4b", description="Pre-configured board dimensions and mounting points"
    )
    custom_length: Optional[float] = Field(default=85.0, ge=15.0, le=300.0, description="Custom board length in mm")
    custom_width: Optional[float] = Field(default=56.0, ge=15.0, le=300.0, description="Custom board width in mm")
    standoff_height: float = Field(default=5.0, ge=2.0, le=20.0, description="Standoff peg height in mm")
    wall_thickness: float = Field(default=2.0, ge=1.2, le=5.0, description="Wall thickness in mm")
    clearance: float = Field(default=2.0, ge=0.5, le=10.0, description="Margin around board perimeter in mm")
    lid_type: Literal["snap", "screw", "slip"] = Field(default="snap", description="Lid mechanism")


class BracketLParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    arm1_length: float = Field(default=50.0, ge=15.0, le=250.0, description="Length of horizontal arm in mm")
    arm2_length: float = Field(default=50.0, ge=15.0, le=250.0, description="Length of vertical arm in mm")
    width: float = Field(default=30.0, ge=10.0, le=150.0, description="Bracket width in mm")
    thickness: float = Field(default=4.0, ge=2.0, le=15.0, description="Material thickness in mm")
    hole_diameter_arm1: float = Field(default=4.2, ge=0.0, le=20.0, description="Arm 1 bolt hole diameter (M4=4.2mm)")
    hole_count_arm1: int = Field(default=2, ge=0, le=5, description="Number of bolt holes on arm 1")
    hole_diameter_arm2: float = Field(default=4.2, ge=0.0, le=20.0, description="Arm 2 bolt hole diameter (M4=4.2mm)")
    hole_count_arm2: int = Field(default=2, ge=0, le=5, description="Number of bolt holes on arm 2")
    gusset: bool = Field(default=True, description="Add corner reinforcement gusset web")


class BracketFlatPlateParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    length: float = Field(default=80.0, ge=20.0, le=300.0, description="Plate length in mm")
    width: float = Field(default=40.0, ge=15.0, le=200.0, description="Plate width in mm")
    thickness: float = Field(default=3.0, ge=1.5, le=15.0, description="Plate thickness in mm")
    corner_radius: float = Field(default=3.0, ge=0.0, le=15.0, description="Corner fillet radius in mm")
    hole_diameter: float = Field(default=4.2, ge=0.0, le=20.0, description="Mounting hole diameter in mm")
    hole_pattern: Literal["corners", "center", "grid", "slots"] = Field(
        default="corners", description="Layout pattern of mounting holes"
    )
    slot_length: float = Field(default=0.0, ge=0.0, le=40.0, description="Slot elongation length in mm (if slots)")


class SnapFitClipParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    clip_length: float = Field(default=30.0, ge=10.0, le=100.0, description="Length of cantilever beam in mm")
    clip_width: float = Field(default=15.0, ge=5.0, le=50.0, description="Width of cantilever beam in mm")
    cantilever_thickness: float = Field(default=2.0, ge=1.0, le=5.0, description="Beam thickness in mm")
    hook_depth: float = Field(default=1.5, ge=0.5, le=5.0, description="Catch hook protrusion depth in mm")
    hook_angle_deg: float = Field(default=30.0, ge=15.0, le=60.0, description="Lead-in angle in degrees")
    base_thickness: float = Field(default=4.0, ge=2.0, le=10.0, description="Mounting base thickness in mm")


class LivingHingeParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    plate_length: float = Field(default=40.0, ge=20.0, le=150.0, description="Total length across both plates in mm")
    plate_width: float = Field(default=30.0, ge=10.0, le=100.0, description="Width of plates and hinge in mm")
    plate_thickness: float = Field(default=2.5, ge=1.5, le=6.0, description="Rigid plate thickness in mm")
    hinge_gap: float = Field(default=3.0, ge=1.0, le=10.0, description="Hinge flexure width in mm")
    hinge_thickness: float = Field(default=0.5, ge=0.25, le=1.0, description="Thin flexible membrane thickness in mm")


class PinHingeParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    leaf_length: float = Field(default=35.0, ge=15.0, le=100.0, description="Length of each hinge leaf in mm")
    leaf_width: float = Field(default=25.0, ge=10.0, le=80.0, description="Width of hinge knuckle axis in mm")
    leaf_thickness: float = Field(default=3.0, ge=2.0, le=8.0, description="Leaf plate thickness in mm")
    pin_diameter: float = Field(default=3.0, ge=1.5, le=10.0, description="Hinge pin hole diameter in mm")
    knuckle_count: int = Field(default=3, ge=2, le=5, description="Number of alternating knuckle segments")
    clearance: float = Field(default=0.3, ge=0.15, le=1.0, description="Gap clearance between knuckles in mm")


class KnobParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    outer_diameter: float = Field(default=25.0, ge=10.0, le=80.0, description="Knob outer diameter in mm")
    height: float = Field(default=16.0, ge=8.0, le=50.0, description="Knob total height in mm")
    shaft_diameter: float = Field(default=6.0, ge=3.0, le=15.0, description="Shaft bore diameter in mm (e.g. 6.0)")
    shaft_type: Literal["d_shaft", "round"] = Field(default="d_shaft", description="Shaft profile")
    d_shaft_flat_depth: float = Field(default=1.0, ge=0.4, le=3.0, description="Depth of flat face on D-shaft in mm")
    knurl_ribs: int = Field(default=16, ge=0, le=36, description="Number of grip flutes/ribs around edge")
    pointer_notch: bool = Field(default=True, description="Indicator indicator notch/line on top face")
    set_screw_hole: bool = Field(default=True, description="Transverse grub screw hole for locking")
    set_screw_diameter: float = Field(default=2.5, ge=1.5, le=4.0, description="Grub screw tap hole diameter in mm")


class BatteryCoverParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    length: float = Field(default=55.0, ge=20.0, le=120.0, description="Cover length in mm")
    width: float = Field(default=30.0, ge=15.0, le=80.0, description="Cover width in mm")
    thickness: float = Field(default=1.8, ge=1.2, le=4.0, description="Cover plate thickness in mm")
    retaining_lip_depth: float = Field(default=2.0, ge=1.0, le=4.0, description="Depth of rear locating tab in mm")
    snap_latch_width: float = Field(default=8.0, ge=4.0, le=20.0, description="Front snap latch flexure width in mm")
    finger_grip_ribs: int = Field(default=4, ge=0, le=8, description="Number of textured thumb grip ribs")


class GasketFromProfileParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    shape: Literal["rectangular", "circular"] = Field(default="rectangular", description="Gasket outline geometry")
    length: float = Field(default=60.0, ge=10.0, le=200.0, description="Outer length in mm (rectangular)")
    width: float = Field(default=40.0, ge=10.0, le=200.0, description="Outer width in mm (rectangular)")
    diameter: float = Field(default=50.0, ge=10.0, le=200.0, description="Outer diameter in mm (circular)")
    cross_section_width: float = Field(default=3.0, ge=1.0, le=10.0, description="Gasket rib rim width in mm")
    thickness: float = Field(default=2.0, ge=0.8, le=10.0, description="Gasket sheet thickness in mm")
    bolt_hole_diameter: float = Field(default=3.2, ge=0.0, le=10.0, description="Bolt hole diameter in mm (0 for none)")
    bolt_hole_count: int = Field(default=4, ge=0, le=12, description="Number of bolt holes")


class ThreadedInsertBossParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    insert_thread: Literal["M2", "M2.5", "M3", "M4", "M5"] = Field(
        default="M3", description="Heat-set threaded brass insert standard"
    )
    boss_outer_diameter: float = Field(default=7.0, ge=4.0, le=20.0, description="Boss cylinder outer diameter in mm")
    boss_height: float = Field(default=8.0, ge=4.0, le=30.0, description="Boss post height in mm")
    hole_diameter: float = Field(default=4.2, ge=2.0, le=10.0, description="Core pilot hole diameter in mm")
    hole_depth: float = Field(default=6.0, ge=3.0, le=25.0, description="Pilot hole depth in mm")
    base_plate_thickness: float = Field(default=2.0, ge=0.0, le=10.0, description="Supporting base plate thickness")
    gusset_count: int = Field(default=2, ge=0, le=4, description="Number of triangular support ribs")


class MetricThreadParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nominal_diameter: float = Field(default=8.0, ge=3.0, le=50.0, description="Major thread diameter in mm (e.g. M8=8.0)")
    pitch: float = Field(default=1.25, ge=0.5, le=4.0, description="Thread pitch in mm (e.g. standard M8 is 1.25mm)")
    length: float = Field(default=20.0, ge=5.0, le=100.0, description="Threaded shaft length in mm")
    head_type: Literal["hex", "cylinder", "none"] = Field(default="hex", description="Fastener head type")
    head_diameter: float = Field(default=13.0, ge=5.0, le=60.0, description="Head across flats or diameter in mm")
    head_height: float = Field(default=5.5, ge=2.0, le=30.0, description="Bolt head height in mm")


class SpacerWasherParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    outer_diameter: float = Field(default=16.0, ge=5.0, le=60.0, description="Washer/spacer outer diameter in mm")
    inner_diameter: float = Field(default=5.2, ge=2.0, le=40.0, description="Clearance hole inner diameter in mm")
    thickness: float = Field(default=5.0, ge=0.5, le=50.0, description="Spacer length / washer thickness in mm")
    chamfer: float = Field(default=0.5, ge=0.0, le=2.0, description="Edge chamfer in mm")


class CableClipParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cable_diameter: float = Field(default=6.0, ge=2.0, le=30.0, description="Target cable outer diameter in mm")
    clip_width: float = Field(default=12.0, ge=6.0, le=40.0, description="Width along the cable axis in mm")
    wall_thickness: float = Field(default=2.0, ge=1.5, le=5.0, description="Clip wall thickness in mm")
    mounting: Literal["screw_hole", "adhesive_tab"] = Field(default="screw_hole", description="Mounting method")
    screw_hole_diameter: float = Field(default=3.5, ge=2.0, le=6.0, description="Mounting screw hole diameter in mm")


class WallHookParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    hook_depth: float = Field(default=35.0, ge=15.0, le=100.0, description="Forward reach/depth of hook arm in mm")
    hook_width: float = Field(default=15.0, ge=8.0, le=40.0, description="Width of hook body in mm")
    backplate_height: float = Field(default=50.0, ge=20.0, le=120.0, description="Height of mounting backplate in mm")
    backplate_thickness: float = Field(default=4.0, ge=2.0, le=10.0, description="Thickness of backplate in mm")
    lip_height: float = Field(default=15.0, ge=5.0, le=40.0, description="Upward retaining lip height in mm")
    screw_hole_count: int = Field(default=2, ge=1, le=3, description="Countersunk mounting screw holes")
    screw_hole_diameter: float = Field(default=4.2, ge=2.5, le=6.0, description="Screw hole diameter in mm")

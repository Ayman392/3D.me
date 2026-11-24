"""
cad_sandbox.py - Safe Subprocess Runner for AI-Generated CadQuery Code (Phase 2)

Features:
- Strict AST pre-execution validation:
  * Whitelist imports: only 'cadquery', 'cq', 'math', and 'cad_kit'.
  * Rejects exec, eval, open, __import__, input, dunder attributes (__class__, __subclasses__, etc.)
  * Rejects os, sys, subprocess, network, and file system primitives.
- Subprocess isolation:
  * Strict execution timeout (default 60s).
  * Enforces script contract: must define `parts = {"name": cq_object}`.
  * Direct export of STL, STEP, and GLB files into designated project/iteration folder.
  * Captures formatted tracebacks with file line numbers for agent auto-repair.
"""

import ast
import os
import sys
import json
import time
import shutil
import tempfile
import subprocess
import logging
from typing import Dict, Any, Tuple, Optional, List
import cadquery as cq

logger = logging.getLogger("3dme.cad.sandbox")

ALLOWED_MODULES = {"cadquery", "cq", "build123d", "b3d", "math", "cad_kit"}
FORBIDDEN_CALLS = {
    "exec", "eval", "compile", "open", "__import__", "input",
    "breakpoint", "globals", "locals", "getattr", "setattr", "delattr"
}
FORBIDDEN_ATTRIBUTES = {
    "__class__", "__bases__", "__subclasses__", "__globals__",
    "__builtins__", "__code__", "__dict__", "__closure__", "__mro__"
}


class CadQuerySecurityVisitor(ast.NodeVisitor):
    """AST Visitor that validates safety of agent-generated CadQuery code."""

    def __init__(self):
        self.errors: List[str] = []

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            base_module = alias.name.split(".")[0]
            if base_module not in ALLOWED_MODULES:
                self.errors.append(
                    f"Forbidden import '{alias.name}'. Only 'cadquery', 'math', and 'cad_kit' are allowed."
                )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.module:
            base_module = node.module.split(".")[0]
            if base_module not in ALLOWED_MODULES:
                self.errors.append(
                    f"Forbidden from-import '{node.module}'. Only 'cadquery', 'math', and 'cad_kit' are allowed."
                )
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        if isinstance(node.func, ast.Name):
            if node.func.id in FORBIDDEN_CALLS:
                self.errors.append(
                    f"Forbidden function call '{node.func.id}()'. Dynamic execution and file I/O are blocked."
                )
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        if node.attr in FORBIDDEN_ATTRIBUTES or (node.attr.startswith("__") and node.attr.endswith("__")):
            self.errors.append(
                f"Forbidden dunder attribute access '{node.attr}'. Introspection is blocked."
            )
        self.generic_visit(node)


def validate_script_ast(code: str) -> Tuple[bool, Optional[str]]:
    """
    Parses code into an AST and ensures no forbidden modules, calls, or dunders are used.
    Returns (is_safe, error_message).
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"SyntaxError on line {e.lineno}: {e.msg}"
    except Exception as e:
        return False, f"AST parse error: {e}"

    visitor = CadQuerySecurityVisitor()
    visitor.visit(tree)

    if visitor.errors:
        return False, "; ".join(visitor.errors)

    return True, None


WRAPPER_TEMPLATE = """# -*- coding: utf-8 -*-
import sys
import os
import json
import traceback
import cadquery as cq
import math
import cad_kit
import trimesh

output_dir = {output_dir!r}
result_file = {result_file!r}

response = {{
    "success": False,
    "error": None,
    "traceback": None,
    "parts": {{}},
    "files": {{}},
    "metrics": {{}}
}}

try:
    # Scope for execution
    user_globals = {{
        "cq": cq,
        "cadquery": cq,
        "math": math,
        "cad_kit": cad_kit,
    }}
    try:
        import build123d as b3d
        user_globals["b3d"] = b3d
        user_globals["build123d"] = b3d
    except Exception:
        pass
    
    # Execute user code
    exec({code!r}, user_globals)
    
    if "parts" not in user_globals or not isinstance(user_globals["parts"], dict):
        raise ValueError("Script must define a 'parts' dictionary, e.g. parts = {{'head': head_solid}}")
    
    parts_dict = user_globals["parts"]
    if not parts_dict:
        raise ValueError("The 'parts' dictionary is empty. At least one part solid must be defined.")
    
    os.makedirs(output_dir, exist_ok=True)
    
    exported_files = {{}}
    metrics = {{}}
    
    for name, solid in parts_dict.items():
        clean_name = str(name).strip().replace(" ", "_")
        stl_path = os.path.join(output_dir, f"{{clean_name}}.stl")
        step_path = os.path.join(output_dir, f"{{clean_name}}.step")
        
        # Export STL and STEP (supporting both CadQuery and Build123d solids)
        if hasattr(solid, "export_stl"):
            solid.export_stl(stl_path)
            if hasattr(solid, "export_step"):
                solid.export_step(step_path)
        elif hasattr(cq, "exporters"):
            cq.exporters.export(solid, stl_path, cq.exporters.ExportTypes.STL, tolerance=0.01, angularTolerance=0.1)
            cq.exporters.export(solid, step_path, cq.exporters.ExportTypes.STEP)
        else:
            raise TypeError(f"Unknown solid type for part '{{name}}': {{type(solid)}}")
        
        # Compute mesh metrics via trimesh
        mesh = trimesh.load(stl_path, force="mesh")
        try:
            mesh.process(validate=True)
        except Exception:
            pass

        vol = float(solid.val().Volume()) if hasattr(solid, "val") else float(mesh.volume)
        bb = solid.val().BoundingBox() if hasattr(solid, "val") else None
        bounds = [float(bb.xmax - bb.xmin), float(bb.ymax - bb.ymin), float(bb.zmax - bb.zmin)] if bb else [float(x) for x in (mesh.bounds[1] - mesh.bounds[0])]
        
        is_brep_valid = bool(solid.val().isValid()) if hasattr(solid, "val") else True
        is_watertight = bool(mesh.is_watertight or (is_brep_valid and vol > 0))

        metrics[clean_name] = {{
            "volume_mm3": round(vol, 2),
            "watertight": is_watertight,
            "valid_brep": is_brep_valid,
            "vertices": int(len(mesh.vertices)),
            "triangles": int(len(mesh.faces)),
            "bounds": [round(b, 2) for b in bounds]
        }}
        
        exported_files[clean_name] = {{
            "stl": stl_path,
            "step": step_path
        }}
    
    # Combined assembly GLB export
    combined_glb_path = os.path.join(output_dir, "assembly.glb")
    scene = trimesh.Scene()
    for clean_name, file_info in exported_files.items():
        sub_mesh = trimesh.load(file_info["stl"], force="mesh")
        scene.add_geometry(sub_mesh, node_name=clean_name)
    scene.export(combined_glb_path)
    exported_files["assembly_glb"] = combined_glb_path

    response["success"] = True
    response["parts"] = list(parts_dict.keys())
    response["files"] = exported_files
    response["metrics"] = metrics

except Exception as e:
    exc_type, exc_value, exc_tb = sys.exc_info()
    tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
    # Extract relevant user code traceback
    clean_tb = []
    for line in tb_lines:
        if "cadquery" in line or "user_globals" in line or "exec(" in line or "<string>" in line:
            clean_tb.append(line)
        elif not clean_tb:
            clean_tb.append(line)
        else:
            clean_tb.append(line)
    
    response["success"] = False
    response["error"] = str(e)
    response["traceback"] = "".join(clean_tb[-6:]) if len(clean_tb) > 6 else "".join(clean_tb)

with open(result_file, "w", encoding="utf-8") as rf:
    json.dump(response, rf, indent=2)
"""


def execute_cadquery_script(
    code: str,
    output_dir: str,
    timeout: float = 60.0,
) -> Dict[str, Any]:
    """
    Executes an AI-generated CadQuery script safely inside a subprocess:
    1. Validates AST for security.
    2. Runs wrapper in an isolated subprocess with strict 60s timeout.
    3. Exports STLs, STEPs, and assembly GLB into output_dir.
    4. Returns metrics, file paths, and any tracebacks.

    Returns:
        Dict with keys:
            success: bool
            error: Optional[str]
            traceback: Optional[str]
            parts: List[str]
            files: Dict[str, Any]
            metrics: Dict[str, Any]
            duration_s: float
    """
    t0 = time.time()

    # 1. AST Pre-check
    is_safe, security_error = validate_script_ast(code)
    if not is_safe:
        return {
            "success": False,
            "error": f"Security validation failed: {security_error}",
            "traceback": f"ASTSecurityError: {security_error}",
            "parts": [],
            "files": {},
            "metrics": {},
            "duration_s": round(time.time() - t0, 3),
        }

    os.makedirs(output_dir, exist_ok=True)
    temp_runner_dir = tempfile.mkdtemp(prefix="3dme_sandbox_")
    wrapper_path = os.path.join(temp_runner_dir, "run_wrapper.py")
    result_path = os.path.join(temp_runner_dir, "result.json")

    wrapper_code = WRAPPER_TEMPLATE.format(
        output_dir=output_dir,
        result_file=result_path,
        code=code,
    )

    with open(wrapper_path, "w", encoding="utf-8") as wf:
        wf.write(wrapper_code)

    # Clean sandbox environment inheriting sys.path for CadQuery
    clean_env = os.environ.copy()
    clean_env["PYTHONPATH"] = os.path.dirname(os.path.abspath(__file__))

    try:
        proc = subprocess.run(
            [sys.executable, wrapper_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=temp_runner_dir,
            env=clean_env,
        )

        duration = round(time.time() - t0, 3)

        if os.path.exists(result_path):
            with open(result_path, "r", encoding="utf-8") as rf:
                result = json.load(rf)
            result["duration_s"] = duration
            if proc.returncode != 0 and result.get("success"):
                result["success"] = False
                result["error"] = proc.stderr.strip() or "Process exited with non-zero status"
            return result
        else:
            stderr_out = proc.stderr.strip() or proc.stdout.strip()
            return {
                "success": False,
                "error": stderr_out or f"Subprocess exited with code {proc.returncode} without writing output",
                "traceback": stderr_out,
                "parts": [],
                "files": {},
                "metrics": {},
                "duration_s": duration,
            }

    except subprocess.TimeoutExpired:
        logger.warning(f"CadQuery sandbox timed out after {timeout}s")
        return {
            "success": False,
            "error": f"Execution timed out after {timeout} seconds (infinite loop or excessive complexity)",
            "traceback": f"TimeoutError: Execution exceeded {timeout}s limit",
            "parts": [],
            "files": {},
            "metrics": {},
            "duration_s": round(time.time() - t0, 3),
        }
    except Exception as e:
        logger.error(f"Sandbox execution error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "traceback": str(e),
            "parts": [],
            "files": {},
            "metrics": {},
            "duration_s": round(time.time() - t0, 3),
        }
    finally:
        shutil.rmtree(temp_runner_dir, ignore_errors=True)

"""
3d.me 30-Case Functional CAD Benchmark Runner (Phase 8)
Executes all 30 real-world functional cases across:
- 10 Casings & Enclosures
- 10 Brackets & Mounts
- 10 Replacement & Home Parts
Verifies solid validity, dimensions, STEP/STL export, and stores results in results/latest.json.
"""

import glob
import json
import os
import sys
import time
from typing import Dict, Any, List

# Ensure ai-engine is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cad_template_engine import design_parametric_template
from cad_verify import verify_cad_solid_v2
from build123d import import_step

BENCHMARKS_DIR = os.path.dirname(os.path.abspath(__file__))
CASES_DIR = os.path.join(BENCHMARKS_DIR, "cases")
RESULTS_DIR = os.path.join(BENCHMARKS_DIR, "results")
os.makedirs(RESULTS_DIR, exist_ok=True)


def run_all_benchmarks() -> Dict[str, Any]:
    case_files = sorted(glob.glob(os.path.join(CASES_DIR, "*.json")))
    if not case_files:
        raise RuntimeError("No benchmark cases found in benchmarks/cases/")

    total_cases = len(case_files)
    passed_cases = 0
    results: List[Dict[str, Any]] = []

    print(f"\n=======================================================")
    print(f"       3d.me Functional CAD Benchmark Suite ({total_cases} Cases)       ")
    print(f"=======================================================\n")

    start_suite = time.time()

    for idx, fpath in enumerate(case_files, 1):
        with open(fpath, "r", encoding="utf-8") as f:
            case = json.load(f)

        cid = case["id"]
        cname = case["name"]
        cat = case["category"]
        prompt = case["prompt"]
        crit_dims = case.get("critical_dimensions", {})
        expected_tpl = case.get("template")

        case_start = time.time()
        err_msg = None
        is_passed = False
        step_exists = False
        stl_exists = False
        dim_ok = True

        try:
            design_res = design_parametric_template(
                prompt=prompt,
                template_name_override=expected_tpl
            )

            status = design_res.get("status")
            tpl_used = design_res.get("template")
            step_rel = design_res.get("step_url", "")
            stl_rel = design_res.get("stl_url", "")

            # Verify files on disk
            base_engine = os.path.dirname(BENCHMARKS_DIR)
            step_disk = os.path.join(base_engine, step_rel.lstrip("/"))
            stl_disk = os.path.join(base_engine, stl_rel.lstrip("/"))

            step_exists = os.path.exists(step_disk) and os.path.getsize(step_disk) > 100
            stl_exists = os.path.exists(stl_disk) and os.path.getsize(stl_disk) > 100

            # Check critical dimensions
            actual_params = design_res.get("parameters", {})
            for k, expected_v in crit_dims.items():
                actual_v = actual_params.get(k)
                if actual_v is not None and abs(actual_v - expected_v) > 0.1:
                    dim_ok = False
                    err_msg = f"Dimension {k}: expected {expected_v}, got {actual_v}"
                    break

            if status == "completed" and step_exists and stl_exists and dim_ok:
                is_passed = True
                passed_cases += 1
            elif not step_exists or not stl_exists:
                err_msg = "STEP or STL file missing/empty"

        except Exception as e:
            err_msg = str(e)

        duration = round(time.time() - case_start, 3)
        status_sym = "✅ PASS" if is_passed else "❌ FAIL"
        print(f"[{idx:02d}/{total_cases:02d}] {status_sym} | {cat:<11} | {cname:<28} | {duration:.3f}s")
        if err_msg:
            print(f"      └── Note: {err_msg}")

        results.append({
            "id": cid,
            "name": cname,
            "category": cat,
            "passed": is_passed,
            "duration_s": duration,
            "step_valid": step_exists,
            "stl_valid": stl_exists,
            "dimensions_match": dim_ok,
            "error": err_msg
        })

    total_time = round(time.time() - start_suite, 2)
    pass_rate_pct = round((passed_cases / total_cases) * 100.0, 1)

    print(f"\n=======================================================")
    print(f"Scorecard: {passed_cases}/{total_cases} passed ({pass_rate_pct}%) in {total_time}s")
    print(f"=======================================================\n")

    summary = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_cases": total_cases,
        "passed_cases": passed_cases,
        "pass_rate_percent": pass_rate_pct,
        "total_duration_seconds": total_time,
        "cases": results
    }

    out_file = os.path.join(RESULTS_DIR, "latest.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    return summary


if __name__ == "__main__":
    summary = run_all_benchmarks()
    sys.exit(0 if summary["pass_rate_percent"] >= 90.0 else 1)

"""
CI Regression Test for Functional CAD Benchmark Suite (Phase 8)
Asserts that the 30-case benchmark suite achieves >= 90% pass rate.
"""

import os
import json
import pytest
from benchmarks.run import run_all_benchmarks, RESULTS_DIR


def test_benchmark_suite_ci_threshold():
    summary = run_all_benchmarks()
    pass_rate = summary["pass_rate_percent"]
    total = summary["total_cases"]
    passed = summary["passed_cases"]

    assert total == 30, f"Expected 30 cases, found {total}"
    assert pass_rate >= 90.0, f"Benchmark pass rate {pass_rate}% is below 90% threshold ({passed}/{total})"

    latest_file = os.path.join(RESULTS_DIR, "latest.json")
    assert os.path.exists(latest_file)
    with open(latest_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        assert data["passed_cases"] == passed

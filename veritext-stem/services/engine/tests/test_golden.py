"""fixtures/golden_demo_reports.json must match what the engine produces now.

The web core's tests compare against the same file, which keeps both engines in step.
Regenerate with ``uv run python ../../scripts/gen_golden.py``.
"""

from __future__ import annotations

import json

from tests.conftest import FIXTURES
from veritext_engine.pipeline.providers import DemoProvider
from veritext_engine.pipeline.run import run_pipeline


def test_golden_reports_are_current() -> None:
    cases = json.loads((FIXTURES / "golden_demo_reports.json").read_text(encoding="utf-8"))["cases"]
    assert cases
    for case in cases:
        report = run_pipeline(case["text"], DemoProvider()).model_dump(by_alias=True)
        assert report == case["report"], f"golden report {case['id']} is stale; rerun scripts/gen_golden.py"

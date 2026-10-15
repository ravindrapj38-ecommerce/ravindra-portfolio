"""Writes fixtures/golden_demo_reports.json: engine reports (demo rewriter) for a set of inputs.

The web core's tests compare its own reports with these, so the Python and TypeScript engines cannot
drift apart silently. Run from veritext-stem/services/engine: ``uv run python ../../scripts/gen_golden.py``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
INPUTS: list[dict[str, Any]] = [
    {"id": "sample", "text": (ROOT / "shared" / "sample.md").read_text(encoding="utf-8")},
    {
        "id": "markdown-doc",
        "text": (
            "# Results\n\nIn order to test the model, we utilize a large number of runs [4]. "
            "It is important to note that accuracy did not improve beyond 92.1% (Wu et al., 2021).\n\n"
            "- Furthermore, the loss is associated with batch size.\n- Training used `torch.compile`.\n\n"
            "| a | b |\n|---|---|\n\n```python\nprint('x')\n```\n"
        ),
    },
    {
        "id": "latex-doc",
        "text": (
            "\\documentclass{article}\n\\begin{document}\n\\section{Methods}\n"
            "Prior to analysis, samples were stored at $-80$~\\textdegree C. Subsequently, NaCl (0.9\\%) was added "
            "in order to stabilise BRCA1 expression \\cite{smith2020}.\n"
            "\\begin{equation}\nE = mc^2\n\\end{equation}\n\\end{document}\n"
        ),
    },
]


def main() -> None:
    sys.path.insert(0, str(ROOT / "services" / "engine"))
    from veritext_engine.pipeline.providers import DemoProvider
    from veritext_engine.pipeline.run import run_pipeline

    out = []
    for item in INPUTS:
        report = run_pipeline(item["text"], DemoProvider())
        out.append({"id": item["id"], "text": item["text"], "report": report.model_dump(by_alias=True)})
    path = ROOT / "fixtures" / "golden_demo_reports.json"
    path.write_text(json.dumps({"cases": out}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()

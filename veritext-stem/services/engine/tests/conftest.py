from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"


def load_fixture(name: str) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = json.loads((FIXTURES / name).read_text(encoding="utf-8"))["cases"]
    return cases

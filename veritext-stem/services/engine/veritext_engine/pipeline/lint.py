"""Overused-phrase hints. Writing quality only: never part of the fidelity score, never tied to detectors."""

from __future__ import annotations

import re
from functools import lru_cache

from pydantic import BaseModel

from veritext_engine.shared import ai_phrases


class LintHit(BaseModel):
    phrase: str
    text: str
    start: int
    end: int
    suggestion: str


@lru_cache
def _patterns() -> list[tuple[re.Pattern[str], dict[str, str]]]:
    out = []
    for p in ai_phrases():
        body = r"\s+".join(re.escape(w) for w in p["phrase"].split())
        tail = r"[a-z]*" if p.get("match") == "word-prefix" else ""
        out.append((re.compile(rf"(?<![A-Za-z]){body}{tail}(?![A-Za-z])", re.I), p))
    return out


def lint(text: str) -> list[LintHit]:
    hits = [
        LintHit(phrase=p["phrase"], text=m.group(0), start=m.start(), end=m.end(), suggestion=p["suggestion"])
        for rx, p in _patterns()
        for m in rx.finditer(text)
    ]
    return sorted(hits, key=lambda h: h.start)

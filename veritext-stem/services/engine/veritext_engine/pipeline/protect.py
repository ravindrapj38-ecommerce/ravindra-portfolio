"""Lock invariants behind opaque placeholders and restore them exactly (D-008).

Every span that must survive a rewrite unchanged (math, numbers with units, citations, chemical and
gene names, code, URLs/DOIs, cross-references, LaTeX markup) becomes ``⟦<KIND><n>⟧``.
Property: ``restore(protect(x).text, protect(x).table) == x`` for every string ``x``.
Pre-existing ``⟦``/``⟧`` characters are themselves locked (kind ``X``), so the property holds even
for adversarial input.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel

from veritext_engine.shared import lexicons, lock_rules

Format = Literal["text", "markdown", "latex"]

PLACEHOLDER_RE = re.compile(r"⟦([A-Z])(\d+)⟧")

KIND_LABELS: dict[str, str] = {
    "M": "equation",
    "N": "number/unit",
    "C": "citation",
    "R": "cross-reference",
    "K": "code/markup",
    "E": "chemical/gene/species name",
    "A": "acronym",
    "U": "URL/DOI",
    "X": "reserved character",
}


class Protected(BaseModel):
    text: str
    table: dict[str, str]  # placeholder key ("M1") -> original text


@dataclass(frozen=True)
class _Rule:
    id: str
    kind: str
    regex: re.Pattern[str]
    filter: str | None
    formats: tuple[str, ...] | None


@lru_cache
def _rules() -> tuple[_Rule, ...]:
    out: list[_Rule] = []
    for r in lock_rules():
        flags = 0
        for f in str(r.get("flags", "")):
            flags |= {"m": re.M, "s": re.S, "i": re.I}[f]
        formats = r.get("formats")
        out.append(
            _Rule(
                id=str(r["id"]),
                kind=str(r["kind"]),
                regex=re.compile(str(r["pattern"]), flags),
                filter=str(r["filter"]) if r.get("filter") else None,
                formats=tuple(str(x) for x in formats) if isinstance(formats, list) else None,
            )
        )
    return tuple(out)


def _passes_filter(name: str | None, s: str) -> bool:
    if name is None:
        return True
    if name == "formula":
        has_digit = any(c.isdigit() for c in s)
        has_charge = s[-1] in "+-−"
        uppers = sum(1 for c in s if c.isupper())
        has_lower = any(c.islower() for c in s)
        return has_digit or has_charge or (uppers >= 2 and has_lower)
    if name == "acronym":
        return s.rstrip("s") not in set(lexicons()["uppercase_words_not_acronyms"]) and s not in set(
            lexicons()["uppercase_words_not_acronyms"]
        )
    raise ValueError(f"unknown lock filter {name!r}")


def detect_format(text: str) -> Format:
    if re.search(r"\\(documentclass|begin\{|section\{|subsection\{|cite\{|usepackage)", text):
        return "latex"
    if re.search(r"^(#{1,6} |```|[-*+] |\d+\. )", text, re.M) or re.search(r"\*\*[^*]+\*\*", text):
        return "markdown"
    return "text"


def find_spans(text: str, fmt: Format) -> list[tuple[int, int, str]]:
    """Non-overlapping (start, end, kind) spans, earlier rules winning overlaps, sorted by start."""
    taken: list[tuple[int, int, str]] = []
    occupied = bytearray(len(text))
    for rule in _rules():
        if rule.formats is not None and fmt not in rule.formats:
            continue
        for m in rule.regex.finditer(text):
            s, e = m.span()
            if s == e or any(occupied[s:e]):
                continue
            if not _passes_filter(rule.filter, m.group(0)):
                continue
            taken.append((s, e, rule.kind))
            occupied[s:e] = b"\x01" * (e - s)
    taken.sort()
    return taken


def protect(text: str, fmt: Format = "text") -> Protected:
    spans = find_spans(text, fmt)
    counters: dict[str, int] = {}
    table: dict[str, str] = {}
    parts: list[str] = []
    pos = 0
    for s, e, kind in spans:
        counters[kind] = counters.get(kind, 0) + 1
        key = f"{kind}{counters[kind]}"
        table[key] = text[s:e]
        parts.append(text[pos:s])
        parts.append(f"⟦{key}⟧")
        pos = e
    parts.append(text[pos:])
    return Protected(text="".join(parts), table=table)


def restore(text: str, table: dict[str, str]) -> str:
    """Re-insert originals. Unknown keys are left as-is (verification rejects them earlier)."""
    return PLACEHOLDER_RE.sub(lambda m: table.get(m.group(1) + m.group(2), m.group(0)), text)


def placeholders(text: str) -> list[str]:
    return [m.group(1) + m.group(2) for m in PLACEHOLDER_RE.finditer(text)]

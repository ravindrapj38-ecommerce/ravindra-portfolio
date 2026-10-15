"""Split protected text into raw spans and rewritable sentences.

Concatenating every segment's ``text`` gives back the protected input exactly, so the document
round-trips losslessly. Headings, tables, list markers, display math and markup-only lines are
``raw`` and never sent to a rewriter.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

from veritext_engine.pipeline.protect import PLACEHOLDER_RE

ABBREVIATIONS = {
    "e.g",
    "i.e",
    "al",
    "vs",
    "cf",
    "approx",
    "dr",
    "prof",
    "fig",
    "figs",
    "eq",
    "eqs",
    "no",
    "nos",
    "ca",
    "resp",
    "ref",
    "refs",
    "st",
    "mr",
    "mrs",
    "ms",
    "jr",
    "inc",
    "ltd",
    "etc",
    "sec",
    "vol",
    "pp",
    "ch",
}

_BLOCK_SPLIT = re.compile(r"(\n[ \t]*\n\s*)")
_BOUNDARY = re.compile(r"[.!?][\"”’')\]]*(\s+)(?=[A-Z⟦\"“(\[])")


class Segment(BaseModel):
    kind: Literal["raw", "sentence"]
    text: str
    block: int = -1


def prose_words(s: str) -> list[str]:
    return re.findall(r"[A-Za-z]{2,}", PLACEHOLDER_RE.sub(" ", s))


def _leading_value(line: str, table: dict[str, str]) -> str:
    m = PLACEHOLDER_RE.match(line.lstrip())
    return table.get(m.group(1) + m.group(2), "") if m else ""


def _is_heading(line: str, table: dict[str, str]) -> bool:
    v = _leading_value(line, table)
    return v.startswith("#") or bool(re.match(r"\\(part|chapter|(sub)*section|paragraph|title|caption)\b", v))


def _is_list_item(line: str, table: dict[str, str]) -> bool:
    v = _leading_value(line, table)
    return bool(re.match(r"^[ \t]*(?:[-*+]|\d+[.)])[ \t]+$", v)) or v.startswith("\\item")


def split_sentences(unit: str) -> list[tuple[int, int]]:
    """(start, end) spans of sentences in ``unit``; whitespace between them is excluded."""
    spans: list[tuple[int, int]] = []
    start = len(unit) - len(unit.lstrip())
    for m in _BOUNDARY.finditer(unit):
        punct_end = m.start(1)
        before = unit[start : m.start() + 1]
        word = re.search(r"([A-Za-z.]+)\.$", before)
        if word and (word.group(1).lower().rstrip(".") in ABBREVIATIONS or re.fullmatch(r"[A-Z]", word.group(1))):
            continue
        if punct_end > start:
            spans.append((start, punct_end))
        start = m.end(1)
    end = len(unit.rstrip())
    if end > start:
        spans.append((start, end))
    return spans


def segment(text: str, table: dict[str, str]) -> list[Segment]:
    out: list[Segment] = []
    block_id = 0

    def raw(s: str) -> None:
        if s:
            if out and out[-1].kind == "raw":
                out[-1].text += s
            else:
                out.append(Segment(kind="raw", text=s))

    def prose_unit(unit: str, block: int) -> None:
        if len(prose_words(unit)) < 3:
            raw(unit)
            return
        pos = 0
        for s, e in split_sentences(unit):
            raw(unit[pos:s])
            sent = unit[s:e]
            if len(prose_words(sent)) < 3:
                raw(sent)
            else:
                out.append(Segment(kind="sentence", text=sent, block=block))
            pos = e
        raw(unit[pos:])

    for i, piece in enumerate(_BLOCK_SPLIT.split(text)):
        if i % 2 == 1 or not piece:
            raw(piece)
            continue
        lines = re.findall(r"[^\n]*\n|[^\n]+", piece)
        if all(ln.lstrip().startswith("|") for ln in lines if ln.strip()):
            raw(piece)
            continue
        buf = ""
        for ln in lines:
            if _is_heading(ln, table) or not prose_words(ln) or _is_list_item(ln, table):
                if buf:
                    prose_unit(buf, block_id)
                    block_id += 1
                    buf = ""
                if _is_list_item(ln, table) and not _is_heading(ln, table):
                    prose_unit(ln, block_id)
                    block_id += 1
                else:
                    raw(ln)
            else:
                buf += ln
        if buf:
            prose_unit(buf, block_id)
            block_id += 1
    return out

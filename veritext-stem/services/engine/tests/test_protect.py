from __future__ import annotations

from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from tests.conftest import load_fixture
from veritext_engine.pipeline.protect import detect_format, placeholders, protect, restore
from veritext_engine.pipeline.segment import segment
from veritext_engine.shared import sample_text

PROTECT_CASES = load_fixture("protect_cases.json")


@pytest.mark.parametrize("case", PROTECT_CASES, ids=[c["id"] for c in PROTECT_CASES])
def test_fixture_locks(case: dict[str, Any]) -> None:
    p = protect(case["input"], case["format"])
    assert restore(p.text, p.table) == case["input"]
    values = list(p.table.values())
    for item in case["locked"]:
        assert item in values, f"{item!r} not locked as one item; got {values}"
    for phrase in case["not_locked"]:
        assert phrase in p.text, f"{phrase!r} should stay rewritable"


@pytest.mark.parametrize("case", PROTECT_CASES, ids=[c["id"] for c in PROTECT_CASES])
def test_fixture_segments_round_trip(case: dict[str, Any]) -> None:
    p = protect(case["input"], case["format"])
    assert "".join(s.text for s in segment(p.text, p.table)) == p.text


def test_sample_round_trip_and_segments() -> None:
    text = sample_text()
    p = protect(text, detect_format(text))
    assert restore(p.text, p.table) == text
    segs = segment(p.text, p.table)
    assert "".join(s.text for s in segs) == p.text
    assert sum(s.kind == "sentence" for s in segs) == 5


def test_placeholders_are_unique_and_all_restored() -> None:
    p = protect(sample_text(), "markdown")
    keys = placeholders(p.text)
    assert len(keys) == len(set(keys)) == len(p.table)


STEM_ALPHABET = st.sampled_from(
    [
        *list("abcXYZ019 .,;:()[]{}$\\^_-+=%°±×/\n\t`#*|~'\"⟦⟧µΩ"),
        "\\cite{a}",
        "$x$",
        "$$y$$",
        "10^3 K",
        "H2O",
        "BRCA1",
        "https://a.b/c",
        "10.1000/x",
        "```\nz\n```",
        "\\begin{equation}a\\end{equation}",
        "Fig. 2",
        "(Smith, 2020)",
        "[12]",
        "⟦M1⟧",
        "e.g. ",
        "\\section{A}",
    ]
)


@settings(max_examples=400, deadline=None)
@given(st.lists(STEM_ALPHABET, max_size=60).map("".join), st.sampled_from(["text", "markdown", "latex"]))
def test_restore_protect_is_identity(text: str, fmt: Any) -> None:
    p = protect(text, fmt)
    assert restore(p.text, p.table) == text
    assert "".join(s.text for s in segment(p.text, p.table)) == p.text


@settings(max_examples=200, deadline=None)
@given(st.text(max_size=200), st.sampled_from(["text", "markdown", "latex"]))
def test_restore_protect_is_identity_arbitrary_unicode(text: str, fmt: Any) -> None:
    p = protect(text, fmt)
    assert restore(p.text, p.table) == text

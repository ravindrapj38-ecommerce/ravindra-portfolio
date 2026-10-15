from __future__ import annotations

from typing import Any

import pytest

from tests.conftest import load_fixture
from veritext_engine.pipeline.checks import check_sentence, hedge_class
from veritext_engine.pipeline.diff import word_diff
from veritext_engine.pipeline.lint import lint

CHECK_CASES = load_fixture("check_cases.json")


@pytest.mark.parametrize("case", CHECK_CASES, ids=[c["id"] for c in CHECK_CASES])
def test_check_fixtures(case: dict[str, Any]) -> None:
    hard = sorted({i.code for i in check_sentence(case["original"], case["rewritten"]) if i.severity == "hard"})
    assert hard == sorted(case["fail"])


def test_hedge_classes() -> None:
    assert hedge_class("X may cause Y") == "hedged"
    assert hedge_class("This proves X") == "boosted"
    assert hedge_class("X causes Y") == "neutral"


def test_soft_drift_flags_needs_review() -> None:
    issues = check_sentence(
        "Raman spectra of annealed graphene films show a narrow symmetric peak.",
        "Spectroscopy reveals tidy results for treated carbon sheets overall.",
    )
    assert [i.code for i in issues] == ["wording_drift"]


def test_word_diff_reconstructs_both_sides() -> None:
    a, b = "The film was measured at 300 K.", "We measured the film at 300 K."
    ops = word_diff(a, b)
    assert "".join(o.text for o in ops if o.op != "insert") == a
    assert "".join(o.text for o in ops if o.op != "delete") == b


def test_lint_flags_overused_phrases() -> None:
    hits = lint("It is worth noting that we delve into this. Furthermore, it underscores the point.")
    assert [h.phrase for h in hits] == ["it is worth noting that", "delve", "furthermore", "underscore"]
    assert hits[1].text == "delve"

from __future__ import annotations

from fastapi.testclient import TestClient

from veritext_engine.main import create_app
from veritext_engine.pipeline.providers import DemoProvider, RewriteRequest
from veritext_engine.pipeline.run import run_pipeline
from veritext_engine.shared import sample_text


class ScriptedProvider:
    """Returns scripted rewrites per call; records every request."""

    name = "scripted"
    label = "Scripted test provider"

    def __init__(self, transform: object) -> None:
        self.transform = transform
        self.requests: list[RewriteRequest] = []

    def rewrite(self, req: RewriteRequest) -> list[str]:
        self.requests.append(req)
        return [self.transform(s, len(self.requests)) for s in req.sentences]  # type: ignore[operator]


TEXT = "The data suggest that strain may shift the G peak by 2.4 cm^-1 [3]. The defects did not alter the peak."


def test_demo_sample_all_verified_and_locked_items_intact() -> None:
    text = sample_text()
    r = run_pipeline(text, DemoProvider())
    assert r.round_trip_ok and not r.warnings
    assert r.counts == {"verified": 5, "kept_original": 0, "needs_review": 0}
    assert "delve" not in r.output.lower() and "It is worth noting" not in r.output
    for item in r.locked:
        assert item.text in r.output
    assert r.fidelity_score == 100
    assert {h.phrase for h in r.lint_input} >= {"delve", "it is worth noting that"}


def test_failing_rewrite_retried_three_times_then_kept_original() -> None:
    p = ScriptedProvider(lambda s, n: s.replace("may shift", "proves to shift").replace("suggest", "show"))
    r = run_pipeline(TEXT, p)
    first = r.sentences[0]
    assert first.status == "kept_original"
    assert first.final == first.original
    assert first.attempts == 4  # first pass + 3 retries
    assert "hedging_changed" in {i.code for i in first.issues}
    assert r.output == TEXT  # nothing unverified ships
    # Retries carry the failure reasons back to the provider.
    assert p.requests[1].feedback and "Certainty changed" in p.requests[1].feedback[0][0]


def test_repair_succeeds_on_second_attempt() -> None:
    def transform(s: str, call: int) -> str:
        if "did not" in s:
            return s if call > 1 else s.replace("did not alter", "altered")
        return s.replace("The data suggest", "These data suggest")

    r = run_pipeline(TEXT, ScriptedProvider(transform))
    second = r.sentences[1]
    assert second.status == "verified" and second.attempts == 2
    assert r.sentences[0].status == "verified"


def test_misaligned_batch_falls_back_to_single_sentences() -> None:
    class Merger:
        name, label = "merger", "merges sentences"

        def rewrite(self, req: RewriteRequest) -> list[str]:
            return [" ".join(req.sentences)] if len(req.sentences) > 1 else req.sentences

    r = run_pipeline(TEXT, Merger())
    assert all(s.status == "verified" for s in r.sentences)
    assert r.output == TEXT


def test_provider_error_keeps_originals_with_warning() -> None:
    class Broken:
        name, label = "broken", "always fails"

        def rewrite(self, req: RewriteRequest) -> list[str]:
            raise TimeoutError("upstream timeout")

    r = run_pipeline(TEXT, Broken())
    assert r.output == TEXT
    assert all(s.status == "kept_original" for s in r.sentences)
    assert r.warnings and "TimeoutError" in r.warnings[0]


def test_latex_document_structure_untouched() -> None:
    tex = (
        "\\documentclass{article}\n\\begin{document}\n\\section{Results}\n"
        "In order to test it, we utilize the method of \\citet{lee2019} at $T = 4$ K.\n"
        "\\begin{equation}\nE = mc^2\n\\end{equation}\n\\end{document}\n"
    )
    r = run_pipeline(tex, DemoProvider(), fmt="latex")
    assert r.output.replace("To test it, we use", "In order to test it, we utilize") == tex
    assert len(r.sentences) == 1


def test_api_rewrite_and_sample() -> None:
    client = TestClient(create_app(DemoProvider()))
    assert client.get("/healthz").json()["status"] == "ok"
    sample = client.get("/v1/sample").json()
    res = client.post("/v1/rewrite", json={"text": sample["text"], "discipline": "physics", "register": "journal"})
    assert res.status_code == 200
    body = res.json()
    assert body["register"] == "journal" and body["provider"] == "demo"
    assert {s["status"] for s in body["sentences"]} <= {"verified", "kept_original", "needs_review"}
    assert client.post("/v1/rewrite", json={"text": "x", "discipline": "astrology"}).status_code == 422

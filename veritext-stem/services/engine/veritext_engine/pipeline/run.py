"""Orchestrates protect → segment → rewrite → verify → repair (≤N) → restore → report."""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from veritext_engine.pipeline.checks import Issue, check_sentence
from veritext_engine.pipeline.diff import DiffOp, word_diff
from veritext_engine.pipeline.lint import LintHit, lint
from veritext_engine.pipeline.protect import KIND_LABELS, Format, detect_format, protect, restore
from veritext_engine.pipeline.providers import RewriteProvider, RewriteRequest
from veritext_engine.pipeline.segment import segment

Status = Literal["verified", "kept_original", "needs_review"]
Discipline = Literal["physics", "chemistry", "biology", "cs_ml", "engineering", "maths"]
Register = Literal["journal", "thesis", "lab_report", "explainer"]


class SentenceResult(BaseModel):
    id: int
    block: int
    original: str
    final: str
    status: Status
    attempts: int
    issues: list[Issue]
    diff: list[DiffOp]


class LockedItem(BaseModel):
    key: str
    kind: str
    label: str
    text: str


class Report(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    format: Format
    discipline: Discipline
    register_: Register = Field(alias="register")
    provider: str
    provider_label: str
    output: str
    sentences: list[SentenceResult]
    counts: dict[str, int]
    fidelity_score: int
    rewritten_share: int
    locked: list[LockedItem]
    lint_input: list[LintHit]
    lint_output: list[LintHit]
    round_trip_ok: bool
    warnings: list[str]


def _round(x: float) -> int:
    """Half-up rounding, matching JavaScript's Math.round (the web core must produce the same score)."""
    return math.floor(x + 0.5)


def run_pipeline(
    text: str,
    provider: RewriteProvider,
    discipline: Discipline = "physics",
    register: Register = "journal",
    fmt: Format | None = None,
    max_attempts: int = 3,
) -> Report:
    fmt = fmt or detect_format(text)
    prot = protect(text, fmt)
    round_trip_ok = restore(prot.text, prot.table) == text
    if not round_trip_ok:  # pragma: no cover - guarded by property tests
        raise RuntimeError("lock/restore round-trip failed; refusing to rewrite")
    segs = segment(prot.text, prot.table)
    warnings: list[str] = []

    sentence_idx = [i for i, s in enumerate(segs) if s.kind == "sentence"]
    current: dict[int, str] = {}
    issues: dict[int, list[Issue]] = {}
    attempts: dict[int, int] = {}

    blocks: dict[int, list[int]] = {}
    for i in sentence_idx:
        blocks.setdefault(segs[i].block, []).append(i)

    failed: list[bool] = []  # set once the provider raises; we then stop calling it

    def call(ids: list[int], feedback: list[list[str]], context: str) -> list[str] | None:
        req = RewriteRequest(
            sentences=[segs[i].text for i in ids],
            discipline=discipline,
            register=register,
            context=context,
            feedback=feedback,
        )
        try:
            out = provider.rewrite(req)
        except Exception as exc:
            failed.append(True)
            warnings.append(f"Rewrite provider error: {type(exc).__name__}: {exc}"[:300])
            return None
        return out if len(out) == len(ids) else None

    for ids in blocks.values():
        context = " ".join(segs[i].text for i in ids)
        pending = list(ids)
        feedback: dict[int, list[str]] = {}
        for attempt in range(1, max_attempts + 2):  # first pass + up to max_attempts retries
            if not pending or failed:
                break
            fb = [feedback[i] for i in pending] if attempt > 1 else []
            out = call(pending, fb, context)
            if out is None and len(pending) > 1 and not failed:  # misaligned batch: retry one by one
                out = []
                for k, i in enumerate(pending):
                    single = call([i], [fb[k]] if fb else [], context)
                    out.append(single[0] if single else "")
            still: list[int] = []
            for k, i in enumerate(pending):
                attempts[i] = attempt
                new = out[k] if out else ""
                found = check_sentence(segs[i].text, new, prot.table)
                hard = [x for x in found if x.severity == "hard"]
                if new and not hard:
                    current[i], issues[i] = new, found
                else:
                    issues[i] = found or [Issue(code="no_output", severity="hard", message="No rewrite returned.")]
                    # Feedback to the model names locked items by placeholder, never by their text.
                    keyed = [x.message for x in check_sentence(segs[i].text, new) if x.severity == "hard"]
                    feedback[i] = keyed or ["No rewrite returned."]
                    still.append(i)
            pending = still

    results: list[SentenceResult] = []
    out_parts: list[str] = []
    for i, seg in enumerate(segs):
        if seg.kind == "raw":
            out_parts.append(seg.text)
            continue
        if i in current:
            final_prot = current[i]
            status: Status = "needs_review" if issues.get(i) else "verified"
        else:
            final_prot = seg.text
            status = "kept_original"
        out_parts.append(final_prot)
        orig = restore(seg.text, prot.table)
        final = restore(final_prot, prot.table)
        results.append(
            SentenceResult(
                id=len(results),
                block=seg.block,
                original=orig,
                final=final,
                status=status,
                attempts=attempts.get(i, 0),
                issues=issues.get(i, []),
                diff=word_diff(orig, final),
            )
        )

    output = restore("".join(out_parts), prot.table)
    # Belt and braces: every locked item must appear in the output as often as in the input.
    for original in prot.table.values():
        if output.count(original) < text.count(original):
            warnings.append(f"Locked item count changed for {original!r}")

    counts = Counter(r.status for r in results)
    weights = [max(1, len(re.findall(r"\S+", r.original))) for r in results]
    scores = [100 if r.status != "needs_review" else max(50, 100 - 20 * len(r.issues)) for r in results]
    total_w = sum(weights) or 1
    fidelity = _round(sum(w * s for w, s in zip(weights, scores, strict=True)) / total_w) if results else 100
    changed = sum(
        w for w, r in zip(weights, results, strict=True) if r.status != "kept_original" and r.final != r.original
    )
    locked = [
        LockedItem(key=k, kind=k[0], label=KIND_LABELS.get(k[0], k[0]), text=v)
        for k, v in prot.table.items()
        if k[0] != "X"
    ]
    return Report(
        format=fmt,
        discipline=discipline,
        register_=register,
        provider=provider.name,
        provider_label=provider.label,
        output=output,
        sentences=results,
        counts={s: counts.get(s, 0) for s in ("verified", "kept_original", "needs_review")},
        fidelity_score=fidelity,
        rewritten_share=_round(100 * changed / total_w) if results else 0,
        locked=locked,
        lint_input=lint(text),
        lint_output=lint(output),
        round_trip_ok=round_trip_ok,
        warnings=warnings,
    )

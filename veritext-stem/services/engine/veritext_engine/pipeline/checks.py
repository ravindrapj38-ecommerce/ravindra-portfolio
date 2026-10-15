"""Sentence-level meaning checks between an original and a rewritten sentence (both protected).

Hard checks (any failure → repair, then keep the original): locked items, new numbers, hedging,
causal vs correlational framing, negation, citation attachment.
Soft checks (→ "needs review"): large wording drift, large length change.
Cue lists live in ``shared/lexicons.json`` and are shared with the TypeScript core.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel

from veritext_engine.pipeline.protect import PLACEHOLDER_RE, placeholders
from veritext_engine.shared import lexicons


class Issue(BaseModel):
    code: str
    severity: Literal["hard", "soft"]
    message: str


def _norm(s: str) -> str:
    return " " + re.sub(r"\s+", " ", PLACEHOLDER_RE.sub(" ", s).replace("’", "'").lower()) + " "


@lru_cache
def _cue_regex(name: str) -> re.Pattern[str]:
    cues = sorted(lexicons()[name], key=len, reverse=True)
    alts = "|".join(r"\s+".join(re.escape(w) for w in c.split()) for c in cues)
    return re.compile(rf"(?<![a-z0-9'-])(?:{alts})(?![a-z0-9'-])")


def cues(name: str, s: str) -> list[str]:
    found = [m.group(0) for m in _cue_regex(name).finditer(_norm(s))]
    if name == "negations":
        found += re.findall(r"[a-z]+n't", _norm(s))
    return found


def hedge_class(s: str) -> str:
    h, b = cues("hedges", s), cues("boosters", s)
    if h and b:
        return "mixed"
    return "hedged" if h else "boosted" if b else "neutral"


def stem(w: str) -> str:
    return w.lower()[:5]


def content_tokens(s: str) -> list[str]:
    """Content-word stems and non-citation placeholder keys, in order."""
    stop = set(lexicons()["stopwords"])
    toks: list[str] = []
    for m in re.finditer(r"⟦([A-Z])(\d+)⟧|[A-Za-z][A-Za-z'-]+", s):
        if m.group(1):
            if m.group(1) != "C":
                toks.append(m.group(1) + m.group(2))
        elif m.group(0).lower() not in stop:
            toks.append(stem(m.group(0)))
    return toks


def _quote(xs: list[str]) -> str:
    return ", ".join(f"'{x}'" for x in xs) if xs else "none"


def check_sentence(original: str, rewritten: str, table: dict[str, str] | None = None) -> list[Issue]:
    table = table or {}
    issues: list[Issue] = []
    if not rewritten.strip():
        return [Issue(code="empty", severity="hard", message="The rewrite is empty.")]

    # 1. Locked items: identical multiset of placeholders, nothing invented, no broken brackets.
    po, pn = Counter(placeholders(original)), Counter(placeholders(rewritten))
    missing, extra = po - pn, pn - po
    if missing:
        shown = [table.get(k, k) for k in missing.elements()]
        issues.append(
            Issue(
                code="locked_missing",
                severity="hard",
                message=f"Locked item(s) dropped or duplicated away: {_quote(shown)}.",
            )
        )
    if extra:
        shown = [table.get(k, k) for k in extra.elements()]
        issues.append(
            Issue(
                code="locked_added",
                severity="hard",
                message=f"Locked item(s) added or repeated: {_quote(shown)}.",
            )
        )
    if re.search(r"[⟦⟧]", PLACEHOLDER_RE.sub("", rewritten)):
        issues.append(Issue(code="locked_corrupt", severity="hard", message="A locked item was altered."))

    # 2. Numbers that are not locked (digits, number words) must not change.
    do = sorted(re.findall(r"\d+", PLACEHOLDER_RE.sub(" ", original)))
    dn = sorted(re.findall(r"\d+", PLACEHOLDER_RE.sub(" ", rewritten)))
    wo, wn = sorted(cues("number_words", original)), sorted(cues("number_words", rewritten))
    if do != dn or wo != wn:
        issues.append(
            Issue(
                code="number_changed",
                severity="hard",
                message=f"Numbers changed: {_quote(do + wo)} became {_quote(dn + wn)}.",
            )
        )

    # 3. Hedging / certainty.
    ho, hn = hedge_class(original), hedge_class(rewritten)
    if ho != hn:
        issues.append(
            Issue(
                code="hedging_changed",
                severity="hard",
                message=(
                    f"Certainty changed from {ho} ({_quote(cues('hedges', original) + cues('boosters', original))}) "
                    f"to {hn} ({_quote(cues('hedges', rewritten) + cues('boosters', rewritten))})."
                ),
            )
        )

    # 4. Causal vs correlational framing.
    co, cn = bool(cues("causal", original)), bool(cues("causal", rewritten))
    ro, rn = bool(cues("correlational", original)), bool(cues("correlational", rewritten))
    if (co, ro) != (cn, rn):

        def frame(c: bool, r: bool) -> str:
            return "causal and correlational" if c and r else "causal" if c else "correlational" if r else "neither"

        issues.append(
            Issue(
                code="causality_changed",
                severity="hard",
                message=(
                    f"Causal/correlational framing changed from {frame(co, ro)} "
                    f"({_quote(cues('causal', original) + cues('correlational', original))}) to {frame(cn, rn)} "
                    f"({_quote(cues('causal', rewritten) + cues('correlational', rewritten))})."
                ),
            )
        )

    # 5. Negation: the number of negation cues must keep its parity and presence.
    no, nn = len(cues("negations", original)), len(cues("negations", rewritten))
    if (no % 2) != (nn % 2) or (no == 0) != (nn == 0):
        issues.append(
            Issue(
                code="negation_changed",
                severity="hard",
                message=(
                    f"Negation changed: original has {_quote(cues('negations', original))}, "
                    f"rewrite has {_quote(cues('negations', rewritten))}."
                ),
            )
        )

    # 6. Citation attachment: each citation keeps (part of) the words it followed, and the order holds.
    cites_o = [k for k in placeholders(original) if k.startswith("C")]
    cites_n = [k for k in placeholders(rewritten) if k.startswith("C")]
    if cites_o and Counter(cites_o) == Counter(cites_n):
        moved = cites_o != cites_n
        if not moved and (len(cites_o) > 1 or not _at_end(original, cites_o[0])):
            for key in cites_o:
                anchor = set(_window(original, key, 3))
                if anchor and not anchor & set(_window(rewritten, key, 3)):
                    moved = True
        if moved:
            shown = [table.get(k, k) for k in cites_o]
            issues.append(
                Issue(
                    code="citation_moved",
                    severity="hard",
                    message=f"Citation(s) {_quote(shown)} now support a different part of the sentence.",
                )
            )

    if any(i.severity == "hard" for i in issues):
        return issues

    # Soft checks.
    to, tn = content_tokens(original), content_tokens(rewritten)
    if len(to) >= 4:
        kept = len(set(to) & set(tn)) / len(set(to))
        if kept < 0.4:
            issues.append(
                Issue(
                    code="wording_drift",
                    severity="soft",
                    message=(
                        f"Only {math.floor(kept * 100 + 0.5)}% of the original content words survive; "
                        "check the meaning by hand."
                    ),
                )
            )
    wo_n = len(re.findall(r"\S+", original))
    wn_n = len(re.findall(r"\S+", rewritten))
    if wo_n >= 6 and not 0.5 <= wn_n / wo_n <= 1.8:
        issues.append(
            Issue(
                code="length_changed",
                severity="soft",
                message=f"Length changed a lot ({wo_n} → {wn_n} words); check nothing was added or lost.",
            )
        )
    return issues


def _window(s: str, key: str, n: int) -> list[str]:
    i = s.find(f"⟦{key}⟧")
    return content_tokens(s[:i])[-n:] if i >= 0 else []


def _at_end(s: str, key: str) -> bool:
    i = s.find(f"⟦{key}⟧")
    return i >= 0 and not re.search(r"[A-Za-z]", PLACEHOLDER_RE.sub("", s[i:]))

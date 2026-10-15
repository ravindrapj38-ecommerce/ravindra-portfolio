"""Word-level diff (LCS over word/space/punctuation tokens). Mirrors apps/web/lib/core/diff.ts."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

_TOKEN = re.compile(r"\s+|[A-Za-z0-9À-ɏ'’-]+|[^\sA-Za-z0-9]")


class DiffOp(BaseModel):
    op: Literal["equal", "delete", "insert"]
    text: str


def tokenize(s: str) -> list[str]:
    return _TOKEN.findall(s)


def word_diff(a: str, b: str) -> list[DiffOp]:
    ta, tb = tokenize(a), tokenize(b)
    n, m = len(ta), len(tb)
    lcs = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            lcs[i][j] = lcs[i + 1][j + 1] + 1 if ta[i] == tb[j] else max(lcs[i + 1][j], lcs[i][j + 1])
    ops: list[DiffOp] = []

    def push(op: Literal["equal", "delete", "insert"], t: str) -> None:
        if ops and ops[-1].op == op:
            ops[-1].text += t
        else:
            ops.append(DiffOp(op=op, text=t))

    i = j = 0
    while i < n and j < m:
        if ta[i] == tb[j]:
            push("equal", ta[i])
            i, j = i + 1, j + 1
        elif lcs[i + 1][j] >= lcs[i][j + 1]:
            push("delete", ta[i])
            i += 1
        else:
            push("insert", tb[j])
            j += 1
    for t in ta[i:]:
        push("delete", t)
    for t in tb[j:]:
        push("insert", t)
    return ops

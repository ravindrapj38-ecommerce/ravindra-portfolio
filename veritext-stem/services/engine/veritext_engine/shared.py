"""Loads the data files shared with the TypeScript core (``veritext-stem/shared``)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from veritext_engine.config import get_settings


def _load(name: str) -> dict[str, Any]:
    path: Path = get_settings().shared_dir / name
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


@lru_cache
def lexicons() -> dict[str, list[str]]:
    return {k: v for k, v in _load("lexicons.json").items() if not k.startswith("_")}


@lru_cache
def lock_rules() -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = _load("lock_patterns.json")["rules"]
    return rules


@lru_cache
def ai_phrases() -> list[dict[str, str]]:
    phrases: list[dict[str, str]] = _load("ai_phrases.json")["phrases"]
    return phrases


@lru_cache
def demo_substitutions() -> list[tuple[str, str]]:
    return [(a, b) for a, b in _load("demo_rewrites.json")["substitutions"]]


@lru_cache
def sample_text() -> str:
    return (get_settings().shared_dir / "sample.md").read_text(encoding="utf-8")

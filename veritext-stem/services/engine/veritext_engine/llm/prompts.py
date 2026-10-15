"""Versioned prompt registry (D-009): ``prompts/<name>/v<N>.md`` + mandatory ``eval.yaml``."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

import yaml
from pydantic import BaseModel

from veritext_engine.config import get_settings


class Prompt(BaseModel):
    name: str
    version: int
    model_role: str
    body: str


@lru_cache
def load_prompt(name: str, version: int | None = None) -> Prompt:
    folder = get_settings().prompts_dir / name
    if not (folder / "eval.yaml").exists():
        raise FileNotFoundError(f"prompt {name!r} has no eval.yaml; every prompt needs an eval case")
    versions = sorted(int(m.group(1)) for p in folder.glob("v*.md") if (m := re.fullmatch(r"v(\d+)\.md", p.name)))
    if not versions:
        raise FileNotFoundError(f"no versions for prompt {name!r}")
    v = version if version is not None else versions[-1]
    raw = (folder / f"v{v}.md").read_text(encoding="utf-8")
    _, front, body = raw.split("---", 2)
    meta: dict[str, Any] = yaml.safe_load(front)
    return Prompt(name=meta["name"], version=int(meta["version"]), model_role=meta["model_role"], body=body.strip())


@lru_cache
def styles() -> dict[str, dict[str, str]]:
    data: dict[str, dict[str, str]] = yaml.safe_load(
        (get_settings().prompts_dir / "rewrite" / "styles.yaml").read_text(encoding="utf-8")
    )
    return data


def render_rewrite_system(discipline: str, register: str) -> str:
    st = styles()
    labels = {
        "cs_ml": "computer science / machine learning",
        "lab_report": "lab report",
        "maths": "mathematics",
    }
    return load_prompt("rewrite").body.format(
        discipline=labels.get(discipline, discipline),
        register=labels.get(register, register),
        register_guidance=st["registers"][register],
        discipline_guidance=st["disciplines"][discipline],
    )

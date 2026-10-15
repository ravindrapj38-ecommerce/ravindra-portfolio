"""Rewrite providers. Stages depend on the ``RewriteProvider`` protocol, so tests use fakes.

- ``AnthropicProvider``: real rewrites with Claude (needs ``ANTHROPIC_API_KEY``).
- ``DemoProvider``: offline, deterministic phrase-level edits from ``shared/demo_rewrites.json``.
  It exists so the app works without a key; it is labelled as a demo everywhere it is shown.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from veritext_engine.config import Settings, get_settings
from veritext_engine.llm.prompts import load_prompt, render_rewrite_system
from veritext_engine.shared import demo_substitutions


@dataclass
class RewriteRequest:
    sentences: list[str]
    discipline: str
    register: str
    context: str = ""
    # Per-sentence reasons from the previous failed attempt; empty for a first pass.
    feedback: list[list[str]] = field(default_factory=list)


class RewriteProvider(Protocol):
    name: str
    label: str

    def rewrite(self, req: RewriteRequest) -> list[str]: ...


class DemoProvider:
    name = "demo"
    label = "Demo rewriter (no AI model connected; phrase-level edits only)"

    def rewrite(self, req: RewriteRequest) -> list[str]:
        return [demo_rewrite(s) for s in req.sentences]


def demo_rewrite(sentence: str) -> str:
    out = sentence
    for old, new in demo_substitutions():
        out = out.replace(old, new)
    out = re.sub(r"\s{2,}", " ", out)
    # Re-capitalise the first word when a leading phrase was dropped (skipping leading locked items).
    lead = re.compile(r"^(?:⟦[A-Z]\d+⟧\s*)*")
    i, j = lead.match(out).end(), lead.match(sentence).end()  # type: ignore[union-attr]
    if out[i : i + 1].islower() and sentence[j : j + 1].isupper():
        out = out[:i] + out[i].upper() + out[i + 1 :]
    return out


SUBMIT_TOOL: dict[str, Any] = {
    "name": "submit_rewrite",
    "description": "Return the rewritten sentences, one per input sentence, in order.",
    "input_schema": {
        "type": "object",
        "properties": {"sentences": {"type": "array", "items": {"type": "string"}}},
        "required": ["sentences"],
    },
}


def build_user_message(req: RewriteRequest) -> str:
    if req.feedback:
        items = [{"original": s, "rejected_because": fb} for s, fb in zip(req.sentences, req.feedback, strict=True)]
        return (
            load_prompt("repair").body
            + "\n\nParagraph for context:\n"
            + req.context
            + "\n\nSentences:\n"
            + json.dumps(items, ensure_ascii=False, indent=1)
        )
    return (
        "Paragraph for context:\n"
        + req.context
        + "\n\nRewrite these sentences:\n"
        + json.dumps(req.sentences, ensure_ascii=False, indent=1)
    )


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings | None = None, client: Any = None) -> None:
        self.settings = settings or get_settings()
        self.label = f"Claude ({self.settings.model_rewrite})"
        if client is None:
            import anthropic

            client = anthropic.Anthropic()
        self.client = client

    def rewrite(self, req: RewriteRequest) -> list[str]:
        resp = self.client.messages.create(
            model=self.settings.model_rewrite,
            max_tokens=4096,
            system=[
                {
                    "type": "text",
                    "text": render_rewrite_system(req.discipline, req.register),
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[SUBMIT_TOOL],
            tool_choice={"type": "tool", "name": "submit_rewrite"},
            messages=[{"role": "user", "content": build_user_message(req)}],
        )
        for block in resp.content:
            if getattr(block, "type", None) == "tool_use":
                sentences = block.input.get("sentences", [])
                return [str(s) for s in sentences]
        return []


def make_provider(settings: Settings | None = None) -> RewriteProvider:
    s = settings or get_settings()
    if s.provider == "demo" or (s.provider == "auto" and not os.environ.get("ANTHROPIC_API_KEY")):
        return DemoProvider()
    return AnthropicProvider(s)

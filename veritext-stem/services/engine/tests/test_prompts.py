from __future__ import annotations

from typing import Any

from veritext_engine.llm.prompts import load_prompt, render_rewrite_system, styles
from veritext_engine.pipeline.providers import AnthropicProvider, RewriteRequest, parse_sentences


def test_every_discipline_and_register_renders() -> None:
    for d in styles()["disciplines"]:
        for r in styles()["registers"]:
            text = render_rewrite_system(d, r)
            assert "⟦M1⟧" in text and "{" not in text


def test_prompt_metadata() -> None:
    p = load_prompt("rewrite")
    assert p.version == 2 and p.model_role == "rewrite"


def test_anthropic_provider_parses_structured_output_without_network() -> None:
    class Block:
        type = "text"
        text = '{"sentences": ["A rewritten sentence."]}'

    class Resp:
        stop_reason = "end_turn"
        content = [Block()]

    class Messages:
        def __init__(self) -> None:
            self.kwargs: dict[str, Any] = {}

        def create(self, **kwargs: Any) -> Resp:
            self.kwargs = kwargs
            return Resp()

    class Client:
        messages = Messages()

    client = Client()
    p = AnthropicProvider(client=client)
    out = p.rewrite(RewriteRequest(sentences=["A sentence."], discipline="biology", register="thesis"))
    assert out == ["A rewritten sentence."]
    sent = client.messages.kwargs
    assert sent["model"] == "claude-opus-5-5"
    assert sent["output_config"]["format"]["type"] == "json_schema"
    assert sent["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "submit_rewrite" not in sent["system"][0]["text"]
    # Rejected by the current model family.
    assert "tool_choice" not in sent and "thinking" not in sent and "temperature" not in sent


def test_refusal_or_bad_json_yields_no_sentences() -> None:
    assert parse_sentences("not json") == []
    assert parse_sentences('{"sentences": "x"}') == []

    class Block:
        type = "text"
        text = '{"sentences": ["x"]}'

    class Resp:
        stop_reason = "refusal"
        content = [Block()]

    class Client:
        class messages:
            @staticmethod
            def create(**_: Any) -> Resp:
                return Resp()

    p = AnthropicProvider(client=Client())
    assert p.rewrite(RewriteRequest(sentences=["A."], discipline="physics", register="journal")) == []

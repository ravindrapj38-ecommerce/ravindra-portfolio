from __future__ import annotations

from veritext_engine.llm.prompts import load_prompt, render_rewrite_system, styles
from veritext_engine.pipeline.providers import AnthropicProvider, RewriteRequest


def test_every_discipline_and_register_renders() -> None:
    for d in styles()["disciplines"]:
        for r in styles()["registers"]:
            text = render_rewrite_system(d, r)
            assert "⟦M1⟧" in text and "{" not in text


def test_prompt_metadata() -> None:
    p = load_prompt("rewrite")
    assert p.version == 1 and p.model_role == "rewrite"


def test_anthropic_provider_parses_tool_output_without_network() -> None:
    class Block:
        type = "tool_use"
        input = {"sentences": ["A rewritten sentence."]}

    class Resp:
        content = [Block()]

    class Messages:
        def __init__(self) -> None:
            self.kwargs: dict[str, object] = {}

        def create(self, **kwargs: object) -> Resp:
            self.kwargs = kwargs
            return Resp()

    class Client:
        messages = Messages()

    client = Client()
    p = AnthropicProvider(client=client)
    out = p.rewrite(RewriteRequest(sentences=["A sentence."], discipline="biology", register="thesis"))
    assert out == ["A rewritten sentence."]
    assert client.messages.kwargs["tool_choice"] == {"type": "tool", "name": "submit_rewrite"}
    assert client.messages.kwargs["model"] == "claude-opus-5-5"

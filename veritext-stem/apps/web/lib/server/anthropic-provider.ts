// Real rewrites with Claude, through the official SDK. Mirrors pipeline/providers.py in the engine.
// The model returns JSON constrained by a schema (structured outputs); forced tool_choice is not
// available on current models. The system prompt is cached, since it repeats for every paragraph.
import Anthropic from "@anthropic-ai/sdk";
import { buildUserMessage, renderRewriteSystem, type RewriteProvider } from "@/lib/core/providers";
import type { Config, ModelPrice } from "./config";

export interface TokenUsage {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const emptyUsage = (): TokenUsage => ({ calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export const costUsd = (u: TokenUsage, p: ModelPrice): number =>
  (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;

const SCHEMA = {
  type: "object",
  properties: { sentences: { type: "array", items: { type: "string" } } },
  required: ["sentences"],
  additionalProperties: false,
} as const;

export function parseSentences(text: string): string[] {
  try {
    const value = JSON.parse(text) as { sentences?: unknown };
    return Array.isArray(value.sentences) ? value.sentences.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

export interface MeteredProvider extends RewriteProvider {
  usage: TokenUsage;
}

export function anthropicProvider(c: Config, client: Anthropic = new Anthropic({ apiKey: c.anthropicKey, maxRetries: 3 })): MeteredProvider {
  const usage = emptyUsage();
  return {
    name: "anthropic",
    label: `Claude (${c.model})`,
    usage,
    async rewrite(req) {
      const system = renderRewriteSystem(req.discipline, req.register);
      // `fallbacks` lets the API re-run a request a safety classifier declined (biology and chemistry
      // text can trip one) on another model inside the same call, instead of returning nothing.
      const res = await client.beta.messages.create({
        model: c.model,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 16000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: { effort: c.effort, format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: buildUserMessage(req) }],
      });
      usage.calls += 1;
      usage.input += res.usage.input_tokens;
      usage.output += res.usage.output_tokens;
      usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
      // A refusal or a cut-off reply yields no sentences; the pipeline then keeps the originals.
      if (res.stop_reason !== "end_turn") return [];
      const text = res.content.find((b) => b.type === "text");
      return text && text.type === "text" ? parseSentences(text.text) : [];
    },
  };
}

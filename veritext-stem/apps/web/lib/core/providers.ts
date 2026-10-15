// Rewrite providers for the in-browser engine. Mirrors pipeline/providers.py.
import type { Discipline, Register } from "./types";
import shared from "./shared-data";

export interface RewriteRequest {
  sentences: string[];
  discipline: Discipline;
  register: Register;
  context: string;
  feedback: string[][];
}

export interface RewriteProvider {
  name: string;
  label: string;
  rewrite(req: RewriteRequest): Promise<string[]>;
}

export function demoRewrite(sentence: string): string {
  let out = sentence;
  for (const [oldS, newS] of shared.demoSubstitutions) out = out.replaceAll(oldS!, newS!);
  out = out.replace(/\s{2,}/g, " ");
  // Re-capitalise the first word when a leading phrase was dropped (skipping leading locked items).
  const lead = /^(?:⟦[A-Z]\d+⟧\s*)*/;
  const i = lead.exec(out)![0].length;
  const j = lead.exec(sentence)![0].length;
  if (/[a-z]/.test(out[i] ?? "") && /[A-Z]/.test(sentence[j] ?? "")) out = out.slice(0, i) + out[i]!.toUpperCase() + out.slice(i + 1);
  return out;
}

export const demoProvider: RewriteProvider = {
  name: "demo",
  label: "Demo rewriter (no AI model connected; phrase-level edits only)",
  async rewrite(req) {
    return req.sentences.map(demoRewrite);
  },
};

const LABELS: Record<string, string> = {
  cs_ml: "computer science / machine learning",
  lab_report: "lab report",
  maths: "mathematics",
};

export function renderRewriteSystem(discipline: Discipline, register: Register): string {
  const vars: Record<string, string> = {
    discipline: LABELS[discipline] ?? discipline,
    register: LABELS[register] ?? register,
    register_guidance: shared.styles.registers[register],
    discipline_guidance: shared.styles.disciplines[discipline],
  };
  return shared.prompts.rewrite.replace(/\{(\w+)\}/g, (w, k: string) => vars[k] ?? w);
}

export function buildUserMessage(req: RewriteRequest): string {
  if (req.feedback.length) {
    const items = req.sentences.map((s, i) => ({ original: s, rejected_because: req.feedback[i] ?? [] }));
    return (
      shared.prompts.repair +
      "\n\nParagraph for context:\n" +
      req.context +
      "\n\nSentences:\n" +
      JSON.stringify(items, null, 1)
    );
  }
  return "Paragraph for context:\n" + req.context + "\n\nRewrite these sentences:\n" + JSON.stringify(req.sentences, null, 1);
}

/** Minimal shape of the artifact runtime's `sample` capability that we use. */
export interface SampleFn {
  json<T = unknown>(input: string, options?: { modelTier?: "default" | "complex" | "quick" }): Promise<T>;
}

/** Real rewrites through Claude, using the viewer's own Claude account (published preview only). */
export function claudeSampleProvider(sample: SampleFn): RewriteProvider {
  return {
    name: "claude",
    label: "Claude (through your Claude account)",
    async rewrite(req) {
      const prompt =
        renderRewriteSystem(req.discipline, req.register).replace(
          "Return your answer with the submit_rewrite tool.",
          'Reply with only a JSON object {"sentences": [...]}: one string per input sentence, in order.',
        ) +
        "\n\n" +
        buildUserMessage(req);
      const value = await sample.json<{ sentences?: unknown }>(prompt, { modelTier: "default" });
      const out = Array.isArray(value?.sentences) ? value.sentences : Array.isArray(value) ? value : [];
      return (out as unknown[]).map((s) => String(s));
    },
  };
}

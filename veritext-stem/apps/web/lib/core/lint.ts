// Overused-phrase hints. Writing quality only: never part of the fidelity score, never tied to detectors.
import type { LintHit } from "./types";
import shared from "./shared-data";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS = shared.aiPhrases.map((p) => ({
  p,
  rx: new RegExp(
    `(?<![A-Za-z])${p.phrase.split(/\s+/).map(esc).join("\\s+")}${p.match === "word-prefix" ? "[a-z]*" : ""}(?![A-Za-z])`,
    "gi",
  ),
}));

export function lint(text: string): LintHit[] {
  const hits: LintHit[] = [];
  for (const { p, rx } of PATTERNS)
    for (const m of text.matchAll(rx))
      hits.push({ phrase: p.phrase, text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, suggestion: p.suggestion });
  return hits.sort((a, b) => a.start - b.start);
}

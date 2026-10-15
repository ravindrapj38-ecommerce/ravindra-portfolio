// Port of services/engine/veritext_engine/pipeline/protect.py. Lock rules come from shared/lock_patterns.json.
import type { Format } from "./types";
import shared, { lexicon } from "./shared-data";

export const PLACEHOLDER_RE = /⟦([A-Z])(\d+)⟧/g;

export const KIND_LABELS: Record<string, string> = {
  M: "equation",
  N: "number/unit",
  C: "citation",
  R: "cross-reference",
  K: "code/markup",
  E: "chemical/gene/species name",
  A: "acronym",
  U: "URL/DOI",
  X: "reserved character",
};

export interface Protected {
  text: string;
  table: Record<string, string>;
}

const RULES = shared.lockPatterns.map((r) => ({
  ...r,
  regex: new RegExp(r.pattern, "g" + (r.flags ?? "")),
}));

function passesFilter(name: string | undefined, s: string): boolean {
  if (!name) return true;
  if (name === "formula") {
    const hasDigit = /\d/.test(s);
    const hasCharge = "+-−".includes(s[s.length - 1] ?? "");
    const uppers = (s.match(/[A-Z]/g) ?? []).length;
    return hasDigit || hasCharge || (uppers >= 2 && /[a-z]/.test(s));
  }
  if (name === "acronym") {
    const stop = new Set(lexicon("uppercase_words_not_acronyms"));
    return !stop.has(s.replace(/s+$/, "")) && !stop.has(s);
  }
  throw new Error(`unknown lock filter ${name}`);
}

export function detectFormat(text: string): Format {
  if (/\\(documentclass|begin\{|section\{|subsection\{|cite\{|usepackage)/.test(text)) return "latex";
  if (/^(#{1,6} |```|[-*+] |\d+\. )/m.test(text) || /\*\*[^*]+\*\*/.test(text)) return "markdown";
  return "text";
}

export function findSpans(text: string, fmt: Format): [number, number, string][] {
  const taken: [number, number, string][] = [];
  const occupied = new Uint8Array(text.length);
  for (const rule of RULES) {
    if (rule.formats && !rule.formats.includes(fmt)) continue;
    rule.regex.lastIndex = 0;
    for (const m of text.matchAll(rule.regex)) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      if (s === e || occupied.subarray(s, e).some((x) => x)) continue;
      if (!passesFilter(rule.filter, m[0])) continue;
      taken.push([s, e, rule.kind]);
      occupied.fill(1, s, e);
    }
  }
  return taken.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function protect(text: string, fmt: Format = "text"): Protected {
  const counters: Record<string, number> = {};
  const table: Record<string, string> = {};
  const parts: string[] = [];
  let pos = 0;
  for (const [s, e, kind] of findSpans(text, fmt)) {
    counters[kind] = (counters[kind] ?? 0) + 1;
    const key = `${kind}${counters[kind]}`;
    table[key] = text.slice(s, e);
    parts.push(text.slice(pos, s), `⟦${key}⟧`);
    pos = e;
  }
  parts.push(text.slice(pos));
  return { text: parts.join(""), table };
}

export function restore(text: string, table: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (whole, k: string, n: string) => table[k + n] ?? whole);
}

export function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => `${m[1]}${m[2]}`);
}

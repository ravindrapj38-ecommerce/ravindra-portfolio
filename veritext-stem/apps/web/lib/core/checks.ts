// Port of services/engine/veritext_engine/pipeline/checks.py. Cue lists come from shared/lexicons.json.
import type { Issue } from "./types";
import { lexicon } from "./shared-data";
import { PLACEHOLDER_RE, placeholders } from "./protect";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const norm = (s: string) => " " + s.replace(PLACEHOLDER_RE, " ").replaceAll("’", "'").toLowerCase().replace(/\s+/g, " ") + " ";

const cueCache = new Map<string, RegExp>();
function cueRegex(name: string): RegExp {
  let rx = cueCache.get(name);
  if (!rx) {
    const cues = [...lexicon(name)].sort((a, b) => b.length - a.length);
    const alts = cues.map((c) => c.split(/\s+/).map(esc).join("\\s+")).join("|");
    rx = new RegExp(`(?<![a-z0-9'-])(?:${alts})(?![a-z0-9'-])`, "g");
    cueCache.set(name, rx);
  }
  return rx;
}

export function cues(name: string, s: string): string[] {
  const n = norm(s);
  const found = [...n.matchAll(cueRegex(name))].map((m) => m[0]);
  if (name === "negations") found.push(...(n.match(/[a-z]+n't/g) ?? []));
  return found;
}

export function hedgeClass(s: string): string {
  const h = cues("hedges", s).length;
  const b = cues("boosters", s).length;
  if (h && b) return "mixed";
  return h ? "hedged" : b ? "boosted" : "neutral";
}

const stem = (w: string) => w.toLowerCase().slice(0, 5);

export function contentTokens(s: string): string[] {
  const stop = new Set(lexicon("stopwords"));
  const toks: string[] = [];
  for (const m of s.matchAll(/⟦([A-Z])(\d+)⟧|[A-Za-z][A-Za-z'-]+/g)) {
    if (m[1]) {
      if (m[1] !== "C") toks.push(m[1] + m[2]);
    } else if (!stop.has(m[0].toLowerCase())) toks.push(stem(m[0]));
  }
  return toks;
}

const quote = (xs: string[]) => (xs.length ? xs.map((x) => `'${x}'`).join(", ") : "none");

function counter(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

function subtract(a: Map<string, number>, b: Map<string, number>): string[] {
  const out: string[] = [];
  for (const [k, n] of a) for (let i = 0; i < n - (b.get(k) ?? 0); i++) out.push(k);
  return out;
}

const sameMultiset = (a: string[], b: string[]) => {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

function windowBefore(s: string, key: string, n: number): string[] {
  const i = s.indexOf(`⟦${key}⟧`);
  return i >= 0 ? contentTokens(s.slice(0, i)).slice(-n) : [];
}

function atEnd(s: string, key: string): boolean {
  const i = s.indexOf(`⟦${key}⟧`);
  return i >= 0 && !/[A-Za-z]/.test(s.slice(i).replace(PLACEHOLDER_RE, ""));
}

export function checkSentence(original: string, rewritten: string, table: Record<string, string> = {}): Issue[] {
  const issues: Issue[] = [];
  const hard = (code: string, message: string) => issues.push({ code, severity: "hard", message });
  if (!rewritten.trim()) return [{ code: "empty", severity: "hard", message: "The rewrite is empty." }];

  const po = counter(placeholders(original));
  const pn = counter(placeholders(rewritten));
  const missing = subtract(po, pn);
  const extra = subtract(pn, po);
  if (missing.length)
    hard("locked_missing", `Locked item(s) dropped or duplicated away: ${quote(missing.map((k) => table[k] ?? k))}.`);
  if (extra.length) hard("locked_added", `Locked item(s) added or repeated: ${quote(extra.map((k) => table[k] ?? k))}.`);
  if (/[⟦⟧]/.test(rewritten.replace(PLACEHOLDER_RE, ""))) hard("locked_corrupt", "A locked item was altered.");

  const digits = (s: string) => (s.replace(PLACEHOLDER_RE, " ").match(/\d+/g) ?? []).sort();
  const dO = digits(original);
  const dN = digits(rewritten);
  const wO = cues("number_words", original).sort();
  const wN = cues("number_words", rewritten).sort();
  if (dO.join("|") !== dN.join("|") || wO.join("|") !== wN.join("|"))
    hard("number_changed", `Numbers changed: ${quote([...dO, ...wO])} became ${quote([...dN, ...wN])}.`);

  const hO = hedgeClass(original);
  const hN = hedgeClass(rewritten);
  if (hO !== hN)
    hard(
      "hedging_changed",
      `Certainty changed from ${hO} (${quote([...cues("hedges", original), ...cues("boosters", original)])}) ` +
        `to ${hN} (${quote([...cues("hedges", rewritten), ...cues("boosters", rewritten)])}).`,
    );

  const cO = cues("causal", original).length > 0;
  const cN = cues("causal", rewritten).length > 0;
  const rO = cues("correlational", original).length > 0;
  const rN = cues("correlational", rewritten).length > 0;
  if (cO !== cN || rO !== rN) {
    const frame = (c: boolean, r: boolean) =>
      c && r ? "causal and correlational" : c ? "causal" : r ? "correlational" : "neither";
    hard(
      "causality_changed",
      `Causal/correlational framing changed from ${frame(cO, rO)} ` +
        `(${quote([...cues("causal", original), ...cues("correlational", original)])}) to ${frame(cN, rN)} ` +
        `(${quote([...cues("causal", rewritten), ...cues("correlational", rewritten)])}).`,
    );
  }

  const nO = cues("negations", original).length;
  const nN = cues("negations", rewritten).length;
  if (nO % 2 !== nN % 2 || (nO === 0) !== (nN === 0))
    hard(
      "negation_changed",
      `Negation changed: original has ${quote(cues("negations", original))}, rewrite has ${quote(cues("negations", rewritten))}.`,
    );

  const citesO = placeholders(original).filter((k) => k.startsWith("C"));
  const citesN = placeholders(rewritten).filter((k) => k.startsWith("C"));
  if (citesO.length && sameMultiset(citesO, citesN)) {
    let moved = citesO.join("|") !== citesN.join("|");
    if (!moved && (citesO.length > 1 || !atEnd(original, citesO[0]!))) {
      for (const key of citesO) {
        const anchor = new Set(windowBefore(original, key, 3));
        const now = new Set(windowBefore(rewritten, key, 3));
        if (anchor.size && ![...anchor].some((t) => now.has(t))) moved = true;
      }
    }
    if (moved)
      hard("citation_moved", `Citation(s) ${quote(citesO.map((k) => table[k] ?? k))} now support a different part of the sentence.`);
  }

  if (issues.some((i) => i.severity === "hard")) return issues;

  const tO = contentTokens(original);
  const tN = new Set(contentTokens(rewritten));
  if (tO.length >= 4) {
    const uniq = new Set(tO);
    const kept = [...uniq].filter((t) => tN.has(t)).length / uniq.size;
    if (kept < 0.4)
      issues.push({
        code: "wording_drift",
        severity: "soft",
        message: `Only ${Math.floor(kept * 100 + 0.5)}% of the original content words survive; check the meaning by hand.`,
      });
  }
  const wo = (original.match(/\S+/g) ?? []).length;
  const wn = (rewritten.match(/\S+/g) ?? []).length;
  if (wo >= 6 && !(wn / wo >= 0.5 && wn / wo <= 1.8))
    issues.push({
      code: "length_changed",
      severity: "soft",
      message: `Length changed a lot (${wo} → ${wn} words); check nothing was added or lost.`,
    });
  return issues;
}

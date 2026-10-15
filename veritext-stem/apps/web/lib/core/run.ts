// Port of pipeline/run.py: protect → segment → rewrite → verify → repair (≤N) → restore → report.
import type { Discipline, Format, Issue, LockedItem, Register, Report, SentenceResult, Status } from "./types";
import { checkSentence } from "./checks";
import { wordDiff } from "./diff";
import { lint } from "./lint";
import { KIND_LABELS, detectFormat, protect, restore } from "./protect";
import type { RewriteProvider } from "./providers";
import { segment } from "./segment";

export interface RunOptions {
  discipline?: Discipline;
  register?: Register;
  format?: Format | null;
  maxAttempts?: number;
  onProgress?: (done: number, total: number) => void;
}

const round = (x: number) => Math.floor(x + 0.5);
const words = (s: string) => (s.match(/\S+/g) ?? []).length;

export async function runPipeline(text: string, provider: RewriteProvider, opts: RunOptions = {}): Promise<Report> {
  const discipline = opts.discipline ?? "physics";
  const register = opts.register ?? "journal";
  const maxAttempts = opts.maxAttempts ?? 3;
  const fmt = opts.format ?? detectFormat(text);
  const prot = protect(text, fmt);
  const roundTripOk = restore(prot.text, prot.table) === text;
  if (!roundTripOk) throw new Error("lock/restore round-trip failed; refusing to rewrite");
  const segs = segment(prot.text, prot.table);
  const warnings: string[] = [];

  const current = new Map<number, string>();
  const issues = new Map<number, Issue[]>();
  const attempts = new Map<number, number>();
  const blocks = new Map<number, number[]>();
  segs.forEach((s, i) => {
    if (s.kind === "sentence") blocks.set(s.block, [...(blocks.get(s.block) ?? []), i]);
  });
  let failed = false;

  const call = async (ids: number[], feedback: string[][], context: string): Promise<string[] | null> => {
    try {
      const out = await provider.rewrite({
        sentences: ids.map((i) => segs[i]!.text),
        discipline,
        register,
        context,
        feedback,
      });
      return out.length === ids.length ? out : null;
    } catch (exc) {
      failed = true;
      const e = exc as { code?: string; message?: string };
      warnings.push(`Rewrite provider error: ${e.code ?? "error"}: ${e.message ?? String(exc)}`.slice(0, 300));
      return null;
    }
  };

  let doneBlocks = 0;
  opts.onProgress?.(0, blocks.size);
  for (const ids of blocks.values()) {
    const context = ids.map((i) => segs[i]!.text).join(" ");
    let pending = [...ids];
    const feedback = new Map<number, string[]>();
    for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
      if (!pending.length || failed) break;
      const fb = attempt > 1 ? pending.map((i) => feedback.get(i) ?? []) : [];
      let out = await call(pending, fb, context);
      if (out === null && pending.length > 1 && !failed) {
        out = [];
        for (let k = 0; k < pending.length; k++) {
          const single = await call([pending[k]!], fb.length ? [fb[k]!] : [], context);
          out.push(single?.[0] ?? "");
        }
      }
      const still: number[] = [];
      pending.forEach((i, k) => {
        attempts.set(i, attempt);
        const next = out?.[k] ?? "";
        const found = checkSentence(segs[i]!.text, next, prot.table);
        const hard = found.filter((x) => x.severity === "hard");
        if (next && !hard.length) {
          current.set(i, next);
          issues.set(i, found);
        } else {
          issues.set(i, found.length ? found : [{ code: "no_output", severity: "hard", message: "No rewrite returned." }]);
          const keyed = checkSentence(segs[i]!.text, next)
            .filter((x) => x.severity === "hard")
            .map((x) => x.message);
          feedback.set(i, keyed.length ? keyed : ["No rewrite returned."]);
          still.push(i);
        }
      });
      pending = still;
    }
    opts.onProgress?.(++doneBlocks, blocks.size);
  }

  const results: SentenceResult[] = [];
  const outParts: string[] = [];
  segs.forEach((seg, i) => {
    if (seg.kind === "raw") return void outParts.push(seg.text);
    let finalProt = seg.text;
    let status: Status = "kept_original";
    if (current.has(i)) {
      finalProt = current.get(i)!;
      status = issues.get(i)?.length ? "needs_review" : "verified";
    }
    outParts.push(finalProt);
    const original = restore(seg.text, prot.table);
    const final = restore(finalProt, prot.table);
    results.push({
      id: results.length,
      block: seg.block,
      original,
      final,
      status,
      attempts: attempts.get(i) ?? 0,
      issues: issues.get(i) ?? [],
      diff: wordDiff(original, final),
    });
  });

  const output = restore(outParts.join(""), prot.table);
  const count = (h: string, n: string) => h.split(n).length - 1;
  for (const original of Object.values(prot.table))
    if (count(output, original) < count(text, original)) warnings.push(`Locked item count changed for '${original}'`);

  const weights = results.map((r) => Math.max(1, words(r.original)));
  const scores = results.map((r) => (r.status !== "needs_review" ? 100 : Math.max(50, 100 - 20 * r.issues.length)));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const fidelity = results.length ? round(weights.reduce((a, w, k) => a + w * scores[k]!, 0) / totalW) : 100;
  const changed = results.reduce(
    (a, r, k) => a + (r.status !== "kept_original" && r.final !== r.original ? weights[k]! : 0),
    0,
  );
  const locked: LockedItem[] = Object.entries(prot.table)
    .filter(([k]) => k[0] !== "X")
    .map(([key, value]) => ({ key, kind: key[0]!, label: KIND_LABELS[key[0]!] ?? key[0]!, text: value }));
  const counts = { verified: 0, kept_original: 0, needs_review: 0 } as Record<Status, number>;
  for (const r of results) counts[r.status]++;

  return {
    format: fmt,
    discipline,
    register,
    provider: provider.name,
    provider_label: provider.label,
    output,
    sentences: results,
    counts,
    fidelity_score: fidelity,
    rewritten_share: results.length ? round((100 * changed) / totalW) : 0,
    locked,
    lint_input: lint(text),
    lint_output: lint(output),
    round_trip_ok: roundTripOk,
    warnings,
  };
}

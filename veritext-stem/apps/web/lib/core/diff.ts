// Word-level diff (LCS over word/space/punctuation tokens). Mirrors pipeline/diff.py.
import type { DiffOp } from "./types";

const TOKEN = /\s+|[A-Za-z0-9À-ɏ'’-]+|[^\sA-Za-z0-9]/g;

export const tokenize = (s: string): string[] => s.match(TOKEN) ?? [];

export function wordDiff(a: string, b: string): DiffOp[] {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = ta.length;
  const m = tb.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] = ta[i] === tb[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp["op"], t: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += t;
    else ops.push({ op, text: t });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      push("equal", ta[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) push("delete", ta[i++]!);
    else push("insert", tb[j++]!);
  }
  while (i < n) push("delete", ta[i++]!);
  while (j < m) push("insert", tb[j++]!);
  return ops;
}

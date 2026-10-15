// Port of services/engine/veritext_engine/pipeline/segment.py.
import { PLACEHOLDER_RE } from "./protect";

const ABBREVIATIONS = new Set([
  "e.g", "i.e", "al", "vs", "cf", "approx", "dr", "prof", "fig", "figs", "eq", "eqs", "no", "nos", "ca",
  "resp", "ref", "refs", "st", "mr", "mrs", "ms", "jr", "inc", "ltd", "etc", "sec", "vol", "pp", "ch",
]);

const BLOCK_SPLIT = /(\n[ \t]*\n\s*)/;
const BOUNDARY = /[.!?]["”’')\]]*(\s+)(?=[A-Z⟦"“(\[])/g;

export interface Segment {
  kind: "raw" | "sentence";
  text: string;
  block: number;
}

export function proseWords(s: string): string[] {
  return s.replace(PLACEHOLDER_RE, " ").match(/[A-Za-z]{2,}/g) ?? [];
}

function leadingValue(line: string, table: Record<string, string>): string {
  const m = /^⟦([A-Z])(\d+)⟧/.exec(line.trimStart());
  return m ? (table[`${m[1]}${m[2]}`] ?? "") : "";
}

function isHeading(line: string, table: Record<string, string>): boolean {
  const v = leadingValue(line, table);
  return v.startsWith("#") || /^\\(part|chapter|(sub)*section|paragraph|title|caption)\b/.test(v);
}

function isListItem(line: string, table: Record<string, string>): boolean {
  const v = leadingValue(line, table);
  return /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+$/.test(v) || v.startsWith("\\item");
}

export function splitSentences(unit: string): [number, number][] {
  const spans: [number, number][] = [];
  let start = unit.length - unit.trimStart().length;
  for (const m of unit.matchAll(BOUNDARY)) {
    const mStart = m.index ?? 0;
    const ws = m[1] ?? "";
    const wsStart = mStart + m[0].length - ws.length;
    const before = unit.slice(start, mStart + 1);
    const word = /([A-Za-z.]+)\.$/.exec(before);
    if (word && (ABBREVIATIONS.has(word[1]!.toLowerCase().replace(/\.+$/, "")) || /^[A-Z]$/.test(word[1]!))) continue;
    if (wsStart > start) spans.push([start, wsStart]);
    start = wsStart + ws.length;
  }
  const end = unit.trimEnd().length;
  if (end > start) spans.push([start, end]);
  return spans;
}

export function segment(text: string, table: Record<string, string>): Segment[] {
  const out: Segment[] = [];
  let blockId = 0;

  const raw = (s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.kind === "raw") last.text += s;
    else out.push({ kind: "raw", text: s, block: -1 });
  };

  const proseUnit = (unit: string, block: number) => {
    if (proseWords(unit).length < 3) return raw(unit);
    let pos = 0;
    for (const [s, e] of splitSentences(unit)) {
      raw(unit.slice(pos, s));
      const sent = unit.slice(s, e);
      if (proseWords(sent).length < 3) raw(sent);
      else out.push({ kind: "sentence", text: sent, block });
      pos = e;
    }
    raw(unit.slice(pos));
  };

  text.split(BLOCK_SPLIT).forEach((piece, i) => {
    if (i % 2 === 1 || !piece) return raw(piece);
    const lines = piece.match(/[^\n]*\n|[^\n]+/g) ?? [];
    if (lines.filter((l) => l.trim()).every((l) => l.trimStart().startsWith("|"))) return raw(piece);
    let buf = "";
    for (const ln of lines) {
      const heading = isHeading(ln, table);
      const item = isListItem(ln, table);
      if (heading || proseWords(ln).length === 0 || item) {
        if (buf) {
          proseUnit(buf, blockId++);
          buf = "";
        }
        if (item && !heading) proseUnit(ln, blockId++);
        else raw(ln);
      } else buf += ln;
    }
    if (buf) proseUnit(buf, blockId++);
  });
  return out;
}

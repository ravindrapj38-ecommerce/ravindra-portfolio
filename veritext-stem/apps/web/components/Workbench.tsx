"use client";

// The rewrite workbench. Plain React (no next/* imports) so the same component powers the Next.js app
// and the single-file preview build (preview/main.tsx).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DISCIPLINES,
  REGISTERS,
  type Discipline,
  type Format,
  type LintHit,
  type Register,
  type Report,
  type RewriteInput,
  type SentenceResult,
  type Status,
} from "@/lib/core/types";

export interface EngineOption {
  id: string;
  label: string;
  description: string;
  run(input: RewriteInput, onProgress: (done: number, total: number) => void): Promise<Report>;
}

interface Props {
  engines: EngineOption[];
  initialText: string;
  notice?: ReactNode;
  canDownload?: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  verified: "Verified",
  kept_original: "Kept original",
  needs_review: "Needs review",
};

const FORMATS: { value: Format | "auto"; label: string }[] = [
  { value: "auto", label: "Detect format" },
  { value: "text", label: "Plain text" },
  { value: "markdown", label: "Markdown" },
  { value: "latex", label: "LaTeX" },
];

type Tab = "compare" | "output" | "locked" | "quality";
type Filter = "all" | "flagged";

export default function Workbench({ engines, initialText, notice, canDownload = false }: Props) {
  const [text, setText] = useState(initialText);
  const [format, setFormat] = useState<Format | "auto">("auto");
  const [discipline, setDiscipline] = useState<Discipline>("physics");
  const [register, setRegister] = useState<Register>("journal");
  const [engineId, setEngineId] = useState(engines[0]?.id ?? "");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("compare");
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLPreElement>(null);
  const engine = engines.find((e) => e.id === engineId) ?? engines[0];

  useEffect(() => {
    if (!engines.some((e) => e.id === engineId) && engines[0]) setEngineId(engines[0].id);
  }, [engines, engineId]);

  async function rewrite() {
    if (!engine || !text.trim()) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const r = await engine.run({ text, format, discipline, register }, (done, total) => setProgress([done, total]));
      setReport(r);
      setTab("compare");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".tex")) setFormat("latex");
    else if (name.endsWith(".md") || name.endsWith(".markdown")) setFormat("markdown");
    else setFormat("text");
    file.text().then(setText, () => setError("Could not read that file. Upload a .txt, .md or .tex file."));
  }

  async function copyOutput() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      const el = outRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  function download() {
    if (!report) return;
    const ext = report.format === "latex" ? "tex" : report.format === "markdown" ? "md" : "txt";
    const url = URL.createObjectURL(new Blob([report.output], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `veritext-rewrite.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="vx-shell">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1" style={{ maxWidth: "62ch" }}>
          <h1 className="vx-display m-0 text-[30px] leading-tight">Veritext STEM</h1>
          <p className="m-0" style={{ color: "var(--muted)" }}>
            Rewrites AI-drafted STEM text into natural expert prose, then checks every sentence: locked
            equations, numbers, citations and names are restored exactly, and no claim changes its certainty,
            causality or negation.
          </p>
        </div>
        {engines.length > 1 ? (
          <label className="grid gap-1 text-sm">
            <span className="vx-label">Rewriter</span>
            <select
              id="vx-engine"
              className="vx-field"
              value={engineId}
              onChange={(e) => setEngineId(e.target.value)}
            >
              {engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {notice}

      <section className="vx-panel grid" aria-label="Input">
        <div className="flex flex-wrap items-end gap-3 p-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <label className="grid gap-1">
            <span className="vx-label">Discipline</span>
            <select
              id="vx-discipline"
              className="vx-field"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as Discipline)}
            >
              {DISCIPLINES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="vx-label">Register</span>
            <select
              id="vx-register"
              className="vx-field"
              value={register}
              onChange={(e) => setRegister(e.target.value as Register)}
            >
              {REGISTERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="vx-label">Format</span>
            <select
              id="vx-format"
              className="vx-field"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format | "auto")}
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <input
              ref={fileRef}
              id="vx-file"
              type="file"
              accept=".txt,.md,.markdown,.tex,text/plain,text/markdown"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="vx-btn" onClick={() => fileRef.current?.click()}>
              Upload file
            </button>
            <button type="button" className="vx-btn" onClick={() => setText(initialText)}>
              Load sample
            </button>
            <button
              type="button"
              className="vx-btn vx-btn-primary"
              onClick={rewrite}
              disabled={busy || !text.trim()}
              data-testid="rewrite"
            >
              {busy ? "Rewriting…" : "Rewrite and verify"}
            </button>
          </div>
        </div>
        <textarea
          id="vx-input"
          aria-label="STEM text to rewrite"
          className="vx-textarea"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste plain text, Markdown or LaTeX…"
        />
      </section>

      {busy ? (
        <p className="vx-note vx-note-info vx-spin m-0" role="status">
          {engine?.id === "claude" ? "Claude is rewriting; each paragraph is checked as it comes back" : "Rewriting"}
          {progress && progress[1] > 0 ? ` (paragraph ${Math.min(progress[0] + 1, progress[1])} of ${progress[1]})` : ""}
          …
        </p>
      ) : null}
      {error ? (
        <p className="vx-note vx-note-bad m-0" role="alert">
          {error}
        </p>
      ) : null}

      {report ? (
        <Results
          report={report}
          tab={tab}
          setTab={setTab}
          filter={filter}
          setFilter={setFilter}
          copied={copied}
          onCopy={copyOutput}
          onDownload={canDownload ? download : undefined}
          outRef={outRef}
        />
      ) : null}

      <footer className="text-[13px]" style={{ color: "var(--muted)", maxWidth: "75ch" }}>
        Overused-phrase flags are a writing-quality aid. Veritext does not measure, target or integrate with
        AI-detection tools.
      </footer>
    </div>
  );
}

function Results(props: {
  report: Report;
  tab: Tab;
  setTab(t: Tab): void;
  filter: Filter;
  setFilter(f: Filter): void;
  copied: boolean;
  onCopy(): void;
  onDownload?: () => void;
  outRef: React.RefObject<HTMLPreElement | null>;
}) {
  const { report, tab, setTab, filter, setFilter } = props;
  const total = report.sentences.length || 1;
  const rows = useMemo(
    () => report.sentences.filter((s) => filter === "all" || s.status !== "verified"),
    [report, filter],
  );
  const scoreColor =
    report.fidelity_score >= 90 ? "var(--ok)" : report.fidelity_score >= 70 ? "var(--warn)" : "var(--bad)";

  return (
    <section className="grid gap-4" aria-label="Results">
      {report.warnings.length ? (
        <div className="vx-note vx-note-warn grid gap-1">
          {report.warnings.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      ) : null}

      <div className="vx-panel grid gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid content-start gap-1">
          <span className="vx-label">Fidelity score</span>
          <span className="vx-score" style={{ color: scoreColor }} data-testid="fidelity">
            {report.fidelity_score}
          </span>
          <span className="text-[13px]" style={{ color: "var(--muted)" }}>
            out of 100
          </span>
        </div>
        <div className="grid content-start gap-3">
          <div className="vx-meter" aria-hidden="true">
            <span style={{ width: `${(100 * report.counts.verified) / total}%`, background: "var(--ok)" }} />
            <span style={{ width: `${(100 * report.counts.needs_review) / total}%`, background: "var(--warn)" }} />
            <span style={{ width: `${(100 * report.counts.kept_original) / total}%`, background: "var(--bad)" }} />
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {(
              [
                ["Verified", report.counts.verified, "var(--ok)"],
                ["Needs review", report.counts.needs_review, "var(--warn)"],
                ["Kept original", report.counts.kept_original, "var(--bad)"],
                ["Text rewritten", `${report.rewritten_share}%`, "var(--ink)"],
              ] as const
            ).map(([k, v, c]) => (
              <div key={k} className="grid">
                <dt className="vx-label">{k}</dt>
                <dd className="vx-num m-0 text-[22px] font-semibold" style={{ color: c }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
            {report.locked.length} items locked and restored exactly · format {report.format} · {report.provider_label}
          </p>
        </div>
      </div>

      <div className="vx-panel">
        <div
          role="tablist"
          aria-label="Result views"
          className="flex flex-wrap items-center px-4"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          {(
            [
              ["compare", "Side by side"],
              ["output", "Rewritten text"],
              ["locked", `Locked items (${report.locked.length})`],
              ["quality", `Writing quality (${report.lint_input.length} flagged)`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={`vx-tab-${id}`}
              aria-selected={tab === id}
              className="vx-tab"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "compare" ? (
          <div>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <button
                type="button"
                className="vx-chip-btn"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All sentences ({report.sentences.length})
              </button>
              <button
                type="button"
                className="vx-chip-btn"
                aria-pressed={filter === "flagged"}
                onClick={() => setFilter("flagged")}
              >
                Flagged ({report.counts.kept_original + report.counts.needs_review})
              </button>
              <span className="ml-auto flex gap-3 text-[12.5px]" style={{ color: "var(--muted)" }}>
                <span>
                  <span className="vx-del px-1">removed</span>
                </span>
                <span>
                  <span className="vx-ins px-1">added</span>
                </span>
              </span>
            </div>
            <div className="vx-row vx-row-head vx-label" style={{ background: "var(--paper)" }}>
              <div style={{ paddingBlock: 8 }}>Original</div>
              <div style={{ paddingBlock: 8 }}>Rewrite</div>
            </div>
            {rows.length ? (
              rows.map((s) => <SentenceRow key={s.id} s={s} />)
            ) : (
              <p className="m-0 px-4 py-6" style={{ color: "var(--muted)" }}>
                Every sentence passed every check.
              </p>
            )}
          </div>
        ) : null}

        {tab === "output" ? (
          <div className="grid gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="vx-btn" onClick={props.onCopy}>
                {props.copied ? "Copied" : "Copy text"}
              </button>
              {props.onDownload ? (
                <button type="button" className="vx-btn" onClick={props.onDownload}>
                  Download
                </button>
              ) : null}
            </div>
            <pre ref={props.outRef} className="vx-pre" data-testid="output">
              {report.output}
            </pre>
          </div>
        ) : null}

        {tab === "locked" ? (
          <div className="overflow-x-auto p-2">
            {report.locked.length ? (
              <table className="vx-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Exact text (restored unchanged)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.locked.map((l) => (
                    <tr key={l.key}>
                      <td className="whitespace-nowrap">{l.label}</td>
                      <td className="vx-mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {l.text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="m-0 p-3" style={{ color: "var(--muted)" }}>
                Nothing in this text needed locking.
              </p>
            )}
          </div>
        ) : null}

        {tab === "quality" ? <Quality report={report} /> : null}
      </div>
    </section>
  );
}

function SentenceRow({ s }: { s: SentenceResult }) {
  const changed = s.final !== s.original;
  const hard = s.issues.filter((i) => i.severity === "hard");
  const soft = s.issues.filter((i) => i.severity === "soft");
  return (
    <div className="vx-row" data-status={s.status}>
      <div className="vx-cell-orig">
        {s.diff.map((op, i) =>
          op.op === "insert" ? null : (
            <span key={i} className={op.op === "delete" ? "vx-del" : undefined}>
              {op.text}
            </span>
          ),
        )}
      </div>
      <div className="vx-cell-new grid gap-2">
        <div>
          {changed
            ? s.diff.map((op, i) =>
                op.op === "delete" ? null : (
                  <span key={i} className={op.op === "insert" ? "vx-ins" : undefined}>
                    {op.text}
                  </span>
                ),
              )
            : s.final}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
          <span className={`vx-chip vx-chip-${s.status}`}>{STATUS_LABEL[s.status]}</span>
          {s.status === "verified" && !changed ? <span>already reads well; left as is</span> : null}
          {s.attempts > 1 ? <span>{s.attempts - 1} retr{s.attempts === 2 ? "y" : "ies"}</span> : null}
        </div>
        {s.status === "kept_original" && hard.length ? (
          <ul className="m-0 grid gap-1 pl-5 text-[13px]" style={{ color: "var(--muted)" }}>
            {hard.map((i, k) => (
              <li key={k}>
                <span style={{ color: "var(--bad)" }}>Rejected rewrite:</span> {i.message}
              </li>
            ))}
          </ul>
        ) : null}
        {s.status === "needs_review" && soft.length ? (
          <ul className="m-0 grid gap-1 pl-5 text-[13px]" style={{ color: "var(--muted)" }}>
            {soft.map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function highlight(text: string, hits: LintHit[]): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  hits.forEach((h, i) => {
    if (h.start < pos) return;
    out.push(text.slice(pos, h.start));
    out.push(
      <mark key={i} className="vx-hit" style={{ color: "inherit" }} title={`Try: ${h.suggestion}`}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    pos = h.end;
  });
  out.push(text.slice(pos));
  return out;
}

function Quality({ report }: { report: Report }) {
  const grouped = new Map<string, { n: number; suggestion: string }>();
  for (const h of report.lint_input) {
    const g = grouped.get(h.phrase) ?? { n: 0, suggestion: h.suggestion };
    g.n++;
    grouped.set(h.phrase, g);
  }
  const left = new Map<string, number>();
  for (const h of report.lint_output) left.set(h.phrase, (left.get(h.phrase) ?? 0) + 1);
  return (
    <div className="grid gap-4 p-4">
      <p className="m-0 text-[14px]" style={{ color: "var(--muted)", maxWidth: "70ch" }}>
        Stock phrases make technical prose read as templated. They are flagged to help the writing, and they do not
        affect the fidelity score.
      </p>
      {grouped.size ? (
        <div className="overflow-x-auto">
          <table className="vx-table">
            <thead>
              <tr>
                <th>Phrase</th>
                <th>In draft</th>
                <th>After rewrite</th>
                <th>Try instead</th>
              </tr>
            </thead>
            <tbody>
              {[...grouped].map(([phrase, g]) => (
                <tr key={phrase}>
                  <td>“{phrase}”</td>
                  <td className="vx-num">{g.n}</td>
                  <td className="vx-num" style={{ color: left.get(phrase) ? "var(--warn)" : "var(--ok)" }}>
                    {left.get(phrase) ?? 0}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{g.suggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0">No overused phrases found in the draft.</p>
      )}
      {report.lint_output.length ? (
        <div className="grid gap-2">
          <span className="vx-label">Still in the rewrite</span>
          <pre className="vx-pre">{highlight(report.output, report.lint_output)}</pre>
        </div>
      ) : null}
    </div>
  );
}

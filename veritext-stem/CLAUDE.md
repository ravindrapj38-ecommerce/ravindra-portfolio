# Veritext STEM — engineering guide

Veritext STEM (working name) rewrites AI-generated STEM text into natural, discipline-appropriate
prose **with verified preservation of meaning**. We lock what must not change, verify what did
change, and prove it with a per-sentence fidelity report.

**Success = meaning fidelity + natural, discipline-appropriate prose.**
We never integrate, call, benchmark against, or optimise for third-party AI detectors
(Turnitin, GPTZero, …). Do not write "detector bypass" features, metrics, prompts or copy.
Naturalness metrics are writing-quality metrics only.

Plan: [`docs/plan.md`](docs/plan.md). Decisions log: [`docs/decisions.md`](docs/decisions.md) —
add an entry whenever you pick a default the spec didn't fix.

## Repository layout

This project lives in `veritext-stem/` inside a portfolio repo; all paths below are relative to it.
CI workflows live at the repo root in `.github/workflows/veritext-*.yml`.

```
apps/web/                     Next.js 15 (App Router), TS strict, Tailwind v4
  components/Workbench.tsx    The whole UI (plain React; also used by the preview build)
  lib/core/                   TypeScript port of the pipeline (D-013); generated/ is synced from shared/
  preview/, scripts/          Single-file preview build (D-017), sync-shared script
  e2e/, tests/                Playwright smoke, Vitest (shared fixtures + engine parity)
services/engine/              Python FastAPI engine (uv project, D-018)
  veritext_engine/
    pipeline/                 protect, segment, checks, lint, diff, providers, run
    llm/prompts.py            Prompt registry
    config.py                 pydantic-settings; ALL tunables incl. model IDs
    main.py                   FastAPI app
  prompts/                    Versioned prompt files + eval cases (no inline prompts!)
  tests/
shared/                       Rules shared by both engines: lock patterns, lexicons, phrases, sample
fixtures/                     Test cases run by both engines + golden parity reports
scripts/                      gen_lock_patterns.py, gen_golden.py
docs/                         plan, decisions
```
Planned, not yet present: `db/`, `worker.py`, `cli.py`, `observability.py`, `migrations/`,
`benchmarks/stem_fidelitybench/`, `infra/`.

**Changing a rule:** edit `scripts/gen_lock_patterns.py` or a file in `shared/`, then run
`python3 scripts/gen_lock_patterns.py`, `pnpm --filter web sync-shared` and
`cd services/engine && uv run python ../../scripts/gen_golden.py`. Both test suites must pass.

## Pipeline (`services/engine/veritext_engine/pipeline/`)

Each stage is a **pure module**: typed Pydantic inputs → typed outputs, no hidden I/O.
LLM access is injected via a `LLMClient` protocol so stages are testable with fakes.

1. `parse` — text / Markdown / LaTeX / DOCX / ipynb → `Document` tree
   (sections → paragraphs → sentences) with **source spans** for lossless round-trip.
2. `protect` — replace invariants with opaque placeholders `⟦<KIND><n>⟧` (e.g. `⟦M3⟧` math,
   `⟦N7⟧` number/unit, `⟦C2⟧` citation, `⟦K1⟧` code, `⟦E4⟧` entity, `⟦G1⟧` glossary term,
   `⟦R5⟧` cross-ref, `⟦U1⟧` URL/DOI). Originals go into an `InvariantTable`.
   **Property:** `restore(protect(x)) == x` for every input (Hypothesis-tested).
3. `claims` — atomic claims per paragraph (subject, relation, object, conditions, quantifier,
   polarity, hedge_level 0–4, causality, direction_of_effect, citations, invariants).
4. `rewrite` — paragraph rewrite under hard constraints (placeholders exactly once, claims,
   hedges, causality, citation attachment preserved) + style profile.
5. `verify` — sentence-level: placeholder integrity, sympy equivalence for worded math,
   numbers/units via pint, bidirectional entailment (LLM judge + DeBERTa NLI), hedge/polarity/
   quantifier/causality/citation-attachment shifts, locked-term consistency.
6. `repair` — regenerate only failing sentences with targeted feedback, max 3 attempts;
   otherwise keep the original and flag it. **Never ship an unverified change silently.**
7. `restore` / `export` — re-insert invariants, render to the original format.
8. `report` — fidelity score 0–100, per-sentence status (verified / kept original / needs review),
   reasons, naturalness score.

## LLM conventions

- SDK: official `anthropic` Python SDK only. API key from `ANTHROPIC_API_KEY` env var.
- Model IDs live in `config.py` (`VERITEXT_MODEL_REWRITE`, `_JUDGE`, `_CLASSIFY`). Defaults:
  rewrite `claude-opus-5-5`, verify/judge `claude-sonnet-5-5`, classify `claude-haiku-5-5`.
  Never hard-code a model ID anywhere else.
- Every prompt is a file in `services/engine/prompts/<name>/v<N>.md` with YAML front matter
  (`name`, `version`, `model_role`, `output_schema`) and a sibling `eval.yaml` test case.
  Load prompts through `veritext_engine.llm.prompts.load_prompt`. **No inline prompt strings.**
  Changing a prompt's behaviour = new version file, not an edit in place.
- Use prompt caching (`cache_control`) for system prompts and style profiles.
- Every judge/extraction call uses tool use / structured output with a Pydantic schema.
- Record input/output/cache tokens and cost per call, aggregated per job.
- Unit tests never hit the network: use the fake client in `tests/fakes.py`.

## Engineering standards

- **Python:** 3.12, `ruff check`, `ruff format`, `mypy --strict`, pytest + hypothesis.
  Pydantic v2 models for all stage I/O. No `Any` leaking across module boundaries.
- **TypeScript:** strict, ESLint (next/core-web-vitals + typescript), Prettier, Vitest,
  Playwright for e2e.
- Golden-file tests for LaTeX round-trips; output must compile with `tectonic`.
- Observability: structlog JSON logs, one OpenTelemetry span per pipeline stage,
  token/cost metrics.
- Secrets only via env (`.env`, never committed). Keep `.env.example` in sync with `config.py`.
- Privacy: zero retention by default (24h TTL unless saved), never train on customer content,
  per-tenant isolation in every query.

## Commands

Run from `veritext-stem/` unless stated otherwise.

| Task | Command |
| --- | --- |
| Everything (lint, types, tests) | `make check` |
| Engine deps | `cd services/engine && uv sync` |
| Engine lint / types / tests | `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest` (in `services/engine`) |
| Engine dev server | `uv run uvicorn veritext_engine.main:app --reload` (in `services/engine`) |
| Web deps | `pnpm install` |
| Web lint / types / tests | `pnpm -r lint && pnpm -r typecheck && pnpm -r test` |
| Web dev server | `pnpm --filter web dev` → http://localhost:3000 (expects the engine on :8000, `ENGINE_URL`) |
| Preview build + e2e | `pnpm --filter web build:preview && pnpm --filter web e2e` |
| Benchmark smoke | not built yet (Phase 2) |

## Phase discipline

Work phase by phase (see plan). At the end of each phase: run all checks, commit, report status.

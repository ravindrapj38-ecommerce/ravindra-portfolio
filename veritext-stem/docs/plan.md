# Veritext STEM — build plan

This is the working plan. Each phase ends with: all tests green → commit → short status.
Decisions taken along the way are recorded in [`decisions.md`](decisions.md).

## Status

| Milestone | State |
| --- | --- |
| Milestone 1 — first working version (below) | Landed on `claude/project-thread-kwo90h`, draft PR open |
| Phase 0 infra items (Postgres, Redis, MinIO, worker, compose, OTel) | Not started; not needed until jobs and accounts exist |
| Phases 2–6 | Not started |

## Milestone 1 — first working version (landed)

Done:
- Web app (Next.js 15): paste or upload plain text, Markdown or LaTeX; pick discipline (physics,
  chemistry, biology, CS/ML, engineering, maths) and register (journal, thesis, lab report,
  explainer); sample paragraph loaded on first open.
- Lock and restore: equations, numbers with units, citations, cross-references, chemical formulas,
  gene/protein names, species, acronyms, code, URLs, DOIs and LaTeX markup. Restore is exact
  (Hypothesis + randomised tests in both languages).
- Sentence checks after rewriting (D-011): locked items, numbers, hedging, causal vs correlational,
  negation, citation attachment; up to 3 retries with the failure reasons, then keep the original.
- Report: side-by-side word diff, fidelity score, per-sentence status (verified / kept original /
  needs review) with reasons, locked-items table, overused-phrase writing-quality panel.
- FastAPI engine (`POST /v1/rewrite`, `GET /v1/sample`, `GET /v1/meta`, `GET /healthz`), Claude
  provider via tool use, offline demo provider (D-014). In-browser TypeScript core with enforced
  parity (D-012, D-013). Preview published as an artifact (D-017).

Still missing (next):
- Real deployment; preview is an artifact.
- NLI / LLM-judge entailment and claim extraction (Phase 2); quantifier checks; sympy/pint checks.
- STEM-FidelityBench (smoke run becomes a CI gate once it exists).
- DOCX / ipynb input, download in the original format beyond plain files, KaTeX rendering.
- Token and cost accounting, structured logging, persistence, auth, billing.

## Phase 0 — Scaffold

Goal: an empty-but-real monorepo where every later phase only *adds* modules.

| Area | Deliverable |
| --- | --- |
| Conventions | `CLAUDE.md` (architecture, conventions, commands), `docs/decisions.md`, this plan |
| Workspace | pnpm workspace (`apps/*`, `packages/*`), uv project for `services/engine`, `.editorconfig`, Prettier, `.env.example`, `.gitignore` |
| Engine | FastAPI app factory, `pydantic-settings` config (model IDs in config), `/healthz` (liveness) + `/readyz` (Postgres, Redis, S3 probes), structlog JSON logs, OpenTelemetry setup (no-op unless an OTLP endpoint is set), SQLAlchemy 2 base + Alembic env, `arq` worker skeleton, `veritext` CLI skeleton (Typer), pipeline package with typed stage stubs, versioned prompt registry (`services/engine/prompts/`) |
| Web | Next.js 15 App Router, TS strict, Tailwind, shadcn/ui config + `cn` util, ESLint + Prettier, `/api/health` route that also reports engine health, landing placeholder, Vitest unit test, Playwright smoke test |
| Benchmark | `benchmarks/stem_fidelitybench/` package skeleton: item schema (Pydantic), loader, `smoke` command used by CI |
| Infra | Docker Compose: `postgres`, `redis`, `minio` (+ bucket init), `engine`, `worker`, `web`; Dockerfiles with healthchecks |
| CI | GitHub Actions: engine (ruff, ruff format --check, mypy --strict, pytest), web (eslint, prettier --check, tsc, vitest, next build, Playwright smoke), benchmark smoke, `docker compose config` validation |

Exit criteria: `make check` (or the per-package commands in `CLAUDE.md`) is green locally;
the CI workflow is valid; `docker compose config` validates.

## Phase 1 — Engine core
Document tree with source spans; parsers for text / Markdown / LaTeX; protect (placeholder
table) → rewrite (Opus, prompt-cached) → verify (placeholder integrity, numbers/units via
`pint`, sympy for worded math, locked terms) → repair (≤3, else keep original) → restore.
`veritext rewrite file.tex --discipline physics`. Hypothesis property test: protect∘restore = id.
Golden LaTeX round-trip tests compiled with `tectonic`.

## Phase 2 — Claims, NLI, fidelity report, bench v0
Claim extraction prompt + schema, bidirectional entailment (Sonnet judge via tool use +
DeBERTa NLI), hedge/polarity/quantifier/causality/citation-attachment diffing, fidelity
report JSON + score. STEM-FidelityBench with 40 seed items, adversarial injection set, metrics.

## Phase 3 — Web editor
Monaco source view, KaTeX rendering, word-level diff, claim hover, per-sentence
accept/reject/regenerate, report panel, upload/download in original format.

## Phase 4 — Style & naturalness
Discipline/register profiles, personal voice fingerprint, versioned AI-pattern linter,
naturalness metrics (variance, MTLD, nominalisations, hedge density, readability),
non-native English mode.

## Phase 5 — Platform
Auth.js, Stripe (credits + subscriptions), public `/v1` API with keys, rate limits,
webhooks, OpenAPI; team workspaces, audit log, 24h retention, PII warning, AI-use
disclosure helper.

## Phase 6 — Scale & launch
Bench to 300 items + HTML leaderboard, release gates in CI, cost tuning (batching,
caching, Haiku for cheap checks), admin margin dashboard, landing page.

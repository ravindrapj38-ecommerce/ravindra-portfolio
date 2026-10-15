# Veritext STEM

Rewrites AI-drafted STEM text into natural, expert prose and proves, sentence by sentence, that the
meaning survived. See [`CLAUDE.md`](CLAUDE.md), [`docs/plan.md`](docs/plan.md) and
[`docs/decisions.md`](docs/decisions.md).

## Run locally

```bash
cd veritext-stem
cp .env.example .env            # add ANTHROPIC_API_KEY for real Claude rewrites (optional)
(cd services/engine && uv sync && uv run uvicorn veritext_engine.main:app --port 8000) &
pnpm install && pnpm --filter web dev   # http://localhost:3000
```

Without an API key the engine uses the offline demo rewriter (phrase-level edits). Without the engine
the page falls back to the same demo running in the browser.

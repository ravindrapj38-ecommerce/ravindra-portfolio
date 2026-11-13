# Veritext STEM

Rewrites AI-drafted or second-language STEM text into natural expert prose and shows, sentence by
sentence, that the meaning survived: equations, numbers, citations and names are locked and restored
exactly, and a rewrite that changes certainty, causality or a negation is rejected.

It is built to be sold. One deployable web app contains the landing page, pricing, the product,
plan limits, license-key activation and cost tracking.

| Plan | Price | Includes |
| --- | --- | --- |
| Free | $0 | 1,500 words/month, 600 words per run, plain text and Markdown |
| Researcher | $12/month or $96/year | 50,000 words/month, 10,000 per run, LaTeX, downloads, fidelity report |
| Thesis pack | $29 once | 100,000 words that never expire, everything in Researcher |
| Lab | from $39/seat | Sold by email for now |

Prices and limits live in `apps/web/lib/plans.ts`.

## How the money flows

1. A visitor uses the Free plan with no account. The server meters words per browser (signed cookie),
   with a higher cap per IP address as an abuse backstop.
2. At a limit (words used, text too long, LaTeX, downloads) the app shows an upgrade prompt that links
   to your Lemon Squeezy checkout.
3. Lemon Squeezy takes the payment, handles sales tax/VAT as Merchant of Record, and emails the buyer
   a license key.
4. The buyer pastes the key in the app. The server validates it with Lemon Squeezy, maps the
   purchased variant to a plan, and meters words against that license. Keys are re-checked every
   6 hours, so a cancelled, expired or refunded purchase loses access.
5. Every run records words, tokens and model cost. `GET /api/admin/stats` shows cost per 1,000 words
   against the price.

All limits are enforced on the server (`apps/web/lib/server/`); the browser only displays them.

## Go-live checklist

None of this can be done from the repository; each step needs your own accounts.

1. **Anthropic**: create an API key at console.anthropic.com and add credit.
2. **Lemon Squeezy**: create a store. Create product **Veritext Researcher** as a subscription with
   two variants ($12/month, $96/year), and product **Veritext Thesis pack** as a single payment ($29).
   On both, turn on **License keys**: for the subscription, key length follows the subscription; for
   the pack, keys do not expire. Note the store ID, the three variant IDs and the three checkout
   links. Set each product's post-purchase redirect to `https://YOUR-SITE/app?welcome=1`.
3. **Upstash**: create a Redis database (free tier) and copy the REST URL and token.
4. **Deploy** on Vercel: import this repository, set the root directory to `veritext-stem/apps/web`,
   and add the variables from [`.env.example`](.env.example). Generate `VERITEXT_SESSION_SECRET` and
   `VERITEXT_ADMIN_TOKEN` with `openssl rand -hex 32`. Long documents need a function duration of up
   to 300 s; the rewrite route already asks for it.
5. **Check the configuration**:
   `VERITEXT_ADMIN_TOKEN=... pnpm --filter web launch-check https://YOUR-SITE` lists anything missing.
6. **Test a purchase** in Lemon Squeezy test mode with `VERITEXT_ALLOW_TEST_KEYS=1`: buy, paste the
   emailed key, run a LaTeX file, confirm the word count drops. Then remove that variable.
7. **Read the legal pages** (`/legal/terms`, `/legal/privacy`, `/legal/refunds`), set
   `VERITEXT_OWNER_NAME` and `VERITEXT_SUPPORT_EMAIL`, and change the refund terms to what you will
   honour. Lemon Squeezy reviews these pages when approving a store.
8. **Watch the margin** for the first week with `/api/admin/stats`. Expected model cost is roughly
   $0.05 to $0.10 per 1,000 words on `claude-opus-5-5` at low effort. That is an estimate from token
   arithmetic, not a measurement; the stats endpoint gives the real figure. If it is higher, keep
   `VERITEXT_EFFORT=low` and adjust the allowances in `lib/plans.ts`.

## Run locally

```bash
cd veritext-stem
pnpm install
cp .env.example apps/web/.env.local     # add ANTHROPIC_API_KEY for real rewrites (optional)
pnpm --filter web dev                   # http://localhost:3000
```

Without an API key the app uses a demo rewriter (phrase-level edits) and charges no words. Without
Upstash, usage is kept in memory.

## Checks

```bash
make check     # engine: ruff, mypy, pytest; web: eslint, tsc, vitest, build, Playwright
```

The Playwright suite runs the built app against local stand-ins for Lemon Squeezy and the Anthropic
API (`apps/web/e2e/mock-services.mjs`) and covers the whole paid path in a browser.

## Not built yet

- Accounts, team workspaces and seat billing (the Lab plan is sold by email).
- Lemon Squeezy webhooks; access changes are picked up by the 6-hourly license re-check instead.
- NLI / LLM-judge entailment and claim extraction; the checks are rule-based.
- DOCX and Jupyter input; the benchmark.

See [`CLAUDE.md`](CLAUDE.md), [`docs/plan.md`](docs/plan.md) and [`docs/decisions.md`](docs/decisions.md).

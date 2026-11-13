import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/Site";
import { SentenceRow } from "@/components/Workbench";
import { exampleReport } from "@/lib/example";
import { PLANS, PRICES } from "@/lib/plans";
import { site } from "@/lib/site";

const n = (x: number) => x.toLocaleString("en-US");

const LOCKED = [
  ["Equations", "Inline and display math, LaTeX environments"],
  ["Numbers and units", "Values, uncertainties, ranges, percentages"],
  ["Citations and references", "\\cite{}, [12], (Lee et al., 2019), Fig. and Eq. references"],
  ["Names", "Chemical formulas, genes and proteins, species, acronyms"],
  ["Code and links", "Code spans, URLs and DOIs"],
] as const;

const STEPS = [
  ["Lock", "Equations, numbers, citations and technical names are swapped for sealed tokens before any rewriting, so the model never gets to retype them."],
  ["Rewrite", "Claude rewrites each paragraph for your discipline and register: plainer verbs, varied rhythm, no stock phrases."],
  ["Check", "Every sentence is compared with its original. A rewrite that changes certainty, causality, a negation, a number or a citation is rejected and retried."],
  ["Report", "After three failed tries the original sentence is kept. You see which sentences changed, which were kept, and why."],
] as const;

const FAQ: [string, string][] = [
  [
    "Does this help text get past AI detectors?",
    "No. Veritext does not test against, target or integrate with any AI-detection tool, and we make no claim about detector scores. It is an editing tool: it improves how the text reads and proves the meaning did not move. The app also writes an accurate AI-use statement for your journal.",
  ],
  [
    "What exactly is checked?",
    "For each sentence: every locked item appears exactly once and unchanged; no number was added or lost; hedged claims stay hedged and firm claims stay firm; causal wording stays causal and correlational stays correlational; negations are kept; each citation stays with the claim it supported. These are rule-based checks. They are strict by design, so they sometimes keep an original sentence that a human would have accepted. You remain responsible for the final text.",
  ],
  [
    "Is my manuscript stored?",
    "No. Your text is processed in memory, sent to Anthropic's API for the rewrite, and returned to your browser. We keep word counts for billing, not content. Anthropic does not train its models on API data by default.",
  ],
  [
    "How do I get access after paying?",
    "Checkout is handled by Lemon Squeezy. Your license key arrives by email within a minute. Open the app, choose “I have a license key”, paste it, and the paid plan is active in that browser. The same key works on your other devices.",
  ],
  [
    "Which formats work?",
    "Plain text and Markdown on every plan. LaTeX (.tex, including text pasted from Overleaf) on paid plans: preamble, environments, labels and macros are preserved and only prose is rewritten.",
  ],
  [
    "What counts as a word?",
    "Every whitespace-separated token in the text you submit, including sentences the checks decide to keep. If the model cannot be reached, the run is not charged.",
  ],
  [
    "Can I cancel or get a refund?",
    "Cancel any time from the billing link in your receipt; the plan stays active until the period ends. If the product did not work for you, ask within 14 days of your first payment and we refund it.",
  ],
];

export default async function Home() {
  const s = site();
  const example = await exampleReport();
  const rows = example.sentences.slice(0, 3);
  return (
    <div className="vx-shell vx-landing">
      <SiteNav />

      <header className="vx-hero">
        <p className="vx-label m-0">For papers, theses and lab reports</p>
        <h1 className="vx-display">
          Rewrite your STEM draft into natural expert prose. Keep every number, equation and citation exactly as it was.
        </h1>
        <p className="vx-lede">
          Other rewriters ask you to trust them. Veritext locks what must not change, checks each rewritten sentence
          against the original, and shows you a report of what it verified and what it refused to change.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link className="vx-btn vx-btn-primary vx-btn-lg" href="/app" data-testid="cta-try">
            Try it free
          </Link>
          <a className="vx-btn vx-btn-lg" href="#pricing">
            See pricing
          </a>
          <span className="text-[13.5px]" style={{ color: "var(--muted)" }}>
            No account needed. {n(PLANS.free.words)} words a month free.
          </span>
        </div>
      </header>

      <section className="grid gap-3" aria-label="Example">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="vx-display vx-h2">A real run on a sample paragraph</h2>
          <span className="text-[13px]" style={{ color: "var(--muted)" }}>
            {example.locked.length} items locked · fidelity score {example.fidelity_score}
          </span>
        </div>
        <div className="vx-panel overflow-hidden">
          <div className="vx-row vx-row-head vx-label" style={{ background: "var(--paper)", borderTop: 0 }}>
            <div style={{ paddingBlock: 8 }}>Original</div>
            <div style={{ paddingBlock: 8 }}>Rewrite</div>
          </div>
          {rows.map((r) => (
            <SentenceRow key={r.id} s={r} />
          ))}
        </div>
        <p className="m-0 text-[13.5px]" style={{ color: "var(--muted)", maxWidth: "80ch" }}>
          In the second sentence the rewrite turned “suggest … may decrease” into “prove … decreases”. That changes the
          claim, so it was rejected and the original sentence was kept.
        </p>
      </section>

      <section className="grid gap-4" aria-label="What stays locked">
        <h2 className="vx-display vx-h2">What is locked before rewriting</h2>
        <ul className="vx-cards">
          {LOCKED.map(([title, body]) => (
            <li key={title} className="vx-panel vx-card">
              <strong>{title}</strong>
              <span>{body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className="grid gap-4" aria-label="How it works">
        <h2 className="vx-display vx-h2">How it works</h2>
        <ol className="vx-steps">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="vx-panel vx-card">
              <span className="vx-step-n vx-num">{i + 1}</span>
              <strong>{title}</strong>
              <span>{body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="grid gap-4" aria-label="Pricing">
        <h2 className="vx-display vx-h2">Pricing</h2>
        <div className="vx-prices">
          <div className="vx-panel vx-price">
            <h3>Free</h3>
            <p className="vx-price-n">
              <span className="vx-display">$0</span>
            </p>
            <ul>
              <li>{n(PLANS.free.words)} words a month</li>
              <li>Up to {n(PLANS.free.maxWordsPerRun)} words per run</li>
              <li>Plain text and Markdown</li>
              <li>Full sentence-by-sentence report on screen</li>
              <li>AI-use statement for your journal</li>
            </ul>
            <Link className="vx-btn" href="/app">
              Start free
            </Link>
          </div>

          <div className="vx-panel vx-price vx-price-main">
            <h3>Researcher</h3>
            <p className="vx-price-n">
              <span className="vx-display">${PRICES.monthly}</span> / month
            </p>
            <ul>
              <li>{n(PLANS.researcher.words)} words a month (about six full papers)</li>
              <li>Up to {n(PLANS.researcher.maxWordsPerRun)} words per run</li>
              <li>LaTeX documents, structure preserved</li>
              <li>Download the file and the fidelity report</li>
              <li>Cancel any time</li>
            </ul>
            <a className="vx-btn vx-btn-primary" href={s.checkout("monthly")} data-testid="buy-monthly">
              Subscribe monthly
            </a>
            <a className="vx-btn" href={s.checkout("yearly")} data-testid="buy-yearly">
              Yearly: ${PRICES.yearly} (${PRICES.yearly / 12}/month)
            </a>
          </div>

          <div className="vx-panel vx-price">
            <h3>Thesis pack</h3>
            <p className="vx-price-n">
              <span className="vx-display">${PRICES.pack}</span> once
            </p>
            <ul>
              <li>{n(PLANS.pack.words)} words, no expiry</li>
              <li>Everything in Researcher</li>
              <li>No subscription</li>
              <li>Enough for a full thesis</li>
            </ul>
            <a className="vx-btn" href={s.checkout("pack")} data-testid="buy-pack">
              Buy a pack
            </a>
          </div>
        </div>
        <p className="m-0 text-[14px]" style={{ color: "var(--muted)" }}>
          Lab or department? Shared plans start at ${PRICES.labSeat} per seat a month. <a href={s.labMail}>Write to us</a>.
          Prices in USD; tax is calculated at checkout.
        </p>
      </section>

      <section id="faq" className="grid gap-3" aria-label="Questions">
        <h2 className="vx-display vx-h2">Questions</h2>
        <div className="vx-panel vx-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="vx-panel vx-cta">
        <h2 className="vx-display vx-h2 m-0">Paste a paragraph and see the report.</h2>
        <Link className="vx-btn vx-btn-primary vx-btn-lg" href="/app">
          Try it free
        </Link>
      </section>

      <SiteFooter />
    </div>
  );
}

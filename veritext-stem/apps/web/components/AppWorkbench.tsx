"use client";

// The product page. Rewrites run on the server (/api/rewrite), which enforces the plan: words per
// month, words per run and formats. This component shows the account, the upgrade prompt and the
// license-key form; it never decides what the visitor is allowed to do.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Workbench, { type EngineOption } from "@/components/Workbench";
import type { Report } from "@/lib/core/types";
import { PLANS, PRICES, type Account } from "@/lib/plans";

type PaywallCode = "format_locked" | "too_long" | "quota" | "export";

class PaywallError extends Error {
  constructor(
    public code: PaywallCode,
    message: string,
  ) {
    super(message);
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function AppWorkbench({ sample }: { sample: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [exportPrompt, setExportPrompt] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.has("welcome") || params.has("license_key")) setKeyOpen(true);
    fetch("/api/me")
      .then((r) => r.json())
      .then((b: { account: Account; notice: string | null }) => {
        setAccount(b.account);
        setNotice(b.notice);
      })
      .catch(() => setNotice("Could not load your account. Reload the page to try again."));
  }, []);

  const engines = useMemo<EngineOption[]>(
    () => [
      {
        id: "server",
        label: "Veritext",
        description: "Claude rewrite with sentence-level checks",
        async run(input, onProgress) {
          const res = await fetch("/api/rewrite", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          });
          if (res.status === 402) {
            const b = (await res.json()) as { code: PaywallCode; message: string; account: Account };
            setAccount(b.account);
            throw new PaywallError(b.code, b.message);
          }
          if (!res.ok || !res.body) {
            const b = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(b.message ?? `The rewrite failed (HTTP ${res.status}). You were not charged.`);
          }
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let report: Report | null = null;
          const handle = (line: string) => {
            if (!line.trim()) return;
            const ev = JSON.parse(line) as
              | { type: "progress"; done: number; total: number }
              | { type: "result"; report: Report; account: Account }
              | { type: "error"; message: string };
            if (ev.type === "progress") onProgress(ev.done, ev.total);
            else if (ev.type === "error") throw new Error(ev.message);
            else {
              report = ev.report;
              setAccount(ev.account);
            }
          };
          for (;;) {
            const { done, value } = await reader.read();
            buf += dec.decode(value, { stream: !done });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            lines.forEach(handle);
            if (done) break;
          }
          handle(buf);
          if (!report) throw new Error("The connection dropped before the rewrite finished. You were not charged.");
          setExportPrompt(false);
          return report;
        },
      },
    ],
    [],
  );

  const paid = account ? account.plan !== "free" : false;
  const onLocked = useCallback(() => setExportPrompt(true), []);

  const header = (
    <>
      <nav className="vx-nav" aria-label="Main">
        <Link href="/" className="vx-brand">
          Veritext <span>STEM</span>
        </Link>
        <span className="vx-nav-links">
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#how">How it works</Link>
        </span>
      </nav>
      <AccountBar account={account} onEnterKey={() => setKeyOpen(true)} onSignedOut={setAccount} />
      {notice ? (
        <p className="vx-note vx-note-warn m-0" role="status">
          {notice}
        </p>
      ) : null}
      {account && !account.live ? (
        <p className="vx-note vx-note-warn m-0">
          Preview mode: no AI model is connected on this server, so rewrites are limited to phrase-level edits and are
          not counted against any plan.
        </p>
      ) : null}
      {keyOpen ? (
        <LicenseForm
          onClose={() => setKeyOpen(false)}
          onActivated={(a) => {
            setAccount(a);
            setNotice(null);
            setKeyOpen(false);
          }}
        />
      ) : null}
      {exportPrompt && account && !paid ? (
        <Upgrade
          account={account}
          title="Downloads are part of the paid plans"
          message="Copying the rewritten text is free. Downloading the file in its original format and the fidelity report needs a paid plan."
          onEnterKey={() => setKeyOpen(true)}
        />
      ) : null}
    </>
  );

  return (
    <Workbench
      engines={engines}
      initialText={sample}
      header={header}
      canDownload={Boolean(account?.exports)}
      onLocked={onLocked}
      wordNote={(words) =>
        account ? (
          words > account.maxWordsPerRun ? (
            <span style={{ color: "var(--bad)" }}>over the {fmt(account.maxWordsPerRun)}-word limit per run</span>
          ) : account.live && words > account.wordsLeft ? (
            <span style={{ color: "var(--bad)" }}>more than the {fmt(account.wordsLeft)} words you have left</span>
          ) : (
            <>up to {fmt(account.maxWordsPerRun)} words per run</>
          )
        ) : null
      }
      renderError={(e) =>
        e instanceof PaywallError && account ? (
          <Upgrade
            account={account}
            title={
              e.code === "quota"
                ? "You have used your words"
                : e.code === "too_long"
                  ? "This text is too long for one run"
                  : "LaTeX needs a paid plan"
            }
            message={e.message}
            onEnterKey={() => setKeyOpen(true)}
          />
        ) : null
      }
    />
  );
}

function AccountBar({
  account,
  onEnterKey,
  onSignedOut,
}: {
  account: Account | null;
  onEnterKey: () => void;
  onSignedOut: (a: Account) => void;
}) {
  if (!account) return <div className="vx-account vx-panel" aria-busy="true" style={{ minHeight: 58 }} />;
  const pct = Math.min(100, (100 * account.wordsUsed) / Math.max(1, account.wordsIncluded));
  const paid = account.plan !== "free";
  return (
    <section className="vx-account vx-panel" aria-label="Your plan" data-testid="account" data-plan={account.plan}>
      <div className="grid gap-1">
        <span className="vx-label">Plan</span>
        <span className="font-semibold" data-testid="plan-name">
          {account.planName}
          {account.email ? <span className="font-normal" style={{ color: "var(--muted)" }}> · {account.email}</span> : null}
        </span>
      </div>
      <div className="grid min-w-[200px] flex-1 gap-1">
        <span className="vx-label">{account.period === "month" ? "Words this month" : "Words in your pack"}</span>
        <div className="vx-meter" role="img" aria-label={`${fmt(account.wordsUsed)} of ${fmt(account.wordsIncluded)} words used`}>
          <span style={{ width: `${pct}%`, background: pct >= 100 ? "var(--bad)" : "var(--accent)" }} />
        </div>
        <span className="vx-num text-[13px]" style={{ color: "var(--muted)" }} data-testid="words-left">
          {fmt(account.wordsLeft)} of {fmt(account.wordsIncluded)} left
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {paid ? (
          <>
            {account.billingPortal ? (
              <a className="vx-btn" href={account.billingPortal} target="_blank" rel="noreferrer">
                Manage billing
              </a>
            ) : null}
            <button
              type="button"
              className="vx-btn"
              onClick={() =>
                fetch("/api/license", { method: "DELETE" })
                  .then((r) => r.json())
                  .then((b: { account: Account }) => onSignedOut(b.account))
                  .catch(() => undefined)
              }
            >
              Remove key
            </button>
          </>
        ) : (
          <>
            <button type="button" className="vx-btn" onClick={onEnterKey} data-testid="enter-key">
              I have a license key
            </button>
            <Link className="vx-btn vx-btn-primary" href="/#pricing">
              Upgrade
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

export function checkoutHref(account: Pick<Account, "checkout" | "supportEmail">, kind: keyof Account["checkout"]): string {
  return account.checkout[kind] || `mailto:${account.supportEmail}?subject=${encodeURIComponent("Veritext STEM: I would like to buy a plan")}`;
}

function Upgrade({ account, title, message, onEnterKey }: { account: Account; title: string; message: string; onEnterKey: () => void }) {
  const paid = account.plan !== "free";
  return (
    <section className="vx-upgrade vx-panel" role="alert" data-testid="paywall">
      <div className="grid gap-1">
        <h2 className="vx-display m-0 text-[20px]">{title}</h2>
        <p className="m-0" style={{ color: "var(--muted)" }}>
          {message}
        </p>
      </div>
      <div className="vx-upgrade-options">
        {account.plan !== "researcher" ? (
          <a className="vx-option" href={checkoutHref(account, "monthly")} data-testid="buy-monthly">
            <strong>Researcher · ${PRICES.monthly}/month</strong>
            <span>
              {fmt(PLANS.researcher.words)} words a month, LaTeX, downloads and fidelity reports. Or ${PRICES.yearly}/year.
            </span>
          </a>
        ) : null}
        <a className="vx-option" href={checkoutHref(account, "pack")} data-testid="buy-pack">
          <strong>Thesis pack · ${PRICES.pack} once</strong>
          <span>{fmt(PLANS.pack.words)} words that never expire. No subscription.</span>
        </a>
      </div>
      <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
        {paid ? "A new purchase comes with a new key. " : "Your license key arrives by email right after checkout. "}
        <button type="button" className="vx-link" onClick={onEnterKey}>
          Enter a license key
        </button>
      </p>
    </section>
  );
}

function LicenseForm({ onClose, onActivated }: { onClose: () => void; onActivated: (a: Account) => void }) {
  const [key, setKey] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("license_key") ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = (await res.json()) as { account?: Account; message?: string };
      if (!res.ok || !body.account) throw new Error(body.message ?? "That key could not be activated.");
      window.history.replaceState(null, "", window.location.pathname);
      onActivated(body.account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That key could not be activated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="vx-panel grid gap-3 p-4" onSubmit={submit} aria-label="Activate a license key">
      <label className="grid gap-1" htmlFor="vx-license-key">
        <span className="vx-label">License key</span>
        <span className="text-[13px]" style={{ color: "var(--muted)" }}>
          It is in the receipt email from Lemon Squeezy, sent right after you pay.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="vx-license-key"
          className="vx-field vx-mono min-w-[260px] flex-1"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <button type="submit" className="vx-btn vx-btn-primary" disabled={busy || !key.trim()} data-testid="activate">
          {busy ? "Checking…" : "Activate"}
        </button>
        <button type="button" className="vx-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error ? (
        <p className="vx-note vx-note-bad m-0" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

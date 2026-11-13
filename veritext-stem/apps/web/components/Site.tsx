// Shared chrome for the marketing and legal pages (server components).
import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/lib/site";

export function SiteNav() {
  return (
    <nav className="vx-nav" aria-label="Main">
      <Link href="/" className="vx-brand">
        Veritext <span>STEM</span>
      </Link>
      <span className="vx-nav-links">
        <Link href="/#how">How it works</Link>
        <Link href="/#pricing">Pricing</Link>
        <Link href="/#faq">FAQ</Link>
        <Link href="/app" className="vx-btn vx-btn-primary">
          Open the app
        </Link>
      </span>
    </nav>
  );
}

export function SiteFooter() {
  const s = site();
  return (
    <footer className="vx-footer">
      <span>
        © {new Date().getFullYear()} {s.owner}
      </span>
      <Link href="/legal/terms">Terms</Link>
      <Link href="/legal/privacy">Privacy</Link>
      <Link href="/legal/refunds">Refunds</Link>
      <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>
      <span className="vx-footer-note">
        Veritext does not measure, target or integrate with AI-detection tools. Payments are handled by Lemon Squeezy.
      </span>
    </footer>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="vx-shell">
      <SiteNav />
      <article className="vx-legal">
        <h1 className="vx-display">{title}</h1>
        <p className="vx-legal-updated">Last updated {updated}</p>
        {children}
      </article>
      <SiteFooter />
    </div>
  );
}

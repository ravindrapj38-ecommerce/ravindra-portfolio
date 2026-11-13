// Plans, prices and limits. The single source for the pricing page, the paywall and the server-side
// quota checks. Prices here are display values: keep them in sync with the Lemon Squeezy products.
import type { Format } from "@/lib/core/types";

export type PlanId = "free" | "researcher" | "pack";

export interface Plan {
  id: PlanId;
  name: string;
  /** Words included: per calendar month for free/researcher, in total for a pack. */
  words: number;
  period: "month" | "once";
  /** Largest single document, in words. */
  maxWordsPerRun: number;
  formats: Format[];
  /** Download the rewrite in its original format and the fidelity report as JSON. */
  exports: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    words: 1500,
    period: "month",
    maxWordsPerRun: 600,
    formats: ["text", "markdown"],
    exports: false,
  },
  researcher: {
    id: "researcher",
    name: "Researcher",
    words: 50_000,
    period: "month",
    maxWordsPerRun: 10_000,
    formats: ["text", "markdown", "latex"],
    exports: true,
  },
  pack: {
    id: "pack",
    name: "Thesis pack",
    words: 100_000,
    period: "once",
    maxWordsPerRun: 10_000,
    formats: ["text", "markdown", "latex"],
    exports: true,
  },
};

/** Display prices in USD. */
export const PRICES = { monthly: 12, yearly: 96, pack: 29, labSeat: 39 } as const;

export type CheckoutKind = "monthly" | "yearly" | "pack";

export const countWords = (text: string): number => (text.match(/\S+/g) ?? []).length;

/** What the browser is told about the current visitor. */
export interface Account {
  plan: PlanId;
  planName: string;
  period: "month" | "once";
  wordsIncluded: number;
  wordsUsed: number;
  wordsLeft: number;
  maxWordsPerRun: number;
  formats: Format[];
  exports: boolean;
  email: string | null;
  /** True when rewrites run on Claude; false when the server has no API key and uses the demo rewriter. */
  live: boolean;
  checkout: Record<CheckoutKind, string>;
  billingPortal: string;
  supportEmail: string;
}

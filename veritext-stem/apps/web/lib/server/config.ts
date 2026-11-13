// Server-side configuration. Everything comes from the environment (see .env.example); nothing here
// is sent to the browser except what /api/me chooses to return.
import type { CheckoutKind, PlanId } from "@/lib/plans";

const env = (name: string): string => (process.env[name] ?? "").trim();
const num = (name: string, fallback: number): number => {
  const v = Number(env(name));
  return env(name) && Number.isFinite(v) ? v : fallback;
};
const ids = (name: string): number[] =>
  env(name)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

export interface ModelPrice {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function config() {
  const model = env("VERITEXT_MODEL_REWRITE") || "claude-opus-5-5";
  return {
    // --- Rewriting -----------------------------------------------------------
    anthropicKey: env("ANTHROPIC_API_KEY"),
    model,
    effort: (env("VERITEXT_EFFORT") || "low") as "low" | "medium" | "high",
    concurrency: num("VERITEXT_CONCURRENCY", 6),
    maxRepairAttempts: num("VERITEXT_MAX_REPAIR_ATTEMPTS", 3),
    /** Optional FastAPI engine. When set, rewrites are proxied to it instead of running in this app. */
    engineUrl: env("ENGINE_URL").replace(/\/$/, ""),
    /** USD per million tokens for the rewrite model; override when Anthropic's prices change. */
    price: {
      input: num("VERITEXT_PRICE_INPUT", 4),
      output: num("VERITEXT_PRICE_OUTPUT", 20),
      cacheRead: num("VERITEXT_PRICE_CACHE_READ", 0.2),
      cacheWrite: num("VERITEXT_PRICE_CACHE_WRITE", 5),
    } satisfies ModelPrice,

    // --- Payments (Lemon Squeezy) --------------------------------------------
    lemonApi: env("LEMONSQUEEZY_API_URL") || "https://api.lemonsqueezy.com",
    storeId: num("LEMONSQUEEZY_STORE_ID", 0),
    variants: {
      researcher: ids("LEMONSQUEEZY_RESEARCHER_VARIANT_IDS"),
      pack: ids("LEMONSQUEEZY_PACK_VARIANT_IDS"),
    } satisfies Record<Exclude<PlanId, "free">, number[]>,
    checkout: {
      monthly: env("VERITEXT_CHECKOUT_MONTHLY"),
      yearly: env("VERITEXT_CHECKOUT_YEARLY"),
      pack: env("VERITEXT_CHECKOUT_PACK"),
    } satisfies Record<CheckoutKind, string>,
    billingPortal: env("VERITEXT_BILLING_PORTAL"),
    supportEmail: env("VERITEXT_SUPPORT_EMAIL") || "support@example.com",
    /** Free words per month for one IP address across all browsers (a campus shares an IP, so keep it generous). */
    freeIpWords: num("VERITEXT_FREE_IP_WORDS", 15_000),

    // --- Sessions, storage, admin ----------------------------------------------
    sessionSecret: env("VERITEXT_SESSION_SECRET"),
    upstashUrl: env("UPSTASH_REDIS_REST_URL").replace(/\/$/, ""),
    upstashToken: env("UPSTASH_REDIS_REST_TOKEN"),
    adminToken: env("VERITEXT_ADMIN_TOKEN"),
    production: process.env.NODE_ENV === "production",
  };
}

export type Config = ReturnType<typeof config>;

/** Things that must be fixed before taking real payments. Shown by /api/health and `pnpm launch-check`. */
export function launchProblems(c: Config = config()): string[] {
  const out: string[] = [];
  if (!c.anthropicKey && !c.engineUrl) out.push("ANTHROPIC_API_KEY is not set: rewrites use the demo rewriter.");
  if (c.sessionSecret.length < 32) out.push("VERITEXT_SESSION_SECRET must be at least 32 random characters.");
  if (!c.upstashUrl || !c.upstashToken)
    out.push("UPSTASH_REDIS_REST_URL / _TOKEN are not set: word usage is kept in memory and resets on restart.");
  if (!c.storeId) out.push("LEMONSQUEEZY_STORE_ID is not set: license keys from any store would be rejected.");
  if (!c.variants.researcher.length) out.push("LEMONSQUEEZY_RESEARCHER_VARIANT_IDS is not set.");
  if (!c.variants.pack.length) out.push("LEMONSQUEEZY_PACK_VARIANT_IDS is not set.");
  for (const k of ["monthly", "yearly", "pack"] as const)
    if (!/^https:\/\//.test(c.checkout[k])) out.push(`VERITEXT_CHECKOUT_${k.toUpperCase()} is not an https checkout link.`);
  if (!c.adminToken) out.push("VERITEXT_ADMIN_TOKEN is not set: /api/admin/stats is disabled.");
  if (c.supportEmail === "support@example.com") out.push("VERITEXT_SUPPORT_EMAIL is still the placeholder.");
  return out;
}

import { vi } from "vitest";
import { emptyUsage, type MeteredProvider } from "@/lib/server/anthropic-provider";
import { LICENSE_COOKIE, sign, type LicenseSession } from "@/lib/server/session";
import { MemoryStore, setStore } from "@/lib/server/store";

export const STORE_ID = 4242;
export const RESEARCHER_VARIANT = 111;
export const PACK_VARIANT = 222;

export function setupEnv(extra: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  const env: Record<string, string> = {
    VERITEXT_SESSION_SECRET: "test-secret-test-secret-test-secret-1234",
    LEMONSQUEEZY_STORE_ID: String(STORE_ID),
    LEMONSQUEEZY_RESEARCHER_VARIANT_IDS: `${RESEARCHER_VARIANT}, 112`,
    LEMONSQUEEZY_PACK_VARIANT_IDS: String(PACK_VARIANT),
    LEMONSQUEEZY_API_URL: "https://lemon.test",
    ANTHROPIC_API_KEY: "",
    ENGINE_URL: "",
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
    VERITEXT_ADMIN_TOKEN: "admin-token",
    ...extra,
  };
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const store = new MemoryStore();
  setStore(store);
  return store;
}

export function lemonResponse(over: { valid?: boolean; status?: string; store?: number; variant?: number; id?: number; test?: boolean } = {}) {
  return {
    valid: over.valid ?? true,
    error: null,
    license_key: { id: over.id ?? 9001, status: over.status ?? "active", test_mode: over.test ?? false },
    meta: { store_id: over.store ?? STORE_ID, variant_id: over.variant ?? RESEARCHER_VARIANT, customer_email: "ada@example.edu" },
  };
}

export const lemonFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

export function licenseCookie(over: Partial<LicenseSession> = {}): string {
  const session: LicenseSession = { key: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", licenseId: 9001, plan: "researcher", email: "ada@example.edu", checkedAt: Date.now(), ...over };
  return `${LICENSE_COOKIE}=${encodeURIComponent(sign(session)!)}`;
}

/** A provider that rewrites nothing-harmful: swaps one stock phrase, counts tokens like a model would. */
export function fakeProvider(opts: { fail?: boolean } = {}): MeteredProvider {
  const usage = emptyUsage();
  return {
    name: "anthropic",
    label: "Claude (test)",
    usage,
    async rewrite(req) {
      if (opts.fail) throw new Error("upstream down");
      usage.calls += 1;
      usage.input += 1000;
      usage.output += 500;
      return req.sentences.map((s) => s.replace("in order to", "to"));
    },
  };
}

export const words = (n: number, sentenceLen = 12) =>
  Array.from({ length: Math.ceil(n / sentenceLen) }, (_, i) =>
    Array.from({ length: Math.min(sentenceLen, n - i * sentenceLen) }, (_, j) => (j === 0 ? "The" : j === sentenceLen - 1 ? "sample." : "film")).join(" "),
  ).join(" ");

export function rewriteRequest(text: string, opts: { cookie?: string; ip?: string; format?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": opts.ip ?? "203.0.113.7" };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request("http://localhost/api/rewrite", {
    method: "POST",
    headers,
    body: JSON.stringify({ text, format: opts.format ?? "auto", discipline: "physics", register: "journal" }),
  });
}

export async function readEvents(res: Response) {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; [k: string]: unknown });
}

/** Cookies set by a response, as a Cookie header for the next request. */
export const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");

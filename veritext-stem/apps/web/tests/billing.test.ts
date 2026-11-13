// The money path: license validation, sessions, plan limits, word metering, refunds on failure.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as adminStats } from "@/app/api/admin/stats/route";
import { DELETE as removeKey, POST as activate } from "@/app/api/license/route";
import { GET as me } from "@/app/api/me/route";
import type { Report } from "@/lib/core/types";
import { disclosure } from "@/lib/disclosure";
import { PLANS, countWords, type Account } from "@/lib/plans";
import { anthropicProvider, costUsd, parseSentences } from "@/lib/server/anthropic-provider";
import { config, launchProblems } from "@/lib/server/config";
import { validateLicense } from "@/lib/server/license";
import { handleRewrite } from "@/lib/server/rewrite";
import { sign, verify } from "@/lib/server/session";
import { MemoryStore, UpstashStore } from "@/lib/server/store";
import { PACK_VARIANT, cookiesOf, fakeProvider, lemonFetch, lemonResponse, licenseCookie, readEvents, rewriteRequest, setupEnv, words } from "./helpers";

const KEY = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
const withProvider = { makeProvider: () => fakeProvider() };

beforeEach(() => {
  setupEnv();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("signed sessions", () => {
  it("round-trips and rejects tampering", () => {
    const token = sign({ id: "abc" })!;
    expect(verify<{ id: string }>(token)).toEqual({ id: "abc" });
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ id: "evil" })).toString("base64url");
    expect(verify(`${forged}.${mac}`)).toBeNull();
    expect(verify(`${payload}.AAAA`)).toBeNull();
    expect(verify("garbage")).toBeNull();
  });

  it("refuses to sign in production without a real secret", () => {
    setupEnv({ VERITEXT_SESSION_SECRET: "", NODE_ENV: "production" });
    expect(sign({ id: "abc" })).toBeNull();
  });
});

describe("license validation", () => {
  it("maps purchased variants to plans", async () => {
    expect(await validateLicense(KEY, config(), lemonFetch(lemonResponse()))).toEqual({ ok: true, licenseId: 9001, plan: "researcher", email: "ada@example.edu" });
    expect(await validateLicense(KEY, config(), lemonFetch(lemonResponse({ variant: PACK_VARIANT })))).toMatchObject({ ok: true, plan: "pack" });
    // An "inactive" key is one that has never been activated on a device; it is still a paid key.
    expect(await validateLicense(KEY, config(), lemonFetch(lemonResponse({ status: "inactive" })))).toMatchObject({ ok: true });
  });

  it("sends the key to Lemon Squeezy's validate endpoint", async () => {
    const f = lemonFetch(lemonResponse());
    await validateLicense(`  ${KEY} `, config(), f);
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://lemon.test/v1/licenses/validate");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe(`license_key=${KEY}`);
  });

  it.each([
    ["another store's key", lemonResponse({ store: 1 }), /different product/],
    ["an unknown variant", lemonResponse({ variant: 999 }), /different product/],
    ["an expired key", lemonResponse({ valid: false, status: "expired" }), /expired/],
    ["a disabled key", lemonResponse({ status: "disabled" }), /disabled/],
    ["an unknown key", { valid: false, error: "license_key not found." }, /not found/],
  ])("rejects %s", async (_name, body, message) => {
    const res = await validateLicense(KEY, config(), lemonFetch(body, body.valid ? 200 : 404));
    expect(res).toMatchObject({ ok: false, reason: "invalid" });
    expect(res.ok ? "" : res.message).toMatch(message);
  });

  it("rejects malformed keys without calling the API", async () => {
    const f = lemonFetch(lemonResponse());
    expect(await validateLicense("nope", config(), f)).toMatchObject({ ok: false, reason: "invalid" });
    expect(f).not.toHaveBeenCalled();
  });

  it("treats outages as 'unreachable', not 'invalid'", async () => {
    expect(await validateLicense(KEY, config(), lemonFetch({}, 503))).toMatchObject({ ok: false, reason: "unreachable" });
    const down = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await validateLicense(KEY, config(), down)).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("rejects everything when the store id is not configured", async () => {
    setupEnv({ LEMONSQUEEZY_STORE_ID: "" });
    expect(await validateLicense(KEY, config(), lemonFetch(lemonResponse()))).toMatchObject({ ok: false });
  });

  it("rejects test-mode keys in production unless explicitly allowed", async () => {
    setupEnv({ NODE_ENV: "production" });
    expect(await validateLicense(KEY, config(), lemonFetch(lemonResponse({ test: true })))).toMatchObject({ ok: false });
    setupEnv({ NODE_ENV: "production", VERITEXT_ALLOW_TEST_KEYS: "1" });
    expect(await validateLicense(KEY, config(), lemonFetch(lemonResponse({ test: true })))).toMatchObject({ ok: true });
  });
});

describe("free plan", () => {
  it("rewrites, charges the words and reports the balance", async () => {
    const text = words(240);
    const res = await handleRewrite(rewriteRequest(text), withProvider);
    expect(res.status).toBe(200);
    const events = await readEvents(res);
    const result = events.at(-1)!;
    expect(result.type).toBe("result");
    expect(result.words_charged).toBe(240);
    expect((result.account as Account).wordsLeft).toBe(PLANS.free.words - 240);
    expect((result.report as Report).provider).toBe("anthropic");
    expect(events.some((e) => e.type === "progress")).toBe(true);
  });

  it("stops at the monthly allowance and never goes over it", async () => {
    let cookie = "";
    for (let i = 0; i < 2; i++) {
      const res = await handleRewrite(rewriteRequest(words(600), { cookie }), withProvider);
      expect(res.status).toBe(200);
      cookie = cookiesOf(res) || cookie;
      await res.text();
    }
    const over = await handleRewrite(rewriteRequest(words(400), { cookie }), withProvider);
    expect(over.status).toBe(402);
    const body = (await over.json()) as { code: string; account: Account };
    expect(body.code).toBe("quota");
    expect(body.account.wordsLeft).toBe(300);
    // The failed attempt reserved nothing: exactly 300 words still fit.
    const fits = await handleRewrite(rewriteRequest(words(300), { cookie }), withProvider);
    expect(fits.status).toBe(200);
    const last = (await readEvents(fits)).at(-1)!;
    expect((last.account as Account).wordsLeft).toBe(0);
  });

  it("gives each browser its own allowance, with a higher cap per IP address", async () => {
    setupEnv({ VERITEXT_FREE_IP_WORDS: "2000" });
    // Three browsers behind one address (no cookies sent, so each request is a new browser).
    for (let i = 0; i < 3; i++) {
      const res = await handleRewrite(rewriteRequest(words(600)), withProvider);
      expect(res.status).toBe(200);
      await res.text();
    }
    // 1,800 of the address's 2,000 are used: a fourth new browser cannot run 600 more…
    const capped = await handleRewrite(rewriteRequest(words(600)), withProvider);
    expect(capped.status).toBe(402);
    expect(((await capped.json()) as { account: Account }).account.wordsLeft).toBe(200);
    // …but another address is unaffected.
    const other = await handleRewrite(rewriteRequest(words(600), { ip: "198.51.100.9" }), withProvider);
    expect(other.status).toBe(200);
  });

  it("limits the size of one run", async () => {
    const res = await handleRewrite(rewriteRequest(words(PLANS.free.maxWordsPerRun + 1)), withProvider);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { code: string }).code).toBe("too_long");
  });

  it("keeps LaTeX for paid plans", async () => {
    const tex = "\\section{Results}\nThe films were measured at 300 K in order to compare them \\cite{lee2019}.";
    const res = await handleRewrite(rewriteRequest(tex), withProvider);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { code: string }).code).toBe("format_locked");
    const forced = await handleRewrite(rewriteRequest("Plain words here.", { format: "latex" }), withProvider);
    expect(forced.status).toBe(402);
  });

  it("does not charge when the model cannot be reached", async () => {
    const res = await handleRewrite(rewriteRequest(words(240)), { makeProvider: () => fakeProvider({ fail: true }) });
    const result = (await readEvents(res)).at(-1)!;
    expect(result.words_charged).toBe(0);
    expect((result.account as Account).wordsUsed).toBe(0);
    expect((result.report as Report).output).toBe(words(240));
  });

  it("does not meter the demo rewriter (no API key configured)", async () => {
    const res = await handleRewrite(rewriteRequest(words(240)));
    const result = (await readEvents(res)).at(-1)!;
    expect((result.report as Report).provider).toBe("demo");
    expect(result.words_charged).toBe(0);
    expect((result.account as Account).live).toBe(false);
  });

  it("rejects empty input and rate-limits bursts", async () => {
    expect((await handleRewrite(rewriteRequest("   "), withProvider)).status).toBe(400);
    let last = 200;
    for (let i = 0; i < 22; i++) {
      const r = await handleRewrite(rewriteRequest("One short sentence."), withProvider);
      last = r.status;
      await r.text();
    }
    expect(last).toBe(429);
  });
});

describe("paid plans", () => {
  it("unlocks LaTeX, long runs and the monthly allowance", async () => {
    const tex = `\\section{Results}\n${words(900)} We repeated it in order to check \\cite{lee2019}.`;
    const res = await handleRewrite(rewriteRequest(tex, { cookie: licenseCookie() }), withProvider);
    expect(res.status).toBe(200);
    const result = (await readEvents(res)).at(-1)!;
    const account = result.account as Account;
    expect(account.plan).toBe("researcher");
    expect(account.exports).toBe(true);
    expect(account.wordsLeft).toBe(PLANS.researcher.words - countWords(tex));
    expect((result.report as Report).output).toContain("\\cite{lee2019}");
    expect((result.report as Report).output).toContain("\\section{Results}");
  });

  it("shares one allowance across browsers using the same key, separate from the free allowance", async () => {
    await (await handleRewrite(rewriteRequest(words(500), { cookie: licenseCookie(), ip: "1.1.1.1" }), withProvider)).text();
    const res = await me(new Request("http://localhost/api/me", { headers: { cookie: licenseCookie(), "x-forwarded-for": "2.2.2.2" } }));
    expect(((await res.json()) as { account: Account }).account.wordsUsed).toBe(500);
    const free = await me(new Request("http://localhost/api/me", { headers: { "x-forwarded-for": "1.1.1.1" } }));
    expect(((await free.json()) as { account: Account }).account.wordsUsed).toBe(0);
  });

  it("resets a subscription each month but not a pack", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T10:00:00Z"), toFake: ["Date"] });
    const sub = licenseCookie();
    const pack = licenseCookie({ plan: "pack", licenseId: 9002 });
    await (await handleRewrite(rewriteRequest(words(500), { cookie: sub }), withProvider)).text();
    await (await handleRewrite(rewriteRequest(words(500), { cookie: pack, ip: "9.9.9.9" }), withProvider)).text();
    vi.setSystemTime(new Date("2026-12-02T10:00:00Z"));
    vi.stubGlobal("fetch", lemonFetch(lemonResponse()));
    const subNext = (await (await me(new Request("http://localhost/api/me", { headers: { cookie: sub } }))).json()) as { account: Account };
    expect(subNext.account.wordsUsed).toBe(0);
    vi.stubGlobal("fetch", lemonFetch(lemonResponse({ variant: PACK_VARIANT, id: 9002 })));
    const packNext = (await (await me(new Request("http://localhost/api/me", { headers: { cookie: pack } }))).json()) as { account: Account };
    expect(packNext.account).toMatchObject({ plan: "pack", wordsUsed: 500, wordsLeft: PLANS.pack.words - 500 });
  });

  it("ends access when a re-check says the license was cancelled", async () => {
    const stale = licenseCookie({ checkedAt: Date.now() - 7 * 3600 * 1000 });
    vi.stubGlobal("fetch", lemonFetch(lemonResponse({ valid: false, status: "expired" })));
    const res = await me(new Request("http://localhost/api/me", { headers: { cookie: stale } }));
    const body = (await res.json()) as { account: Account; notice: string };
    expect(body.account.plan).toBe("free");
    expect(body.notice).toMatch(/expired/);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("vx_license=;"))).toBe(true);
  });

  it("keeps access for a short grace period when the license server is down", async () => {
    vi.stubGlobal("fetch", lemonFetch({}, 503));
    const recent = licenseCookie({ checkedAt: Date.now() - 7 * 3600 * 1000 });
    const ok = (await (await me(new Request("http://localhost/api/me", { headers: { cookie: recent } }))).json()) as { account: Account };
    expect(ok.account.plan).toBe("researcher");
    const old = licenseCookie({ checkedAt: Date.now() - 4 * 86_400 * 1000 });
    const lapsed = (await (await me(new Request("http://localhost/api/me", { headers: { cookie: old } }))).json()) as { account: Account };
    expect(lapsed.account.plan).toBe("free");
  });

  it("ignores a forged license cookie", async () => {
    const forged = `vx_license=${Buffer.from(JSON.stringify({ key: KEY, licenseId: 1, plan: "researcher", checkedAt: Date.now() })).toString("base64url")}.AAAA`;
    const body = (await (await me(new Request("http://localhost/api/me", { headers: { cookie: forged } }))).json()) as { account: Account };
    expect(body.account.plan).toBe("free");
  });
});

describe("POST /api/license", () => {
  const post = (key: unknown) =>
    activate(new Request("http://localhost/api/license", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }));

  it("activates a valid key and returns the paid account", async () => {
    vi.stubGlobal("fetch", lemonFetch(lemonResponse()));
    const res = await post(KEY);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { account: Account }).account).toMatchObject({ plan: "researcher", email: "ada@example.edu", wordsLeft: PLANS.researcher.words });
    const set = res.headers.getSetCookie().find((c) => c.startsWith("vx_license="))!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    // The cookie works on the next request.
    const again = (await (await me(new Request("http://localhost/api/me", { headers: { cookie: set.split(";")[0]! } }))).json()) as { account: Account };
    expect(again.account.plan).toBe("researcher");
  });

  it("explains a bad key and sets no cookie", async () => {
    vi.stubGlobal("fetch", lemonFetch({ valid: false, error: "license_key not found." }, 404));
    const res = await post(KEY);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/not found/);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect((await post("")).status).toBe(400);
  });

  it("reports an outage as temporary", async () => {
    vi.stubGlobal("fetch", lemonFetch({}, 500));
    expect((await post(KEY)).status).toBe(503);
  });

  it("limits guessing", async () => {
    vi.stubGlobal("fetch", lemonFetch({ valid: false }, 404));
    let status = 0;
    for (let i = 0; i < 11; i++) status = (await post(KEY)).status;
    expect(status).toBe(429);
  });

  it("removes the key on DELETE", async () => {
    const res = await removeKey(new Request("http://localhost/api/license", { method: "DELETE", headers: { cookie: licenseCookie() } }));
    expect(((await res.json()) as { account: Account }).account.plan).toBe("free");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("vx_license=;") && /Max-Age=0/.test(c))).toBe(true);
  });
});

describe("cost tracking", () => {
  it("prices token usage with the configured rates", () => {
    const usd = costUsd({ calls: 1, input: 1_000_000, output: 100_000, cacheRead: 500_000, cacheWrite: 0 }, config().price);
    expect(usd).toBeCloseTo(4 + 2 + 0.1, 6);
  });

  it("records runs, words and model cost for the admin report", async () => {
    await (await handleRewrite(rewriteRequest(words(240)), withProvider)).text();
    await (await handleRewrite(rewriteRequest(words(600), { cookie: licenseCookie() }), withProvider)).text();
    const denied = await adminStats(new Request("http://localhost/api/admin/stats"));
    expect(denied.status).toBe(401);
    const wrong = await adminStats(new Request("http://localhost/api/admin/stats", { headers: { authorization: "Bearer nope" } }));
    expect(wrong.status).toBe(401);
    const res = await adminStats(new Request("http://localhost/api/admin/stats", { headers: { authorization: "Bearer admin-token" } }));
    const s = (await res.json()) as Record<string, number>;
    expect(s).toMatchObject({ runs: 2, runs_free: 1, runs_researcher: 1, words: 840, words_researcher: 600 });
    expect(s.model_cost_usd).toBeGreaterThan(0);
    expect(s.cost_per_1k_words_usd).toBeCloseTo((s.model_cost_usd! / 840) * 1000, 3);
  });

  it("lists what is missing before launch", () => {
    expect(launchProblems(config()).join(" ")).toMatch(/ANTHROPIC_API_KEY/);
    setupEnv({
      ANTHROPIC_API_KEY: "sk-test",
      UPSTASH_REDIS_REST_URL: "https://u.test",
      UPSTASH_REDIS_REST_TOKEN: "t",
      VERITEXT_CHECKOUT_MONTHLY: "https://s.lemonsqueezy.com/buy/a",
      VERITEXT_CHECKOUT_YEARLY: "https://s.lemonsqueezy.com/buy/b",
      VERITEXT_CHECKOUT_PACK: "https://s.lemonsqueezy.com/buy/c",
      VERITEXT_SUPPORT_EMAIL: "help@veritext.test",
    });
    expect(launchProblems(config())).toEqual([]);
  });
});

describe("Claude provider", () => {
  const req = { sentences: ["A ⟦N1⟧ b."], discipline: "physics", register: "journal", context: "A ⟦N1⟧ b.", feedback: [] } as const;
  const client = (reply: object) => {
    const create = vi.fn(async () => reply);
    return { create, sdk: { beta: { messages: { create } } } as never };
  };

  it("asks for schema-constrained JSON with a cached system prompt and reads the usage", async () => {
    const { create, sdk } = client({
      stop_reason: "end_turn",
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"sentences":["B ⟦N1⟧ a."]}' }],
      usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 600, cache_creation_input_tokens: null },
    });
    const p = anthropicProvider(config(), sdk);
    expect(await p.rewrite({ ...req, sentences: [...req.sentences], feedback: [] })).toEqual(["B ⟦N1⟧ a."]);
    expect(p.usage).toEqual({ calls: 1, input: 120, output: 40, cacheRead: 600, cacheWrite: 0 });
    const sent = (create.mock.calls[0] as unknown as [Record<string, never>])[0] as unknown as {
      model: string; tool_choice?: unknown; thinking?: unknown; temperature?: unknown;
      system: { text: string; cache_control: unknown }[]; output_config: { effort: string; format: { type: string } };
    };
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.output_config.format.type).toBe("json_schema");
    expect(sent.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(sent.system[0]!.text).not.toMatch(/submit_rewrite/);
    // Not accepted by the current model family: forced tool choice, disabled thinking, sampling params.
    expect(sent.tool_choice).toBeUndefined();
    expect(sent.thinking).toBeUndefined();
    expect(sent.temperature).toBeUndefined();
  });

  it("returns nothing on a refusal or a truncated reply, so originals are kept", async () => {
    for (const stop_reason of ["refusal", "max_tokens"]) {
      const { sdk } = client({ stop_reason, content: [{ type: "text", text: '{"sentences":["x"]}' }], usage: { input_tokens: 1, output_tokens: 1 } });
      expect(await anthropicProvider(config(), sdk).rewrite({ ...req, sentences: [...req.sentences], feedback: [] })).toEqual([]);
    }
    expect(parseSentences("not json")).toEqual([]);
    expect(parseSentences('{"sentences":"x"}')).toEqual([]);
  });
});

describe("usage store", () => {
  it("memory store expires counters", async () => {
    let now = 0;
    const s = new MemoryStore(() => now);
    expect(await s.incrBy("k", 5, 10)).toBe(5);
    expect(await s.incrBy("k", 2, 10)).toBe(7);
    now = 11_000;
    expect(await s.get("k")).toBeNull();
  });

  it("talks to Upstash over its REST pipeline", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const cmds = JSON.parse(String(init.body)) as unknown[][];
      return new Response(JSON.stringify(cmds.map((c) => ({ result: c[0] === "INCRBY" ? 12 : c[0] === "MGET" ? ["3", null] : "OK" }))));
    });
    const s = new UpstashStore("https://u.test", "tok", f as unknown as typeof fetch);
    expect(await s.incrBy("k", 12, 60)).toBe(12);
    expect(await s.mget(["a", "b"])).toEqual(["3", null]);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://u.test/pipeline");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual([["INCRBY", "k", 12], ["EXPIRE", "k", 60, "NX"]]);
  });
});

describe("AI-use statement", () => {
  it("is filled in from the run", async () => {
    const res = await handleRewrite(rewriteRequest("We did this in order to test it at 300 K. The film survived [3]."), withProvider);
    const report = (await readEvents(res)).at(-1)!.report as Report;
    const text = disclosure("elsevier", report);
    expect(text).toMatch(/Declaration of generative AI/);
    expect(text).toMatch(/full responsibility/);
    expect(disclosure("icmje", report)).toMatch(/rewording was applied to 1 of 2 sentences/);
  });
});

// The paid path: check the plan, reserve words, run the pipeline, stream progress, record cost.
import { demoProvider, detectFormat, runPipeline } from "@/lib/core";
import { DISCIPLINES, REGISTERS, type Discipline, type Format, type Register, type Report } from "@/lib/core/types";
import { PLANS, countWords, type Account } from "@/lib/plans";
import { anthropicProvider, costUsd, emptyUsage, type MeteredProvider, type TokenUsage } from "./anthropic-provider";
import { config, type Config } from "./config";
import { accountFor, monthKey, releaseWords, reserveWords, resolveEntitlement, type Entitlement } from "./entitlement";
import { clientIp, sha } from "./session";
import { getStore } from "./store";

export type PaywallCode = "format_locked" | "too_long" | "quota";

export type StreamEvent =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; report: Report; account: Account; words_charged: number }
  | { type: "error"; message: string };

export interface RewriteDeps {
  /** Returns the provider for one run, or null to use the unmetered demo rewriter. */
  makeProvider?: (c: Config) => MeteredProvider | null;
}

const MAX_CHARS = 400_000;
const RUNS_PER_MINUTE = 20;
const FORMATS: (Format | "auto")[] = ["auto", "text", "markdown", "latex"];

const json = (body: unknown, status: number, cookies: string[] = []) => {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
};

async function paywall(code: PaywallCode, message: string, ent: Entitlement) {
  return json({ code, message, account: await accountFor(ent) }, 402, ent.setCookies);
}

async function recordStats(plan: string, words: number, usage: TokenUsage, c: Config) {
  const store = getStore();
  const m = monthKey();
  const ttl = 400 * 86_400;
  await Promise.all([
    store.incrBy(`s:${m}:runs`, 1, ttl),
    store.incrBy(`s:${m}:runs_${plan}`, 1, ttl),
    store.incrBy(`s:${m}:words`, words, ttl),
    store.incrBy(`s:${m}:words_${plan}`, words, ttl),
    store.incrBy(`s:${m}:tokens_in`, usage.input + usage.cacheRead + usage.cacheWrite, ttl),
    store.incrBy(`s:${m}:tokens_out`, usage.output, ttl),
    store.incrBy(`s:${m}:cost_micro_usd`, Math.round(costUsd(usage, c.price) * 1e6), ttl),
  ]);
}

async function viaEngine(c: Config, body: unknown): Promise<Report> {
  const res = await fetch(`${c.engineUrl}/v1/rewrite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(280_000),
  });
  if (!res.ok) throw new Error(`The rewrite engine returned an error (HTTP ${res.status}).`);
  return (await res.json()) as Report;
}

export async function handleRewrite(req: Request, deps: RewriteDeps = {}): Promise<Response> {
  const c = config();
  let input: { text?: unknown; format?: unknown; discipline?: unknown; register?: unknown };
  try {
    input = (await req.json()) as typeof input;
  } catch {
    return json({ message: "Send a JSON body." }, 400);
  }
  const text = typeof input.text === "string" ? input.text : "";
  const format = FORMATS.includes(input.format as Format) ? (input.format as Format | "auto") : "auto";
  const discipline = DISCIPLINES.some((d) => d.value === input.discipline) ? (input.discipline as Discipline) : "physics";
  const register = REGISTERS.some((r) => r.value === input.register) ? (input.register as Register) : "journal";
  const words = countWords(text);
  if (!words) return json({ message: "Paste some text to rewrite." }, 400);
  if (text.length > MAX_CHARS) return json({ message: "That document is too large for one run. Split it into chapters." }, 413);

  const store = getStore();
  const minute = Math.floor(Date.now() / 60_000);
  if ((await store.incrBy(`rl:${sha(clientIp(req))}:${minute}`, 1, 120)) > RUNS_PER_MINUTE)
    return json({ message: "Too many requests. Wait a minute and try again." }, 429);

  const ent = await resolveEntitlement(req);
  const plan = ent.plan;
  const fmt = format === "auto" ? detectFormat(text) : format;
  if (!plan.formats.includes(fmt))
    return paywall("format_locked", `LaTeX documents are part of the paid plans. The ${plan.name} plan covers plain text and Markdown.`, ent);
  if (words > plan.maxWordsPerRun)
    return paywall(
      "too_long",
      plan.id === "free"
        ? `This text has ${words.toLocaleString("en-US")} words. The Free plan rewrites up to ${plan.maxWordsPerRun.toLocaleString("en-US")} words at a time; paid plans take ${PLANS.researcher.maxWordsPerRun.toLocaleString("en-US")}.`
        : `This text has ${words.toLocaleString("en-US")} words. One run takes up to ${plan.maxWordsPerRun.toLocaleString("en-US")}; split the document and run the parts.`,
      ent,
    );

  const provider = c.engineUrl ? null : deps.makeProvider ? deps.makeProvider(c) : c.anthropicKey ? anthropicProvider(c) : null;
  const metered = Boolean(provider || c.engineUrl);
  if (metered && !(await reserveWords(ent, words))) {
    const left = (await accountFor(ent)).wordsLeft;
    return paywall(
      "quota",
      plan.period === "month"
        ? `This text has ${words.toLocaleString("en-US")} words and your ${plan.name} plan has ${left.toLocaleString("en-US")} left this month.`
        : `This text has ${words.toLocaleString("en-US")} words and your pack has ${left.toLocaleString("en-US")} left.`,
      ent,
    );
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      let charged = metered ? words : 0;
      try {
        let report: Report;
        if (c.engineUrl) {
          report = await viaEngine(c, { text, format, discipline, register });
          if (report.provider === "demo") charged = 0;
        } else {
          report = await runPipeline(text, provider ?? demoProvider, {
            discipline,
            register,
            format: fmt,
            maxAttempts: c.maxRepairAttempts,
            concurrency: provider ? c.concurrency : 1,
            onProgress: (done, total) => send({ type: "progress", done, total }),
          });
        }
        // If the model could not be reached, nothing was delivered: do not charge for the run.
        if (report.warnings.some((w) => w.startsWith("Rewrite provider error"))) charged = 0;
        if (metered && charged < words) await releaseWords(ent, words - charged);
        if (charged) await recordStats(plan.id, charged, provider?.usage ?? emptyUsage(), c).catch(() => undefined);
        send({ type: "result", report, account: await accountFor(ent), words_charged: charged });
      } catch (e) {
        if (metered) await releaseWords(ent, words).catch(() => undefined);
        send({ type: "error", message: e instanceof Error ? e.message : "The rewrite failed. You were not charged." });
      } finally {
        controller.close();
      }
    },
  });
  const headers = new Headers({ "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" });
  for (const ck of ent.setCookies) headers.append("set-cookie", ck);
  return new Response(stream, { status: 200, headers });
}

// Usage, model cost and cost per 1,000 words for a month. `Authorization: Bearer $VERITEXT_ADMIN_TOKEN`.
import { timingSafeEqual } from "node:crypto";
import { PRICES } from "@/lib/plans";
import { config, launchProblems } from "@/lib/server/config";
import { monthKey } from "@/lib/server/entitlement";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["runs", "runs_free", "runs_researcher", "runs_pack", "words", "words_free", "words_researcher", "words_pack", "tokens_in", "tokens_out", "cost_micro_usd"] as const;

export async function GET(req: Request) {
  const c = config();
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(c.adminToken);
  if (!c.adminToken || given.length !== want.length || !timingSafeEqual(given, want))
    return Response.json({ message: "Not authorised." }, { status: 401 });

  const asked = new URL(req.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : monthKey();
  const store = getStore();
  const values = await store.mget(FIELDS.map((f) => `s:${month}:${f}`));
  const n = Object.fromEntries(FIELDS.map((f, i) => [f, Number(values[i] ?? 0)])) as Record<(typeof FIELDS)[number], number>;
  const cost = n.cost_micro_usd / 1e6;
  const per1k = n.words ? (cost / n.words) * 1000 : 0;
  return Response.json({
    month,
    store: store.kind,
    model: c.model,
    ...n,
    model_cost_usd: Number(cost.toFixed(4)),
    cost_per_1k_words_usd: Number(per1k.toFixed(4)),
    // What a subscriber who uses the whole monthly allowance costs, against the monthly price.
    researcher_full_use_cost_usd: Number((per1k * 50).toFixed(2)),
    researcher_price_usd: PRICES.monthly,
    launch_problems: launchProblems(c),
  });
}

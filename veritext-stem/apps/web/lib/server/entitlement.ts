// Who is this visitor, what plan are they on, and how many words do they have left?
// All limits are enforced here on the server; the browser only displays them.
import { PLANS, type Account, type Plan } from "@/lib/plans";
import { config } from "./config";
import { validateLicense } from "./license";
import { ANON_COOKIE, LICENSE_COOKIE, clientIp, cookie, newAnonId, readCookie, sha, sign, verify, type LicenseSession } from "./session";
import { getStore } from "./store";

const DAY = 86_400;
const REVALIDATE_MS = 6 * 3600 * 1000; // re-check a license with Lemon Squeezy every 6 hours
const GRACE_MS = 3 * DAY * 1000; // keep access this long if the license server cannot be reached
const YEAR = 365 * DAY;

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export interface Entitlement {
  plan: Plan;
  email: string | null;
  /** The counter the plan's allowance is measured against. */
  usageKey: string;
  /** A second counter with its own ceiling: all free use from one IP address, as an abuse backstop. */
  guard: { key: string; limit: number } | null;
  usageTtl: number | undefined;
  /** Set-Cookie headers the response must carry. */
  setCookies: string[];
  /** Shown to the visitor when a saved license stopped working. */
  notice: string | null;
}

export async function resolveEntitlement(req: Request, now = Date.now()): Promise<Entitlement> {
  const setCookies: string[] = [];
  let notice: string | null = null;

  const session = verify<LicenseSession>(readCookie(req, LICENSE_COOKIE));
  if (session?.key && session.licenseId) {
    let live: LicenseSession | null = session;
    if (now - session.checkedAt > REVALIDATE_MS) {
      const res = await validateLicense(session.key);
      if (res.ok) {
        live = { key: session.key, licenseId: res.licenseId, plan: res.plan, email: res.email, checkedAt: now };
        const token = sign(live);
        if (token) setCookies.push(cookie(LICENSE_COOKIE, token, YEAR));
      } else if (res.reason === "invalid" || now - session.checkedAt > GRACE_MS) {
        live = null;
        notice = res.reason === "invalid" ? res.message : "Your license could not be re-checked, so the paid plan is paused. Enter the key again to retry.";
        setCookies.push(cookie(LICENSE_COOKIE, "", 0));
      }
    }
    if (live) {
      const plan = PLANS[live.plan];
      const key = plan.period === "month" ? `u:lic:${live.licenseId}:${monthKey(new Date(now))}` : `u:lic:${live.licenseId}:all`;
      return { plan, email: live.email, usageKey: key, guard: null, usageTtl: plan.period === "month" ? 70 * DAY : undefined, setCookies, notice };
    }
  }

  // Free plan: metered per browser (signed cookie). Total free use per IP is capped separately and
  // much higher, because a whole university can sit behind one address.
  let anon = verify<{ id: string }>(readCookie(req, ANON_COOKIE))?.id;
  if (!anon) {
    anon = newAnonId();
    const token = sign({ id: anon });
    if (token) setCookies.push(cookie(ANON_COOKIE, token, YEAR));
  }
  const month = monthKey(new Date(now));
  return {
    plan: PLANS.free,
    email: null,
    usageKey: `u:anon:${anon}:${month}`,
    guard: { key: `u:ip:${sha(clientIp(req))}:${month}`, limit: config().freeIpWords },
    usageTtl: 70 * DAY,
    setCookies,
    notice,
  };
}

const keysOf = (ent: Entitlement) => (ent.guard ? [ent.usageKey, ent.guard.key] : [ent.usageKey]);

/** Words used and words still available, taking the IP backstop into account. */
export async function balance(ent: Entitlement): Promise<{ used: number; left: number }> {
  const [own, guard] = (await getStore().mget(keysOf(ent))).map((v) => Math.max(0, Number(v ?? 0)));
  const used = own ?? 0;
  const left = Math.max(0, Math.min(ent.plan.words - used, ent.guard ? ent.guard.limit - (guard ?? 0) : Infinity));
  return { used, left };
}

/** Atomically reserve `words`. Returns false (and reserves nothing) if that would exceed the plan. */
export async function reserveWords(ent: Entitlement, words: number): Promise<boolean> {
  const store = getStore();
  const [own, guard] = await Promise.all(keysOf(ent).map((k) => store.incrBy(k, words, ent.usageTtl)));
  if (own! <= ent.plan.words && (!ent.guard || guard! <= ent.guard.limit)) return true;
  await releaseWords(ent, words);
  return false;
}

export async function releaseWords(ent: Entitlement, words: number): Promise<void> {
  if (words <= 0) return;
  const store = getStore();
  await Promise.all(keysOf(ent).map((k) => store.incrBy(k, -words, ent.usageTtl)));
}

export async function accountFor(ent: Entitlement): Promise<Account> {
  const c = config();
  const { used, left } = await balance(ent);
  return {
    plan: ent.plan.id,
    planName: ent.plan.name,
    period: ent.plan.period,
    wordsIncluded: ent.plan.words,
    wordsUsed: Math.min(used, ent.plan.words),
    wordsLeft: left,
    maxWordsPerRun: ent.plan.maxWordsPerRun,
    formats: ent.plan.formats,
    exports: ent.plan.exports,
    email: ent.email,
    live: Boolean(c.anthropicKey || c.engineUrl),
    checkout: c.checkout,
    billingPortal: c.billingPortal,
    supportEmail: c.supportEmail,
  };
}

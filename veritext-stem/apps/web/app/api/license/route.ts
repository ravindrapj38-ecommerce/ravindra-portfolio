// POST {key}: validate a license key and start a paid session. DELETE: sign out of it.
import { accountFor, resolveEntitlement } from "@/lib/server/entitlement";
import { validateLicense } from "@/lib/server/license";
import { LICENSE_COOKIE, clientIp, cookie, secret, sha, sign, type LicenseSession } from "@/lib/server/session";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status: number, cookies: string[] = []) => {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
};

export async function POST(req: Request) {
  if (!secret()) return json({ message: "License activation is not configured on this server yet." }, 503);
  const window = Math.floor(Date.now() / 600_000);
  if ((await getStore().incrBy(`rl:lic:${sha(clientIp(req))}:${window}`, 1, 1200)) > 10)
    return json({ message: "Too many attempts. Wait ten minutes and try again." }, 429);

  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return json({ message: "Paste the license key from your purchase email." }, 400);

  const res = await validateLicense(key);
  if (!res.ok) return json({ message: res.message }, res.reason === "unreachable" ? 503 : 400);

  const session: LicenseSession = { key, licenseId: res.licenseId, plan: res.plan, email: res.email, checkedAt: Date.now() };
  const set = cookie(LICENSE_COOKIE, sign(session)!, 365 * 86_400);
  // Resolve against the new cookie so the reply already shows the paid plan and its usage.
  const next = new Request(req.url, { headers: { cookie: set.split(";")[0]! } });
  const ent = await resolveEntitlement(next);
  return json({ account: await accountFor(ent) }, 200, [set]);
}

export async function DELETE(req: Request) {
  const clear = cookie(LICENSE_COOKIE, "", 0);
  const headers = new Headers(req.headers);
  headers.set(
    "cookie",
    (req.headers.get("cookie") ?? "")
      .split(";")
      .filter((p) => p.trim().split("=")[0] !== LICENSE_COOKIE)
      .join(";"),
  );
  const ent = await resolveEntitlement(new Request(req.url, { headers }));
  return json({ account: await accountFor(ent) }, 200, [clear, ...ent.setCookies]);
}

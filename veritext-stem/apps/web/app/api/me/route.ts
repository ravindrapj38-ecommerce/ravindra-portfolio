import { accountFor, resolveEntitlement } from "@/lib/server/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ent = await resolveEntitlement(req);
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of ent.setCookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify({ account: await accountFor(ent), notice: ent.notice }), { headers });
}

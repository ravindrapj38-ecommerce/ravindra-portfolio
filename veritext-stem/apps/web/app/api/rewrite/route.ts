import { engineUrl } from "@/lib/engine-url";

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${engineUrl()}/v1/rewrite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "The rewrite engine is not reachable." }, { status: 502 });
  }
}

import { engineUrl } from "@/lib/engine-url";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${engineUrl()}/v1/meta`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    const engine = res.ok ? { status: "ok", ...(await res.json()) } : { status: "error" };
    return Response.json({ status: "ok", engine });
  } catch {
    return Response.json({ status: "ok", engine: { status: "unreachable" } });
  }
}

import { config, launchProblems } from "@/lib/server/config";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = config();
  return Response.json({
    status: "ok",
    rewriter: c.engineUrl ? "engine" : c.anthropicKey ? "claude" : "demo",
    usage_store: getStore().kind,
    launch_ready: launchProblems(c).length === 0,
  });
}

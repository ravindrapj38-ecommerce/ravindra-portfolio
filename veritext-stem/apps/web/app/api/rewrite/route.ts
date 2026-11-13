import { handleRewrite } from "@/lib/server/rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = (req: Request) => handleRewrite(req);

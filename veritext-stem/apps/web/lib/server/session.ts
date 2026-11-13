// Signed cookies. `vx_license` carries the customer's license key plus the last validated plan;
// `vx_anon` is a random id used to meter the free plan. Both are HMAC-signed and httpOnly.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PlanId } from "@/lib/plans";
import { config } from "./config";

export const LICENSE_COOKIE = "vx_license";
export const ANON_COOKIE = "vx_anon";

export interface LicenseSession {
  key: string;
  licenseId: number;
  plan: Exclude<PlanId, "free">;
  email: string | null;
  /** ms epoch of the last successful validation with Lemon Squeezy. */
  checkedAt: number;
}

const DEV_SECRET = "dev-only-secret-not-for-production-use-0000";

/** The signing secret, or null when production is missing one (paid features are then refused). */
export function secret(): string | null {
  const c = config();
  if (c.sessionSecret.length >= 32) return c.sessionSecret;
  return c.production ? null : DEV_SECRET;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const mac = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function sign(value: unknown): string | null {
  const key = secret();
  if (!key) return null;
  const payload = b64(JSON.stringify(value));
  return `${payload}.${mac(payload, key)}`;
}

export function verify<T>(token: string | undefined | null): T | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(payload, key));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const newAnonId = () => randomBytes(16).toString("hex");
export const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  const secure = config().production ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim() || "local";
}

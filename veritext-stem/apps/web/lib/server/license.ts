// License keys are issued by Lemon Squeezy at checkout and emailed to the buyer. We validate them
// server-side with the public License API (no API key needed) and map the purchased variant to a plan.
// A cancelled or refunded purchase makes the key expired/disabled, which ends access on re-validation.
import type { PlanId } from "@/lib/plans";
import { config, type Config } from "./config";

export interface ValidLicense {
  ok: true;
  licenseId: number;
  plan: Exclude<PlanId, "free">;
  email: string | null;
}
export interface InvalidLicense {
  ok: false;
  /** "invalid": the key is definitively not usable. "unreachable": could not check right now. */
  reason: "invalid" | "unreachable";
  message: string;
}
export type LicenseResult = ValidLicense | InvalidLicense;

interface LemonValidate {
  valid?: boolean;
  error?: string | null;
  license_key?: { id?: number; status?: string; test_mode?: boolean };
  meta?: { store_id?: number; variant_id?: number; customer_email?: string };
}

const bad = (message: string): InvalidLicense => ({ ok: false, reason: "invalid", message });

export async function validateLicense(
  rawKey: string,
  c: Config = config(),
  fetcher: typeof fetch = fetch,
): Promise<LicenseResult> {
  const key = rawKey.trim();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) return bad("That does not look like a license key. Paste it exactly as it appears in your purchase email.");

  let body: LemonValidate;
  try {
    const res = await fetcher(`${c.lemonApi}/v1/licenses/validate`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: key }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    // 400/404 carry a JSON body with valid:false; 5xx and 429 mean "try again", not "invalid".
    if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
    body = (await res.json()) as LemonValidate;
  } catch {
    return { ok: false, reason: "unreachable", message: "Could not reach the license server. Please try again in a minute." };
  }

  const status = body.license_key?.status;
  if (!body.valid || status === "expired" || status === "disabled") {
    if (status === "expired") return bad("This license has expired. Renew your subscription to keep using the paid plan.");
    if (status === "disabled") return bad("This license has been disabled (the purchase was refunded or cancelled).");
    return bad("That license key was not found. Check for missing characters and try again.");
  }
  if (!c.storeId || Number(body.meta?.store_id) !== c.storeId) return bad("This license key belongs to a different product.");
  if (body.license_key?.test_mode && c.production && process.env.VERITEXT_ALLOW_TEST_KEYS !== "1")
    return bad("This is a test-mode license key and cannot be used on the live site.");

  const variant = Number(body.meta?.variant_id);
  const plan = c.variants.researcher.includes(variant) ? "researcher" : c.variants.pack.includes(variant) ? "pack" : null;
  if (!plan) return bad("This license key belongs to a different product.");
  const licenseId = Number(body.license_key?.id);
  if (!Number.isInteger(licenseId) || licenseId <= 0) return bad("That license key could not be read. Contact support.");
  return { ok: true, licenseId, plan, email: body.meta?.customer_email ?? null };
}

// Site-wide details used by the marketing and legal pages (server only).
import type { CheckoutKind } from "@/lib/plans";
import { config } from "@/lib/server/config";

export function site() {
  const c = config();
  const mail = `mailto:${c.supportEmail}?subject=${encodeURIComponent("Veritext STEM: I would like to buy a plan")}`;
  return {
    name: "Veritext STEM",
    owner: (process.env.VERITEXT_OWNER_NAME ?? "").trim() || "Veritext STEM",
    country: (process.env.VERITEXT_OWNER_COUNTRY ?? "").trim() || "India",
    url: (process.env.VERITEXT_SITE_URL ?? "").trim().replace(/\/$/, "") || "http://localhost:3000",
    supportEmail: c.supportEmail,
    checkout: (kind: CheckoutKind) => c.checkout[kind] || mail,
    labMail: `mailto:${c.supportEmail}?subject=${encodeURIComponent("Veritext STEM for our lab")}`,
  };
}

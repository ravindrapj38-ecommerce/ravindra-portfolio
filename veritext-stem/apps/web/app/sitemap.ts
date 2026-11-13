import type { MetadataRoute } from "next";

const url = (process.env.VERITEXT_SITE_URL ?? "").trim().replace(/\/$/, "") || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/app", "/legal/terms", "/legal/privacy", "/legal/refunds"].map((p) => ({ url: `${url}${p}` }));
}

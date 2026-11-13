import type { MetadataRoute } from "next";

const url = (process.env.VERITEXT_SITE_URL ?? "").trim().replace(/\/$/, "") || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }], sitemap: `${url}/sitemap.xml` };
}

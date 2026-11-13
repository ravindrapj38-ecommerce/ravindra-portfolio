import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const url = (process.env.VERITEXT_SITE_URL ?? "").trim() || "http://localhost:3000";
const description =
  "Rewrite AI-drafted or second-language STEM text into natural expert prose. Equations, numbers and citations are locked, every sentence is checked for changed meaning, and you get a fidelity report.";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: "Veritext STEM: rewriting for STEM papers with verified meaning", template: "%s · Veritext STEM" },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Veritext STEM", title: "Veritext STEM", description, url: "/" },
  twitter: { card: "summary", title: "Veritext STEM", description },
};

// Pages read checkout links and contact details from the environment at request time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The App Router root layout covers every page, so this rule (written for pages/) does not apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

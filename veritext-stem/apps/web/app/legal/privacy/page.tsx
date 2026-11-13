import type { Metadata } from "next";
import { LegalPage } from "@/components/Site";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Privacy() {
  const s = site();
  return (
    <LegalPage title="Privacy Policy" updated="13 November 2026">
      <p>
        {s.name} is operated by {s.owner}, {s.country}. This page says what we process and why.
      </p>
      <h2>Your text</h2>
      <p>
        Text you submit is processed in memory to produce the rewrite and the report, and is sent to Anthropic’s API,
        which runs the language model. We do not write your text or the output to a database, file or log. Anthropic
        processes it under its commercial terms and does not use API inputs or outputs to train its models by
        default. Do not submit text you are not permitted to share with a third-party processor.
      </p>
      <h2>What we keep</h2>
      <ul>
        <li>
          Word counts per month, tied to your license number (paid plans) or to a random browser identifier and a
          one-way hash of your IP address (Free plan). This is how plan limits are enforced.
        </li>
        <li>Aggregate totals of runs, words and model cost, with no link to any person.</li>
      </ul>
      <h2>Cookies</h2>
      <p>
        Two cookies, both strictly necessary: one random identifier that meters the Free plan, and, if you activate a
        license, one that keeps your license key so you stay on your plan. No advertising or analytics cookies.
      </p>
      <h2>Payments</h2>
      <p>
        Purchases are made with Lemon Squeezy, our Merchant of Record. It collects your payment details and email
        under its own privacy policy. We receive the license number, plan and email attached to your key, and never
        see card details.
      </p>
      <h2>Your rights</h2>
      <p>
        You can ask what we hold about you, or ask us to delete it, at{" "}
        <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>. Removing your key in the app deletes the license
        cookie from that browser.
      </p>
    </LegalPage>
  );
}

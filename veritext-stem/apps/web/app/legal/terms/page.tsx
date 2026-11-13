import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/Site";
import { PLANS } from "@/lib/plans";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function Terms() {
  const s = site();
  return (
    <LegalPage title="Terms of Service" updated="13 November 2026">
      <p>
        These terms cover your use of {s.name} (“the service”), operated by {s.owner}, {s.country}. By using the service
        you agree to them.
      </p>
      <h2>What the service does</h2>
      <p>
        The service rewrites text you submit and runs automatic checks that compare each rewritten sentence with the
        original. The checks are rule-based and can miss a change of meaning or reject an acceptable sentence. The
        service is an editing aid. You are responsible for reviewing the output and for the content of anything you
        publish or submit.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Use the service only with text you have the right to edit. Follow the rules of your institution, funder and
        publisher on the use of AI tools, including any duty to disclose that use. The service is not designed to
        evade AI-detection tools and makes no claim about them. Do not resell access, share a license key publicly, or
        try to bypass usage limits.
      </p>
      <h2>Plans and payment</h2>
      <p>
        The Free plan includes {PLANS.free.words.toLocaleString("en-US")} words a month. Paid plans are sold through
        our reseller and Merchant of Record, Lemon Squeezy, which processes payment and tax. Subscriptions renew
        automatically until cancelled; you can cancel at any time and keep access until the end of the paid period.
        Word allowances on subscriptions reset each calendar month (UTC) and do not roll over. Words in a one-time pack
        do not expire. See the <Link href="/legal/refunds">refund policy</Link>.
      </p>
      <h2>Your content</h2>
      <p>
        You keep all rights to your text and to the rewritten output. We do not store your text or use it to train
        models. See the <Link href="/legal/privacy">privacy policy</Link> for how it is processed.
      </p>
      <h2>Availability and liability</h2>
      <p>
        The service is provided “as is”, without warranties of any kind. To the extent the law allows, our total
        liability for any claim is limited to the amount you paid us in the three months before the claim. We are not
        liable for indirect or consequential loss, including rejected submissions or academic decisions.
      </p>
      <h2>Changes and contact</h2>
      <p>
        We may update these terms; the date above shows the latest version. Questions:{" "}
        <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>.
      </p>
    </LegalPage>
  );
}

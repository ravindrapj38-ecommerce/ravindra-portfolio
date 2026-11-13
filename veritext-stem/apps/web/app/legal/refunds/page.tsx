import type { Metadata } from "next";
import { LegalPage } from "@/components/Site";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Refund Policy" };

export default function Refunds() {
  const s = site();
  return (
    <LegalPage title="Refund Policy" updated="13 November 2026">
      <p>
        If {s.name} did not work for you, write to <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a> within 14
        days of your first payment, with the email you used at checkout, and we will refund that payment.
      </p>
      <h2>Subscriptions</h2>
      <p>
        You can cancel at any time from the link in your receipt. Cancelling stops future charges; the plan stays
        active until the end of the period already paid for. Renewal payments are refunded if you ask within 7 days of
        the renewal and have not used the plan since it renewed.
      </p>
      <h2>Thesis packs</h2>
      <p>A pack is refundable within 14 days of purchase if no more than 10% of its words have been used.</p>
      <h2>How refunds are paid</h2>
      <p>
        Refunds go back to the original payment method through Lemon Squeezy, usually within 5 to 10 business days.
        The license key for a refunded purchase stops working.
      </p>
    </LegalPage>
  );
}

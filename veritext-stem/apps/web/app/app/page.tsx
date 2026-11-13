import type { Metadata } from "next";
import AppWorkbench from "@/components/AppWorkbench";
import shared from "@/lib/core/shared-data";

export const metadata: Metadata = {
  title: "Rewrite and verify",
  description: "Paste STEM text, get natural expert prose and a sentence-by-sentence fidelity report.",
};

export default function AppPage() {
  return <AppWorkbench sample={shared.sample} />;
}

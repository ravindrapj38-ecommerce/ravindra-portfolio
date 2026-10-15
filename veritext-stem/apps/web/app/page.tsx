import AppWorkbench from "@/components/AppWorkbench";
import shared from "@/lib/core/shared-data";

export default function Home() {
  return <AppWorkbench sample={shared.sample} />;
}

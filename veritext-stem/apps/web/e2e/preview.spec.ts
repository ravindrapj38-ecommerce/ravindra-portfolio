// Smoke test of the single-file preview (run `pnpm build:preview` first). Uses the offline demo rewriter.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(import.meta.dirname, "..", "dist", "preview", "index.html"), "utf8");
const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${page}</body></html>`;

test("loads the sample, rewrites it and shows verified sentences", async ({ page: p }) => {
  await p.route("https://fonts.googleapis.com/**", (r) => r.abort());
  await p.setContent(doc);
  await expect(p.locator("#vx-input")).toHaveValue(/thermal conductivity of the graphene films/);
  await p.getByTestId("rewrite").click();
  await expect(p.getByTestId("fidelity")).toHaveText("100");
  await expect(p.locator('[data-status="verified"]')).toHaveCount(5);
  await p.getByRole("tab", { name: "Rewritten text" }).click();
  await expect(p.getByTestId("output")).toContainText("1800 ± 150 W m^-1 K^-1");
  await expect(p.getByTestId("output")).not.toContainText("delve");
});

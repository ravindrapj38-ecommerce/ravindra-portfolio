// The path that earns money, end to end in a real browser: landing → free rewrite → limit →
// checkout links → license key → paid rewrite.
import { expect, test, type Page } from "@playwright/test";

const GOOD_KEY = "E2E00000-AAAA-BBBB-CCCC-RESEARCHER01";
const LATEX = "\\section{Results}\nThe films were measured at 300 K in order to compare them with theory \\cite{lee2019}. The defects did not alter the peak.";
const words = (n: number) => Array.from({ length: n / 10 }, () => "The film was measured again in order to check it.").join(" ");

// Each test is a different visitor: the free plan is metered per browser and per IP.
let visitor = 0;
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${++visitor}` });
  await context.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

async function rewrite(page: Page, text?: string) {
  if (text !== undefined) await page.locator("#vx-input").fill(text);
  await page.getByTestId("rewrite").click();
}

test("landing page sells: example, prices and working checkout links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep every number, equation and citation");
  await expect(page.locator('[data-status="kept_original"]')).toContainText("Rejected rewrite");
  await expect(page.locator('[data-status="verified"]').first()).toBeVisible();
  await expect(page.getByTestId("buy-monthly")).toHaveAttribute("href", "https://veritext.lemonsqueezy.com/buy/monthly");
  await expect(page.getByTestId("buy-yearly")).toHaveAttribute("href", "https://veritext.lemonsqueezy.com/buy/yearly");
  await expect(page.getByTestId("buy-pack")).toHaveAttribute("href", "https://veritext.lemonsqueezy.com/buy/pack");
  await expect(page.locator("#pricing")).toContainText("$12");
  await expect(page.locator("#pricing")).toContainText("$29");
  for (const path of ["/legal/terms", "/legal/privacy", "/legal/refunds"]) {
    const res = await page.request.get(path);
    expect(res.status()).toBe(200);
  }
  await page.getByTestId("cta-try").click();
  await expect(page).toHaveURL(/\/app$/);
});

test("free visitor rewrites the sample with Claude and sees words deducted", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("plan-name")).toHaveText("Free");
  await expect(page.getByTestId("words-left")).toHaveText("1,500 of 1,500 left");
  const count = Number((await page.getByTestId("word-count").innerText()).replace(/\D/g, ""));
  expect(count).toBeGreaterThan(80);
  await rewrite(page);
  await expect(page.getByTestId("fidelity")).toHaveText("100");
  await expect(page.getByTestId("words-left")).toHaveText(`${(1500 - count).toLocaleString("en-US")} of 1,500 left`);
  await expect(page.getByRole("region", { name: "Results" })).toContainText("Claude (claude-opus-5-5)");
  await page.getByRole("tab", { name: "Rewritten text" }).click();
  await expect(page.getByTestId("output")).toContainText("1800 ± 150 W m^-1 K^-1");
  await expect(page.getByTestId("output")).not.toContainText("It is worth noting");
  // Downloads are a paid feature: the button asks for an upgrade instead of saving a file.
  await page.getByRole("button", { name: "Download fidelity report (paid)" }).click();
  await expect(page.getByTestId("paywall")).toContainText("Downloads are part of the paid plans");
  await page.getByRole("tab", { name: "AI-use statement" }).click();
  await expect(page.getByTestId("disclosure")).toContainText("take full responsibility");
  // The balance survives a reload (it lives on the server).
  await page.reload();
  await expect(page.getByTestId("words-left")).toHaveText(`${(1500 - count).toLocaleString("en-US")} of 1,500 left`);
});

test("free allowance runs out and the upgrade prompt links to checkout", async ({ page }) => {
  await page.goto("/app");
  for (const left of ["900 of 1,500 left", "300 of 1,500 left"]) {
    await rewrite(page, words(600));
    await expect(page.getByTestId("words-left")).toHaveText(left);
  }
  await rewrite(page, words(600));
  const wall = page.getByTestId("paywall");
  await expect(wall).toContainText("You have used your words");
  await expect(wall).toContainText("300 left this month");
  await expect(wall.getByTestId("buy-monthly")).toHaveAttribute("href", "https://veritext.lemonsqueezy.com/buy/monthly");
  await expect(wall.getByTestId("buy-pack")).toHaveAttribute("href", "https://veritext.lemonsqueezy.com/buy/pack");
  await expect(page.getByTestId("words-left")).toHaveText("300 of 1,500 left");
  // Too long for one free run.
  await rewrite(page, words(700));
  await expect(page.getByTestId("paywall")).toContainText("too long for one run");
});

test("LaTeX is locked on Free; a license key unlocks it", async ({ page }) => {
  await page.goto("/app");
  await rewrite(page, LATEX);
  const wall = page.getByTestId("paywall");
  await expect(wall).toContainText("LaTeX needs a paid plan");

  await wall.getByRole("button", { name: "Enter a license key" }).click();
  await page.locator("#vx-license-key").fill("WRONG000-AAAA-BBBB-CCCC-000000000000");
  await page.getByTestId("activate").click();
  await expect(page.getByRole("alert").filter({ hasText: "not found" })).toBeVisible();
  await expect(page.getByTestId("plan-name")).toHaveText("Free");

  await page.locator("#vx-license-key").fill(GOOD_KEY);
  await page.getByTestId("activate").click();
  await expect(page.getByTestId("plan-name")).toContainText("Researcher");
  await expect(page.getByTestId("plan-name")).toContainText("ada@example.edu");
  await expect(page.getByTestId("words-left")).toHaveText("50,000 of 50,000 left");

  await rewrite(page);
  await expect(page.getByTestId("fidelity")).toBeVisible();
  await expect(page.getByTestId("paywall")).toHaveCount(0);
  await page.getByRole("tab", { name: "Rewritten text" }).click();
  await expect(page.getByTestId("output")).toContainText("\\section{Results}");
  await expect(page.getByTestId("output")).toContainText("\\cite{lee2019}");
  await expect(page.getByTestId("output")).toContainText("measured at 300 K to compare");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download fidelity report" }).click();
  expect((await download).suggestedFilename()).toBe("veritext-fidelity-report.json");

  // Still paid after a reload; removing the key goes back to Free.
  await page.reload();
  await expect(page.getByTestId("plan-name")).toContainText("Researcher");
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByTestId("plan-name")).toHaveText("Free");
});

test("arriving from checkout opens the key form", async ({ page }) => {
  await page.goto(`/app?license_key=${GOOD_KEY}`);
  await expect(page.locator("#vx-license-key")).toHaveValue(GOOD_KEY);
  await page.getByTestId("activate").click();
  await expect(page.getByTestId("plan-name")).toContainText("Researcher");
  await expect(page).toHaveURL(/\/app$/);
});

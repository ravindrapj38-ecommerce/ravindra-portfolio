import { defineConfig } from "@playwright/test";

// Cloud sessions ship Chromium at /opt/pw-browsers; CI installs its own (unset PW_CHROMIUM there).
const executablePath = process.env.PW_CHROMIUM || undefined;
const MOCK = "http://127.0.0.1:4010";

// The app is tested as built (`pnpm build` first), wired to local stand-ins for Lemon Squeezy and
// the Anthropic API, so the whole paid path runs without real keys or network.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", launchOptions: executablePath ? { executablePath } : {} },
  reporter: "list",
  webServer: [
    { command: "node e2e/mock-services.mjs", url: `${MOCK}/health`, reuseExistingServer: false },
    {
      command: "pnpm exec next start -p 3100 -H 127.0.0.1",
      url: "http://127.0.0.1:3100/api/health",
      reuseExistingServer: false,
      env: {
        ANTHROPIC_API_KEY: "sk-ant-e2e",
        ANTHROPIC_BASE_URL: MOCK,
        LEMONSQUEEZY_API_URL: MOCK,
        LEMONSQUEEZY_STORE_ID: "4242",
        LEMONSQUEEZY_RESEARCHER_VARIANT_IDS: "111",
        LEMONSQUEEZY_PACK_VARIANT_IDS: "222",
        VERITEXT_SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-0001",
        VERITEXT_CHECKOUT_MONTHLY: "https://veritext.lemonsqueezy.com/buy/monthly",
        VERITEXT_CHECKOUT_YEARLY: "https://veritext.lemonsqueezy.com/buy/yearly",
        VERITEXT_CHECKOUT_PACK: "https://veritext.lemonsqueezy.com/buy/pack",
        VERITEXT_SUPPORT_EMAIL: "help@veritext.test",
        ENGINE_URL: "",
        UPSTASH_REDIS_REST_URL: "",
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
    },
  ],
});

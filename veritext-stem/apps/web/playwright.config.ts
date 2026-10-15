import { defineConfig } from "@playwright/test";

// Cloud sessions ship Chromium at /opt/pw-browsers; CI installs its own (unset PW_CHROMIUM there).
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { launchOptions: executablePath ? { executablePath } : {} },
  reporter: "list",
});

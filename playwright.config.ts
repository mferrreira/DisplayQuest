import { defineConfig, devices } from "@playwright/test";

/**
 * E2E + visual baseline config.
 * - Dev server auto-starts unless one is already running on :3000
 * - Visual baselines (T0.7) are captured BEFORE the Tailwind v4 switch and stored in tests/e2e/__screenshots__
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: !process.env.CI ? true : false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

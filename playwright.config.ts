import { defineConfig, devices } from "@playwright/test";

/**
 * E2E + visual baseline config.
 * - Dev server auto-starts unless one is already running on :3001
 * - PORT 3001 (not 3000): a dockerized production build (`display-quest` container) occupies :3000
 *   on this machine; tests must always exercise OUR dev server, never that stale build.
 * - Visual baselines: baseline-v3 = pre-Tailwind-v4 switch; baseline-e1 recaptured at CP-1.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: !process.env.CI ? true : false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- -p 3001",
    url: "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

/**
 * T0.7 visual baseline capture (R2 mitigation).
 * Logs in as seeded coordinator, then captures viewport screenshots of every dashboard route
 * at 320/768/1024/1440 widths × light/dark themes into tests/e2e/__screenshots__/<variant>/.
 *
 * Usage: node scripts/capture-visual-baseline.mjs <outputDirName> [port]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const variant = process.argv[2] ?? "baseline-v3";
const port = process.argv[3] ?? "3000";
const base = `http://localhost:${port}`;
const outDir = path.resolve("tests/e2e/__screenshots__", variant);

const ROUTES = [
  "/dashboard",
  "/dashboard/projetos",
  "/dashboard/loja",
  "/dashboard/laboratorio",
  "/dashboard/weekly-reports",
  "/dashboard/admin",
  "/dashboard/leaderboard",
  "/dashboard/profile",
];
const WIDTHS = [1440, 1024, 768, 320];
const THEMES = ["light", "dark"];
const HEIGHT = 900;

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: HEIGHT } });

// Set theme BEFORE any page loads (next-themes reads localStorage "theme").
async function newPage(theme) {
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
  return page;
}

// --- login once (session cookie shared inside context) ---
const loginPage = await newPage("light");
await loginPage.goto(`${base}/login`, { waitUntil: "networkidle" });
await loginPage.fill("#email", "coordenador@lab.com");
await loginPage.fill("#password", "123");
await Promise.all([
  loginPage.waitForURL("**/dashboard*", { timeout: 30_000 }),
  loginPage.press("#password", "Enter"),
]);

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const page = await newPage(theme);
    await page.setViewportSize({ width, height: HEIGHT });
    for (const route of ROUTES) {
      const name = `${route.replace(/\//g, "_") || "root"}-${theme}-${width}.png`;
      try {
        await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
        await page.waitForTimeout(700); // settle animations/lazy chunks
        await page.screenshot({ path: path.join(outDir, name) });
        console.log(`✓ ${name}`);
      } catch (error) {
        console.error(`✗ ${name}: ${error.message}`);
      }
    }
    await page.close();
  }
}
await browser.close();
console.log(`\nDone → ${outDir}`);

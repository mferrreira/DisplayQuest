import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E1 shell smoke — server guard + auth round-trip + a11y baseline (CP-1 gate).
 * Credentials: seeded coordenador (scripts/capture-visual-baseline.mjs uses the same).
 */
const CREDENTIALS = { email: "coordenador@lab.com", password: "123" };

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CREDENTIALS.email);
  await page.getByLabel("Senha").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test("unauthenticated /dashboard is redirected to /login SERVER-side", async ({ request }) => {
  // request (no cookies) proves the redirect happens without client JS
  const res = await request.get("/dashboard", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toContain("/login");
});

test("login form authenticates and lands on dashboard", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await login(page);
  // Dashboard chrome mounted (header present)
  await expect(page.locator("header")).toBeVisible();
});

test("authenticated /dashboard renders kanban board", async ({ page }) => {
  await login(page);
  // Column header "A Fazer" (components/ui/kanban-column.tsx); .first() because task cards
  // also carry status badges with the same text.
  await expect(page.getByText("A Fazer").first()).toBeVisible({ timeout: 15_000 });
});

test("axe: login page has no critical accessibility violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
});

test("axe: dashboard SHELL (header) has no critical accessibility violations", async ({ page }) => {
  // Scoped to the shell per CP-1 gate. Whole-board findings (unnamed card action buttons,
  // progressbar names, contrast on overdue banner, nested-interactive DnD pattern) are
  // recorded in discoveries D-15 and become REQUIREMENTS of the E2 task-board spec (T2.1);
  // they are intentionally NOT asserted here against soon-to-be-rebuilt legacy markup.
  await login(page);
  await expect(page.getByText("A Fazer").first()).toBeVisible({ timeout: 15_000 });
  const results = await new AxeBuilder({ page }).include("header").analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
});

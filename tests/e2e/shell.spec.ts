import { test, expect } from "@playwright/test";

/**
 * E1 shell smoke — server guard + auth round-trip (CP-1 gate).
 * Credentials: seeded coordenador (scripts/capture-visual-baseline.mjs uses the same).
 */
const CREDENTIALS = { email: "coordenador@lab.com", password: "123" };

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

  await page.goto("/login");
  await page.getByLabel("Email").fill(CREDENTIALS.email);
  await page.getByLabel("Senha").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  // Dashboard chrome mounted (header present)
  await expect(page.locator("header")).toBeVisible();
});

test("authenticated /dashboard renders kanban board", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CREDENTIALS.email);
  await page.getByLabel("Senha").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  // Kanban column headers exist (to-do/in-progress/review columns render pt-BR labels)
  await expect(page.getByText(/a fazer|to-do|pendente/i).first()).toBeVisible({ timeout: 15_000 });
});

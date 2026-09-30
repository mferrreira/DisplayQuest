import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Shared E2E helpers.
 * Credentials: seeded coordenador (same used by scripts/capture-visual-baseline.mjs).
 */
export const CREDENTIALS = { email: "coordenador@lab.com", password: "123" };

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CREDENTIALS.email);
  await page.getByLabel("Senha").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Programmatic login for bare `request` fixtures (afterAll cleanup): performs the next-auth
 * credentials round-trip so the request context carries session cookies.
 */
export async function apiSession(request: APIRequestContext) {
  const csrf = (await (await request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  await request.post("/api/auth/callback/credentials", {
    form: {
      email: CREDENTIALS.email,
      password: CREDENTIALS.password,
      csrfToken: csrf.csrfToken,
      redirect: "false",
    },
  });
}


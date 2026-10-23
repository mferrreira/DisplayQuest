import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Shared E2E helpers.
 * Credentials: seeded coordenador (same used by scripts/capture-visual-baseline.mjs).
 */
export const CREDENTIALS = { email: "coordenador@lab.com", password: "123" };

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CREDENTIALS.email);
  // `exact`: o formulário tem um botão "Mostrar senha", e getByLabel sem exact faz
  // correspondência por fragmento — os dois elementos casavam e a suíte não entrava.
  await page.getByLabel("Senha", { exact: true }).fill(CREDENTIALS.password);
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

/**
 * O id da pessoa que a sessão autenticou, lido de quem já sabe: o `id` entra no token
 * (`lib/auth/config.ts`) e sai por `/api/auth/session`.
 *
 * Por que existe: o spec do quadro escreveu `COORDENADOR_ID = 2`, que é a identidade do coordenador
 * na instância local do dono (5432) — na base de teste isolada (5433) o coordenador semeado é outro
 * id, e os roundtrips G4 criam/apagam pessoas e movem ids. Um número escrito no spec é uma segunda
 * fonte de verdade para uma identidade que o servidor já devolve; quando ela não bate, o primeiro
 * teste do spec morre em `GET /api/users/2` com 404 e o spec serial não roda nenhum dos outros.
 */
export async function sessionUserId(request: APIRequestContext): Promise<number> {
  const session = (await (await request.get("/api/auth/session")).json()) as { user?: { id?: number } };
  const id = session.user?.id;
  if (typeof id !== "number") {
    throw new Error("sessão sem id — as credenciais do e2e não autenticaram nesta instância");
  }
  return id;
}


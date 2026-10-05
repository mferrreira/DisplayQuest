/**
 * B6-2a (D4, DEC-53) — o gate de MANAGE_REWARDS das rotas de badge desceu para
 * CreateBadgeUseCase / UpdateBadgeUseCase / DeleteBadgeUseCase. Este arquivo fixa o contrato
 * HTTP desse movimento.
 *
 * Por que um arquivo novo, e não `gamification-routes.test.ts`: aquele dobra o módulo
 * (`gamification: mocks.fakeModule`) E o guard (`ensurePermission: () => null`), então nenhum
 * 403 de badge nunca foi realmente exercitado — a asserção de 403 que existe ali é de
 * `POST /api/user-badges` (MANAGE_USERS, B6-2c) e vem do `hasPermission` dobrado. Aqui o
 * módulo é REAL sobre uma porta falsa, que é a mesma forma de `cron-status-roles.test.ts` e da
 * reescrita do teste de caraterização no B6-2a.
 *
 * O que fica congelado:
 *  - as 3 mensagens de 403 ("Sem permissão para criar/atualizar/excluir badges"), que são as
 *    que a rota legacy passava ao `ensurePermission` e que não podem mudar de texto;
 *  - a ordem permissão → validação de id: quem não tem permissão recebe 403 mesmo com id
 *    inválido (a validação do id desceu para o use case justamente para preservar isso);
 *  - que `GET /api/badges` e `GET /api/badges/[id]` são leitura pública — sem sessão, sem 401.
 *    Se algum dia ganharem auth, este arquivo quebra.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  badges: [] as Array<Record<string, unknown>>,
  /**-contadores de escrita na porta: provam que um 403 não chegou a gravar nada. */
  created: [] as unknown[],
  updated: [] as unknown[],
  deleted: [] as number[],
}));

vi.mock("@/backend/composition/root", () => {
  const badges: BadgeCatalogPort = {
    async findAll() {
      return mocks.badges as never;
    },
    async findById(id) {
      return (mocks.badges.find((b) => b.id === id) as never) ?? null;
    },
    async findActive() {
      return mocks.badges as never;
    },
    async findByCategory() {
      return mocks.badges as never;
    },
    async create(data) {
      mocks.created.push(data);
      const badge = { id: mocks.badges.length + 1, ...(data as object) };
      mocks.badges.push(badge);
      return badge as never;
    },
    async update(badge) {
      mocks.updated.push(badge);
      const index = mocks.badges.findIndex((b) => b.id === badge.id);
      mocks.badges[index] = { ...badge };
      return badge;
    },
    async delete(id) {
      mocks.deleted.push(id);
      mocks.badges.splice(
        mocks.badges.findIndex((b) => b.id === id),
        1,
      );
    },
  };

  // Só a porta de badges é exercitada pelas rotas de /api/badges; as outras existem porque
  // `createGamificationModule` constrói o módulo inteiro.
  const notUsed = (name: string) => (): never => {
    throw new Error(`porta de gamification não deveria ser usada neste teste: ${name}`);
  };
  const unused = new Proxy(
    {},
    {
      get: (_target, property) => notUsed(String(property)),
    },
  ) as never;

  const realGamification = createGamificationModule({
    ports: { badges, users: unused, awardHistory: unused, userBadges: unused, stats: unused },
  });

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      gamification: realGamification,
    }),
  };
});

// Só a identidade é dobrada: `requireApiActor` e `hasPermission` seguem sendo os de produção.
vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as badgesList, POST as badgesCreate } from "@/app/api/badges/route";
import { DELETE as badgeDelete, GET as badgeGet, PUT as badgeUpdate } from "@/app/api/badges/[id]/route";

/**
 * Quem tem MANAGE_REWARDS, segundo a matriz real (`backend/domain/identity/permissions.ts`:
 * `MANAGE_REWARDS: ["COORDENADOR", "GERENTE", "LABORATORISTA"]`). Cada papel é seu próprio
 * array porque `requireApiActor` normaliza com `normalizeRoles`, e um array é o formato da
 * sessão — passar a string solta daria `[]` e negaria todo mundo.
 */
const MANAGER_ROLES = [["COORDENADOR"], ["GERENTE"], ["LABORATORISTA"]];
/** VOLUNTARIO não tem nenhuma permissão de gestão. */
const NO_MANAGEMENT_ROLES = ["VOLUNTARIO"];

function login(roles: string[], id = 42) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function logout() {
  mocks.session = null;
}

function request(path: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

/** `Record<string, string>` alargaria para `{id?: string}` e o tipo da rota exige `id`. */
function params(values: { id: string }) {
  return { params: Promise.resolve(values) };
}

const body = async (response: Response) => await response.json();
const VALID_BADGE = { name: "Selo", description: "d", category: "social", createdBy: 7 };

beforeEach(() => {
  mocks.session = null;
  mocks.badges = [{ id: 1, name: "Existente", description: "d", category: "social", isActive: true, createdBy: 1 }];
  mocks.created = [];
  mocks.updated = [];
  mocks.deleted = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("badges — /api/badges", () => {
  it("GET é leitura PÚBLICA: sem sessão devolve 200", async () => {
    logout();
    const response = await badgesList();
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ badges: [{ id: 1, name: "Existente" }] });
  });

  it("POST sem sessão devolve 401 antes de qualquer autorização", async () => {
    logout();
    const response = await badgesCreate(request("/api/badges", { method: "POST", body: VALID_BADGE }));
    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ error: "Não autorizado" });
    expect(mocks.created).toHaveLength(0);
  });

  it("POST: os três papéis com MANAGE_REWARDS gravam; VOLUNTARIO leva 403 com a mensagem legada", async () => {
    for (const roles of MANAGER_ROLES) {
      login(roles);
      const response = await badgesCreate(request("/api/badges", { method: "POST", body: VALID_BADGE }));
      // 201, não 200 — medido nesta migração (a suíte antiga do módulo não exercitava o
      // status HTTP de create).
      expect(response.status).toBe(201);
      expect(await body(response)).toMatchObject({ badge: { name: "Selo" } });
    }
    expect(mocks.created).toHaveLength(MANAGER_ROLES.length);

    login(NO_MANAGEMENT_ROLES);
    const denied = await badgesCreate(request("/api/badges", { method: "POST", body: VALID_BADGE }));
    expect(denied.status).toBe(403);
    // A mensagem é a que a rota legacy passava; o code é o superset do OND8-B4 (DEC-53).
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para criar badges", code: "FORBIDDEN" });
    // o 403 não gravou nada
    expect(mocks.created).toHaveLength(MANAGER_ROLES.length);
  });
});

describe("badges — /api/badges/[id]", () => {
  it("GET é leitura PÚBLICA, com 400 de id e 404 de inexistente preservados na rota", async () => {
    logout();
    expect((await badgeGet(request("/api/badges/1"), params({ id: "1" }))).status).toBe(200);

    const invalid = await badgeGet(request("/api/badges/abc"), params({ id: "abc" }));
    expect(invalid.status).toBe(400);
    // a leitura não ganhou ator: este 400 continua sendo construído pela rota, com o corpo
    // antigo ({error} sem code) — é por isso que a validação do GET NÃO foi para o domínio.
    expect(await body(invalid)).toEqual({ error: "Badge inválido" });

    const missing = await badgeGet(request("/api/badges/999"), params({ id: "999" }));
    expect(missing.status).toBe(404);
    expect(await body(missing)).toEqual({ error: "Badge não encontrado" });
  });

  it("PUT: sem MANAGE_REWARDS leva 403 'atualizar' e não escreve", async () => {
    login(NO_MANAGEMENT_ROLES);
    const denied = await badgeUpdate(request("/api/badges/1", { method: "PUT", body: { name: "X" } }), params({ id: "1" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para atualizar badges", code: "FORBIDDEN" });
    expect(mocks.updated).toHaveLength(0);
  });

  it("DELETE: sem MANAGE_REWARDS leva 403 'excluir' e não apaga", async () => {
    login(NO_MANAGEMENT_ROLES);
    const denied = await badgeDelete(request("/api/badges/1", { method: "DELETE" }), params({ id: "1" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para excluir badges", code: "FORBIDDEN" });
    expect(mocks.deleted).toHaveLength(0);
    expect(mocks.badges).toHaveLength(1);
  });

  it("o gate vem ANTES da validação do id: sem permissão, id inválido é 403 e não 400", async () => {
    // A validação do id desceu para o use case junto com o gate. Se ela tivesse ficado na
    // rota, rodaria antes da chamada e devolveria 400 "Badge inválido" para quem tem 403.
    login(NO_MANAGEMENT_ROLES);
    for (const id of ["abc", "0", "-3"]) {
      const put = await badgeUpdate(request(`/api/badges/${id}`, { method: "PUT", body: {} }), params({ id }));
      expect(put.status).toBe(403);
      expect(await body(put)).toMatchObject({ error: "Sem permissão para atualizar badges" });

      const del = await badgeDelete(request(`/api/badges/${id}`, { method: "DELETE" }), params({ id }));
      expect(del.status).toBe(403);
      expect(await body(del)).toMatchObject({ error: "Sem permissão para excluir badges" });
    }

    // Com a permissão, o id inválido volta a ser o 400 — agora vindo do domínio (superset).
    login(MANAGER_ROLES[0]);
    const put = await badgeUpdate(request("/api/badges/abc", { method: "PUT", body: {} }), params({ id: "abc" }));
    expect(put.status).toBe(400);
    expect(await body(put)).toMatchObject({ error: "Badge inválido", code: "VALIDATION_ERROR" });

    const del = await badgeDelete(request("/api/badges/abc", { method: "DELETE" }), params({ id: "abc" }));
    expect(del.status).toBe(400);
    expect(await body(del)).toMatchObject({ error: "Badge inválido", code: "VALIDATION_ERROR" });
  });

  it("PUT/DELETE com a permissão continuam funcionando (o gate não quebrou o caminho feliz)", async () => {
    login(MANAGER_ROLES[0]);
    const updated = await badgeUpdate(
      request("/api/badges/1", { method: "PUT", body: { name: "Renomeado" } }),
      params({ id: "1" }),
    );
    expect(updated.status).toBe(200);
    expect(await body(updated)).toMatchObject({ badge: { id: 1, name: "Renomeado" } });

    expect((await badgeDelete(request("/api/badges/1", { method: "DELETE" }), params({ id: "1" }))).status).toBe(200);
    expect(mocks.deleted).toEqual([1]);
  });

  it("PUT/DELETE em badge inexistente devolvem 404 (o gate passa antes do NotFound)", async () => {
    login(MANAGER_ROLES[0]);
    const put = await badgeUpdate(request("/api/badges/999", { method: "PUT", body: {} }), params({ id: "999" }));
    expect(put.status).toBe(404);
    expect(await body(put)).toMatchObject({ error: "Badge não encontrado", code: "NOT_FOUND" });

    const del = await badgeDelete(request("/api/badges/999", { method: "DELETE" }), params({ id: "999" }));
    expect(del.status).toBe(404);
    expect(await body(del)).toMatchObject({ error: "Badge não encontrado", code: "NOT_FOUND" });
  });
});
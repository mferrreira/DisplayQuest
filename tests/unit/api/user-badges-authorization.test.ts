/**
 * B6-2c (D4, DEC-115) — os 3 gates que este lote moveu da rota para o módulo gamification.
 * Este arquivo fixa o contrato HTTP do movimento com o módulo REAL sobre portas falsas.
 *
 * Por que um arquivo novo, e não `gamification-routes.test.ts`: aquele dobra o módulo inteiro,
 * então nenhum 403 destas rotas é exercitado de verdade — é o mesmo defeito que o B6-2a achou
 * nos badges e que a nota do B6-RESTANTE já apontava para user-badges ("o lote precisa de um
 * user-badges-authorization.test.ts com módulo real sobre porta falsa"). Aqui só `requireAuth`
 * é dobrado: a identidade, a matriz de permissões e as funções do domínio são as de produção.
 *
 * O que fica congelado:
 *  - POST /api/user-badges e DELETE /api/user-badges/[userId]/[badgeId]: o gate de MANAGE_USERS
 *    roda ANTES da rota ler corpo/params — sem permissão, corpo inválido é 403 e não 400
 *    (medição do B6-RESTANTE §B6-2c; é por isso que existe `assertCanManageUserBadges`);
 *  - a mensagem "Acesso negado" (a mesma que `ensurePermission` devolvia) e o corpo com
 *    `code`/`details` (DEC-53, superset do OND8-B4);
 *  - a validação da rota continua onde estava: 400 "badgeId e userId são obrigatórios" e
 *    400 "Parâmetros inválidos", com o corpo de rota antigo ({error} sem code);
 *  - GET /api/user-badges é LEITURA ABERTA — decisão do dono em 2026-10-07: ver os perfis dos
 *    outros inclui ver as insígnias, então basta estar autenticado. Se algum dia ganhar gate,
 *    este arquivo quebra;
 *  - GET /api/users/[id]/gamification: validação do id ANTES do gate (400 "Usuário inválido"
 *    para quem não é dono nem gestor), depois self-or-manage — dono lê o próprio, COORDENADOR e
 *    GERENTE leem de qualquer um.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  badges: [] as Array<Record<string, unknown>>,
  userBadges: [] as Array<Record<string, unknown>>,
  /** userId -> points, a matéria-prima de getUserProgression. */
  progression: new Map<number, number>(),
  /** Contador de escrita: prova que um 403/404 não chegou a gravar nada. */
  writes: [] as string[],
}));

vi.mock("@/backend/composition/root", () => {
  // As portas que estas rotas não exercem falham alto, para um typo de porta virar erro em
  // vez de dado vazio (regra da casa do B6-2a).
  const notUsed = (name: string) => (): never => {
    throw new Error(`porta de gamification não deveria ser usada neste teste: ${name}`);
  };
  const unused = new Proxy(
    {},
    { get: (_target, property) => notUsed(String(property)) },
  ) as never;

  const badges: BadgeCatalogPort = {
    async findById(id) {
      return (mocks.badges.find((badge) => badge.id === id) as never) ?? null;
    },
    async findAll() {
      return notUsed("badges.findAll")();
    },
    async findActive() {
      return notUsed("badges.findActive")();
    },
    async findByCategory() {
      return notUsed("badges.findByCategory")();
    },
    async create() {
      return notUsed("badges.create")();
    },
    async update() {
      return notUsed("badges.update")();
    },
    async delete() {
      return notUsed("badges.delete")();
    },
  };

  const userBadges: UserBadgePort = {
    async findByUserId(userId) {
      return mocks.userBadges.filter((ub) => ub.userId === userId) as never;
    },
    async findRecentByUserId(userId, limit) {
      return mocks.userBadges.filter((ub) => ub.userId === userId).slice(0, limit) as never;
    },
    async findByUserAndBadge(userId, badgeId) {
      const found = mocks.userBadges.find((ub) => ub.userId === userId && ub.badgeId === badgeId);
      return (found as never) ?? null;
    },
    async create(data) {
      mocks.writes.push(`create:${data.userId}:${data.badgeId}`);
      const userBadge = { id: mocks.userBadges.length + 1, ...data };
      mocks.userBadges.push(userBadge);
      return userBadge as never;
    },
    async delete(id) {
      mocks.writes.push(`delete:${id}`);
      const index = mocks.userBadges.findIndex((ub) => ub.id === id);
      if (index !== -1) mocks.userBadges.splice(index, 1);
    },
  };

  const users: GamificationUsersPort = {
    async findProgressionById(userId) {
      const points = mocks.progression.get(userId);
      return points === undefined ? null : { id: userId, points };
    },
    async findUserById() {
      return notUsed("users.findUserById")();
    },
    async findAllUsers() {
      return notUsed("users.findAllUsers")();
    },
  };

  const realGamification = createGamificationModule({
    ports: { badges, userBadges, users, awardHistory: unused, stats: unused },
  });

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      gamification: realGamification,
    }),
  };
});

// Só a sessão é dobrada: `requireApiActor` e a matriz de permissões seguem sendo as de produção.
vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as userBadgesList, POST as userBadgesAward } from "@/app/api/user-badges/route";
import { DELETE as userBadgeRemove } from "@/app/api/user-badges/[userId]/[badgeId]/route";
import { GET as userGamification } from "@/app/api/users/[id]/gamification/route";

/**
 * Matriz real (`backend/domain/identity/permissions.ts`): MANAGE_USERS = COORDENADOR, GERENTE.
 * Cada papel é seu próprio array porque `requireApiActor` normaliza com `normalizeRoles` —
 * passar a string solta daria `[]` e negaria todo mundo.
 */
const MANAGER_ROLES = [["COORDENADOR"], ["GERENTE"]];
/** VOLUNTARIO não tem nenhuma permissão de gestão. */
const NO_MANAGEMENT_ROLES = ["VOLUNTARIO"];
/** O id da sessão — usado no caso "dono lê a própria progressão". */
const ACTOR_ID = 42;
/** Um usuário qualquer, dono de badge e de progressão nos fixtures. */
const OTHER_USER_ID = 7;

function login(roles: string[], id = ACTOR_ID) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function logout() {
  mocks.session = null;
}

function request(path: string, init?: { method?: string; body?: unknown; rawBody?: string }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.rawBody ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
    headers: { "content-type": "application/json" },
  });
}

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) };
}

const body = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.badges = [{ id: 10, name: "Selo", description: "d", category: "social", isActive: true, createdBy: 1 }];
  mocks.userBadges = [{ id: 1, userId: OTHER_USER_ID, badgeId: 10 }];
  mocks.progression = new Map<number, number>([[OTHER_USER_ID, 250]]);
  mocks.writes = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/user-badges — o gate de MANAGE_USERS está no módulo", () => {
  it("sem sessão devolve 401 antes de qualquer autorização", async () => {
    logout();
    const response = await userBadgesAward(request("/api/user-badges", { method: "POST", body: { badgeId: 10, userId: 7 } }));
    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ error: "Não autorizado" });
    expect(mocks.writes).toHaveLength(0);
  });

  it("o gate vem ANTES do corpo: sem permissão e corpo inválido é 403, não 400 nem 500", async () => {
    // A rota legacy lia o corpo DEPOIS do gate. Descer o gate sem `assertCanManageUserBadges`
    // faria o parse acontecer primeiro — e um corpo que nem é JSON daria 500 para quem hoje
    // leva 403. Este caso é o que prova que a ordem sobreviveu à migração.
    login(NO_MANAGEMENT_ROLES);

    const semChaves = await userBadgesAward(request("/api/user-badges", { method: "POST", body: {} }));
    expect(semChaves.status).toBe(403);
    expect(await body(semChaves)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    const corpoQuebrado = await userBadgesAward(request("/api/user-badges", { method: "POST", rawBody: "{nao é json" }));
    expect(corpoQuebrado.status).toBe(403);

    expect(mocks.writes).toHaveLength(0);
  });

  it("os dois papéis com MANAGE_USERS concedem (201) e a escrita chega à porta", async () => {
    // Um alvo por iteração: o fixture já traz o badge 10 na conta do usuário 7, então
    // conceder nele de novo seria 409 — o teste de conflito logo abaixo prova esse caminho.
    for (const [index, roles] of MANAGER_ROLES.entries()) {
      const targetId = 100 + index;
      login(roles);
      const response = await userBadgesAward(
        request("/api/user-badges", { method: "POST", body: { badgeId: 10, userId: targetId } }),
      );
      expect(response.status).toBe(201);
      expect(await body(response)).toMatchObject({ userBadge: { userId: targetId, badgeId: 10 } });
    }
    expect(mocks.writes).toHaveLength(MANAGER_ROLES.length);
  });

  it("quem tem a permissão e concede o que já existe leva 409 (o gate não esconde o domínio)", async () => {
    login(MANAGER_ROLES[0]);
    const response = await userBadgesAward(
      request("/api/user-badges", { method: "POST", body: { badgeId: 10, userId: OTHER_USER_ID } }),
    );
    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({ error: "Usuário já possui este badge", code: "CONFLICT" });
    expect(mocks.writes).toHaveLength(0);
  });

  it("VOLUNTARIO com corpo válido leva 403 e nada é gravado", async () => {
    login(NO_MANAGEMENT_ROLES);
    const response = await userBadgesAward(
      request("/api/user-badges", { method: "POST", body: { badgeId: 10, userId: OTHER_USER_ID } }),
    );
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
    expect(mocks.writes).toHaveLength(0);
  });

  it("com permissão, a validação da rota continua 400 com a mensagem congelada e o corpo de rota", async () => {
    login(MANAGER_ROLES[0]);
    const response = await userBadgesAward(
      request("/api/user-badges", { method: "POST", body: { badgeId: 0, userId: OTHER_USER_ID } }),
    );
    expect(response.status).toBe(400);
    // corpo de rota ({error} sem code): esta validação não desceu, então ela não ganhou o
    // superset do DEC-53.
    expect(await body(response)).toEqual({ error: "badgeId e userId são obrigatórios" });
    expect(mocks.writes).toHaveLength(0);
  });
});

describe("DELETE /api/user-badges/[userId]/[badgeId] — mesmo gate, mesma ordem", () => {
  it("sem sessão devolve 401", async () => {
    logout();
    const response = await userBadgeRemove(
      request("/api/user-badges/7/10", { method: "DELETE" }),
      params({ userId: "7", badgeId: "10" }),
    );
    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ error: "Não autorizado" });
  });

  it("o gate vem ANTES dos params: sem permissão e param inválido é 403, não 400", async () => {
    // Ordem medida no B6-RESTANTE: gate → 400 "Parâmetros inválidos". Descer o gate sem o
    // assert inverteria esta ordem.
    login(NO_MANAGEMENT_ROLES);
    const response = await userBadgeRemove(
      request("/api/user-badges/0/10", { method: "DELETE" }),
      params({ userId: "0", badgeId: "10" }),
    );
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
    expect(mocks.writes).toHaveLength(0);
  });

  it("VOLUNTARIO com params válidos leva 403 e não apaga", async () => {
    login(NO_MANAGEMENT_ROLES);
    const response = await userBadgeRemove(
      request("/api/user-badges/7/10", { method: "DELETE" }),
      params({ userId: "7", badgeId: "10" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.writes).toHaveLength(0);
    expect(mocks.userBadges).toHaveLength(1);
  });

  it("COORDENADOR remove (200) e o que não existe devolve 404 (o gate passa antes do NotFound)", async () => {
    login(MANAGER_ROLES[0]);
    const ok = await userBadgeRemove(
      request("/api/user-badges/7/10", { method: "DELETE" }),
      params({ userId: "7", badgeId: "10" }),
    );
    expect(ok.status).toBe(200);
    expect(await body(ok)).toEqual({ success: true });
    expect(mocks.userBadges).toHaveLength(0);

    const missing = await userBadgeRemove(
      request("/api/user-badges/7/10", { method: "DELETE" }),
      params({ userId: "7", badgeId: "10" }),
    );
    expect(missing.status).toBe(404);
    expect(await body(missing)).toMatchObject({ error: "Usuário não possui este badge", code: "NOT_FOUND" });
  });

  it("com permissão, params inválidos continuam 400 com o corpo de rota congelado", async () => {
    login(MANAGER_ROLES[0]);
    const response = await userBadgeRemove(
      request("/api/user-badges/0/10", { method: "DELETE" }),
      params({ userId: "0", badgeId: "10" }),
    );
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "Parâmetros inválidos" });
    expect(mocks.writes).toHaveLength(0);
  });
});

describe("GET /api/user-badges — leitura aberta (decisão do dono, 2026-10-07)", () => {
  it("exige sessão: sem autenticação devolve 401", async () => {
    logout();
    const response = await userBadgesList(request(`/api/user-badges?userId=${OTHER_USER_ID}`));
    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ error: "Não autorizado" });
  });

  it("VOLUNTARIO lê os badges de OUTRO usuário sem permissão nenhuma — é contrato, não buraco", async () => {
    login(NO_MANAGEMENT_ROLES);
    const response = await userBadgesList(request(`/api/user-badges?userId=${OTHER_USER_ID}`));
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      badges: [{ userId: OTHER_USER_ID, badgeId: 10 }],
      count: 1,
    });
  });

  it("gestor lê do mesmo jeito (nenhum gate foi acrescentado a esta rota)", async () => {
    login(MANAGER_ROLES[0]);
    const response = await userBadgesList(request(`/api/user-badges?userId=${OTHER_USER_ID}`));
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ count: 1 });
  });
});

describe("GET /api/users/[id]/gamification — self-or-manage", () => {
  it("sem sessão devolve 401", async () => {
    logout();
    const response = await userGamification(request(`/api/users/${OTHER_USER_ID}/gamification`), params({ id: String(OTHER_USER_ID) }));
    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ error: "Não autorizado" });
  });

  it("a validação do id continua ANTES do gate: sem permissão, id inválido é 400 e não 403", async () => {
    // Ordem medida: 400 "Usuário inválido" primeiro, gate depois. Descer o gate sem preservar
    // isso trocaria um 400 por 403 para todo mundo.
    login(NO_MANAGEMENT_ROLES);
    for (const id of ["abc", "0", "-3"]) {
      const response = await userGamification(request(`/api/users/${id}/gamification`), params({ id }));
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({ error: "Usuário inválido" });
    }
  });

  it("o dono VOLUNTARIO lê a própria progressão", async () => {
    mocks.progression.set(ACTOR_ID, 120);
    login(NO_MANAGEMENT_ROLES, ACTOR_ID);
    const response = await userGamification(request(`/api/users/${ACTOR_ID}/gamification`), params({ id: String(ACTOR_ID) }));
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ progression: { userId: ACTOR_ID, points: 120 } });
  });

  it("VOLUNTARIO lendo a progressão de OUTRO leva 403 'Acesso negado'", async () => {
    login(NO_MANAGEMENT_ROLES, ACTOR_ID);
    const response = await userGamification(
      request(`/api/users/${OTHER_USER_ID}/gamification`),
      params({ id: String(OTHER_USER_ID) }),
    );
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("COORDENADOR e GERENTE leem a progressão de qualquer um", async () => {
    for (const roles of MANAGER_ROLES) {
      login(roles, ACTOR_ID);
      const response = await userGamification(
        request(`/api/users/${OTHER_USER_ID}/gamification`),
        params({ id: String(OTHER_USER_ID) }),
      );
      expect(response.status).toBe(200);
      expect(await body(response)).toMatchObject({ progression: { userId: OTHER_USER_ID, points: 250 } });
    }
  });

  it("usuário inexistente devolve 404 (o gate passa antes do NotFound)", async () => {
    login(MANAGER_ROLES[0]);
    const response = await userGamification(request("/api/users/999999/gamification"), params({ id: "999999" }));
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({ error: "Usuário não encontrado", code: "NOT_FOUND" });
  });
});

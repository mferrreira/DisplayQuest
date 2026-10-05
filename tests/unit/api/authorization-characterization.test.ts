// @vitest-environment node
/**
 * B6-0 (D4) — CARACTERIZAÇÃO da decisão de autorização das rotas que decidem na rota e não
 * tinham teste nenhum. Medido em 2026-10-05: das 41 rotas que decidem autorização na camada
 * de rota (17 importam `hasPermission`/`hasRole` de `@/lib/auth/rbac`, 29 usam
 * `ensurePermission`/`ensureAnyRole`/`ensureSelfOrPermission` de `@/lib/auth/api-guard`),
 * 13 não eram importadas por teste algum:
 *
 *   issues/[id], issues/[id]/assign, issues/[id]/resolve, issues/[id]/status,
 *   responsibilities, responsibilities/[id], schedules/bulk,
 *   purchases, rewards, rewards/[id],
 *   projects, weekly-reports/bulk, tasks/global-progress
 *
 * Estes testes existem para o B6 poder MOVER a decisão da rota para o use case sem mudar
 * comportamento observável. A regra: quando um lote do B6 mover a checagem, estes testes
 * passam sem editar uma linha. Se precisarem de edição, o comportamento mudou e o lote
 * está errado.
 *
 * O que é fixado aqui, por rota:
 *   - quem é servido e quem recebe 403 (COORDENADOR, LABORATORISTA, VOLUNTARIO);
 *   - o corpo EXATO do 403 (o legado `{error}` — o domínio devolve `{error,code,details}`,
 *     que é superset, e a migração tem de preservar `error`);
 *   - a ORDEM das checagens, que é contrato: 404 antes de 403; `assigneeId` inválido depois
 *     do 403; `userId` inválido ANTES do 403 em POST /purchases; JSON inválido depois do
 *     403 em PUT /schedules/bulk.
 *
 * Fixtures que decidem o resultado: `identityAccess` é o módulo REAL
 * (`createIdentityAccessModule`), e `@/lib/auth/api-guard` + `@/lib/auth/rbac` rodam de
 * verdade. Só a identidade (`requireAuth`) e o backend de negócio são dobrados — se o mock
 * do guard fosse usado aqui, o teste fixaria o mock, não a decisão.
 *
 * Papéis usados (a matriz real está em `backend/domain/identity/permissions.ts`):
 *   MANAGE_USERS       = COORDENADOR, GERENTE
 *   MANAGE_REWARDS     = COORDENADOR, GERENTE, LABORATORISTA
 *   MANAGE_PURCHASES   = COORDENADOR, GERENTE, LABORATORISTA
 *   MANAGE_PROJECTS    = COORDENADOR, GERENTE, GERENTE_PROJETO
 *   VOLUNTARIO         = nenhuma permissão de gestão (o papel somente-leitura)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";

const mocks = vi.hoisted(() => {
  const state = {
    /** null = sem sessão (401). Objeto = usuário logado. */
    session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
    /** issue usada pelas 4 rotas /issues/*: reporterId e assigneeId controlam o acesso. */
    issue: { id: 5, reporterId: 100, assigneeId: 200, status: "open", title: "Issue de teste" },
    issueExiste: true,
    canEndResponsibility: true,
    listPurchasesDenied: null as null | string,
  };

  const entidade = (payload: Record<string, unknown>) => ({ ...payload, toJSON: () => payload });

  const labOperations = {
    getIssue: async (id: number) => (state.issueExiste ? { ...state.issue, id } : null),
    assignIssue: async (id: number, assigneeId: number) => ({ ...state.issue, id, assigneeId }),
    updateIssue: async (id: number, data: Record<string, unknown>) => ({ ...state.issue, id, ...data }),
    deleteIssue: async (_id: number) => undefined,
    resolveIssue: async (id: number) => ({ ...state.issue, id, status: "resolved" }),
    startIssueProgress: async (id: number) => ({ ...state.issue, id, status: "in_progress" }),
    closeIssue: async (id: number) => ({ ...state.issue, id, status: "closed" }),
    reopenIssue: async (id: number) => ({ ...state.issue, id, status: "open" }),
    unassignIssue: async (id: number) => ({ ...state.issue, id, assigneeId: null }),
    listResponsibilities: async () => ({ responsibilities: [entidade({ id: 1, notes: "nota" })] }),
    canEndResponsibility: async () => state.canEndResponsibility,
    endResponsibility: async (id: number) => entidade({ id, ended: true }),
    updateResponsibilityNotes: async (id: number, _actorId: number, notes: string) =>
      entidade({ id, notes }),
    pauseResponsibilityForUser: async () => entidade({ id: 1, paused: true }),
    resumeResponsibilityForUser: async () => entidade({ id: 1, paused: false }),
    startResponsibility: async (command: Record<string, unknown>) =>
      entidade({ id: 9, notes: command.notes }),
    deleteResponsibility: async (_id: number) => undefined,
    replaceUserSchedules: async ({ slots }: { slots: unknown[] }) =>
      slots.map((slot, index) => entidade({ id: index, ...(slot as object) })),
  };

  const store = {
    listPurchases: async () =>
      state.listPurchasesDenied
        ? { denied: true, message: state.listPurchasesDenied }
        : { denied: false, purchases: [{ id: 1, userId: 42 }] },
    createPurchase: async (data: Record<string, unknown>) => ({ id: 7, ...data }),
    listRewards: async () => [{ id: 1, name: "Recompensa" }],
    createReward: async (data: Record<string, unknown>) => ({ id: 3, ...data }),
    getReward: async (id: number) => (id === 999 ? null : { id, name: "Recompensa" }),
    updateReward: async (id: number, data: Record<string, unknown>) => ({ id, ...data }),
    patchReward: async ({ rewardId }: { rewardId: number }) => ({ id: rewardId, patched: true }),
    deleteReward: async (_id: number) => undefined,
  };

  const projectManagement = {
    listProjectsForActor: async () => [{ id: 1, name: "Projeto" }],
    createProject: async (data: Record<string, unknown>) => ({ id: 2, ...data }),
  };

  const reporting = {
    bulkGenerateWeeklyReports: async () => ({ generated: 2 }),
  };

  const taskManagement = {
    globalProgress: async () => ({ total: 10, done: 4 }),
  };

  return { state, labOperations, store, projectManagement, reporting, taskManagement };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({
    // módulo REAL: a matriz de permissões exercitada aqui é a de produção
    identityAccess: createIdentityAccessModule(),
    labOperations: mocks.labOperations,
    store: mocks.store,
    projectManagement: mocks.projectManagement,
    reporting: mocks.reporting,
    taskManagement: mocks.taskManagement,
  }),
}));

// Só a identidade é dobrada. `requireApiActor`, `ensurePermission`, `ensureAnyRole` e
// `hasPermission` continuam sendo os de produção.
vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.state.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.state.session },
}));

import { DELETE as issueDelete, GET as issueGet, PUT as issueUpdate } from "@/app/api/issues/[id]/route";
import { POST as issueAssign } from "@/app/api/issues/[id]/assign/route";
import { POST as issueResolve } from "@/app/api/issues/[id]/resolve/route";
import { PATCH as issueStatus } from "@/app/api/issues/[id]/status/route";
import { GET as responsibilitiesList, POST as responsibilitiesStart } from "@/app/api/responsibilities/route";
import { DELETE as responsibilityDelete, PATCH as responsibilityPatch } from "@/app/api/responsibilities/[id]/route";
import { PUT as schedulesBulk } from "@/app/api/schedules/bulk/route";
import { GET as purchasesList, POST as purchasesCreate } from "@/app/api/purchases/route";
import { GET as rewardsList, POST as rewardsCreate } from "@/app/api/rewards/route";
import { DELETE as rewardDelete, GET as rewardGet, PATCH as rewardPatch, PUT as rewardUpdate } from "@/app/api/rewards/[id]/route";
import { GET as projectsList, POST as projectsCreate } from "@/app/api/projects/route";
import { POST as weeklyReportsBulk } from "@/app/api/weekly-reports/bulk/route";
import { GET as tasksGlobalProgress } from "@/app/api/tasks/global-progress/route";

function login(roles: string[], id = 42) {
  mocks.state.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function logout() {
  mocks.state.session = null;
}

function request(path: string, init?: { method?: string; body?: unknown; raw?: string }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.raw !== undefined ? init.raw : init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) };
}

const body = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.state.session = null;
  mocks.state.issue = { id: 5, reporterId: 100, assigneeId: 200, status: "open", title: "Issue de teste" };
  mocks.state.issueExiste = true;
  mocks.state.canEndResponsibility = true;
  mocks.state.listPurchasesDenied = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lab-operations — /api/issues/[id]", () => {
  it("GET lê a issue sem checagem de papel (qualquer autenticado)", async () => {
    login(["VOLUNTARIO"]);
    const response = await issueGet(request("/api/issues/5"), params({ id: "5" }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ issue: { ...mocks.state.issue, id: 5 } });
  });

  it("PUT: MANAGER (reporter) passa; terceiro recebe 403 com corpo legado", async () => {
    login(["LABORATORISTA"], 100); // reporterId
    expect((await issueUpdate(request("/api/issues/5", { method: "PUT", body: { title: "x" } }), params({ id: "5" }))).status).toBe(200);

    login(["VOLUNTARIO"], 999);
    const denied = await issueUpdate(request("/api/issues/5", { method: "PUT", body: { title: "x" } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para atualizar issue" });
  });

  it("PUT: assignee também pode (reporterId OU assigneeId)", async () => {
    login(["LABORATORISTA"], 200);
    expect((await issueUpdate(request("/api/issues/5", { method: "PUT", body: { title: "x" } }), params({ id: "5" }))).status).toBe(200);
  });

  it("DELETE: mensagem de 403 própria ('excluir'), distinta da de PUT", async () => {
    login(["VOLUNTARIO"], 999);
    const denied = await issueDelete(request("/api/issues/5", { method: "DELETE" }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para excluir issue" });
  });

  it("404 vem ANTES do 403: issue inexistente não vaza autorização", async () => {
    mocks.state.issueExiste = false;
    login(["VOLUNTARIO"], 999);
    const response = await issueUpdate(request("/api/issues/5", { method: "PUT", body: {} }), params({ id: "5" }));
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: "Issue não encontrado" });
  });
});

describe("lab-operations — /api/issues/[id]/assign", () => {
  it("COORDENADOR atribui; terceiro sem papel recebe 403", async () => {
    login(["COORDENADOR"]);
    expect((await issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 7 } }), params({ id: "5" }))).status).toBe(200);

    login(["VOLUNTARIO"], 999);
    const denied = await issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 7 } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para atribuir issue" });
  });

  it("reporter pode atribuir a própria issue", async () => {
    login(["LABORATORISTA"], 100);
    expect((await issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 7 } }), params({ id: "5" }))).status).toBe(200);
  });

  it("403 vem ANTES da validação: assigneeId ausente devolve 403, não 400", async () => {
    login(["VOLUNTARIO"], 999);
    const response = await issueAssign(request("/api/issues/5/assign", { method: "POST", body: {} }), params({ id: "5" }));
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ error: "Sem permissão para atribuir issue" });
  });

  it("quem passa pelo gate recebe 400 de assigneeId ausente", async () => {
    login(["COORDENADOR"]);
    const response = await issueAssign(request("/api/issues/5/assign", { method: "POST", body: {} }), params({ id: "5" }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "assigneeId é obrigatório" });
  });
});

describe("lab-operations — /api/issues/[id]/resolve", () => {
  it("assignee resolve; terceiro recebe 403", async () => {
    login(["LABORATORISTA"], 200);
    expect((await issueResolve(request("/api/issues/5/resolve", { method: "POST", body: { resolution: "ok" } }), params({ id: "5" }))).status).toBe(200);

    login(["VOLUNTARIO"], 999);
    const denied = await issueResolve(request("/api/issues/5/resolve", { method: "POST", body: { resolution: "ok" } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para resolver issue" });
  });
});

describe("lab-operations — /api/issues/[id]/status", () => {
  it("uma ação por vez; terceira pessoa recebe 403 antes do switch", async () => {
    login(["COORDENADOR"]);
    for (const action of ["start", "resolve", "closed", "reopen", "unassign"]) {
      expect((await issueStatus(request("/api/issues/5/status", { method: "PATCH", body: { action } }), params({ id: "5" }))).status).toBe(200);
    }

    login(["VOLUNTARIO"], 999);
    const denied = await issueStatus(request("/api/issues/5/status", { method: "PATCH", body: { action: "start" } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para atualizar status do issue" });
  });

  it("ação desconhecida é 400 para quem tem o gate", async () => {
    login(["COORDENADOR"]);
    const response = await issueStatus(request("/api/issues/5/status", { method: "PATCH", body: { action: "nope" } }), params({ id: "5" }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "Ação inválida" });
  });
});

describe("lab-operations — /api/responsibilities", () => {
  it("GET é leitura aberta: VOLUNTARIO lista", async () => {
    login(["VOLUNTARIO"]);
    expect((await responsibilitiesList(request("/api/responsibilities"))).status).toBe(200);
  });

  it("POST exige um dos três papéis; GERENTE_PROJETO é barrado mesmo tendo MANAGE_PROJECTS", async () => {
    login(["LABORATORISTA"]);
    expect((await responsibilitiesStart(request("/api/responsibilities", { method: "POST", body: {} }))).status).toBe(201);

    login(["GERENTE_PROJETO"]);
    const denied = await responsibilitiesStart(request("/api/responsibilities", { method: "POST", body: {} }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para iniciar responsabilidade do laboratório" });
  });
});

describe("lab-operations — /api/responsibilities/[id]", () => {
  it("PATCH end: canEndResponsibility decide (a rota só mapeia o 403)", async () => {
    login(["LABORATORISTA"]);
    expect((await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "end" } }), params({ id: "1" }))).status).toBe(200);

    mocks.state.canEndResponsibility = false;
    const denied = await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "end" } }), params({ id: "1" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({
      error: "Apenas o laboratorista atual ou um administrador pode encerrar a responsabilidade",
    });
  });

  it("PATCH updateNotes tem mensagem própria de 403", async () => {
    login(["LABORATORISTA"]);
    mocks.state.canEndResponsibility = false;
    const denied = await responsibilityPatch(
      request("/api/responsibilities/1", { method: "PATCH", body: { action: "updateNotes", notes: "x" } }),
      params({ id: "1" }),
    );
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para atualizar notas desta responsabilidade" });
  });

  it("PATCH pause/resume não têm gate além da autenticação", async () => {
    login(["VOLUNTARIO"]);
    expect((await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "pause" } }), params({ id: "1" }))).status).toBe(200);
    expect((await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "resume" } }), params({ id: "1" }))).status).toBe(200);
  });

  it("PATCH ação desconhecida é 400", async () => {
    login(["LABORATORISTA"]);
    const response = await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "?" } }), params({ id: "1" }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "Ação não suportada" });
  });

  it("DELETE exige um dos três papéis", async () => {
    login(["LABORATORISTA"]);
    expect((await responsibilityDelete(request("/api/responsibilities/1", { method: "DELETE" }), params({ id: "1" }))).status).toBe(200);

    login(["PESQUISADOR"]);
    const denied = await responsibilityDelete(request("/api/responsibilities/1", { method: "DELETE" }), params({ id: "1" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para excluir responsabilidade" });
  });
});

describe("lab-operations — /api/schedules/bulk", () => {
  it("VOLUNTARIO recebe 403 com a mensagem padrão", async () => {
    login(["VOLUNTARIO"]);
    const denied = await schedulesBulk(request("/api/schedules/bulk", { method: "PUT", body: { userId: 9, slots: [] } }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });

  it("o gate vem ANTES do parse: JSON inválido de um não-autorizado é 403, não 400", async () => {
    login(["VOLUNTARIO"]);
    const denied = await schedulesBulk(request("/api/schedules/bulk", { method: "PUT", raw: "{quebrado" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });

  it("COORDENADOR grava a grade de outro usuário", async () => {
    login(["COORDENADOR"]);
    const response = await schedulesBulk(
      request("/api/schedules/bulk", {
        method: "PUT",
        body: { userId: 9, slots: [{ dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }] },
      }),
    );
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ schedules: [{ id: 0, dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }] });
  });

  it("COORDENADOR com slots inválidos recebe 400 (validação depois do gate)", async () => {
    login(["COORDENADOR"]);
    const response = await schedulesBulk(
      request("/api/schedules/bulk", { method: "PUT", body: { userId: 9, slots: [{ dayOfWeek: 9, startTime: "08:00", endTime: "12:00" }] } }),
    );
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "Dados inválidos: dia da semana ou horários inválidos" });
  });
});

describe("store — /api/purchases", () => {
  it("POST: a validação de userId vem ANTES do 403", async () => {
    login(["VOLUNTARIO"], 42);
    const response = await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: "abc" } }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "userId inválido" });
  });

  it("POST: o gate é cross-actor — comprar PARA SI é sempre permitido", async () => {
    // Medido: a regra da rota é `!canManagePurchases && targetUserId !== actor.id`. Ou seja, o
    // que exige MANAGE_PURCHASES é comprar PARA OUTRO, não comprar. Um VOLUNTARIO comprando
    // para si passa (201) — e quem barra é o use case, por pontos insuficientes.
    login(["VOLUNTARIO"], 42);
    expect((await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 42 } }))).status).toBe(201);

    const denied = await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 77 } }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });

  it("POST: quem tem MANAGE_PURCHASES (LABORATORISTA) compra para terceiro", async () => {
    login(["LABORATORISTA"], 42);
    expect((await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 77 } }))).status).toBe(201);
  });

  it("GET: o 403 vem do use case (denied+message), a rota só mapeia", async () => {
    login(["VOLUNTARIO"]);
    mocks.state.listPurchasesDenied = "Acesso negado";
    const denied = await purchasesList(request("/api/purchases"));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });

  it("GET: sem deny devolve as compras", async () => {
    login(["COORDENADOR"]);
    const response = await purchasesList(request("/api/purchases"));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ purchases: [{ id: 1, userId: 42 }] });
  });
});

describe("store — /api/rewards", () => {
  it("GET é leitura aberta", async () => {
    login(["VOLUNTARIO"]);
    expect((await rewardsList()).status).toBe(200);
  });

  it("POST exige MANAGE_REWARDS; VOLUNTARIO barrado", async () => {
    login(["LABORATORISTA"]);
    expect((await rewardsCreate(request("/api/rewards", { method: "POST", body: { name: "R" } }))).status).toBe(201);

    login(["VOLUNTARIO"]);
    const denied = await rewardsCreate(request("/api/rewards", { method: "POST", body: { name: "R" } }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });
});

describe("store — /api/rewards/[id]", () => {
  it("GET é leitura aberta e 404 não encontrado", async () => {
    login(["VOLUNTARIO"]);
    expect((await rewardGet(request("/api/rewards/1"), params({ id: "1" }))).status).toBe(200);
    const missing = await rewardGet(request("/api/rewards/999"), params({ id: "999" }));
    expect(missing.status).toBe(404);
    expect(await body(missing)).toEqual({ error: "Recompensa não encontrada" });
  });

  it("PUT/PATCH/DELETE exigem MANAGE_REWARDS", async () => {
    login(["LABORATORISTA"]);
    expect((await rewardUpdate(request("/api/rewards/1", { method: "PUT", body: {} }), params({ id: "1" }))).status).toBe(200);
    expect((await rewardPatch(request("/api/rewards/1", { method: "PATCH", body: { action: "toggle" } }), params({ id: "1" }))).status).toBe(200);
    expect((await rewardDelete(request("/api/rewards/1", { method: "DELETE" }), params({ id: "1" }))).status).toBe(200);

    login(["VOLUNTARIO"]);
    for (const response of [
      await rewardUpdate(request("/api/rewards/1", { method: "PUT", body: {} }), params({ id: "1" })),
      await rewardPatch(request("/api/rewards/1", { method: "PATCH", body: { action: "toggle" } }), params({ id: "1" })),
      await rewardDelete(request("/api/rewards/1", { method: "DELETE" }), params({ id: "1" })),
    ]) {
      expect(response.status).toBe(403);
      expect(await body(response)).toEqual({ error: "Acesso negado" });
    }
  });
});

describe("project-management — /api/projects", () => {
  it("GET é leitura para qualquer autenticado (a escopo fica no use case)", async () => {
    login(["VOLUNTARIO"]);
    expect((await projectsList()).status).toBe(200);
  });

  it("POST exige MANAGE_PROJECTS; mensagem própria de 403", async () => {
    login(["GERENTE_PROJETO"]);
    expect((await projectsCreate(request("/api/projects", { method: "POST", body: { name: "P" } }))).status).toBe(201);

    login(["VOLUNTARIO"]);
    const denied = await projectsCreate(request("/api/projects", { method: "POST", body: { name: "P" } }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Sem permissão para criar projeto" });
  });
});

describe("reporting — /api/weekly-reports/bulk", () => {
  const valido = { periodType: "weekly", from: "2026-10-01", to: "2026-10-07" };

  it("exige MANAGE_USERS (COORDENADOR/GERENTE) — LABORATORISTA é barrado", async () => {
    login(["COORDENADOR"]);
    expect((await weeklyReportsBulk(request("/api/weekly-reports/bulk", { method: "POST", body: valido }))).status).toBe(200);

    login(["LABORATORISTA"]);
    const denied = await weeklyReportsBulk(request("/api/weekly-reports/bulk", { method: "POST", body: valido }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });

  it("o gate vem ANTES da validação do corpo: quem não tem MANAGE_USERS nem vê o 400", async () => {
    login(["VOLUNTARIO"]);
    const denied = await weeklyReportsBulk(request("/api/weekly-reports/bulk", { method: "POST", body: {} }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });

    login(["COORDENADOR"]);
    const invalid = await weeklyReportsBulk(request("/api/weekly-reports/bulk", { method: "POST", body: {} }));
    expect(invalid.status).toBe(400);
    expect(await body(invalid)).toEqual({ error: "periodType, from e to são obrigatórios" });
  });
});

describe("task-management — /api/tasks/global-progress", () => {
  it("exige MANAGE_USERS; VOLUNTARIO barrado", async () => {
    login(["COORDENADOR"]);
    expect((await tasksGlobalProgress()).status).toBe(200);

    login(["VOLUNTARIO"]);
    const denied = await tasksGlobalProgress();
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });
});

describe("todas as 13 rotas — sem sessão", () => {
  it("devolvem 401 antes de qualquer decisão de autorização", async () => {
    logout();
    const responses = await Promise.all([
      issueUpdate(request("/api/issues/5", { method: "PUT", body: {} }), params({ id: "5" })),
      issueDelete(request("/api/issues/5", { method: "DELETE" }), params({ id: "5" })),
      issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 1 } }), params({ id: "5" })),
      issueResolve(request("/api/issues/5/resolve", { method: "POST", body: {} }), params({ id: "5" })),
      issueStatus(request("/api/issues/5/status", { method: "PATCH", body: { action: "start" } }), params({ id: "5" })),
      responsibilitiesStart(request("/api/responsibilities", { method: "POST", body: {} })),
      responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "end" } }), params({ id: "1" })),
      responsibilityDelete(request("/api/responsibilities/1", { method: "DELETE" }), params({ id: "1" })),
      schedulesBulk(request("/api/schedules/bulk", { method: "PUT", body: { userId: 1, slots: [] } })),
      purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 1 } })),
      purchasesList(request("/api/purchases")),
      rewardsCreate(request("/api/rewards", { method: "POST", body: { name: "R" } })),
      rewardsList(),
      rewardUpdate(request("/api/rewards/1", { method: "PUT", body: {} }), params({ id: "1" })),
      rewardPatch(request("/api/rewards/1", { method: "PATCH", body: { action: "x" } }), params({ id: "1" })),
      rewardDelete(request("/api/rewards/1", { method: "DELETE" }), params({ id: "1" })),
      rewardGet(request("/api/rewards/1"), params({ id: "1" })),
      projectsCreate(request("/api/projects", { method: "POST", body: { name: "P" } })),
      projectsList(),
      weeklyReportsBulk(request("/api/weekly-reports/bulk", { method: "POST", body: {} })),
      tasksGlobalProgress(),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await body(response)).toEqual({ error: "Não autorizado" });
    }
  });
});
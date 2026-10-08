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
import { createStoreModule } from "@/backend/modules/store";
import { createLabOperationsModule } from "@/backend/modules/lab-operations";
import { CreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/create-project.use-case";
import { AssertCanCreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/assert-can-create-project.use-case";
import { UpsertWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/upsert-weekly-report.use-case";
import { BulkGenerateWeeklyReportsUseCase } from "@/backend/modules/reporting/application/use-cases/bulk-generate-weekly-reports.use-case";
import { AssertCanGenerateReportsInBulkUseCase } from "@/backend/modules/reporting/application/use-cases/assert-can-generate-reports-in-bulk.use-case";
import type { PurchaseRepository } from "@/backend/modules/store/application/ports/purchase.repository";
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository";

const mocks = vi.hoisted(() => {
  const state = {
    /** null = sem sessão (401). Objeto = usuário logado. */
    session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
    /**
     * B6-6 (D4): issue/responsabilidade/grade viram catalogos em memoria para o MODULO REAL
     * de lab-operations montado no factory do composition root. reporterId/assigneeId da
     * issue 5 controlam o acesso; o dono da responsabilidade 1 decide o canEnd (dono sempre
     * pode; senao papel de laboratorio — a regra do dominio, nao um toggle do duplo).
     */
    issueRows: [] as Array<Record<string, unknown>>,
    responsibilityRows: [] as Array<Record<string, unknown>>,
    userScheduleRows: [] as Array<Record<string, unknown>>,
    responsibilityOwnerUserId: 42,
    /** B6-2d: catálogo do duplo da porta de compras (ver o factory do composition root). */
    purchases: [] as Array<Record<string, unknown>>,
    purchaseSequence: 0,
    /** B6-2a: catálogo do duplo da porta de rewards (ver o factory do composition root). */
    rewards: [] as Array<Record<string, unknown>>,
    rewardSequence: 0,
  };

  const entidade = (payload: Record<string, unknown>) => ({ ...payload, toJSON: () => payload });

  /**
   * B6-6 (D4): o duplo de `labOperations` SAIU inteiro. As 4 rotas de issue, as 2 de
   * responsabilidade e schedules/bulk decidem agora nos use cases (requireIssueManager /
   * requireIssueAssigner / requireActorAnyRole / canEnd / assertManageUsers) — um duplo de
   * modulo faria o 403 sumir do teste (a licao medida no B6-2a). O que e montado no factory
   * do composition root e o MODULO REAL sobre portas falsas em memoria (molde DEC-90).
   */

  /**
   * B6-2a (D4, DEC-53) — `store` deixou de ser um duplo único.
   *
   * As 6 escritas/leituras de **reward** saíram daqui porque o gate de MANAGE_REWARDS desceu
   * para o use case: um duplo de módulo não decide nada, e o 403 leaving these routes deixou
   * de existir no teste. Elas agora são os métodos do MÓDULO REAL sobre a porta falsa montada
   * no factory do composition root. É a mesma forma de `cron-status-roles.test.ts`.
   *
   * B6-2d (D4): `listPurchases`/`createPurchase` saíram também — a decisão desceu para os
   * use cases (escopo A2 decide a partir do ActorRef; o gate cross-actor de POST mora em
   * CreatePurchaseUseCase). O que resta dobrado aqui é a PORTA (memória), nunca o módulo.
   */

  const projectManagement = {
    listProjectsForActor: async () => [{ id: 1, name: "Projeto" }],
    // B6-3: `createProject` saiu do duplo — o gate de MANAGE_PROJECTS desceu para o use case
    // e um duplo de modulo faria o 403 desaparecer. A montagem real esta no factory do
    // composition root (use cases reais sobre portas falsas). GET segue dobrado: nao ha gate
    // migrado nele (a escopo ja morava no use case).
  };

  // B6-3: `bulkGenerateWeeklyReports` saiu do duplo pelo mesmo motivo (gate MANAGE_USERS no
  // use case + assert antes do parse na rota).

  const taskManagement = {
    globalProgress: async () => ({ total: 10, done: 4 }),
  };

  return { state, entidade, projectManagement, taskManagement };
});

vi.mock("@/backend/composition/root", () => {
  /**
   * Porta falsa de rewards. O que ela NÃO faz é decidir autorização: o 403 vem do use case
   * real, e é exatamente esse o ponto do B6-2a — a rota deixou de ser a dona da decisão.
   */
  const rewards: RewardRepository = {
    async findAll() {
      return mocks.state.rewards as never;
    },
    async findById(id) {
      return (mocks.state.rewards.find((r) => r.id === id) as never) ?? null;
    },
    async create(input) {
      const reward = { id: ++mocks.state.rewardSequence, ...(input as object) };
      mocks.state.rewards.push(reward);
      return reward as never;
    },
    async update(id, fields) {
      const index = mocks.state.rewards.findIndex((r) => r.id === id);
      const next = { ...mocks.state.rewards[index], ...(fields as object) };
      mocks.state.rewards[index] = next;
      return next as never;
    },
    async delete(id) {
      mocks.state.rewards.splice(
        mocks.state.rewards.findIndex((r) => r.id === id),
        1,
      );
    },
  };

  // B6-2d: a porta de compras deixou de ser "não deveria ser usada" — listPurchases/createPurchase
  // agora passam pelo módulo REAL (a decisão desceu para os use cases). O duplo é a PORTA em
  // memória; o que ele NÃO faz é decidir autorização. update/delete/refundPoints/findById seguem
  // inacessíveis pelas 13 rotas deste arquivo — se um dia forem, o duplo falha alto.
  const notUsed = (name: string) => (): never => {
    throw new Error(`porta de compras não deveria ser usada neste teste: ${name}`);
  };
  const purchases: PurchaseRepository = {
    async findAll() {
      return mocks.state.purchases as never;
    },
    async findByUserId(userId: number) {
      return mocks.state.purchases.filter((p) => p.userId === userId) as never;
    },
    async findByStatus(status: string) {
      return mocks.state.purchases.filter((p) => p.status === status) as never;
    },
    async findByRewardId(rewardId: number) {
      return mocks.state.purchases.filter((p) => p.rewardId === rewardId) as never;
    },
    async findUserById(userId: number) {
      // 42 e 77 são os usuários das fixtures de POST; qualquer outro id não existe.
      return (userId === 42 || userId === 77 ? { id: userId, name: `Usuário ${userId}`, points: 100 } : null) as never;
    },
    async createWithPointDeduction(snapshot: object) {
      const purchase = { id: ++mocks.state.purchaseSequence, ...(snapshot as object) };
      mocks.state.purchases.push(purchase);
      return purchase as never;
    },
    findById: notUsed("findById"),
    update: notUsed("update"),
    delete: notUsed("delete"),
    refundPoints: notUsed("refundPoints"),
  } as unknown as PurchaseRepository;

  const realStore = createStoreModule({ ports: { rewards, purchases } });

  // B6-3 (D4): os gates de projects-POST e weekly-reports/bulk desceram para os use cases —
  // os use cases REAIS sobre portas falsas em memoria (mesmo molde do store). O duplo que
  // nao decide nada faria o 403 desaparecer (licao medida do B6-2a).
  const projectsDb: Array<Record<string, unknown>> = [];
  const membershipsDb: Array<Record<string, unknown>> = [];
  const realCreateProject = new CreateProjectUseCase({
    projects: {
      async create(input: Record<string, unknown>) {
        const created = { id: 2 + projectsDb.length, ...input };
        projectsDb.push(created);
        return created as never;
      },
    } as never,
    memberships: {
      async findMembership() {
        return null;
      },
      async createMembership(membership: Record<string, unknown>) {
        membershipsDb.push(membership);
      },
      async updateMembershipRoles() {},
    } as never,
  });
  const realAssertCreateProject = new AssertCanCreateProjectUseCase();

  const weeklyReportsDb: Array<Record<string, unknown>> = [];
  const directoryPort = {
    async findActiveUsers() {
      return [{ id: 1, name: "Usuário ativo" }];
    },
    async findUserById(id: number) {
      return id === 1 ? { id: 1, name: "Usuário ativo" } : null;
    },
  };
  const realUpsertWeeklyReport = new UpsertWeeklyReportUseCase(
    {
      async findFirstByWindow() {
        return null;
      },
      async create(data: Record<string, unknown>) {
        // O mapper do upsert lê createdAt (record builder) — a porta real grava o server-clock.
        const created = { id: 1 + weeklyReportsDb.length, createdAt: new Date(), ...data };
        weeklyReportsDb.push(created);
        return created as never;
      },
    } as never,
    {
      async findCompletedWithRelations() {
        return [];
      },
    } as never,
    directoryPort as never,
  );
  const realBulkGenerate = new BulkGenerateWeeklyReportsUseCase(realUpsertWeeklyReport, directoryPort as never);
  const realAssertBulk = new AssertCanGenerateReportsInBulkUseCase();

  /**
   * B6-6 (D4): lab-operations montado como MODULO REAL sobre portas falsas em memoria — os
   * gates de issue (requireIssueManager/requireIssueAssigner), responsabilidade
   * (requireActorAnyRole/canEnd/self) e grade (assertManageUsers) moram nos use cases. A
   * decisao exercitada e a do dominio; o duplo so fornece dados.
   */
  const labIssues = {
    async findById(id: number) {
      return mocks.state.issueRows.find((i) => i.id === id) ?? null;
    },
    async findAll() {
      return [...mocks.state.issueRows];
    },
    async findByStatus(status: string) {
      return mocks.state.issueRows.filter((i) => i.status === status);
    },
    async findByPriority(priority: string) {
      return mocks.state.issueRows.filter((i) => i.priority === priority);
    },
    async findByCategory(category: string) {
      return mocks.state.issueRows.filter((i) => i.category === category);
    },
    async findByReporterId(reporterId: number) {
      return mocks.state.issueRows.filter((i) => i.reporterId === reporterId);
    },
    async findByAssigneeId(assigneeId: number) {
      return mocks.state.issueRows.filter((i) => i.assigneeId === assigneeId);
    },
    async create(input: Record<string, unknown>) {
      const row = { id: 91, ...(input as object) };
      mocks.state.issueRows.push(row);
      return row;
    },
    async update(id: number, fields: Record<string, unknown>) {
      const index = mocks.state.issueRows.findIndex((i) => i.id === id);
      if (index === -1) throw new Error("issue ausente na porta falsa");
      mocks.state.issueRows[index] = { ...mocks.state.issueRows[index], ...(fields as object) };
      return mocks.state.issueRows[index];
    },
    async delete(id: number) {
      mocks.state.issueRows = mocks.state.issueRows.filter((i) => i.id !== id);
    },
  };

  const labDirectory = {
    async findUserById(id: number) {
      const session = mocks.state.session;
      if (session && session.id === id) {
        return { id, name: session.name, roles: session.roles, status: session.status };
      }
      if ([7, 100, 200].includes(id)) {
        return { id, name: `U${id}`, roles: ["VOLUNTARIO"], status: "active" };
      }
      return null;
    },
    async findUsersWithRoles() {
      return [];
    },
  };

  const labResponsibilities = {
    async findActive() {
      return mocks.state.responsibilityRows.find((r) => !r.endTime) ?? null;
    },
    async findAll() {
      return [...mocks.state.responsibilityRows];
    },
    async findByDateRange() {
      return [...mocks.state.responsibilityRows];
    },
    async findById(id: number) {
      return mocks.state.responsibilityRows.find((r) => r.id === id) ?? null;
    },
    async findActiveForUser(userId: number) {
      return mocks.state.responsibilityRows.find((r) => r.userId === userId && !r.endTime) ?? null;
    },
    async findPausedForUser(userId: number) {
      return (
        mocks.state.responsibilityRows.find((r) => r.userId === userId && !r.endTime && r.pausedAt) ?? null
      );
    },
    async create(input: Record<string, unknown>) {
      const row = mocks.entidade({ id: 9, ...(input as object) });
      mocks.state.responsibilityRows.push(row);
      return row;
    },
    async update(id: number, patch: Record<string, unknown>) {
      const index = mocks.state.responsibilityRows.findIndex((r) => r.id === id);
      if (index === -1) throw new Error("responsabilidade ausente na porta falsa");
      mocks.state.responsibilityRows[index] = mocks.entidade({
        ...mocks.state.responsibilityRows[index],
        ...(patch as object),
      });
      return mocks.state.responsibilityRows[index];
    },
    async delete(id: number) {
      mocks.state.responsibilityRows = mocks.state.responsibilityRows.filter((r) => r.id !== id);
    },
  };

  const labUserSchedules = {
    async findAll() {
      return [...mocks.state.userScheduleRows];
    },
    async findByUserId(userId: number) {
      return mocks.state.userScheduleRows.filter((s) => s.userId === userId);
    },
    async findById(id: number) {
      return mocks.state.userScheduleRows.find((s) => s.id === id) ?? null;
    },
    async create(input: Record<string, unknown>) {
      const row = mocks.entidade({ id: 77, ...(input as object) });
      mocks.state.userScheduleRows.push(row);
      return row;
    },
    async update(id: number, patch: Record<string, unknown>) {
      const index = mocks.state.userScheduleRows.findIndex((s) => s.id === id);
      if (index === -1) throw new Error("horario ausente na porta falsa");
      mocks.state.userScheduleRows[index] = mocks.entidade({
        ...mocks.state.userScheduleRows[index],
        ...(patch as object),
      });
      return mocks.state.userScheduleRows[index];
    },
    async delete(id: number) {
      mocks.state.userScheduleRows = mocks.state.userScheduleRows.filter((s) => s.id !== id);
    },
    async replaceForUser(userId: number, slots: Array<Record<string, unknown>>) {
      void userId;
      // o corpo legado do PUT bulk NAO expoe userId — os slots voltam como vieram (id = index)
      mocks.state.userScheduleRows = slots.map((slot, index) => mocks.entidade({ id: index, ...(slot as object) }));
      return mocks.state.userScheduleRows;
    },
  };

  const labPublisher = {
    async publishIssueRaised() {},
    async publishIssueAssigned() {},
  };

  const realLab = createLabOperationsModule({
    ports: {
      issues: labIssues as never,
      responsibilities: labResponsibilities as never,
      userSchedules: labUserSchedules as never,
      directory: labDirectory as never,
      publisher: labPublisher as never,
    },
  });

  return {
    getBackendComposition: () => ({
      // módulo REAL: a matriz de permissões exercitada aqui é a de produção
      identityAccess: createIdentityAccessModule(),
      // B6-6: os gates de issue/responsabilidade/grade sao dos use cases do modulo REAL
      labOperations: realLab,
      // B6-2a/2d: os 12 métodos do store + o assert de gate do PUT são os do módulo REAL
      // (os gates moram nos use cases); a dobragem restante é só a porta, em memória.
      store: realStore,
      projectManagement: {
        listProjectsForActor: mocks.projectManagement.listProjectsForActor,
        createProject: (command: never) => realCreateProject.execute(command),
        assertCanCreateProject: (command: never) => realAssertCreateProject.execute(command),
      },
      reporting: {
        bulkGenerateWeeklyReports: (command: never) => realBulkGenerate.execute(command),
        assertCanGenerateReportsInBulk: (command: never) => realAssertBulk.execute(command),
      },
      taskManagement: mocks.taskManagement,
    }),
  };
});

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
  // B6-6: issue 5 (reporter 100, assignee 200) e responsabilidade 1 (dono 42) em memoria —
  // o modulo REAL decide a partir delas (reporterId/assigneeId no gate; dono no canEnd).
  mocks.state.issueRows = [
    {
      id: 5,
      reporterId: 100,
      assigneeId: 200,
      status: "open",
      title: "Issue de teste",
      priority: "medium",
      category: "equipamento",
      description: "descricao",
    },
  ];
  mocks.state.responsibilityRows = [
    mocks.entidade({
      id: 1,
      userId: mocks.state.responsibilityOwnerUserId,
      userName: "Lab",
      startTime: new Date(Date.now() - 60_000), // no passado — senao o end cai no 400 "fim <= inicio"
      endTime: null,
      pausedAt: null,
      totalPausedMs: 0,
      notes: "nota",
    }),
  ];
  mocks.state.userScheduleRows = [];
  mocks.state.purchases = [];
  mocks.state.purchaseSequence = 0;
  // B6-2a: o catálogo do módulo real começa com a recompensa 1 (as rotas pedem /api/rewards/1)
  // e nada com id 999 — é assim que o "404 não encontrado" é exercitado de verdade.
  mocks.state.rewards = [{ id: 1, name: "Recompensa", price: 30, available: true }];
  mocks.state.rewardSequence = 1;
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
    expect(await body(response)).toEqual({ issue: mocks.state.issueRows[0] });
  });

  it("PUT: MANAGER (reporter) passa; terceiro recebe 403 com a mensagem congelada", async () => {
    login(["LABORATORISTA"], 100); // reporterId
    expect((await issueUpdate(request("/api/issues/5", { method: "PUT", body: { title: "x" } }), params({ id: "5" }))).status).toBe(200);

    login(["VOLUNTARIO"], 999);
    const denied = await issueUpdate(request("/api/issues/5", { method: "PUT", body: { title: "x" } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    // B6-6: corpo mapeado (superset, DEC-53) — status e mensagem intactos
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para atualizar issue", code: "FORBIDDEN" });
  });

  it("PUT: assignee também pode (reporterId OU assigneeId)", async () => {
    login(["LABORATORISTA"], 200);
    expect((await issueUpdate(request("/api/issues/5", { method: "PUT", body: { title: "x" } }), params({ id: "5" }))).status).toBe(200);
  });

  it("DELETE: mensagem de 403 própria ('excluir'), distinta da de PUT", async () => {
    login(["VOLUNTARIO"], 999);
    const denied = await issueDelete(request("/api/issues/5", { method: "DELETE" }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para excluir issue", code: "FORBIDDEN" });
  });

  it("404 vem ANTES do 403: issue inexistente não vaza autorização", async () => {
    mocks.state.issueRows = [];
    login(["VOLUNTARIO"], 999);
    const response = await issueUpdate(request("/api/issues/5", { method: "PUT", body: {} }), params({ id: "5" }));
    expect(response.status).toBe(404);
    // B6-6: lookup do use case — NotFoundError mapeado (superset); o 404 do GET segue legado
    expect(await body(response)).toMatchObject({ error: "Issue não encontrado", code: "NOT_FOUND" });
  });
});

describe("lab-operations — /api/issues/[id]/assign", () => {
  it("COORDENADOR atribui; terceiro sem papel recebe 403", async () => {
    login(["COORDENADOR"]);
    expect((await issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 7 } }), params({ id: "5" }))).status).toBe(200);

    login(["VOLUNTARIO"], 999);
    const denied = await issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 7 } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para atribuir issue", code: "FORBIDDEN" });
  });

  it("reporter pode atribuir a própria issue", async () => {
    login(["LABORATORISTA"], 100);
    expect((await issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 7 } }), params({ id: "5" }))).status).toBe(200);
  });

  it("assignee NÃO reatribui (gate medido: MANAGE_USERS OU reporter)", async () => {
    login(["LABORATORISTA"], 200); // assigneeId da issue 5
    const denied = await issueAssign(request("/api/issues/5/assign", { method: "POST", body: { assigneeId: 7 } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para atribuir issue", code: "FORBIDDEN" });
  });

  it("403 vem ANTES da validação: assigneeId ausente devolve 403, não 400", async () => {
    login(["VOLUNTARIO"], 999);
    const response = await issueAssign(request("/api/issues/5/assign", { method: "POST", body: {} }), params({ id: "5" }));
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ error: "Sem permissão para atribuir issue", code: "FORBIDDEN" });
  });

  it("quem passa pelo gate recebe 400 de assigneeId ausente", async () => {
    login(["COORDENADOR"]);
    const response = await issueAssign(request("/api/issues/5/assign", { method: "POST", body: {} }), params({ id: "5" }));
    expect(response.status).toBe(400);
    // B6-6: ValidationError mapeado (superset) mantendo a mensagem
    expect(await body(response)).toMatchObject({ error: "assigneeId é obrigatório", code: "VALIDATION_ERROR" });
  });
});

describe("lab-operations — /api/issues/[id]/resolve", () => {
  it("assignee resolve; terceiro recebe 403 com a mensagem DESTA rota (distinta da de status)", async () => {
    login(["LABORATORISTA"], 200);
    expect((await issueResolve(request("/api/issues/5/resolve", { method: "POST", body: { resolution: "ok" } }), params({ id: "5" }))).status).toBe(200);

    login(["VOLUNTARIO"], 999);
    const denied = await issueResolve(request("/api/issues/5/resolve", { method: "POST", body: { resolution: "ok" } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para resolver issue", code: "FORBIDDEN" });
  });
});

describe("lab-operations — /api/issues/[id]/status", () => {
  it("uma ação por vez; terceira pessoa recebe 403 antes do conflito de estado", async () => {
    login(["COORDENADOR"]);
    for (const action of ["start", "resolve", "closed", "reopen", "unassign"]) {
      expect((await issueStatus(request("/api/issues/5/status", { method: "PATCH", body: { action } }), params({ id: "5" }))).status).toBe(200);
    }

    login(["VOLUNTARIO"], 999);
    const denied = await issueStatus(request("/api/issues/5/status", { method: "PATCH", body: { action: "start" } }), params({ id: "5" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para atualizar status do issue", code: "FORBIDDEN" });
  });

  it("ação desconhecida é 400 (despacho de rota, depois do gate para ações válidas)", async () => {
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
    // sem responsabilidade ativa (a 1 do fixture bloquearia por QUIRK-8L10, nao pelo gate)
    mocks.state.responsibilityRows = [];
    login(["LABORATORISTA"]);
    expect((await responsibilitiesStart(request("/api/responsibilities", { method: "POST", body: {} }))).status).toBe(201);

    login(["GERENTE_PROJETO"]);
    const denied = await responsibilitiesStart(request("/api/responsibilities", { method: "POST", body: {} }));
    expect(denied.status).toBe(403);
    // B6-6: gate desceu para o StartResponsibilityUseCase com a mensagem congelada da rota
    expect(await body(denied)).toMatchObject({
      error: "Sem permissão para iniciar responsabilidade do laboratório",
      code: "FORBIDDEN",
    });
  });
});

describe("lab-operations — /api/responsibilities/[id]", () => {
  it("PATCH end: dono pode; quem nao e dono nem papel de lab recebe 403 (canEnd decide no use case)", async () => {
    login(["LABORATORISTA"]); // id 42 = dono da responsabilidade 1
    expect((await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "end" } }), params({ id: "1" }))).status).toBe(200);

    login(["VOLUNTARIO"], 999); // nem dono (42) nem COORD/GER/LAB
    const denied = await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "end" } }), params({ id: "1" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({
      error: "Apenas o laboratorista atual ou um administrador pode encerrar a responsabilidade",
      code: "FORBIDDEN",
    });
  });

  it("PATCH end em responsabilidade AUSENTE é 403, não 404 (canEnd antes do lookup — quirk medido)", async () => {
    login(["VOLUNTARIO"], 999);
    const denied = await responsibilityPatch(request("/api/responsibilities/999", { method: "PATCH", body: { action: "end" } }), params({ id: "999" }));
    expect(denied.status).toBe(403);
  });

  it("PATCH updateNotes tem mensagem própria de 403", async () => {
    login(["VOLUNTARIO"], 999); // canEnd false: nem dono nem papel de lab
    const denied = await responsibilityPatch(
      request("/api/responsibilities/1", { method: "PATCH", body: { action: "updateNotes", notes: "x" } }),
      params({ id: "1" }),
    );
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({
      error: "Sem permissão para atualizar notas desta responsabilidade",
      code: "FORBIDDEN",
    });
  });

  it("PATCH pause/resume não têm gate além da autenticação (a rota só opera sobre si — userId vem do ator)", async () => {
    login(["VOLUNTARIO"]); // id 42 = dono
    expect((await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "pause" } }), params({ id: "1" }))).status).toBe(200);
    expect((await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "resume" } }), params({ id: "1" }))).status).toBe(200);

    // COORDENADOR logado como OUTRO usuario (999): a rota passa userId = ator, entao ele procura
    // a PROPRIA responsabilidade (nao existe) e recebe null 200 — nunca a de outro. A guarda de
    // self do use case (para chamadores diretos, ex. cron) e provada no roundtrip G4.
    login(["COORDENADOR"], 999);
    const response = await responsibilityPatch(request("/api/responsibilities/1", { method: "PATCH", body: { action: "pause" } }), params({ id: "1" }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ responsibility: null });
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
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para excluir responsabilidade", code: "FORBIDDEN" });
  });
});

describe("lab-operations — /api/schedules/bulk", () => {
  it("VOLUNTARIO recebe 403 com a mensagem padrão", async () => {
    login(["VOLUNTARIO"]);
    const denied = await schedulesBulk(request("/api/schedules/bulk", { method: "PUT", body: { userId: 9, slots: [] } }));
    expect(denied.status).toBe(403);
    // B6-6: assertCanManageUserSchedules (ForbiddenError) — mesma mensagem, corpo mapeado
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("o gate vem ANTES do parse: JSON inválido de um não-autorizado é 403, não 400", async () => {
    login(["VOLUNTARIO"]);
    const denied = await schedulesBulk(request("/api/schedules/bulk", { method: "PUT", raw: "{quebrado" }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
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
    // Medido no B6-0 e re-confirmado com o MÓDULO REAL (B6-2d): a regra é
    // `!canManagePurchases && targetUserId !== actor.id` — o que exige MANAGE_PURCHASES é
    // comprar PARA OUTRO, não comprar. O payload agora é válido de verdade (userId + rewardId):
    // o 201 antigo vinha do duplo que ignorava o corpo — a lição do B6-2a (duplo que fixa o
    // comportamento do substituto). Quem barra o VOLUNTARIO para si é a elegibilidade, não o gate.
    login(["VOLUNTARIO"], 42);
    const own = await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 42, rewardId: 1 } }));
    expect(own.status).toBe(201);
    expect((await body(own)).purchase).toMatchObject({ userId: 42, rewardId: 1 });

    const denied = await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 77, rewardId: 1 } }));
    expect(denied.status).toBe(403);
    // B6-2d (DEC-53): o gate desceu para CreatePurchaseUseCase — corpo superset, mensagem intacta.
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("POST: o gate vem ANTES do parse do rewardId — quem não pode comprar para outro recebe 403, não 400", async () => {
    login(["VOLUNTARIO"], 42);
    const denied = await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 77, rewardId: "abc" } }));
    expect(denied.status).toBe(403);
  });

  it("POST: quem tem MANAGE_PURCHASES (LABORATORISTA) compra para terceiro", async () => {
    login(["LABORATORISTA"], 42);
    const response = await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 77, rewardId: 1 } }));
    expect(response.status).toBe(201);
    expect((await body(response)).purchase).toMatchObject({ userId: 77 });
  });

  it("GET: o 403 vem da resolução de escopo no use case — corpo legado EXATO preservado", async () => {
    // B6-2d: antes o deny era injetado no duplo; agora é a regra real (filtro global sem
    // MANAGE_PURCHASES). O deny continua { error } sem code: é resolução de escopo, não gate
    // migrado — a ressalva da DEC-53 não toca aqui.
    login(["VOLUNTARIO"]);
    const denied = await purchasesList(request("/api/purchases?status=pending"));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Acesso negado" });
  });

  it("GET: sem filtro, VOLUNTARIO vê as próprias compras; COORDENADOR vê todas", async () => {
    login(["VOLUNTARIO"], 42);
    await purchasesCreate(request("/api/purchases", { method: "POST", body: { userId: 42, rewardId: 1 } }));

    const own = await purchasesList(request("/api/purchases"));
    expect(own.status).toBe(200);
    expect((await body(own)).purchases).toMatchObject([{ userId: 42 }]);

    login(["VOLUNTARIO"], 999);
    expect((await body(await purchasesList(request("/api/purchases")))).purchases).toEqual([]);

    login(["COORDENADOR"]);
    const all = await purchasesList(request("/api/purchases"));
    expect(all.status).toBe(200);
    expect((await body(all)).purchases).toMatchObject([{ userId: 42 }]);
  });
});

describe("store — /api/rewards", () => {
  it("GET é leitura de catálogo: sessão, não permissão", async () => {
    login(["VOLUNTARIO"]);
    expect((await rewardsList()).status).toBe(200);
  });

  it("POST exige MANAGE_REWARDS; VOLUNTARIO barrado", async () => {
    login(["LABORATORISTA"]);
    expect((await rewardsCreate(request("/api/rewards", { method: "POST", body: { name: "R", price: 10 } }))).status).toBe(201);

    login(["VOLUNTARIO"]);
    const denied = await rewardsCreate(request("/api/rewards", { method: "POST", body: { name: "R", price: 10 } }));
    expect(denied.status).toBe(403);
    // B6-2a (DEC-53): o corpo do 403 passou a ser {error, code, details}. A mensagem e o
    // status são os mesmos de quando a rota decidia — o acréscimo é o superset do OND8-B4.
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("POST: o gate vem ANTES da validação do payload (403 não vira 400)", async () => {
    // CORREÇÃO DE MEDIÇÃO (B6-0 -> B6-2a): o teste do B6-0 afirmava 201 para {name:"R"} sem
    // preco. Era artefato do duplo de modulo, nao comportamento de producao: com o modulo real,
    // `normalizeRewardCreate` devolve 400 "Preco deve ser um numero nao negativo", antes e
    // depois deste lote. Sem permissao, quem responde e o gate — mesmo com o payload invalido.
    login(["VOLUNTARIO"]);
    const denied = await rewardsCreate(request("/api/rewards", { method: "POST", body: { name: "R" } }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    // E com a permissao, o mesmo payload volta a ser o 400 de validacao legado.
    login(["LABORATORISTA"]);
    const invalid = await rewardsCreate(request("/api/rewards", { method: "POST", body: { name: "R" } }));
    expect(invalid.status).toBe(400);
    expect(await body(invalid)).toMatchObject({ error: "Preço deve ser um número não negativo" });
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
      // B6-2a (DEC-53): superset do OND8-B4 — status e mensagem intactos, code acrescentado.
      expect(await body(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
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
    // B6-3 (DEC-53): gate migrado para CreateProjectUseCase — corpo superset, mensagem
    // própria da rota intacta. O assert da rota roda ANTES do parse: ate corpo invalido
    // (ou ausente) para quem nao pode e 403, nunca 400/500.
    expect(await body(denied)).toMatchObject({ error: "Sem permissão para criar projeto", code: "FORBIDDEN" });
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
    // B6-3 (DEC-53): gate MANAGE_USERS PURO desceu para BulkGenerateWeeklyReportsUseCase
    // (e o assert da rota roda antes do parse). Corpo superset, mensagem default intacta.
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("o gate vem ANTES da validação do corpo: quem não tem MANAGE_USERS nem vê o 400", async () => {
    login(["VOLUNTARIO"]);
    const denied = await weeklyReportsBulk(request("/api/weekly-reports/bulk", { method: "POST", body: {} }));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

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
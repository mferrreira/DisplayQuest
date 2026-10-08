/**
 * B6-3 (D4) — o contrato HTTP das 8 rotas migradas (weekly-reports ×4, weekly-hours-history,
 * projects/stats, users/statistics) com a autoridade nos use cases. Molde da casa (B6-2a..2d):
 * módulos REAIS (createReportingModule / createUserManagementModule) sobre portas falsas, só
 * `requireAuth` dobrado — `requireApiActor`, `userActor`, a matriz de permissões e os use cases
 * são os de produção. Um duplo de módulo não faz o teste falhar, faz o 403 desaparecer.
 *
 * Ordens congeladas (medidas nas rotas legado antes do movimento):
 *  - GET /weekly-reports: 400 "userId inválido" ANTES do 403 (validação de entrada na rota).
 *  - POST /weekly-reports e /generate: as validações de corpo (400) vêm ANTES do gate —
 *    até quem não tem permissão recebe o 400 de corpo (ordem legado, preservada).
 *  - GET [id]: 404 legado {error} ANTES do 403 (null do use case). DELETE: ausência agora é
 *    NotFoundError mapeado (evolução documentada, mesma de purchases/[id] no B5).
 *  - POST /bulk e POST /weekly-hours-history: 403 ANTES do parse do corpo — por isso existem
 *    `assertCanGenerateReportsInBulk` e `assertCanManageWeeklyHours` (padrão B6-2b/2d).
 * Mensagens congeladas: "Sem permissão" (composta), "Acesso negado" (generate/bulk/statistics),
 * "Apenas coordenadores e gerentes podem acessar." (histórico), "...estatísticas gerais".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createReportingModule } from "@/backend/modules/reporting";
import { createUserManagementModule } from "@/backend/modules/user-management";
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository";
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port";
import type { WeeklyHoursHistoryRepository } from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository";
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  reports: [] as Array<Record<string, unknown>>,
  writes: [] as string[],
}));

vi.mock("@/backend/composition/root", () => {
  const weeklyReports: WeeklyReportsRepository = {
    async findMany(query: { userId?: number }) {
      return mocks.reports.filter((r) => query.userId === undefined || r.userId === query.userId) as never;
    },
    async findById(id: number) {
      return (mocks.reports.find((r) => r.id === id) as never) ?? null;
    },
    async findFirstByWindow() {
      return null;
    },
    async create(data: Record<string, unknown>) {
      mocks.writes.push(`create:${data.userId}`);
      // O mapper do upsert lê createdAt (record builder) — a porta real grava o server-clock.
      const created = { id: 90 + mocks.reports.length, createdAt: new Date(), ...data };
      mocks.reports.push(created);
      return created as never;
    },
    async update(id: number, data: Record<string, unknown>) {
      mocks.writes.push(`update:${id}`);
      const index = mocks.reports.findIndex((r) => r.id === id);
      mocks.reports[index] = { ...mocks.reports[index], ...data };
      return mocks.reports[index] as never;
    },
    async delete(id: number) {
      mocks.writes.push(`delete:${id}`);
      mocks.reports.splice(mocks.reports.findIndex((r) => r.id === id), 1);
    },
  } as unknown as WeeklyReportsRepository;

  const hoursRead = {
    async findCompletedWithRelations() {
      return [];
    },
    async countCompleted() {
      return 0;
    },
    async findCompletedDurations() {
      return [];
    },
  } as unknown as HoursReadRepository;

  const directory = {
    async findUserById(id: number) {
      return id === 42 || id === 77 ? { id, name: `Usuário ${id}` } : null;
    },
    async findActiveUsers() {
      return [{ id: 42, name: "Ana" }];
    },
    async resetCurrentWeekHours() {},
    async findAllProjectsWithMembers() {
      return [];
    },
  } as unknown as ReportingDirectory;

  const weeklyHoursHistory = {
    async findMany() {
      return [
        { id: 1, userId: 42, userName: "Ana", weekStart: new Date("2026-09-14T03:00:00.000Z"), weekEnd: new Date("2026-09-21T02:59:59.999Z"), totalHours: 3, createdAt: new Date("2026-09-20T12:00:00.000Z") },
      ] as never;
    },
    async findByWeek() {
      return null;
    },
    async create(entry: never) {
      return entry;
    },
  } as unknown as WeeklyHoursHistoryRepository;

  const userManagementRepository = {
    async getUserStatistics() {
      return { total: 10, active: 9 };
    },
    async getUsersByRole() {
      return { VOLUNTARIO: 8, COORDENADOR: 2 };
    },
    async getUsersByStatus() {
      return { active: 9, pending: 1 };
    },
  };

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      reporting: createReportingModule({ ports: { weeklyReports, hoursRead, directory, weeklyHoursHistory } }),
      userManagement: createUserManagementModule({ repository: userManagementRepository as never }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as weeklyList, POST as weeklyUpsert } from "@/app/api/weekly-reports/route";
import { DELETE as weeklyDelete, GET as weeklyGet } from "@/app/api/weekly-reports/[id]/route";
import { POST as weeklyGenerate } from "@/app/api/weekly-reports/generate/route";
import { POST as weeklyBulk } from "@/app/api/weekly-reports/bulk/route";
import { GET as hoursHistoryGet, POST as hoursHistoryPost } from "@/app/api/weekly-hours-history/route";
import { GET as projectsStats } from "@/app/api/projects/stats/route";
import { GET as userStatistics } from "@/app/api/users/statistics/route";

function login(roles: string[], id = 42) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function request(path: string, init?: { method?: string; body?: unknown; raw?: string }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.raw !== undefined ? init.raw : init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const body = async (response: Response) => await response.json();

const WEEK = { weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" };

describe("B6-3 — as 8 rotas migradas com a autoridade nos use cases", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.writes = [];
    const date = new Date("2026-09-20T12:00:00.000Z");
    mocks.reports = [
      { id: 1, userId: 42, userName: "Ana", weekStart: new Date("2026-09-14T03:00:00.000Z"), weekEnd: new Date("2026-09-21T02:59:59.999Z"), totalLogs: 2, summary: "semana", createdAt: date },
      { id: 2, userId: 77, userName: "Beto", weekStart: new Date("2026-09-14T03:00:00.000Z"), weekEnd: new Date("2026-09-21T02:59:59.999Z"), totalLogs: 1, summary: null, createdAt: date },
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/weekly-reports — escopo decidido pelo ActorRef", () => {
    it("VOLUNTARIO sem filtro vê só os próprios; LABORATORISTA e COORDENADOR veem todos", async () => {
      login(["VOLUNTARIO"], 42);
      const own = await weeklyList(request("/api/weekly-reports"));
      expect(own.status).toBe(200);
      expect((await body(own)).weeklyReports.map((r: { userId: number }) => r.userId)).toEqual([42]);

      login(["LABORATORISTA"], 999);
      const asLaboratorista = await body(await weeklyList(request("/api/weekly-reports")));
      expect(asLaboratorista.weeklyReports).toHaveLength(2);

      login(["COORDENADOR"], 999);
      const asManager = await body(await weeklyList(request("/api/weekly-reports")));
      expect(asManager.weeklyReports).toHaveLength(2);
    });

    it("userId de outro sem a composta => 403 'Sem permissão' (mensagem própria, corpo superset)", async () => {
      login(["VOLUNTARIO"], 42);
      const denied = await weeklyList(request("/api/weekly-reports?userId=77"));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Sem permissão", code: "FORBIDDEN" });
    });

    it("400 'userId inválido' vem ANTES do 403 (ordem medida; validação de entrada na rota)", async () => {
      login(["VOLUNTARIO"], 42);
      const invalid = await weeklyList(request("/api/weekly-reports?userId=abc"));
      expect(invalid.status).toBe(400);
      expect(await body(invalid)).toEqual({ error: "userId inválido" });
    });

    it("sem sessão é 401", async () => {
      expect((await weeklyList(request("/api/weekly-reports"))).status).toBe(401);
    });
  });

  describe("POST /api/weekly-reports — gate composto; validações de corpo antes do gate", () => {
    it("VOLUNTARIO cria o próprio (201); PARA OUTRO é 403 'Sem permissão'", async () => {
      login(["VOLUNTARIO"], 42);
      const own = await weeklyUpsert(request("/api/weekly-reports", { method: "POST", body: { userId: 42, ...WEEK } }));
      expect(own.status).toBe(201);
      expect(mocks.writes).toEqual(["create:42"]);

      const denied = await weeklyUpsert(request("/api/weekly-reports", { method: "POST", body: { userId: 77, ...WEEK } }));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Sem permissão", code: "FORBIDDEN" });
    });

    it("LABORATORISTA cria para TERCEIRO pela composta (diferença medida vs /generate)", async () => {
      login(["LABORATORISTA"], 999);
      const response = await weeklyUpsert(request("/api/weekly-reports", { method: "POST", body: { userId: 42, ...WEEK } }));
      expect(response.status).toBe(201);
    });

    it("corpo inválido é 400 legado MESMO para quem não tem permissão (validação antes do gate)", async () => {
      login(["VOLUNTARIO"], 42);
      const invalid = await weeklyUpsert(request("/api/weekly-reports", { method: "POST", body: { userId: 77 } }));
      expect(invalid.status).toBe(400);
      expect(await body(invalid)).toEqual({ error: "userId, weekStart e weekEnd são obrigatórios" });
    });
  });

  describe("GET/DELETE /api/weekly-reports/[id] — 404 antes do gate", () => {
    it("dono lê; outro sem composta é 403; LABORATORISTA lê", async () => {
      login(["VOLUNTARIO"], 42);
      const ok = await weeklyGet(request("/api/weekly-reports/1"), params("1"));
      expect(ok.status).toBe(200);

      login(["VOLUNTARIO"], 998);
      const denied = await weeklyGet(request("/api/weekly-reports/1"), params("1"));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Sem permissão", code: "FORBIDDEN" });

      login(["LABORATORISTA"], 999);
      expect((await weeklyGet(request("/api/weekly-reports/1"), params("1"))).status).toBe(200);
    });

    it("inexistente: 404 com corpo legado {error} preservado (null do use case)", async () => {
      login(["VOLUNTARIO"], 42);
      const missing = await weeklyGet(request("/api/weekly-reports/999"), params("999"));
      expect(missing.status).toBe(404);
      expect(await body(missing)).toEqual({ error: "Relatório não encontrado" });
    });

    it("DELETE: dono pode sem gestão; outro é 403; ausência agora é NotFoundError mapeado (evolução)", async () => {
      login(["VOLUNTARIO"], 998);
      const denied = await weeklyDelete(request("/api/weekly-reports/1", { method: "DELETE" }), params("1"));
      expect(denied.status).toBe(403);
      expect(mocks.writes).toEqual([]);

      login(["VOLUNTARIO"], 42);
      const ok = await weeklyDelete(request("/api/weekly-reports/1", { method: "DELETE" }), params("1"));
      expect(ok.status).toBe(200);
      expect(mocks.writes).toEqual(["delete:1"]);

      const missing = await weeklyDelete(request("/api/weekly-reports/999", { method: "DELETE" }), params("999"));
      expect(missing.status).toBe(404);
      expect(await body(missing)).toMatchObject({ error: "Relatório não encontrado", code: "NOT_FOUND" });
    });
  });

  describe("POST /api/weekly-reports/generate — self || MANAGE_USERS PURO", () => {
    it("LABORATORISTA criando para OUTRO é 403 'Acesso negado' (na rota irmã, passa)", async () => {
      login(["LABORATORISTA"], 999);
      const denied = await weeklyGenerate(request("/api/weekly-reports/generate", { method: "POST", body: { userId: 42, ...WEEK } }));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
      expect(mocks.writes).toEqual([]);
    });

    it("VOLUNTARIO para si passa; COORDENADOR para terceiro passa", async () => {
      login(["VOLUNTARIO"], 42);
      // 200 (não 201): a rota generate devolve createApiResponse({ weeklyReport }) — shape
      // legado congelado, diferente da irmã POST /weekly-reports que devolve 201.
      expect((await weeklyGenerate(request("/api/weekly-reports/generate", { method: "POST", body: { userId: 42, ...WEEK } }))).status).toBe(200);

      login(["COORDENADOR"], 999);
      expect((await weeklyGenerate(request("/api/weekly-reports/generate", { method: "POST", body: { userId: 42, ...WEEK } }))).status).toBe(200);
    });

    it("corpo inválido é 400 legado antes do gate", async () => {
      login(["VOLUNTARIO"], 42);
      const invalid = await weeklyGenerate(request("/api/weekly-reports/generate", { method: "POST", body: { userId: 77 } }));
      expect(invalid.status).toBe(400);
      expect(await body(invalid)).toEqual({ error: "userId, weekStart e weekEnd são obrigatórios" });
    });
  });

  describe("POST /api/weekly-reports/bulk — MANAGE_USERS PURO, assert antes do parse", () => {
    const valido = { periodType: "weekly", from: "2026-10-01", to: "2026-10-07" };

    it("corpo inválido (JSON quebrado) para quem não tem permissão é 403, não 500", async () => {
      login(["VOLUNTARIO"], 42);
      const denied = await weeklyBulk(request("/api/weekly-reports/bulk", { method: "POST", raw: "não é json" }));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
    });

    it("LABORATORISTA é barrado (ao contrário das rotas irmãs); COORDENADOR passa", async () => {
      login(["LABORATORISTA"], 999);
      expect((await weeklyBulk(request("/api/weekly-reports/bulk", { method: "POST", body: valido }))).status).toBe(403);

      login(["COORDENADOR"], 999);
      expect((await weeklyBulk(request("/api/weekly-reports/bulk", { method: "POST", body: valido }))).status).toBe(200);
    });

    it("COORDENADOR com corpo inválido recebe o 400 legado da rota", async () => {
      login(["COORDENADOR"], 999);
      const invalid = await weeklyBulk(request("/api/weekly-reports/bulk", { method: "POST", body: {} }));
      expect(invalid.status).toBe(400);
      expect(await body(invalid)).toEqual({ error: "periodType, from e to são obrigatórios" });
    });
  });

  describe("GET/POST /api/weekly-hours-history — MANAGE_USERS PURO com mensagem própria", () => {
    it("VOLUNTARIO é barrado com a mensagem própria; COORDENADOR lê", async () => {
      login(["VOLUNTARIO"], 42);
      const denied = await hoursHistoryGet(request("/api/weekly-hours-history"));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Apenas coordenadores e gerentes podem acessar.", code: "FORBIDDEN" });

      login(["COORDENADOR"], 999);
      const ok = await hoursHistoryGet(request("/api/weekly-hours-history"));
      expect(ok.status).toBe(200);
      expect((await body(ok)).history).toHaveLength(1);
    });

    it("POST reset: assert antes do parse — JSON quebrado para quem não pode é 403", async () => {
      login(["VOLUNTARIO"], 42);
      const denied = await hoursHistoryPost(request("/api/weekly-hours-history", { method: "POST", raw: "não é json" }));
      expect(denied.status).toBe(403);

      login(["COORDENADOR"], 999);
      const reset = await hoursHistoryPost(request("/api/weekly-hours-history", { method: "POST", body: { action: "reset" } }));
      expect(reset.status).toBe(200);
      expect((await body(reset)).message).toBe("Horas semanais resetadas com sucesso");
    });
  });

  describe("GET /api/projects/stats e GET /api/users/statistics", () => {
    it("projects/stats: VOLUNTARIO é 403 com a mensagem própria; COORDENADOR passa", async () => {
      login(["VOLUNTARIO"], 42);
      const denied = await projectsStats();
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Apenas coordenadores e gerentes podem acessar estatísticas gerais", code: "FORBIDDEN" });

      login(["COORDENADOR"], 999);
      expect((await projectsStats()).status).toBe(200);
    });

    it("users/statistics: VOLUNTARIO é 403 'Acesso negado'; COORDENADOR recebe as estatísticas", async () => {
      login(["VOLUNTARIO"], 42);
      const denied = await userStatistics(request("/api/users/statistics"));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

      login(["COORDENADOR"], 999);
      const ok = await userStatistics(request("/api/users/statistics?type=roles"));
      expect(ok.status).toBe(200);
      expect((await body(ok)).statistics).toMatchObject({ VOLUNTARIO: 8 });
    });
  });
});

/**
 * B6-3 (D4) — a autoridade das rotas de weekly-reports/historico de horas/estatisticas desceu
 * para os use cases do modulo reporting. Este arquivo fixa a decisao no nivel do use case, com
 * o MODULO REAL sobre portas falsas.
 *
 * O que esta congelado aqui, e por que (tudo medido nas rotas antes do movimento):
 *
 *  - A REGRA COMPOSTA `MANAGE_USERS || LABORATORISTA` (weekly-reports GET/POST/[id]):
 *    LABORATORISTA NAO tem MANAGE_USERS na matriz, mas ve/apaga relatorios semanais. Re-expressar
 *    como FEATURE_ACCESS.VIEW_WEEKLY_REPORTS foi considerado e REJEITADO (vocabularios diferentes
 *    que divergiriam na primeira edicao de qualquer matriz) — a regra migrou como foi medida.
 *  - A MENSAGEM PROPRIA "Sem permissão" (createApiError legado dessas rotas), e o default
 *    "Acesso negado" nas rotas que nao passavam mensagem (generate, bulk, statistics).
 *  - O GATE DIFERENTE por rota para o MESMO upsert: POST /weekly-reports aceita a composta
 *    (LABORATORISTA cria para terceiro); POST /weekly-reports/generate e self || MANAGE_USERS
 *    puro (LABORATORISTA NAO cria para terceiro). Daí GenerateWeeklyReportUseCase proprio.
 *  - bulk e MANAGE_USERS PURO (LABORATORISTA barrado) e o gate vem ANTES das validacoes.
 *  - historico de horas e estatisticas: MANAGE_USERS PURO com as mensagens proprias
 *    ("Apenas coordenadores e gerentes podem acessar." / "...estatísticas gerais").
 *  - resetWeeklyHoursHistory tem DOIS donos (DEC-54): pessoa com MANAGE_USERS na rota e o cron
 *    com systemActor("WEEKLY_RESET") — o bypass declarado, fixado caso a caso.
 *  - A porta nao e tocada por um 403/404.
 *
 * A negacao por ROTA (HTTP, corpo {error, code, details}) esta em
 * tests/unit/api/reporting-authorization.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  systemActor,
  userActor,
  ValidationError,
} from "@/backend/domain";
import { createReportingModule } from "@/backend/modules/reporting";
import type { ReportingModule } from "@/backend/modules/reporting";
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository";
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port";
import type { WeeklyHoursHistoryRepository } from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository";
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository";

// O factory default constroi repositorios Prisma para as portas nao informadas (projectReports,
// attachments, storage, publisher) — nunca chamados aqui. O singleton e dobrado para a
// construcao nao depender de DATABASE_URL (mesmo molde do bulk-weekly-reports.use-cases.test).
vi.mock("@/lib/database/prisma", () => ({ prisma: {} as never }));

const OWNER_ID = 42;
const OTHER_ID = 77;
const REPORT_DENIED = "Sem permissão";
const HOURS_DENIED = "Apenas coordenadores e gerentes podem acessar.";

const owner = userActor(OWNER_ID, ["VOLUNTARIO"]);
const laboratorista = userActor(999, ["LABORATORISTA"]);
const manager = userActor(OTHER_ID, ["COORDENADOR"]);
const stranger = userActor(998, ["VOLUNTARIO"]);

interface FakeReport {
  id: number;
  userId: number;
  userName: string;
  weekStart: Date;
  weekEnd: Date;
  totalLogs: number;
  summary: string | null;
  createdAt: Date;
}

function makeReport(overrides: Partial<FakeReport> = {}): FakeReport {
  return {
    id: 1,
    userId: OWNER_ID,
    userName: "Ana",
    weekStart: new Date("2026-09-14T03:00:00.000Z"),
    weekEnd: new Date("2026-09-21T02:59:59.999Z"),
    totalLogs: 2,
    summary: "semana",
    createdAt: new Date("2026-09-20T12:00:00.000Z"),
    ...overrides,
  };
}

function makeFakes() {
  const reportsDb: FakeReport[] = [
    makeReport({ id: 1, userId: OWNER_ID }),
    makeReport({ id: 2, userId: OTHER_ID }),
  ];
  const historyDb: Array<{ id: number; userId: number; userName: string; weekStart: Date; weekEnd: Date; totalHours: number; createdAt: Date }> = [
    { id: 1, userId: OWNER_ID, userName: "Ana", weekStart: new Date("2026-09-14T03:00:00.000Z"), weekEnd: new Date("2026-09-21T02:59:59.999Z"), totalHours: 3, createdAt: new Date("2026-09-20T12:00:00.000Z") },
  ];
  const writes: string[] = [];

  const weeklyReports: WeeklyReportsRepository = {
    async findMany(query) {
      return reportsDb.filter((r) => query.userId === undefined || r.userId === query.userId);
    },
    async findById(id) {
      return reportsDb.find((r) => r.id === id) ?? null;
    },
    async findFirstByWindow() {
      return null;
    },
    async create(data) {
      writes.push(`create:${data.userId}`);
      const created = makeReport({ id: 90 + reportsDb.length, userId: data.userId, userName: data.userName });
      reportsDb.push(created);
      return created;
    },
    async update(id, data) {
      writes.push(`update:${id}`);
      const index = reportsDb.findIndex((r) => r.id === id);
      reportsDb[index] = { ...reportsDb[index], ...(data as object) };
      return reportsDb[index];
    },
    async delete(id) {
      writes.push(`delete:${id}`);
      reportsDb.splice(reportsDb.findIndex((r) => r.id === id), 1);
    },
  };

  const hoursRead: HoursReadRepository = {
    async findCompletedWithRelations() {
      return [];
    },
    async countCompleted() {
      return 0;
    },
    async findCompletedDurations() {
      return [];
    },
    async aggregateCompletedByUser() {
      return [];
    },
    async aggregateCompletedByProject() {
      return [];
    },
    async findCompletedWithRelationsByProject() {
      return [];
    },
  } as unknown as HoursReadRepository;

  const directory: ReportingDirectory = {
    async findUserById(id) {
      return id === OWNER_ID || id === OTHER_ID ? { id, name: `Usuário ${id}` } : null;
    },
    async findActiveUsers() {
      return [
        { id: OWNER_ID, name: "Ana" },
        { id: OTHER_ID, name: "Beto" },
      ];
    },
    async findReportManagers() {
      return [];
    },
    async resetCurrentWeekHours() {},
    async projectExists() {
      return false;
    },
    async getProjectName() {
      return null;
    },
    async isProjectLeader() {
      return false;
    },
    async findLedProjectIds() {
      return [];
    },
    async findMemberships() {
      return [];
    },
    async findAllProjectsWithMembers() {
      return [];
    },
  };

  const weeklyHoursHistory: WeeklyHoursHistoryRepository = {
    async findMany() {
      return historyDb as never;
    },
    async findByWeek() {
      return null;
    },
    async create(entry: never) {
      writes.push(`history:${(entry as { userId: number }).userId}`);
      return entry;
    },
  } as unknown as WeeklyHoursHistoryRepository;

  const reporting: ReportingModule = createReportingModule({
    ports: { weeklyReports, hoursRead, directory, weeklyHoursHistory },
  });
  return { reporting, reportsDb, writes };
}

describe("reporting — autorização de weekly-reports no use case (B6-3)", () => {
  let fakes: ReturnType<typeof makeFakes>;

  beforeEach(() => {
    fakes = makeFakes();
  });

  describe("listWeeklyReports — escopo decidido a partir do ActorRef (regra composta)", () => {
    it("usuário comum sem filtro vê só os próprios relatórios (userId=actor)", async () => {
      const own = await fakes.reporting.listWeeklyReports({ actor: owner });
      expect(own.map((r) => r.userId)).toEqual([OWNER_ID]);
    });

    it("COORDENADOR e LABORATORISTA sem filtro veem todos (MANAGE_USERS || LABORATORISTA)", async () => {
      expect((await fakes.reporting.listWeeklyReports({ actor: manager })).length).toBe(2);
      expect((await fakes.reporting.listWeeklyReports({ actor: laboratorista })).length).toBe(2);
    });

    it("userId de outro recebe 403 com a mensagem própria; o próprio passa", async () => {
      await expect(fakes.reporting.listWeeklyReports({ actor: owner, userId: OTHER_ID })).rejects.toThrow(REPORT_DENIED);
      expect((await fakes.reporting.listWeeklyReports({ actor: owner, userId: OWNER_ID })).length).toBe(1);
      // com a composta, qualquer userId passa
      expect((await fakes.reporting.listWeeklyReports({ actor: laboratorista, userId: OWNER_ID })).length).toBe(1);
    });

    it("system actor passa pelo bypass declarado (DEC-54) e vê todos", async () => {
      const all = await fakes.reporting.listWeeklyReports({ actor: systemActor("SYSTEM_EVENT") });
      expect(all.length).toBe(2);
    });
  });

  describe("getWeeklyReportById / deleteWeeklyReport — 404 antes do gate; dono pode apagar", () => {
    it("dono lê e apaga a própria linha (mesmo sem qualquer gestão)", async () => {
      expect(await fakes.reporting.getWeeklyReportById(owner, 1)).toMatchObject({ id: 1 });
      await fakes.reporting.deleteWeeklyReport(owner, 1);
      expect(fakes.writes).toEqual(["delete:1"]);
    });

    it("outro sem a composta recebe 403 com a mensagem própria", async () => {
      await expect(fakes.reporting.getWeeklyReportById(stranger, 1)).rejects.toThrow(REPORT_DENIED);
      await expect(fakes.reporting.deleteWeeklyReport(stranger, 1)).rejects.toThrow(REPORT_DENIED);
      expect(fakes.writes).toEqual([]);
    });

    it("LABORATORISTA (composta) lê e apaga linha alheia", async () => {
      expect(await fakes.reporting.getWeeklyReportById(laboratorista, 1)).toMatchObject({ id: 1 });
      await fakes.reporting.deleteWeeklyReport(laboratorista, 2);
      expect(fakes.writes).toEqual(["delete:2"]);
    });

    it("inexistente: GET devolve null ANTES do gate; DELETE lança NotFoundError ANTES do gate", async () => {
      expect(await fakes.reporting.getWeeklyReportById(stranger, 999999)).toBeNull();
      await expect(fakes.reporting.deleteWeeklyReport(stranger, 999999)).rejects.toThrow(NotFoundError);
    });
  });

  describe("upsertWeeklyReport — gate composto antes de qualquer leitura/escrita", () => {
    it("dono cria o próprio relatório; outro sem composta é barrado sem tocar a porta", async () => {
      await fakes.reporting.upsertWeeklyReport({ actor: owner, userId: OWNER_ID, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" });
      expect(fakes.writes).toEqual(["create:42"]);

      await expect(
        fakes.reporting.upsertWeeklyReport({ actor: stranger, userId: OWNER_ID, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" }),
      ).rejects.toThrow(REPORT_DENIED);
      expect(fakes.writes).toEqual(["create:42"]);
    });

    it("LABORATORISTA cria para TERCEIRO por esta rota (composta) — ao contrário do generate", async () => {
      await fakes.reporting.upsertWeeklyReport({ actor: laboratorista, userId: OWNER_ID, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" });
      expect(fakes.writes).toEqual(["create:42"]);
    });

    it("gate vem antes do lookup: usuário inexistente PARA OUTRO é 403, não 404", async () => {
      await expect(
        fakes.reporting.upsertWeeklyReport({ actor: stranger, userId: 999999, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("generateWeeklyReport — self || MANAGE_USERS PURO (LABORATORISTA não cria para terceiro)", () => {
    it("LABORATORISTA criando para OUTRO recebe 403 com o default 'Acesso negado'", async () => {
      await expect(
        fakes.reporting.generateWeeklyReport({ actor: laboratorista, userId: OWNER_ID, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" }),
      ).rejects.toThrow("Acesso negado");
      expect(fakes.writes).toEqual([]);
    });

    it("LABORATORISTA criando PARA SI passa (self)", async () => {
      const self = userActor(999, ["LABORATORISTA"]);
      // 999 não existe na directory fake -> o gate passou (self) e o lookup é que falha:
      // prova que o gate NÃO barrou, e que ele vem antes do lookup.
      await expect(
        fakes.reporting.generateWeeklyReport({ actor: self, userId: 999, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("COORDENADOR gera para terceiro (MANAGE_USERS) e o upsert interno atravessa a composta sem barrear", async () => {
      await fakes.reporting.generateWeeklyReport({ actor: manager, userId: OWNER_ID, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" });
      expect(fakes.writes).toEqual(["create:42"]);
    });
  });

  describe("bulkGenerateWeeklyReports — MANAGE_USERS PURO, gate antes das validações", () => {
    const command = { periodType: "weekly" as const, from: "2026-09-07", to: "2026-09-20" };

    it("LABORATORISTA é barrado (ao contrário das rotas irmãs)", async () => {
      await expect(fakes.reporting.bulkGenerateWeeklyReports({ actor: laboratorista, ...command })).rejects.toThrow("Acesso negado");
      expect(fakes.writes).toEqual([]);
    });

    it("gate vem ANTES da validação: periodicidade inválida para quem não pode é 403, não 400", async () => {
      await expect(
        fakes.reporting.bulkGenerateWeeklyReports({ actor: stranger, periodType: "quinzenal" as never, from: "2026-09-07", to: "2026-09-20" }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("COORDENADOR gera por todos os ativos (o upsert interno passa a composta pelo mesmo ator)", async () => {
      const result = await fakes.reporting.bulkGenerateWeeklyReports({ actor: manager, ...command });
      expect(result.periodCount).toBeGreaterThanOrEqual(1);
      expect(result.reportCount).toBe(result.periods.reduce((sum, p) => sum + p.reports, 0));
      expect(result.reportCount).toBeGreaterThanOrEqual(2);
    });

    it("assertCanGenerateReportsInBulk decide sem tocar a porta (o assert do 403-antes-do-parse)", async () => {
      await expect(fakes.reporting.assertCanGenerateReportsInBulk({ actor: stranger })).rejects.toThrow("Acesso negado");
      await expect(fakes.reporting.assertCanGenerateReportsInBulk({ actor: laboratorista })).rejects.toThrow(ForbiddenError);
      await expect(fakes.reporting.assertCanGenerateReportsInBulk({ actor: manager })).resolves.not.toThrow();
      expect(fakes.writes).toEqual([]);
    });
  });

  describe("histórico de horas + estatísticas — MANAGE_USERS PURO com mensagens próprias", () => {
    it("listWeeklyHoursHistory: LABORATORISTA é barrado com a mensagem própria", async () => {
      await expect(fakes.reporting.listWeeklyHoursHistory({ actor: laboratorista })).rejects.toThrow(HOURS_DENIED);
      await expect(fakes.reporting.listWeeklyHoursHistory({ actor: manager })).resolves.toHaveLength(1);
    });

    it("getWeeklyHoursStats: mesma regra e mensagem", async () => {
      await expect(fakes.reporting.getWeeklyHoursStats(stranger)).rejects.toThrow(HOURS_DENIED);
      await expect(fakes.reporting.getWeeklyHoursStats(manager)).resolves.toBeTruthy();
    });

    it("createWeeklyHoursHistory: gate antes de qualquer leitura", async () => {
      await expect(fakes.reporting.createWeeklyHoursHistory(stranger, "2026-09-14T12:00:00.000Z")).rejects.toThrow(HOURS_DENIED);
      expect(fakes.writes).toEqual([]);
    });

    it("resetWeeklyHoursHistory: pessoa sem MANAGE_USERS é barrada; systemActor('WEEKLY_RESET') passa (o caminho do cron, DEC-54)", async () => {
      await expect(fakes.reporting.resetWeeklyHoursHistory(stranger)).rejects.toThrow(HOURS_DENIED);
      await expect(fakes.reporting.resetWeeklyHoursHistory(systemActor("WEEKLY_RESET"))).resolves.toBeTruthy();
      await expect(fakes.reporting.resetWeeklyHoursHistory(manager)).resolves.toBeTruthy();
    });

    it("assertCanManageWeeklyHours decide sem tocar a porta", async () => {
      await expect(fakes.reporting.assertCanManageWeeklyHours({ actor: laboratorista })).rejects.toThrow(HOURS_DENIED);
      await expect(fakes.reporting.assertCanManageWeeklyHours({ actor: manager })).resolves.not.toThrow();
      expect(fakes.writes).toEqual([]);
    });

    it("getProjectStats: mensagem própria e LABORATORISTA barrado", async () => {
      await expect(fakes.reporting.getProjectStats(laboratorista)).rejects.toThrow("Apenas coordenadores e gerentes podem acessar estatísticas gerais");
      await expect(fakes.reporting.getProjectStats(manager)).resolves.toBeTruthy();
    });
  });
});

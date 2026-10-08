// @vitest-environment node
/**
 * OND7-B4 — G4 roundtrip smoke of the reporting module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma (no mocks nos repositórios):
 * os 6 adapters Prisma finos rodam contra o banco real. Storage e publisher são
 * injetados como fakes pelas PORTAS (DEC-17) para não tocar fs/notifications — o resto
 * é produção real via createReportingModule().
 *
 * Fluxo: upsertWeeklyReport (create + update idempotente) -> getWeeklyReportById (logs
 * com fallback de nota) -> createProjectReport (upsert created=false) -> getProjectReport
 * (403/404 tipados) -> aggregate (QUIRK-7D sem filtro de status) -> attachments
 * (register/delete via porta storage) -> sweep lazy -> deleteProjectReport (manager-only,
 * QUIRK-7G) -> weekly hours (create dedup, list, stats, reset QUIRK-7C) -> leitura de
 * horas (project/weekly/history/user) -> P2025 propagado no deleteWeeklyReport (QUIRK-7K).
 *
 * Cleanup em afterAll: project_reports (cascade attachments), weekly_reports,
 * weekly_hours_history, daily_logs, work_sessions, projects, users. O reset semanal
 * zera também usuários seedados do banco de teste isolado — aceitável (DB de teste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endOfWeek, startOfWeek } from "date-fns";
import { prisma } from "@/lib/database/prisma";
import { systemActor, userActor } from "@/backend/domain";
import { createReportingModule } from "@/backend/modules/reporting";
import type { ReportStoragePort } from "@/backend/modules/reporting/application/ports/report-storage.port";
import type { ReportSubmittedEvent, ReportSubmittedPublisherPort } from "@/backend/modules/reporting/application/ports/report-submitted-publisher.port";

const W = { weekStartsOn: 1 } as const;
const now = new Date();
const WEEK_START = startOfWeek(now, W);
const WEEK_END = endOfWeek(now, W);
const SESSION_DAY = new Date(WEEK_START.getTime() + 86_400_000); // segunda-feira local
const REFERENCE = SESSION_DAY.toISOString(); // monthly window do dia dos testes

const storageFake: ReportStoragePort & { removed: string[]; sweeps: Array<{ paths: string[]; maxAgeMs?: number }> } = {
  removed: [],
  sweeps: [],
  async removeFile(storedPath) {
    this.removed.push(storedPath);
  },
  async sweepStale(referencedStoredPaths, maxAgeMs) {
    this.sweeps.push({ paths: referencedStoredPaths, maxAgeMs });
    return 0;
  },
};
const publishedEvents: ReportSubmittedEvent[] = [];
const publisherFake: ReportSubmittedPublisherPort = {
  async publishSubmitted(event) {
    publishedEvents.push(event);
  },
};

const reporting = createReportingModule({ ports: { storage: storageFake, publisher: publisherFake } });

const stamp = Date.now();
let authorId = 0;
let managerId = 0;
let outsiderId = 0;
/**
 * B6-3 (D4): os metodos de weekly-reports/historico de horas passaram a exigir ator.
 * `authorActor` e o VOLUNTARIO da semente (self-or-view pelo proprio id), `managerActor` e o
 * COORDENADOR (MANAGE_USERS — entra na composta e no gate puro do historico/bulk), e o reset
 * roda com `systemActor("WEEKLY_RESET")` — o caminho do cron (DEC-54), provado no G4.
 */
let authorActor = userActor(0, ["VOLUNTARIO"]);
let managerActor = userActor(0, ["COORDENADOR"]);
let projectId = 0;
let weeklyReportId = 0;
let projectReportId = 0;
let attachmentId = 0;

describe("G4 roundtrip — reporting (isolated test DB)", () => {
  beforeAll(async () => {
    const author = await prisma.users.create({
      data: {
        name: `G7 Autor ${stamp}`,
        email: `g7-reporting-author-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    const manager = await prisma.users.create({
      data: {
        name: `G7 Gestor ${stamp}`,
        email: `g7-reporting-manager-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    });
    const outsider = await prisma.users.create({
      data: {
        name: `G7 Estranho ${stamp}`,
        email: `g7-reporting-outsider-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    authorId = author.id;
    managerId = manager.id;
    outsiderId = outsider.id;
    authorActor = userActor(authorId, ["VOLUNTARIO"]);
    managerActor = userActor(managerId, ["COORDENADOR"]);

    const project = await prisma.projects.create({
      data: {
        name: `G7 Projeto ${stamp}`,
        createdAt: new Date().toISOString(),
        createdBy: authorId,
        leaderId: authorId, // QUIRK-7J: criar relatorio exige LIDER do projeto (ou MANAGE_USERS)
        status: "ativo",
      },
      select: { id: true },
    });
    projectId = project.id;

    // 2 sessoes CONCLUIDAS no MESMO dia local (sempre dentro da janela monthly da referencia)
    const s1 = await prisma.work_sessions.create({
      data: {
        userId: authorId,
        userName: `G7 Autor ${stamp}`,
        startTime: SESSION_DAY,
        endTime: new Date(SESSION_DAY.getTime() + 7_200_000),
        duration: 7200,
        activity: "Atividade A",
        projectId,
        status: "completed",
      },
      select: { id: true },
    });
    await prisma.daily_logs.create({
      data: { userId: authorId, projectId, date: SESSION_DAY, note: "Nota do log", workSessionId: s1.id },
    });
    await prisma.work_sessions.create({
      data: {
        userId: authorId,
        userName: `G7 Autor ${stamp}`,
        startTime: new Date(SESSION_DAY.getTime() + 3_600_000),
        endTime: new Date(SESSION_DAY.getTime() + 7_200_000),
        duration: 3600,
        projectId,
        status: "completed",
      },
    });
    // 1 sessao ACTIVE (QUIRK-7D: aggregate nao filtra status; weekly/hours contam so concluidas)
    await prisma.work_sessions.create({
      data: {
        userId: authorId,
        userName: `G7 Autor ${stamp}`,
        startTime: new Date(SESSION_DAY.getTime() + 7_200_000),
        projectId,
        status: "active",
      },
    });
    // sessao de outro usuario no mesmo projeto (hoursByUser com 2 linhas)
    await prisma.work_sessions.create({
      data: {
        userId: outsiderId,
        userName: `G7 Estranho ${stamp}`,
        startTime: new Date(SESSION_DAY.getTime() + 1_800_000),
        endTime: new Date(SESSION_DAY.getTime() + 5_400_000),
        duration: 3600,
        projectId,
        status: "completed",
      },
    });
    await prisma.project_members.create({
      data: { projectId, userId: authorId, roles: [] },
    });
  });

  afterAll(async () => {
    await prisma.project_reports.deleteMany({ where: { projectId } });
    await prisma.project_members.deleteMany({ where: { projectId } });
    await prisma.weekly_reports.deleteMany({ where: { userId: { in: [authorId, managerId, outsiderId] } } });
    await prisma.weekly_hours_history.deleteMany({ where: { userId: { in: [authorId, managerId, outsiderId] } } });
    await prisma.daily_logs.deleteMany({ where: { userId: { in: [authorId, managerId, outsiderId] } } });
    await prisma.work_sessions.deleteMany({ where: { userId: { in: [authorId, managerId, outsiderId] } } });
    await prisma.projects.deleteMany({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: [authorId, managerId, outsiderId] } } });
  });

  it("upsertWeeklyReport: cria com totalLogs das concluidas; segundo upsert atualiza a MESMA linha", async () => {
    const created = await reporting.upsertWeeklyReport({
      actor: authorActor,
      userId: authorId,
      weekStart: WEEK_START.toISOString(),
      weekEnd: WEEK_END.toISOString(),
      summary: "primeira passada",
    });
    weeklyReportId = created.id;
    expect(created.totalLogs).toBe(2); // 2 concluidas; a active fica fora

    const updated = await reporting.upsertWeeklyReport({
      actor: authorActor,
      userId: authorId,
      weekStart: WEEK_START.toISOString(),
      weekEnd: WEEK_END.toISOString(),
      summary: "segunda passada",
    });
    expect(updated.id).toBe(weeklyReportId);
    expect(updated.summary).toBe("segunda passada");

    const rows = await prisma.weekly_reports.findMany({ where: { userId: authorId } });
    expect(rows).toHaveLength(1);
  });

  it("upsertWeeklyReport usuario inexistente -> NotFoundError 'Usuário não encontrado'", async () => {
    // O ator e o manager: para o autor, o gate self-or-view barraria ANTES do 404 —
    // a ordem (gate -> lookup) e provada nos testes de use case/rota.
    await expect(
      reporting.upsertWeeklyReport({ actor: managerActor, userId: 999999, weekStart: WEEK_START.toISOString(), weekEnd: WEEK_END.toISOString() }),
    ).rejects.toThrow("Usuário não encontrado");
  });

  it("getWeeklyReportById: logs das concluidas com nota do dailyLog e fallback legado", async () => {
    const report = await reporting.getWeeklyReportById(authorActor, weeklyReportId);
    expect(report).not.toBeNull();
    const logs = (report as any).logs;
    expect(logs).toHaveLength(2);
    expect(logs.map((l: any) => l.note).sort()).toEqual(["Nota do log", "Sessão finalizada sem observações"]);
  });

  it("listWeeklyReports: gestor ve o relatorio; autor ve o proprio", async () => {
    const all = await reporting.listWeeklyReports({ actor: managerActor });
    expect(all.map((r) => r.id)).toContain(weeklyReportId);

    const own = await reporting.listWeeklyReports({ actor: authorActor, userId: authorId });
    expect(own.map((r) => r.id)).toEqual([weeklyReportId]);
  });

  it("createProjectReport: create (created=true + publisher com destinatarios) e upsert (created=false, sem evento)", async () => {
    const first = await reporting.createProjectReport({
      actorUserId: authorId,
      actorRoles: ["VOLUNTARIO"],
      projectId,
      periodType: "monthly",
      reference: REFERENCE,
      title: "Relatório G7",
      content: "Conteúdo do relatório mensal",
    });
    expect(first.created).toBe(true);
    projectReportId = first.report.id;

    const second = await reporting.createProjectReport({
      actorUserId: authorId,
      actorRoles: ["VOLUNTARIO"],
      projectId,
      periodType: "monthly",
      reference: REFERENCE,
      title: "Relatório G7 v2",
      content: "Conteúdo atualizado",
    });
    expect(second.created).toBe(false);
    expect(second.report.id).toBe(projectReportId);

    const rows = await prisma.project_reports.findMany({ where: { projectId, authorId } });
    expect(rows).toHaveLength(1);

    // publisher via PORTA LOCAL: 1 evento (so a criacao), destinatarios = gestores ativos exceto o autor
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].reportId).toBe(projectReportId);
    expect(publishedEvents[0].userIds).toContain(managerId);
    expect(publishedEvents[0].userIds).not.toContain(authorId);
  });

  it("getProjectReport: gestor (lider) acessa; estranho -> 'Acesso negado'; inexistente -> 'Relatório não encontrado'", async () => {
    const byManager = await reporting.getProjectReport(managerId, ["COORDENADOR"], projectReportId);
    expect(byManager?.id).toBe(projectReportId);

    await expect(reporting.getProjectReport(outsiderId, ["VOLUNTARIO"], projectReportId)).rejects.toThrow("Acesso negado");
    await expect(reporting.getProjectReport(managerId, ["COORDENADOR"], 999999)).rejects.toThrow("Relatório não encontrado");
  });

  it("updateProjectReport muda content; aggregate soma sem filtro de status (QUIRK-7D)", async () => {
    const updated = await reporting.updateProjectReport({
      actorUserId: authorId,
      actorRoles: ["VOLUNTARIO"],
      reportId: projectReportId,
      content: "Conteúdo final",
    });
    expect(updated.content).toBe("Conteúdo final");

    const aggregate = await reporting.aggregateProjectReport(managerId, ["COORDENADOR"], projectReportId);
    expect(aggregate.totals.sessionCount).toBe(4); // 3 concluidas + 1 active (QUIRK-7D: sem filtro)
    expect(aggregate.totals.totalHours).toBe(4); // active duration null -> 0
    expect(aggregate.totals.logCount).toBe(1);
    expect(aggregate.sessions.map((s: any) => s.userName).every((n: string) => n.startsWith("G7"))).toBe(true);
  });

  it("attachments: register cria linha; sweep lazy ve o storedPath referenciado; delete remove linha + arquivo via porta", async () => {
    const withAttachment = await reporting.registerReportAttachment({
      actorUserId: authorId,
      actorRoles: ["VOLUNTARIO"],
      reportId: projectReportId,
      fileName: "g7.txt",
      storedPath: `uploads/reports/${projectReportId}/g7-${stamp}.txt`,
      mimeType: "text/plain",
      sizeBytes: 12,
    });
    attachmentId = withAttachment.attachments![0].id;

    const swept = await reporting.sweepStaleReportUploads(60_000);
    expect(storageFake.sweeps.length).toBeGreaterThan(0);
    expect(storageFake.sweeps.at(-1)!.paths).toContain(`uploads/reports/${projectReportId}/g7-${stamp}.txt`);
    expect(swept).toBe(0);

    await reporting.deleteReportAttachment({
      actorUserId: authorId,
      actorRoles: ["VOLUNTARIO"],
      attachmentId,
    });
    expect(storageFake.removed).toContain(`uploads/reports/${projectReportId}/g7-${stamp}.txt`);
    expect(await prisma.report_attachments.findUnique({ where: { id: attachmentId } })).toBeNull();
  });

  it("deleteProjectReport: autor VOLUNTARIO -> 'Acesso negado' (QUIRK-7G manager-only); gestor exclui", async () => {
    await expect(
      reporting.deleteProjectReport({ actorUserId: authorId, actorRoles: ["VOLUNTARIO"], reportId: projectReportId }),
    ).rejects.toThrow("Acesso negado");

    await reporting.deleteProjectReport({ actorUserId: managerId, actorRoles: ["COORDENADOR"], reportId: projectReportId });
    expect(await prisma.project_reports.findUnique({ where: { id: projectReportId } })).toBeNull();
  });

  it("weekly hours: create cria por usuario com sessoes (totalHours numerico), segunda passada dedup", async () => {
    const results = await reporting.createWeeklyHoursHistory(managerActor, WEEK_START.toISOString());
    expect(results.find((r: any) => r.userId === authorId)?.totalHours).toBe(3);
    expect(results.find((r: any) => r.userId === outsiderId)?.totalHours).toBe(1);

    const again = await reporting.createWeeklyHoursHistory(managerActor, WEEK_START.toISOString());
    expect(again.find((r: any) => r.userId === authorId)).toBeUndefined();

    const rows = await prisma.weekly_hours_history.findMany({ where: { userId: authorId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].totalHours).toBe(3);
  });

  it("listWeeklyHoursHistory + getWeeklyHoursStats enxergam a semana corrente", async () => {
    const history = await reporting.listWeeklyHoursHistory({ actor: managerActor, weekStart: new Date().toISOString() });
    const mine = history.filter((r) => r.userId === authorId || r.userId === outsiderId);
    expect(mine.map((r) => r.totalHours).sort((a, b) => b - a)).toEqual([3, 1]);

    const stats = await reporting.getWeeklyHoursStats(managerActor);
    expect(stats.last4Weeks).toHaveLength(4);
    expect(stats.currentWeek.totalHours).toBeGreaterThanOrEqual(4);
  });

  it("resetWeeklyHoursHistory: savedHours string toFixed(1), cria nova linha sem dedup (QUIRK-7C), zera currentWeekHours", async () => {
    // O reset varre TODOS os ativos do banco de teste; arquivos de integração concorrentes
    // excluem seus usuários seedados no afterAll -> P2025 intermitente no update alheio.
    // Retry até uma passada completa; linhas parciais de tentativas falhas são aceitas
    // (o proprio QUIRK-7C — no-dedup — ja permite multiplas linhas por usuario).
    let resetResults: any[] | null = null
    for (let attempt = 0; attempt < 4 && resetResults === null; attempt++) {
      try {
        resetResults = await reporting.resetWeeklyHoursHistory(systemActor("WEEKLY_RESET"))
      } catch {
        // corrida com afterAll de outro arquivo — tenta de novo
      }
    }
    expect(resetResults).not.toBeNull()
    expect(resetResults!.find((r: any) => r.userId === authorId)?.savedHours).toBe("3.0")

    const rows = await prisma.weekly_hours_history.findMany({ where: { userId: authorId } })
    expect(rows.length).toBeGreaterThanOrEqual(2); // create anterior + reset (nao deduplica)
    expect(rows.every((r) => r.totalHours === 3)).toBe(true);

    const userRow = await prisma.users.findUnique({ where: { id: authorId }, select: { currentWeekHours: true } });
    expect(userRow?.currentWeekHours).toBe(0);
  });

  it("leitura de horas: project/weekly/history/user refletem as sessoes do projeto", async () => {
    const hours = await reporting.getProjectHours({ projectId });
    expect(hours.sessionCount).toBe(3); // so concluidas
    expect(hours.totalHours).toBe(4); // 3 autor + 1 estranho
    expect(hours.hoursByUser.find((h: any) => h.userId === authorId)?.totalHours).toBe(3);

    const weekly = await reporting.getProjectWeeklyHours(projectId, WEEK_START.toISOString());
    expect(weekly.sessionCount).toBe(3);
    expect(weekly.totalHours).toBe(4);

    const history = await reporting.getProjectHoursHistory({ projectId, months: 2 });
    expect(history.weeks).toHaveLength(8); // months*4
    expect(history.totalHours).toBe(4);

    // B6-4 (D4): self || MANAGE_USERS — o autor le as proprias horas (self).
    const userHours = await reporting.getUserProjectHours({ actor: authorActor, userId: authorId });
    expect(userHours).toHaveLength(1);
    expect(userHours[0]).toMatchObject({ projectId, userHours: 3, projectTotalHours: 4, sessionCount: 2 });

    const stats = await reporting.getProjectStats(managerActor);
    expect(stats).toBeTruthy();
  });

  it("deleteWeeklyReport remove; segunda exclusao devolve NotFoundError (pre-check desceu com o gate; P2025 segue para corrida)", async () => {
    await reporting.deleteWeeklyReport(authorActor, weeklyReportId);
    expect(await prisma.weekly_reports.findUnique({ where: { id: weeklyReportId } })).toBeNull();

    await expect(reporting.deleteWeeklyReport(authorActor, weeklyReportId)).rejects.toThrow("Relatório não encontrado");
  });

  it("bulkGenerateWeeklyReports (merge 64a6095): gera por usuario ativo; reexecucao nao duplica", async () => {
    const command = { actor: managerActor, periodType: "weekly" as const, from: WEEK_START.toISOString(), to: WEEK_END.toISOString() };

    const first = await reporting.bulkGenerateWeeklyReports(command);
    expect(first.periodCount).toBeGreaterThanOrEqual(1);
    expect(first.reportCount).toBe(first.periods.reduce((sum, p) => sum + p.reports, 0));
    // author/manager/outsider sao ativos no DB de teste -> cada periodo cobre ao menos os 3
    expect(first.periods.every((p) => p.reports >= 3)).toBe(true);

    const rowsAfterFirst = await prisma.weekly_reports.count({
      where: { userId: { in: [authorId, managerId, outsiderId] } },
    });
    expect(rowsAfterFirst).toBeGreaterThanOrEqual(3);

    // Idempotencia (upsert pelo MESMO window): contagem de linhas dos NOSSOS usuarios nao muda.
    // reportCount total NAO e comparado entre execucoes — arquivos de roundtrip paralelos podem
    // semear/remover outros usuarios ativos do DB compartilhado durante a corrida.
    const second = await reporting.bulkGenerateWeeklyReports(command);
    expect(second.periodCount).toBe(first.periodCount);
    expect(second.periods.every((p) => p.reports >= 3)).toBe(true);
    const rowsAfterSecond = await prisma.weekly_reports.count({
      where: { userId: { in: [authorId, managerId, outsiderId] } },
    });
    expect(rowsAfterSecond).toBe(rowsAfterFirst);
  });

  it("bulkGenerateWeeklyReports validacao: periodicidade invalida -> mensagem legada (ValidationError)", async () => {
    await expect(
      reporting.bulkGenerateWeeklyReports({
        actor: managerActor,
        periodType: "quinzenal" as never,
        from: WEEK_START.toISOString(),
        to: WEEK_END.toISOString(),
      }),
    ).rejects.toThrow("Periodicidade inválida");
  });
});

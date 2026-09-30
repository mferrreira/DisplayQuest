/**
 * OND7-B2 — domínio puro de reporting (backend/domain/reporting).
 *
 * As regras são movidas VERBATIM do gateway legado (golden OND7-B1); esta suíte pincha as
 * fórmulas diretamente (periodos SP-anchored por ISO fixo; janelas de semana recomputadas
 * com as MESMAS funções date-fns sobre os mesmos instantes — TZ-robusto, pina a fórmula).
 */
import { endOfWeek, format, startOfWeek, subWeeks } from "date-fns";
import { describe, expect, it } from "vitest";

import {
  averageHoursPerWeek,
  buildWeeklySummary,
  canManageProjectReports,
  decideAttachmentDeleteAccess,
  decideReportCreateAccess,
  decideReportDeleteAccess,
  decideReportEditAccess,
  decideReportListAccess,
  decideReportViewAccess,
  computeReportPeriod,
  formatWeekDate,
  hasValidReportContent,
  historyWeekCount,
  hoursFromDurations,
  hoursTimeWindow,
  isReportPeriod,
  listReportPeriods,
  mapSessionToWeeklyLog,
  normalizeLocalWeekWindow,
  projectReportPeriodLabel,
  projectWeeklyHoursWindow,
  REPORT_NOTIFICATION_ROLES,
  REPORT_SUBMISSION_EVENT,
  reportSubmissionMessage,
  rollingWeekWindows,
  sumWeeklyHours,
  TOP_USERS_LIMIT,
  weekWindowFor,
  weeklyHistoryWindow,
  aggregateProjectHours,
  type HoursSessionRow,
} from "@/backend/domain/reporting";

const W = { weekStartsOn: 1 } as const;
const REF = new Date("2026-09-16T12:00:00.000Z"); // quarta-feira (SP 09:00)

describe("OND7-B2 domain/reporting — ReportPeriod (SP-anchored)", () => {
  it("enum + guard", () => {
    expect(isReportPeriod("weekly")).toBe(true);
    expect(isReportPeriod("quinzenal")).toBe(false);
    expect(isReportPeriod(7)).toBe(false);
  });

  it("weekly: Monday..Sunday ancorado em SP (UTC-3 fixo)", () => {
    const p = computeReportPeriod("weekly", REF);
    expect(p.start.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-09-21T02:59:59.999Z");
    expect(p.label).toBe("Semana de 14/09 a 20/09");
  });

  it("weekly boundaries: instante inicial e final caem na MESMA semana; 1ms antes cai na anterior", () => {
    const atStart = computeReportPeriod("weekly", new Date("2026-09-14T03:00:00.000Z"));
    expect(atStart.start.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    const atEnd = computeReportPeriod("weekly", new Date("2026-09-21T02:59:59.999Z"));
    expect(atEnd.start.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    const before = computeReportPeriod("weekly", new Date("2026-09-14T02:59:59.999Z"));
    expect(before.start.toISOString()).toBe("2026-09-07T03:00:00.000Z");
    expect(before.label).toBe("Semana de 07/09 a 13/09");
  });

  it("biweekly: 1ª quinzena (dia<=15) e 2ª quinzena com labels/limites exatos", () => {
    const first = computeReportPeriod("biweekly", new Date("2026-09-10T12:00:00.000Z"));
    expect(first.start.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(first.end.toISOString()).toBe("2026-09-16T02:59:59.999Z");
    expect(first.label).toBe("1ª quinzena de setembro/2026");

    const second = computeReportPeriod("biweekly", REF);
    expect(second.start.toISOString()).toBe("2026-09-16T03:00:00.000Z");
    expect(second.end.toISOString()).toBe("2026-10-01T02:59:59.999Z");
    expect(second.label).toBe("2ª quinzena de setembro/2026");
  });

  it("monthly: mês cheio + label; fevereiro bissexto tem 29 dias", () => {
    const p = computeReportPeriod("monthly", REF);
    expect(p.start.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-10-01T02:59:59.999Z");
    expect(p.label).toBe("setembro/2026");

    const feb = computeReportPeriod("monthly", new Date("2024-02-15T12:00:00.000Z"));
    expect(feb.end.toISOString()).toBe("2024-03-01T02:59:59.999Z");
    expect(feb.label).toBe("fevereiro/2024");
  });

  it("semiannual: 1º/2º semestre", () => {
    const first = computeReportPeriod("semiannual", new Date("2026-03-05T12:00:00.000Z"));
    expect(first.start.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(first.end.toISOString()).toBe("2026-07-01T02:59:59.999Z");
    expect(first.label).toBe("1º semestre de 2026");

    const second = computeReportPeriod("semiannual", REF);
    expect(second.start.toISOString()).toBe("2026-07-01T03:00:00.000Z");
    expect(second.end.toISOString()).toBe("2027-01-01T02:59:59.999Z");
    expect(second.label).toBe("2º semestre de 2026");
  });

  it("annual: ano cheio", () => {
    const p = computeReportPeriod("annual", REF);
    expect(p.start.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(p.end.toISOString()).toBe("2027-01-01T02:59:59.999Z");
    expect(p.label).toBe("Ano 2026");
  });

  it("listReportPeriods: janelas consecutivas; to<from -> []; weekly em 2 semanas -> 2", () => {
    const months = listReportPeriods(
      "monthly",
      new Date("2026-09-16T12:00:00.000Z"),
      new Date("2026-11-05T12:00:00.000Z"),
    );
    expect(months.map((m) => m.label)).toEqual(["setembro/2026", "outubro/2026", "novembro/2026"]);

    expect(listReportPeriods("monthly", new Date("2026-11-01T00:00:00.000Z"), new Date("2026-09-01T00:00:00.000Z"))).toEqual([]);

    const weeks = listReportPeriods(
      "weekly",
      new Date("2026-09-16T12:00:00.000Z"),
      new Date("2026-09-23T12:00:00.000Z"),
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[1].start.toISOString()).toBe("2026-09-21T03:00:00.000Z");
  });
});

describe("OND7-B2 domain/reporting — weekly report rules", () => {
  it("normalizeLocalWeekWindow: setHours LOCAL (00:00:00.000 / 23:59:59.999) — QUIRK-7I", () => {
    const rawStart = new Date("2026-09-14T18:00:00.000Z");
    const rawEnd = new Date("2026-09-20T18:00:00.000Z");
    const { start, end } = normalizeLocalWeekWindow(rawStart, rawEnd);

    const expectedStart = new Date(rawStart);
    expectedStart.setHours(0, 0, 0, 0);
    const expectedEnd = new Date(rawEnd);
    expectedEnd.setHours(23, 59, 59, 999);
    expect(start.getTime()).toBe(expectedStart.getTime());
    expect(end.getTime()).toBe(expectedEnd.getTime());

    // instantes brutos diferentes no MESMO dia local colapsam na mesma janela
    const other = normalizeLocalWeekWindow(new Date("2026-09-14T12:00:00.000Z"), new Date("2026-09-20T12:00:00.000Z"));
    expect(other.start.getTime()).toBe(start.getTime());
    expect(other.end.getTime()).toBe(end.getTime());

    // não muta as entradas
    expect(rawStart.getTime()).toBe(new Date("2026-09-14T18:00:00.000Z").getTime());
  });

  it("buildWeeklySummary: summary explícito vence (trim); whitespace cai no automático", () => {
    expect(buildWeeklySummary("  Resumo  ", [])).toBe("Resumo");
    expect(buildWeeklySummary("   ", [])).toBe("Nenhuma sessão concluída para este período.");
    expect(buildWeeklySummary(null, [])).toBe("Nenhuma sessão concluída para este período.");
  });

  it("buildWeeklySummary: contagens exatas (sessões/dias UTC/projetos/tasks)", () => {
    const sessions = [
      { startTime: new Date("2026-09-15T10:00:00.000Z"), project: { name: "Alpha" }, tasks: [{}] },
      { startTime: new Date("2026-09-15T14:00:00.000Z"), project: { name: "Alpha" }, tasks: [] },
      { startTime: new Date("2026-09-16T10:00:00.000Z"), project: null, tasks: undefined },
    ];
    expect(buildWeeklySummary(undefined, sessions)).toBe(
      "Relatório semanal: 3 sessões concluídas em 2 dia(s). Projetos envolvidos: 1. Tasks vinculadas às sessões: 1.",
    );
  });

  it("buildWeeklySummary: sem projetos únicos omite a cláusula; tasks>0 inclui a cláusula", () => {
    const sessions = [
      { startTime: new Date("2026-09-15T10:00:00.000Z"), project: null, tasks: [{}, {}] },
    ];
    expect(buildWeeklySummary(undefined, sessions)).toBe(
      "Relatório semanal: 1 sessões concluídas em 1 dia(s). Tasks vinculadas às sessões: 2.",
    );
  });

  it("mapSessionToWeeklyLog: date = endTime||startTime; nota dailyLog > activity > fallback", () => {
    const base = {
      id: 1,
      userId: 2,
      projectId: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const withEnd = mapSessionToWeeklyLog({
      ...base,
      startTime: new Date("2026-09-08T10:00:00.000Z"),
      endTime: new Date("2026-09-08T12:00:00.000Z"),
      dailyLog: { note: "Nota" },
      activity: "Ensaio",
      project: { id: 5, name: "P" },
    });
    expect(withEnd.date).toBe("2026-09-08T12:00:00.000Z");
    expect(withEnd.note).toBe("Nota");
    expect(withEnd.project).toEqual({ id: 5, name: "P" });

    const noNote = mapSessionToWeeklyLog({
      ...base,
      startTime: "2026-09-08T10:00:00.000Z", // string também é aceita
      endTime: null,
      dailyLog: { note: null },
      activity: "Atividade",
    });
    expect(noNote.date).toBe("2026-09-08T10:00:00.000Z");
    expect(noNote.note).toBe("Atividade");
    expect(noNote.project).toBeNull();

    const fallback = mapSessionToWeeklyLog({ ...base, startTime: new Date("2026-09-08T10:00:00.000Z") });
    expect(fallback.note).toBe("Sessão finalizada sem observações");
    expect(fallback.endTime).toBeNull();
  });
});

describe("OND7-B2 domain/reporting — project hours rules", () => {
  it("weekWindowFor: Monday-based local (startOfWeek/endOfWeek weekStartsOn:1)", () => {
    const { start, end } = weekWindowFor(REF);
    expect(start.getTime()).toBe(startOfWeek(REF, W).getTime());
    expect(end.getTime()).toBe(endOfWeek(REF, W).getTime());
    expect(start.getDay()).toBe(1);
    expect(end.getDay()).toBe(0);
  });

  it("hoursTimeWindow: só com AMBOS os limites (QUIRK-7A); parcial -> null", () => {
    const a = new Date("2026-09-07T00:00:00.000Z");
    const b = new Date("2026-09-13T23:59:59.999Z");
    expect(hoursTimeWindow(a, b)).toEqual({ gte: a, lte: b });
    expect(hoursTimeWindow(a, undefined)).toBeNull();
    expect(hoursTimeWindow(undefined, b)).toBeNull();
    expect(hoursTimeWindow()).toBeNull();
  });

  it("weeklyHistoryWindow: [startOfWeek, endOfWeek) — lt (QUIRK-7B)", () => {
    const w = weeklyHistoryWindow(REF);
    expect(w.gte.getTime()).toBe(startOfWeek(REF, W).getTime());
    expect(w.lt.getTime()).toBe(endOfWeek(REF, W).getTime());
  });

  it("projectWeeklyHoursWindow: start BRUTO, end endOfWeek(raw) (QUIRK-7L)", () => {
    const w = projectWeeklyHoursWindow(REF);
    expect(w.gte.getTime()).toBe(REF.getTime());
    expect(w.lte.getTime()).toBe(endOfWeek(REF, W).getTime());
  });

  it("rollingWeekWindows: i=0..n-1 via subWeeks(now,i) normalizados", () => {
    const windows = rollingWeekWindows(REF, 3);
    expect(windows).toHaveLength(3);
    windows.forEach((win, i) => {
      const ws = subWeeks(REF, i);
      expect(win.start.getTime()).toBe(startOfWeek(ws, W).getTime());
      expect(win.end.getTime()).toBe(endOfWeek(ws, W).getTime());
    });
  });

  it("historyWeekCount: months||4 (months=0 -> 4), *4 semanas", () => {
    expect(historyWeekCount(undefined)).toBe(16);
    expect(historyWeekCount(2)).toBe(8);
    expect(historyWeekCount(1)).toBe(4);
    expect(historyWeekCount(0)).toBe(16);
    expect(historyWeekCount(-1)).toBe(4);
  });

  it("formatWeekDate: dd/MM/yyyy", () => {
    expect(formatWeekDate(startOfWeek(REF, W))).toBe(format(startOfWeek(REF, W), "dd/MM/yyyy"));
  });

  it("hoursFromDurations: sum(duration||0)/3600", () => {
    expect(hoursFromDurations([{ duration: 3600 }, { duration: null }, { duration: 7200 }, {}])).toBe(3);
    expect(hoursFromDurations([])).toBe(0);
  });

  it("averageHoursPerWeek: 0 quando sem semanas", () => {
    expect(averageHoursPerWeek(3, 8)).toBeCloseTo(0.375, 10);
    expect(averageHoursPerWeek(5, 0)).toBe(0);
  });

  it("aggregateProjectHours: grouping, ISO mapping, linkedTasks e linhas cruas em hoursByUser (QUIRK-7H)", () => {
    const rowA: HoursSessionRow = {
      id: 1,
      userId: 10,
      userName: "Ana",
      startTime: new Date("2026-09-08T10:00:00.000Z"),
      endTime: null,
      duration: 3600,
      activity: "A",
      location: null,
      tasks: [{ task: { id: 50, title: "T" } }],
    };
    const rowB: HoursSessionRow = {
      ...rowA,
      id: 2,
      userId: 11,
      userName: "Bruno",
      startTime: new Date("2026-09-09T10:00:00.000Z"),
      duration: null,
      tasks: [],
    };
    const out = aggregateProjectHours(7, [rowA, rowB]);
    expect(out.projectId).toBe(7);
    expect(out.totalHours).toBe(1);
    expect(out.sessionCount).toBe(2);
    expect(out.hoursByUser).toHaveLength(2);
    const ana = out.hoursByUser.find((e) => e.userId === 10)!;
    expect(ana.userName).toBe("Ana");
    expect(ana.totalHours).toBe(1);
    expect(ana.sessions[0]).toBe(rowA); // RAW row leakada (identidade preservada)
    expect(out.sessions[0]).toEqual({
      id: 1,
      userId: 10,
      userName: "Ana",
      startTime: "2026-09-08T10:00:00.000Z",
      endTime: null,
      duration: 3600,
      activity: "A",
      location: null,
      linkedTasks: [{ id: 50, title: "T" }],
    });
  });

  it("sumWeeklyHours + TOP_USERS_LIMIT", () => {
    expect(sumWeeklyHours([{ totalHours: 1.5 }, { totalHours: 2 }, { totalHours: 0 }])).toBe(3.5);
    expect(sumWeeklyHours([])).toBe(0);
    expect(TOP_USERS_LIMIT).toBe(5);
  });
});

describe("OND7-B2 domain/reporting — project report rules", () => {
  it("canManageProjectReports: MANAGE_USERS = COORDENADOR/GERENTE", () => {
    expect(canManageProjectReports(["COORDENADOR"])).toBe(true);
    expect(canManageProjectReports(["GERENTE"])).toBe(true);
    expect(canManageProjectReports(["LABORATORISTA"])).toBe(false);
    expect(canManageProjectReports(["VOLUNTARIO", "COLABORADOR"])).toBe(false);
    expect(canManageProjectReports([])).toBe(false);
  });

  it("decideReportCreateAccess: project -> management -> leader (ordem do gateway)", () => {
    expect(decideReportCreateAccess(false, true, true)).toBe("project_not_found");
    expect(decideReportCreateAccess(true, true, false)).toBe("ok");
    expect(decideReportCreateAccess(true, false, true)).toBe("ok");
    expect(decideReportCreateAccess(true, false, false)).toBe("denied");
  });

  it("decideReportViewAccess / EditAccess / DeleteAccess / AttachmentDeleteAccess", () => {
    expect(decideReportViewAccess(true, false)).toBe("ok");
    expect(decideReportViewAccess(false, true)).toBe("ok");
    expect(decideReportViewAccess(false, false)).toBe("denied");

    expect(decideReportEditAccess(false, true)).toBe("ok");
    expect(decideReportEditAccess(false, false)).toBe("denied");

    // QUIRK-7G: autor NÃO-manager não exclui
    expect(decideReportDeleteAccess(true)).toBe("ok");
    expect(decideReportDeleteAccess(false)).toBe("denied");

    expect(decideAttachmentDeleteAccess(false, true)).toBe("ok");
    expect(decideAttachmentDeleteAccess(false, false)).toBe("denied");
  });

  it("decideReportListAccess: manager vê tudo; líder só liderados; vedações (QUIRK-7J)", () => {
    expect(decideReportListAccess(true, undefined, [])).toEqual({ allowed: true, projectFilter: undefined });
    expect(decideReportListAccess(true, 10, [])).toEqual({ allowed: true, projectFilter: [10] });

    expect(decideReportListAccess(false, undefined, [10, 11])).toEqual({ allowed: true, projectFilter: [10, 11] });
    expect(decideReportListAccess(false, 10, [10, 11])).toEqual({ allowed: true, projectFilter: [10, 11] });
    expect(decideReportListAccess(false, 12, [10, 11])).toEqual({ allowed: false });
    expect(decideReportListAccess(false, undefined, [])).toEqual({ allowed: false });
  });

  it("projectReportPeriodLabel: weekly usa formato date-fns LOCAL; demais o label SP (QUIRK-7E)", () => {
    const start = new Date("2026-09-14T03:00:00.000Z");
    const end = new Date("2026-09-21T02:59:59.999Z");
    expect(projectReportPeriodLabel("weekly", start, end)).toBe(
      `Semana ${format(start, "dd/MM")}–${format(end, "dd/MM")}`,
    );
    expect(projectReportPeriodLabel("monthly", start, end)).toBe("setembro/2026");
    expect(projectReportPeriodLabel("annual", start, end)).toBe("Ano 2026");
  });

  it("hasValidReportContent: null/''/whitespace inválidos (create); update não valida (QUIRK-7F fica no use case)", () => {
    expect(hasValidReportContent("ok")).toBe(true);
    expect(hasValidReportContent("  x  ")).toBe(true);
    expect(hasValidReportContent("   ")).toBe(false);
    expect(hasValidReportContent("")).toBe(false);
    expect(hasValidReportContent(null)).toBe(false);
    expect(hasValidReportContent(undefined)).toBe(false);
  });

  it("notificação: evento/roles/message congelados", () => {
    expect(REPORT_SUBMISSION_EVENT).toEqual({
      eventType: "PROJECT_REPORT_SUBMITTED",
      title: "Novo relatório de projeto",
    });
    expect(REPORT_NOTIFICATION_ROLES).toEqual(["COORDENADOR", "GERENTE"]);
    expect(reportSubmissionMessage("setembro/2026", "Alpha")).toBe("setembro/2026 · Alpha");
  });
});

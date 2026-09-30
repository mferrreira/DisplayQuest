/**
 * OND7-B3 — CONTRACT old-vs-new do reporting (R3, DEC-18).
 *
 * Lado ANTIGO: o `PrismaReportingGateway` LEGADO (intacto, DEC-15) — a implementação antiga
 * indexada na costura. Lado NOVO: `createReportingModule({ ports })` com os adapters Prisma
 * FINOS + use cases novos + o publisher real `NotificationsReportPublisher` plugado numa
 * sink fake. AMBOS os lados passam pelo MESMO fake prisma (singleton do harness compartilhado)
 * e pelo MESMO mock de `lib/storage/report-uploads`.
 *
 * Paridade aferida em três planos (padrão OND6-B3):
 *   1. resultado JSON-observável (toEqual profundo);
 *   2. estado FINAL do store (snapshot serializado determinístico, Dates->ISO);
 *   3. eventos de notificação publishEvent (payloads registrados dos dois lados) + erros
 *      comparados por MENSAGEM (o lado novo lança DomainError tipados com as mensagens
 *      legadas verbatim; o status HTTP é evolução do batch 7.4, não divergência aqui).
 *
 * Relógio congelado (2026-09-16T12:00:00Z, quarta). TZ-robustez como no golden: esperados
 * vêm da PARIDADE old-vs-new, não de literais de fuso.
 */
import { endOfWeek, startOfWeek, subWeeks } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  reportingHarness,
  snapshotReportingWorld,
  type ReportingFakeWorld,
} from "./reporting-fake-prisma";

vi.mock("@/lib/database/prisma", () => ({ prisma: reportingHarness.prisma }));
vi.mock("@/lib/storage/report-uploads", () => ({
  removeStoredReportFile: async (storedPath: string) => {
    reportingHarness.world.storage.removed.push(storedPath)
  },
  sweepStaleReportUploads: async (referenced: string[], maxAgeMs?: number) => {
    reportingHarness.world.storage.sweepCalls.push({ paths: referenced, maxAgeMs })
    return reportingHarness.world.storage.sweepResult
  },
}));

import { PrismaReportingGateway } from "@/backend/modules/reporting/infrastructure/prisma-reporting.gateway";
import { createReportingModule } from "@/backend/modules/reporting";
import { PrismaHoursReadRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-hours-read.repository";
import { PrismaProjectReportsRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-project-reports.repository";
import { PrismaReportAttachmentsRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-report-attachments.repository";
import { PrismaReportingDirectory } from "@/backend/modules/reporting/infrastructure/repositories/prisma-reporting-directory";
import { PrismaWeeklyHoursHistoryRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-weekly-hours-history.repository";
import { PrismaWeeklyReportsRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-weekly-reports.repository";
import { NotificationsReportPublisher, type ReportSubmittedEventSink } from "@/backend/modules/reporting/infrastructure/publishers/notifications-report-publisher";

const FROZEN = new Date("2026-09-16T12:00:00.000Z"); // quarta-feira
const W = { weekStartsOn: 1 } as const;

type ReportingModuleNew = ReturnType<typeof createReportingModule>;

let events: any[];
let notifications: { publishEvent: ReturnType<typeof vi.fn> };
let sink: ReportSubmittedEventSink;

function newPorts() {
  return {
    weeklyReports: new PrismaWeeklyReportsRepository(),
    hoursRead: new PrismaHoursReadRepository(),
    weeklyHoursHistory: new PrismaWeeklyHoursHistoryRepository(),
    projectReports: new PrismaProjectReportsRepository(),
    reportAttachments: new PrismaReportAttachmentsRepository(),
    directory: new PrismaReportingDirectory(),
  };
}

function makePublishFn(fail: boolean) {
  return vi.fn(async (event: any) => {
    if (fail) throw new Error("bus down")
    events.push(event)
  })
}

async function parity(
  seed: (world: ReportingFakeWorld) => void,
  runOld: (gateway: PrismaReportingGateway) => Promise<unknown>,
  runNew: (reportingModule: ReportingModuleNew) => Promise<unknown>,
  options: { failPublish?: boolean } = {},
) {
  // lado ANTIGO
  reportingHarness.reset()
  seed(reportingHarness.world)
  events = []
  notifications = { publishEvent: makePublishFn(Boolean(options.failPublish)) }
  const gateway = new PrismaReportingGateway(notifications as never)
  const oldResult = await runOld(gateway)
  const oldSnapshot = snapshotReportingWorld(reportingHarness.world)
  const oldEvents = structuredClone(events)

  // lado NOVO
  reportingHarness.reset()
  seed(reportingHarness.world)
  events = []
  sink = { publishEvent: makePublishFn(Boolean(options.failPublish)) }
  const reportingModule = createReportingModule({
    ports: { ...newPorts(), publisher: new NotificationsReportPublisher(sink) },
  })
  const newResult = await runNew(reportingModule)
  const newSnapshot = snapshotReportingWorld(reportingHarness.world)
  const newEvents = structuredClone(events)

  expect(newResult).toEqual(oldResult)
  expect(newSnapshot).toBe(oldSnapshot)
  expect(newEvents).toEqual(oldEvents)

  return { oldResult, newResult, oldSnapshot, newSnapshot, oldEvents, newEvents }
}

async function captureError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
    return "__no_error__"
  } catch (error) {
    return (error as Error).message
  }
}

async function parityError(
  seed: (world: ReportingFakeWorld) => void,
  runOld: (gateway: PrismaReportingGateway) => Promise<unknown>,
  runNew: (reportingModule: ReportingModuleNew) => Promise<unknown>,
  expectedMessage: string,
) {
  reportingHarness.reset()
  seed(reportingHarness.world)
  events = []
  notifications = { publishEvent: makePublishFn(false) }
  const gateway = new PrismaReportingGateway(notifications as never)
  const oldMessage = await captureError(() => runOld(gateway))
  const oldSnapshot = snapshotReportingWorld(reportingHarness.world)

  reportingHarness.reset()
  seed(reportingHarness.world)
  events = []
  sink = { publishEvent: makePublishFn(false) }
  const reportingModule = createReportingModule({
    ports: { ...newPorts(), publisher: new NotificationsReportPublisher(sink) },
  })
  const newMessage = await captureError(() => runNew(reportingModule))
  const newSnapshot = snapshotReportingWorld(reportingHarness.world)

  expect(oldMessage).toBe(expectedMessage)
  expect(newMessage).toBe(expectedMessage)
  expect(newSnapshot).toBe(oldSnapshot)
}

// ---------------------------------------------------------------------------
// seed builders (fresh objects/Dates per side — deterministic by construction)
// ---------------------------------------------------------------------------

function seedUser(world: ReportingFakeWorld, over: any = {}) {
  const u = {
    id: "id" in over ? over.id : world.seq.user++,
    name: over.name ?? `Usuario ${over.id ?? 0}`,
    email: over.email ?? `u${over.id ?? 0}@example.com`,
    roles: over.roles ?? ["VOLUNTARIO"],
    status: over.status ?? "active",
    currentWeekHours: over.currentWeekHours ?? 0,
  }
  world.users.push(u)
  return u
}

function seedProject(world: ReportingFakeWorld, over: any = {}) {
  const p = {
    id: "id" in over ? over.id : world.seq.project++,
    name: over.name ?? "Projeto",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: over.createdBy ?? 1,
    leaderId: over.leaderId ?? null,
    status: over.status ?? "active",
    links: null,
  }
  world.projects.push(p)
  return p
}

function seedMember(world: ReportingFakeWorld, projectId: number, userId: number, roles: string[] = ["COLABORADOR"]) {
  const m = { id: world.seq.member++, projectId, userId, joinedAt: new Date("2026-01-02T00:00:00.000Z"), roles }
  world.projectMembers.push(m)
  return m
}

function seedTask(world: ReportingFakeWorld, over: any = {}) {
  const t = {
    id: "id" in over ? over.id : world.seq.task++,
    title: over.title ?? "Task",
    description: null,
    status: "pending",
    priority: "medium",
    assignedTo: null,
    projectId: over.projectId ?? null,
    dueDate: null,
    points: over.points ?? 10,
    completed: over.completed ?? false,
  }
  world.tasks.push(t)
  return t
}

function seedSession(world: ReportingFakeWorld, over: any = {}) {
  const s = {
    id: "id" in over ? over.id : world.seq.session++,
    userId: over.userId,
    userName: over.userName ?? `Usuario ${over.userId}`,
    startTime: new Date(over.startTime),
    endTime: over.endTime == null ? null : new Date(over.endTime),
    duration: over.duration ?? null,
    activity: over.activity ?? null,
    location: over.location ?? null,
    projectId: over.projectId ?? null,
    status: over.status ?? "completed",
    createdAt: new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    tasks: (over.tasks ?? []).map((taskId: number) => ({ id: taskId, workSessionId: over.id, taskId })),
  }
  world.workSessions.push(s)
  return s
}

function seedDailyLog(world: ReportingFakeWorld, over: any = {}) {
  const l = {
    id: "id" in over ? over.id : world.seq.dailyLog++,
    userId: over.userId,
    projectId: over.projectId ?? null,
    date: new Date(over.date),
    note: over.note ?? null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    workSessionId: over.workSessionId ?? null,
  }
  world.dailyLogs.push(l)
  return l
}

function seedWeeklyReport(world: ReportingFakeWorld, over: any = {}) {
  const r = {
    id: "id" in over ? over.id : world.seq.weeklyReport++,
    userId: over.userId,
    userName: over.userName ?? `Usuario ${over.userId}`,
    weekStart: new Date(over.weekStart),
    weekEnd: new Date(over.weekEnd),
    totalLogs: over.totalLogs ?? 0,
    summary: over.summary ?? null,
    createdAt: new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
  }
  world.weeklyReports.push(r)
  return r
}

function seedWeeklyHours(world: ReportingFakeWorld, over: any = {}) {
  const r = {
    id: "id" in over ? over.id : world.seq.weeklyHours++,
    userId: over.userId,
    userName: over.userName ?? `Usuario ${over.userId}`,
    weekStart: over.weekStart instanceof Date ? over.weekStart : new Date(over.weekStart),
    weekEnd: over.weekEnd instanceof Date ? over.weekEnd : new Date(over.weekEnd),
    totalHours: over.totalHours ?? 0,
    createdAt: new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
  }
  world.weeklyHours.push(r)
  return r
}

function seedProjectReport(world: ReportingFakeWorld, over: any = {}) {
  const r = {
    id: "id" in over ? over.id : world.seq.projectReport++,
    projectId: over.projectId,
    authorId: over.authorId,
    periodType: over.periodType ?? "monthly",
    periodStart: new Date(over.periodStart ?? "2026-09-01T03:00:00.000Z"),
    periodEnd: new Date(over.periodEnd ?? "2026-10-01T02:59:59.999Z"),
    title: over.title ?? null,
    content: over.content ?? "conteudo",
    createdAt: new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
    updatedAt: new Date(over.updatedAt ?? "2026-09-01T00:00:00.000Z"),
  }
  world.projectReports.push(r)
  return r
}

function seedAttachment(world: ReportingFakeWorld, over: any = {}) {
  const a = {
    id: "id" in over ? over.id : world.seq.attachment++,
    reportId: over.reportId,
    fileName: over.fileName ?? "arquivo.pdf",
    storedPath: over.storedPath ?? `reports/${over.reportId}/arquivo.pdf`,
    mimeType: over.mimeType ?? "application/pdf",
    sizeBytes: over.sizeBytes ?? 1234,
    uploadedBy: over.uploadedBy ?? 1,
    createdAt: new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
  }
  world.reportAttachments.push(a)
  return a
}

beforeEach(() => {
  reportingHarness.reset()
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN)
  events = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("OND7-B3 contract — reporting old-vs-new", () => {
  // ===================== weekly reports =====================
  it("listWeeklyReports: filtros + totalLogs por relatório", async () => {
    const { oldResult } = await parity(
      (world) => {
        seedWeeklyReport(world, { userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" })
        seedWeeklyReport(world, { userId: 1, weekStart: "2026-08-31T00:00:00.000Z", weekEnd: "2026-09-06T23:59:59.999Z" })
        seedWeeklyReport(world, { userId: 2, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" })
        seedSession(world, { userId: 1, startTime: "2026-09-08T10:00:00.000Z" })
        seedSession(world, { userId: 1, startTime: "2026-09-09T10:00:00.000Z" })
        seedSession(world, { userId: 1, startTime: "2026-09-10T10:00:00.000Z", status: "active" })
      },
      (gateway) => gateway.listWeeklyReports({ userId: 1 }),
      (module) => module.listWeeklyReports({ userId: 1 }),
    )
    expect((oldResult as any[]).map((r) => r.totalLogs)).toEqual([2, 0])
  })

  it("getWeeklyReportById: null para inexistente + logs mapeados (nota fallback, date=endTime||start)", async () => {
    await parity(
      () => undefined,
      (gateway) => gateway.getWeeklyReportById(999),
      (module) => module.getWeeklyReportById(999),
    )

    const { oldResult } = await parity(
      (world) => {
        const rep = seedWeeklyReport(world, { userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" })
        const proj = seedProject(world, { id: 10, name: "Alpha" })
        const s1 = seedSession(world, { userId: 1, startTime: "2026-09-08T10:00:00.000Z", endTime: "2026-09-08T12:00:00.000Z", projectId: 10, activity: "Ensaio" })
        seedDailyLog(world, { userId: 1, projectId: 10, date: "2026-09-08T12:00:00.000Z", note: "Nota do log", workSessionId: s1.id })
        seedSession(world, { userId: 1, startTime: "2026-09-09T10:00:00.000Z", endTime: "2026-09-09T11:00:00.000Z", activity: "Atividade X" })
        seedSession(world, { userId: 1, startTime: "2026-09-10T10:00:00.000Z" })
        void proj
        return rep
      },
      (gateway) => gateway.getWeeklyReportById(1),
      (module) => module.getWeeklyReportById(1),
    )
    const logs = (oldResult as any).logs
    // orderBy startTime DESC: Sep10 (fallback), Sep9 (activity), Sep8 (dailyLog.note)
    expect(logs.map((l: any) => l.note)).toEqual(["Sessão finalizada sem observações", "Atividade X", "Nota do log"])
  })

  it("upsertWeeklyReport: cria com janela normalizada + summary automático", async () => {
    const { oldSnapshot } = await parity(
      (world) => {
        seedUser(world, { id: 1, name: "Maria" })
        seedSession(world, { userId: 1, startTime: "2026-09-15T10:00:00.000Z" })
        seedSession(world, { userId: 1, startTime: "2026-09-15T14:00:00.000Z" })
        seedSession(world, { userId: 1, startTime: "2026-09-13T12:00:00.000Z" })
        seedSession(world, { userId: 1, startTime: "2026-09-16T10:00:00.000Z", status: "active" })
      },
      (gateway) => gateway.upsertWeeklyReport({ userId: 1, weekStart: "2026-09-14T18:00:00.000Z", weekEnd: "2026-09-20T18:00:00.000Z" }),
      (module) => module.upsertWeeklyReport({ userId: 1, weekStart: "2026-09-14T18:00:00.000Z", weekEnd: "2026-09-20T18:00:00.000Z" }),
    )
    const store = JSON.parse(oldSnapshot)
    expect(store.weeklyReports).toHaveLength(1)
    expect(store.weeklyReports[0].totalLogs).toBe(2)
    expect(store.weeklyReports[0].summary).toBe("Relatório semanal: 2 sessões concluídas em 1 dia(s).")
  })

  it("upsertWeeklyReport: update path (colapso QUIRK-7I) + summary explícito trimado", async () => {
    const run = async (target: PrismaReportingGateway | ReportingModuleNew) => {
      const first = await (target as any).upsertWeeklyReport({ userId: 1, weekStart: "2026-09-14T18:00:00.000Z", weekEnd: "2026-09-20T18:00:00.000Z", summary: "  v1  " })
      const second = await (target as any).upsertWeeklyReport({ userId: 1, weekStart: "2026-09-14T18:00:00.000Z", weekEnd: "2026-09-20T19:00:00.000Z", summary: "v2" })
      return { first, second }
    }
    const { oldSnapshot } = await parity(
      (world) => seedUser(world, { id: 1 }),
      (gateway) => run(gateway),
      (module) => run(module),
    )
    const store = JSON.parse(oldSnapshot)
    expect(store.weeklyReports).toHaveLength(1)
    expect(store.weeklyReports[0].summary).toBe("v2")
  })

  it("upsertWeeklyReport: 'Usuário não encontrado' (mensagem legada verbatim)", async () => {
    await parityError(
      () => undefined,
      (gateway) => gateway.upsertWeeklyReport({ userId: 999, weekStart: "2026-09-14T18:00:00.000Z", weekEnd: "2026-09-20T18:00:00.000Z" }),
      (module) => module.upsertWeeklyReport({ userId: 999, weekStart: "2026-09-14T18:00:00.000Z", weekEnd: "2026-09-20T18:00:00.000Z" }),
      "Usuário não encontrado",
    )
  })

  it("deleteWeeklyReport: remove + P2025 propagado (QUIRK-7K, mesma mensagem)", async () => {
    const { oldSnapshot } = await parity(
      (world) => seedWeeklyReport(world, { userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" }),
      (gateway) => gateway.deleteWeeklyReport(1),
      (module) => module.deleteWeeklyReport(1),
    )
    expect(JSON.parse(oldSnapshot).weeklyReports).toHaveLength(0)

    await parityError(
      () => undefined,
      (gateway) => gateway.deleteWeeklyReport(999),
      (module) => module.deleteWeeklyReport(999),
      "Record not found: weekly_reports 999",
    )
  })

  // ===================== project hours =====================
  it("getProjectHours: janela completa, completed-only, hoursByUser com linhas cruas (QUIRK-7H)", async () => {
    const { oldResult } = await parity(
      (world) => {
        seedProject(world, { id: 10 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-08T10:00:00.000Z", duration: 3600 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-09T10:00:00.000Z", duration: null })
        seedSession(world, { userId: 2, projectId: 10, startTime: "2026-09-10T10:00:00.000Z", duration: 7200 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-11T10:00:00.000Z", duration: 9999, status: "active" })
      },
      (gateway) => gateway.getProjectHours({ projectId: 10, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" }),
      (module) => module.getProjectHours({ projectId: 10, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" }),
    )
    expect(oldResult).toMatchObject({ totalHours: 3, sessionCount: 3 })
  })

  it("getProjectHours: range parcial ignorado (QUIRK-7A)", async () => {
    const { oldResult } = await parity(
      (world) => {
        seedProject(world, { id: 10 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2020-01-01T10:00:00.000Z", duration: 3600 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2030-01-01T10:00:00.000Z", duration: 3600 })
      },
      (gateway) => gateway.getProjectHours({ projectId: 10, weekStart: "2026-09-07T00:00:00.000Z" }),
      (module) => module.getProjectHours({ projectId: 10, weekStart: "2026-09-07T00:00:00.000Z" }),
    )
    expect((oldResult as any).sessionCount).toBe(2)
  })

  it("getProjectWeeklyHours: janela [bruto, endOfWeek(bruto)] (QUIRK-7L)", async () => {
    const { oldResult } = await parity(
      (world) => {
        seedProject(world, { id: 10 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-16T11:00:00.000Z", duration: 3600 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-16T13:00:00.000Z", duration: 3600 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-24T12:00:00.000Z", duration: 3600 })
      },
      (gateway) => gateway.getProjectWeeklyHours(10, "2026-09-16T12:00:00.000Z"),
      (module) => module.getProjectWeeklyHours(10, "2026-09-16T12:00:00.000Z"),
    )
    expect((oldResult as any).sessionCount).toBe(1)
  })

  it("getProjectHoursHistory: 8 semanas (months=2), labels dd/MM/yyyy, média", async () => {
    const { oldResult } = await parity(
      (world) => {
        seedProject(world, { id: 10 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-16T11:00:00.000Z", duration: 3600 })
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-09T11:00:00.000Z", duration: 7200 })
      },
      (gateway) => gateway.getProjectHoursHistory({ projectId: 10, months: 2 }),
      (module) => module.getProjectHoursHistory({ projectId: 10, months: 2 }),
    )
    const history = oldResult as any
    expect(history.weeks).toHaveLength(8)
    expect(history.totalHours).toBe(3)
    expect(history.averageHoursPerWeek).toBeCloseTo(3 / 8, 10)
  })

  it("getUserProjectHours: memberships + userHours do próprio usuário", async () => {
    await parity(
      (world) => {
        seedProject(world, { id: 10, name: "Alpha" })
        seedProject(world, { id: 11, name: "Beta", status: "completed" })
        seedMember(world, 10, 1)
        seedMember(world, 11, 1)
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-08T10:00:00.000Z", duration: 3600 })
        seedSession(world, { userId: 2, projectId: 10, startTime: "2026-09-08T11:00:00.000Z", duration: 7200 })
      },
      (gateway) => gateway.getUserProjectHours({ userId: 1 }),
      (module) => module.getUserProjectHours({ userId: 1 }),
    )
  })

  // ===================== weekly hours history =====================
  it("listWeeklyHoursHistory: sem weekStart (orderBy weekStart desc, user incluído)", async () => {
    await parity(
      (world) => {
        seedUser(world, { id: 1, email: "a@x.com" })
        seedWeeklyHours(world, { userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z", totalHours: 5 })
        seedWeeklyHours(world, { userId: 1, weekStart: "2026-08-31T00:00:00.000Z", weekEnd: "2026-09-06T23:59:59.999Z", totalHours: 3 })
        seedWeeklyHours(world, { userId: 2, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z", totalHours: 9 })
      },
      (gateway) => gateway.listWeeklyHoursHistory({ userId: 1 }),
      (module) => module.listWeeklyHoursHistory({ userId: 1 }),
    )
  })

  it("listWeeklyHoursHistory: com weekStart janela [start,end) + orderBy totalHours desc (QUIRK-7B)", async () => {
    const { oldResult } = await parity(
      (world) => {
        const weekStart = startOfWeek(FROZEN, W)
        const weekEnd = endOfWeek(FROZEN, W)
        seedWeeklyHours(world, { userId: 1, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: 2 })
        seedWeeklyHours(world, { userId: 2, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: 8 })
        seedWeeklyHours(world, { userId: 3, weekStart: weekEnd, weekEnd, totalHours: 99 }) // exatamente no endOfWeek -> excluída pelo lt
      },
      (gateway) => gateway.listWeeklyHoursHistory({ weekStart: "2026-09-16T12:00:00.000Z" }),
      (module) => module.listWeeklyHoursHistory({ weekStart: "2026-09-16T12:00:00.000Z" }),
    )
    expect((oldResult as any[]).map((r) => r.totalHours)).toEqual([8, 2])
  })

  it("getWeeklyHoursStats: currentWeek + topUsers(5) + last4Weeks", async () => {
    const { oldResult } = await parity(
      (world) => {
        const weekStart = startOfWeek(FROZEN, W)
        const weekEnd = endOfWeek(FROZEN, W)
        for (let i = 1; i <= 7; i++) {
          seedWeeklyHours(world, { userId: i, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: i })
        }
        for (let i = 1; i <= 4; i++) {
          const ws = startOfWeek(subWeeks(FROZEN, i), W)
          const we = endOfWeek(subWeeks(FROZEN, i), W)
          seedWeeklyHours(world, { userId: 1, weekStart: ws, weekEnd: new Date(we.getTime() - 1), totalHours: i * 2 })
          seedWeeklyHours(world, { userId: 2, weekStart: ws, weekEnd: new Date(we.getTime() - 1), totalHours: i })
        }
      },
      (gateway) => gateway.getWeeklyHoursStats(),
      (module) => module.getWeeklyHoursStats(),
    )
    const stats = oldResult as any
    expect(stats.currentWeek.totalHours).toBe(28)
    expect(stats.currentWeek.topUsers).toHaveLength(5)
    expect(stats.last4Weeks.map((w: any) => w.totalHours)).toEqual([3, 6, 9, 12])
  })

  it("resetWeeklyHoursHistory: cria linha >0h, zera TODO ativo, inativo intocado, SEM dedup (QUIRK-7C)", async () => {
    const run = async (target: PrismaReportingGateway | ReportingModuleNew) => {
      const first = await (target as any).resetWeeklyHoursHistory()
      const second = await (target as any).resetWeeklyHoursHistory()
      return { first, second }
    }
    const { oldSnapshot } = await parity(
      (world) => {
        seedUser(world, { id: 1, name: "Ativo", currentWeekHours: 10 })
        seedUser(world, { id: 2, name: "Zerado", currentWeekHours: 12 })
        seedUser(world, { id: 3, name: "Inativo", status: "inactive", currentWeekHours: 7 })
        seedSession(world, { userId: 1, startTime: "2026-09-16T11:00:00.000Z", duration: 5400 })
        seedSession(world, { userId: 3, startTime: "2026-09-16T11:00:00.000Z", duration: 3600 })
      },
      (gateway) => run(gateway),
      (module) => run(module),
    )
    const store = JSON.parse(oldSnapshot)
    expect(store.weeklyHours).toHaveLength(2) // duplicadas — QUIRK-7C dos dois lados
    expect(store.users.find((u: any) => u.id === 2).currentWeekHours).toBe(0)
    expect(store.users.find((u: any) => u.id === 3).currentWeekHours).toBe(7)
  })

  it("createWeeklyHoursHistory: dedup por (userId, weekStart exato) + totalHours numérico", async () => {
    const { oldSnapshot } = await parity(
      (world) => {
        seedUser(world, { id: 1, name: "Um" })
        seedUser(world, { id: 2, name: "Dois" })
        const ref = new Date("2026-09-02T12:00:00.000Z")
        const weekStart = startOfWeek(ref, W)
        const weekEnd = endOfWeek(ref, W)
        seedWeeklyHours(world, { userId: 1, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: 99 }) // existing -> skip
        seedSession(world, { userId: 1, startTime: new Date(weekStart.getTime() + 86_400_000), duration: 3600 })
        seedSession(world, { userId: 2, startTime: new Date(weekStart.getTime() + 86_400_000), duration: 7200 })
      },
      (gateway) => gateway.createWeeklyHoursHistory("2026-09-02T12:00:00.000Z"),
      (module) => module.createWeeklyHoursHistory("2026-09-02T12:00:00.000Z"),
    )
    const store = JSON.parse(oldSnapshot)
    expect(store.weeklyHours).toHaveLength(2) // existing + nova (user 1 pulado)
  })

  it("getProjectStats: memberCount + horas da semana atual + members", async () => {
    await parity(
      (world) => {
        seedUser(world, { id: 1 })
        seedUser(world, { id: 2 })
        seedProject(world, { id: 10, name: "Alpha", status: "active" })
        seedMember(world, 10, 1, ["COORDENADOR"])
        seedMember(world, 10, 2, ["COLABORADOR"])
        seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-16T11:00:00.000Z", duration: 3600 })
        seedSession(world, { userId: 2, projectId: 10, startTime: "2026-09-13T11:00:00.000Z", duration: 3600 })
      },
      (gateway) => gateway.getProjectStats(),
      (module) => module.getProjectStats(),
    )
  })

  // ===================== project reports =====================
  it("createProjectReport: 'Projeto não encontrado' e 'Acesso negado' (mensagens legadas)", async () => {
    await parityError(
      () => undefined,
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 999, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 999, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      "Projeto não encontrado",
    )

    await parityError(
      (world) => {
        seedProject(world, { id: 10, leaderId: 2 })
        seedMember(world, 10, 1, ["COLABORADOR"])
      },
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      "Acesso negado",
    )
  })

  it("createProjectReport: validações conteúdo/periodicidade/referência (mensagens exatas)", async () => {
    const seed = (world: ReportingFakeWorld) => seedProject(world, { id: 10 })
    await parityError(
      seed,
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "   " }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "   " }),
      "Dados inválidos: conteúdo obrigatório",
    )
    await parityError(
      seed,
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "quinzenal" as any, reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "quinzenal" as any, reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      "Dados inválidos: periodicidade inválida",
    )
    await parityError(
      seed,
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "data-invalida", content: "ok" }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "data-invalida", content: "ok" }),
      "Dados inválidos: referência inválida",
    )
  })

  it("createProjectReport: cria monthly (janela SP + label) + notificação payload-idêntico", async () => {
    const { oldResult, oldEvents } = await parity(
      (world) => {
        seedUser(world, { id: 1, name: "Autor" })
        seedUser(world, { id: 2, roles: ["COORDENADOR"] })
        seedUser(world, { id: 3, roles: ["GERENTE"] })
        seedUser(world, { id: 4, roles: ["LABORATORISTA"] })
        seedUser(world, { id: 5, roles: ["COORDENADOR"], status: "inactive" })
        seedProject(world, { id: 10, name: "Alpha" })
      },
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", title: "Relatório M", content: "conteudo mensal" }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", title: "Relatório M", content: "conteudo mensal" }),
    )
    const created = oldResult as any
    expect(created.created).toBe(true)
    expect(created.report.periodStart).toBe("2026-09-01T03:00:00.000Z")
    expect(created.report.periodEnd).toBe("2026-10-01T02:59:59.999Z")
    expect(created.report.periodLabel).toBe("setembro/2026")
    expect(oldEvents).toHaveLength(1)
    expect(oldEvents[0]).toMatchObject({
      eventType: "PROJECT_REPORT_SUBMITTED",
      title: "Novo relatório de projeto",
      message: "setembro/2026 · Alpha",
      audience: { mode: "USER_IDS", userIds: [2, 3] },
      triggeredByUserId: 1,
    })
  })

  it("createProjectReport: upsert (created=false, sem notificação) + autor diferente cria linha nova", async () => {
    const run = async (target: PrismaReportingGateway | ReportingModuleNew) => {
      const first = await (target as any).createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", title: "v1", content: "v1" })
      const second = await (target as any).createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", title: null, content: "v2" })
      const other = await (target as any).createProjectReport({ actorUserId: 2, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "outro autor" })
      return { first, second, other }
    }
    const { oldSnapshot, oldEvents } = await parity(
      (world) => {
        seedUser(world, { id: 1 })
        seedUser(world, { id: 2 })
        seedUser(world, { id: 3, roles: ["COORDENADOR"] }) // destinatário fixo (não autor) p/ as duas criações
        seedProject(world, { id: 10 })
      },
      (gateway) => run(gateway),
      (module) => run(module),
    )
    expect(oldEvents).toHaveLength(2) // só as duas CRIACOES
    expect(JSON.parse(oldSnapshot).projectReports).toHaveLength(2)
  })

  it("createProjectReport: weekly — read model label local vs notificação label SP (QUIRK-7E)", async () => {
    const { oldResult, oldEvents } = await parity(
      (world) => {
        seedUser(world, { id: 1 })
        seedUser(world, { id: 2, roles: ["COORDENADOR"] })
        seedProject(world, { id: 10, name: "Alpha" })
      },
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "weekly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "weekly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
    )
    const created = oldResult as any
    expect(created.report.periodStart).toBe("2026-09-14T03:00:00.000Z")
    expect(created.report.periodLabel).toMatch(/^Semana \d{2}\/\d{2}–\d{2}\/\d{2}$/)
    expect(oldEvents[0].message).toBe("Semana de 14/09 a 20/09 · Alpha")
  })

  it("createProjectReport: falha de notificação engolida (console.error) — store idêntico", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await parity(
      (world) => {
        seedUser(world, { id: 1 })
        seedUser(world, { id: 2, roles: ["COORDENADOR"] })
        seedProject(world, { id: 10 })
      },
      (gateway) => gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      (module) => module.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "2026-09-16T12:00:00.000Z", content: "ok" }),
      { failPublish: true },
    )
    expect(spy).toHaveBeenCalledWith("Erro ao notificar gerência sobre relatório:", expect.any(Error))
  })

  it("updateProjectReport: autor OK / não-autor negado / manager OK (mensagens legadas)", async () => {
    const seed = (world: ReportingFakeWorld) => {
      seedUser(world, { id: 1 })
      seedProject(world, { id: 10 })
      seedProjectReport(world, { projectId: 10, authorId: 1, content: "original" })
    }
    await parity(
      seed,
      (gateway) => gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, content: "do autor" }),
      (module) => module.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, content: "do autor" }),
    )
    await parityError(
      seed,
      (gateway) => gateway.updateProjectReport({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], reportId: 1, content: "invasor" }),
      (module) => module.updateProjectReport({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], reportId: 1, content: "invasor" }),
      "Acesso negado",
    )
    await parityError(
      () => undefined,
      (gateway) => gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], reportId: 999, content: "x" }),
      (module) => module.updateProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], reportId: 999, content: "x" }),
      "Relatório não encontrado",
    )
  })

  it("updateProjectReport: parcial (title null zera, content omitido preserva) + vazio aceito (QUIRK-7F)", async () => {
    const { oldSnapshot } = await parity(
      (world) => {
        seedUser(world, { id: 1 })
        seedProject(world, { id: 10 })
        seedProjectReport(world, { projectId: 10, authorId: 1, title: "T original", content: "C original" })
      },
      (gateway) => gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, title: null }),
      (module) => module.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, title: null }),
    )
    expect(JSON.parse(oldSnapshot).projectReports[0]).toMatchObject({ title: null, content: "C original" })

    const empty = await parity(
      (world) => {
        seedUser(world, { id: 1 })
        seedProject(world, { id: 10 })
        seedProjectReport(world, { projectId: 10, authorId: 1, content: "original" })
      },
      (gateway) => gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, content: "" }),
      (module) => module.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, content: "" }),
    )
    expect((empty.oldResult as any).content).toBe("")
  })

  it("deleteProjectReport: autor NÃO-manager negado (QUIRK-7G); manager remove com arquivos + cascade", async () => {
    const seed = (world: ReportingFakeWorld) => {
      seedProject(world, { id: 10 })
      seedProjectReport(world, { projectId: 10, authorId: 1 })
      seedAttachment(world, { reportId: 1, storedPath: "reports/10/a.pdf" })
      seedAttachment(world, { reportId: 1, storedPath: "reports/10/b.pdf" })
    }
    await parityError(
      seed,
      (gateway) => gateway.deleteProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1 }),
      (module) => module.deleteProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1 }),
      "Acesso negado",
    )
    const { oldSnapshot } = await parity(
      seed,
      (gateway) => gateway.deleteProjectReport({ actorUserId: 2, actorRoles: ["COORDENADOR"], reportId: 1 }),
      (module) => module.deleteProjectReport({ actorUserId: 2, actorRoles: ["COORDENADOR"], reportId: 1 }),
    )
    const store = JSON.parse(oldSnapshot)
    expect(store.projectReports).toHaveLength(0)
    expect(store.reportAttachments).toHaveLength(0)
    expect(store.storage.removed).toEqual(["reports/10/a.pdf", "reports/10/b.pdf"])
  })

  it("getProjectReport: lança 'Relatório não encontrado'; líder OK; estranho negado", async () => {
    const seed = (world: ReportingFakeWorld) => {
      seedUser(world, { id: 1 })
      seedProject(world, { id: 10, leaderId: 2 })
      seedProjectReport(world, { projectId: 10, authorId: 1 })
    }
    await parityError(
      () => undefined,
      (gateway) => gateway.getProjectReport(1, ["COORDENADOR"], 999),
      (module) => module.getProjectReport(1, ["COORDENADOR"], 999),
      "Relatório não encontrado",
    )
    await parity(
      seed,
      (gateway) => gateway.getProjectReport(2, ["VOLUNTARIO"], 1),
      (module) => module.getProjectReport(2, ["VOLUNTARIO"], 1),
    )
    await parityError(
      seed,
      (gateway) => gateway.getProjectReport(4, ["VOLUNTARIO"], 1),
      (module) => module.getProjectReport(4, ["VOLUNTARIO"], 1),
      "Acesso negado",
    )
  })

  it("listProjectReports: manager filtros + colisão from/to (QUIRK-7M) + líder + vedações (QUIRK-7J)", async () => {
    const seed = (world: ReportingFakeWorld) => {
      seedUser(world, { id: 1 })
      seedUser(world, { id: 2 })
      seedProject(world, { id: 10, leaderId: 2 })
      seedProject(world, { id: 11, leaderId: 3 })
      seedProjectReport(world, { projectId: 10, authorId: 1, periodType: "monthly", periodStart: "2026-09-01T03:00:00.000Z", periodEnd: "2026-10-01T02:59:59.999Z" })
      seedProjectReport(world, { projectId: 11, authorId: 1, periodType: "weekly", periodStart: "2026-09-14T03:00:00.000Z", periodEnd: "2026-09-21T02:59:59.999Z" })
      seedProjectReport(world, { projectId: 10, authorId: 1, periodType: "monthly", periodStart: "2026-08-01T03:00:00.000Z", periodEnd: "2026-09-01T02:59:59.999Z" })
    }

    const both = await parity(
      seed,
      (gateway) => gateway.listProjectReports({ actorUserId: 5, actorRoles: ["COORDENADOR"], from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T00:00:00.000Z" }),
      (module) => module.listProjectReports({ actorUserId: 5, actorRoles: ["COORDENADOR"], from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T00:00:00.000Z" }),
    )
    expect((both.oldResult as any[]).map((r) => r.id)).toEqual([2, 1, 3]) // from descartado pelo to (QUIRK-7M)

    const leader = await parity(
      seed,
      (gateway) => gateway.listProjectReports({ actorUserId: 2, actorRoles: ["VOLUNTARIO"] }),
      (module) => module.listProjectReports({ actorUserId: 2, actorRoles: ["VOLUNTARIO"] }),
    )
    expect((leader.oldResult as any[]).map((r) => r.id)).toEqual([1, 3]) // relatórios do projeto 10 que ele lidera

    await parityError(
      seed,
      (gateway) => gateway.listProjectReports({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], projectId: 11 }),
      (module) => module.listProjectReports({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], projectId: 11 }),
      "Acesso negado",
    )
    await parityError(
      seed,
      (gateway) => gateway.listProjectReports({ actorUserId: 9, actorRoles: ["VOLUNTARIO"] }),
      (module) => module.listProjectReports({ actorUserId: 9, actorRoles: ["VOLUNTARIO"] }),
      "Acesso negado",
    )
  })

  it("aggregateProjectReport: totals + sessions SEM filtro de status (QUIRK-7D)", async () => {
    const seed = (world: ReportingFakeWorld) => {
      seedUser(world, { id: 1 })
      seedUser(world, { id: 2 })
      seedProject(world, { id: 10 })
      seedProjectReport(world, { projectId: 10, authorId: 1, periodType: "monthly", periodStart: "2026-09-01T03:00:00.000Z", periodEnd: "2026-10-01T02:59:59.999Z" })
      seedDailyLog(world, { userId: 1, projectId: 10, date: "2026-09-10T12:00:00.000Z", note: "log A" })
      const s1 = seedSession(world, { userId: 2, projectId: 10, startTime: "2026-09-11T10:00:00.000Z", endTime: "2026-09-11T12:00:00.000Z", duration: 7200 })
      seedDailyLog(world, { userId: 2, projectId: 10, date: "2026-09-11T12:00:00.000Z", note: "log B", workSessionId: s1.id })
      seedDailyLog(world, { userId: 1, projectId: 10, date: "2026-10-05T12:00:00.000Z", note: "fora" })
      seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-05T10:00:00.000Z", duration: 3600 })
      seedSession(world, { userId: 1, projectId: 10, startTime: "2026-09-06T10:00:00.000Z", duration: null, status: "active" })
      seedSession(world, { userId: 1, projectId: 10, startTime: "2026-10-05T10:00:00.000Z", duration: 3600 })
    }
    const { oldResult } = await parity(
      seed,
      (gateway) => gateway.aggregateProjectReport(1, ["COORDENADOR"], 1),
      (module) => module.aggregateProjectReport(1, ["COORDENADOR"], 1),
    )
    expect((oldResult as any).totals).toEqual({ logCount: 2, sessionCount: 3, totalHours: 3 })

    await parityError(
      seed,
      (gateway) => gateway.aggregateProjectReport(2, ["VOLUNTARIO"], 1),
      (module) => module.aggregateProjectReport(2, ["VOLUNTARIO"], 1),
      "Acesso negado",
    )
  })

  it("registerReportAttachment: autor OK / estranho negado / inexistente negado (mensagens legadas)", async () => {
    const seed = (world: ReportingFakeWorld) => {
      seedUser(world, { id: 1 })
      seedProject(world, { id: 10 })
      seedProjectReport(world, { projectId: 10, authorId: 1 })
    }
    const { oldSnapshot } = await parity(
      seed,
      (gateway) => gateway.registerReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, fileName: "a.pdf", storedPath: "reports/10/a.pdf", mimeType: "application/pdf", sizeBytes: 4321 }),
      (module) => module.registerReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: 1, fileName: "a.pdf", storedPath: "reports/10/a.pdf", mimeType: "application/pdf", sizeBytes: 4321 }),
    )
    expect(JSON.parse(oldSnapshot).reportAttachments[0].uploadedBy).toBe(1)

    await parityError(
      seed,
      (gateway) => gateway.registerReportAttachment({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], reportId: 1, fileName: "a.pdf", storedPath: "x", mimeType: "application/pdf", sizeBytes: 1 }),
      (module) => module.registerReportAttachment({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], reportId: 1, fileName: "a.pdf", storedPath: "x", mimeType: "application/pdf", sizeBytes: 1 }),
      "Acesso negado",
    )
    await parityError(
      () => undefined,
      (gateway) => gateway.registerReportAttachment({ actorUserId: 1, actorRoles: ["COORDENADOR"], reportId: 999, fileName: "a.pdf", storedPath: "x", mimeType: "application/pdf", sizeBytes: 1 }),
      (module) => module.registerReportAttachment({ actorUserId: 1, actorRoles: ["COORDENADOR"], reportId: 999, fileName: "a.pdf", storedPath: "x", mimeType: "application/pdf", sizeBytes: 1 }),
      "Relatório não encontrado",
    )
  })

  it("deleteReportAttachment: uploader OK / não-uploader negado / manager OK + arquivo removido", async () => {
    const seed = (world: ReportingFakeWorld) => {
      seedProject(world, { id: 10 })
      seedProjectReport(world, { projectId: 10, authorId: 1 })
      seedAttachment(world, { reportId: 1, uploadedBy: 1, storedPath: "reports/10/a.pdf" })
      seedAttachment(world, { reportId: 1, uploadedBy: 2, storedPath: "reports/10/b.pdf" })
    }
    await parity(
      seed,
      (gateway) => gateway.deleteReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], attachmentId: 1 }),
      (module) => module.deleteReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], attachmentId: 1 }),
    )
    await parityError(
      seed,
      (gateway) => gateway.deleteReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], attachmentId: 2 }),
      (module) => module.deleteReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], attachmentId: 2 }),
      "Acesso negado",
    )
    await parityError(
      () => undefined,
      (gateway) => gateway.deleteReportAttachment({ actorUserId: 1, actorRoles: ["COORDENADOR"], attachmentId: 999 }),
      (module) => module.deleteReportAttachment({ actorUserId: 1, actorRoles: ["COORDENADOR"], attachmentId: 999 }),
      "Anexo não encontrado",
    )
  })

  it("sweepStaleReportUploads: delegação idêntica ao storage seam", async () => {
    const { oldSnapshot } = await parity(
      (world) => {
        seedProject(world, { id: 10 })
        seedProjectReport(world, { projectId: 10, authorId: 1 })
        seedAttachment(world, { reportId: 1, storedPath: "reports/10/a.pdf" })
        seedAttachment(world, { reportId: 1, storedPath: "reports/10/b.pdf" })
        world.storage.sweepResult = 3
      },
      (gateway) => gateway.sweepStaleReportUploads(60_000),
      (module) => module.sweepStaleReportUploads(60_000),
    )
    const store = JSON.parse(oldSnapshot)
    expect(store.storage.sweepCalls).toEqual([{ paths: ["reports/10/a.pdf", "reports/10/b.pdf"], maxAgeMs: 60000 }])
  })
})

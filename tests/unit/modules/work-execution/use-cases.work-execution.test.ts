// @vitest-environment node
/**
 * OND3-B2 (R2) — use-case tests for the NEW work-execution wiring (rules extracted from the
 * fat gateway into the use cases + pure domain session-rules).
 *
 * Behavior is the golden matrix (OND3-B1) re-expressed against fake ports; the frozen quirks
 * are asserted HERE TOO (double-count on re-completion, status='active' excluding normalized
 * sessions, owner-only daily log) because the contract suite (OND3-B3) must find old and new
 * implementations agreeing. The only intentional evolution: `throw new Error` became typed
 * DomainErrors (AC-00-07) with the SAME messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  userActor,
  ValidationError,
  type DailyLog,
  type WorkSession,
} from "@/backend/domain"
import { CompleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/complete-work-session.use-case"
import { CreateDailyLogFromSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/create-daily-log-from-session.use-case"
import { DeleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/delete-work-session.use-case"
import { GetWorkSessionByIdUseCase } from "@/backend/modules/work-execution/application/use-cases/get-work-session-by-id.use-case"
import { ListDailyLogsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-daily-logs.use-case"
import { ListProjectLogsForLeaderUseCase } from "@/backend/modules/work-execution/application/use-cases/list-project-logs-for-leader.use-case"
import { ListWorkSessionsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-work-sessions.use-case"
import { StartWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/start-work-session.use-case"
import { UpdateWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/update-work-session.use-case"
import type { CompletedTaskRef } from "@/backend/modules/work-execution/application/ports/task-verification.port"
import type { LeaderLogsAudit } from "@/backend/modules/work-execution/application/ports/project-access.port"

// 2026-06-15 is a Monday; America/Sao_Paulo is UTC-3. Pauses in UTC: 12:30/15:00/18:00/20:00.
const T_11Z = "2026-06-15T11:00:00.000Z"; // SP 08:00 — no pause elapsed
const T_13Z = "2026-06-15T13:00:00.000Z"; // SP 10:00 — the 12:30Z pause was crossed
const PAUSE_1230Z = new Date("2026-06-15T12:30:00.000Z");

// B6-5 (D4): os comandos agora carregam ActorRef (antes actorUserId/actorRoles crus). Os atores
// do golden: dono (7), Beto (8), gestor (999 — MANAGE_WORK_SESSIONS via COORDENADOR, id FORA do
// store para a decisao sair da PERMISSAO e nao de acaso de id) e sem papéis (7, []).
const ownerActor = userActor(7, ["VOLUNTARIO"]);
const betoActor = userActor(8, ["VOLUNTARIO"]);
const managerActor = userActor(999, ["COORDENADOR"]);
const noRolesActor = userActor(7, []);

class FakeWorkSessions {
  private nextId = 1000;
  rows: WorkSession[] = [];
  sessionTasks: Array<{ sessionId: number; taskIds: number[] }> = [];

  seed(partial: Partial<WorkSession> & { id: number; userId: number; startTime: Date }): void {
    this.rows.push({
      userName: "Ana",
      endTime: null,
      duration: null,
      activity: null,
      location: null,
      projectId: null,
      status: "active",
      ...partial,
    });
  }

  async findById(id: number) {
    const row = this.rows.find((s) => s.id === id);
    return row ? { ...row } : null;
  }

  async findActiveByUserId(userId: number) {
    const rows = this.rows
      .filter((s) => s.userId === userId && s.status === "active")
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    return rows[0] ? { ...rows[0] } : null;
  }

  async findByUserId(userId: number) {
    return this.rows
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .map((s) => ({ ...s }));
  }

  async findAll() {
    return [...this.rows].sort((a, b) => b.startTime.getTime() - a.startTime.getTime()).map((s) => ({ ...s }));
  }

  async findByStatus(status: string) {
    return this.rows
      .filter((s) => s.status === status)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .map((s) => ({ ...s }));
  }

  async create(session: Omit<WorkSession, "id" | "createdAt" | "updatedAt">) {
    const row: WorkSession = { ...session, id: this.nextId++, createdAt: new Date(0) };
    this.rows.push(row);
    return { ...row };
  }

  async update(id: number, updates: Partial<WorkSession>) {
    const row = this.rows.find((s) => s.id === id);
    if (!row) throw new Error("Session not found");
    for (const key of ["userName", "startTime", "endTime", "duration", "activity", "location", "projectId", "status"] as const) {
      if (updates[key] !== undefined) (row as unknown as Record<string, unknown>)[key] = updates[key];
    }
    return { ...row };
  }

  async delete(id: number) {
    this.rows = this.rows.filter((s) => s.id !== id);
  }

  async replaceSessionTasks(sessionId: number, taskIds: number[]) {
    this.sessionTasks.push({ sessionId, taskIds });
  }
}

class FakeDailyLogs {
  private nextId = 1;
  rows: DailyLog[] = [];
  users: Array<{ id: number; name: string }> = [{ id: 7, name: "Ana" }, { id: 8, name: "Beto" }];

  seed(partial: Partial<DailyLog> & { id: number; userId: number; date: Date }): void {
    this.rows.push({ projectId: null, note: null, workSessionId: null, createdAt: new Date(0), ...partial });
  }

  async findById(id: number) {
    const row = this.rows.find((l) => l.id === id);
    return row ? { ...row } : null;
  }

  async findByUserId(userId: number) {
    return this.rows.filter((l) => l.userId === userId).map((l) => ({ ...l }));
  }

  async findByProjectId(projectId: number) {
    return this.rows.filter((l) => l.projectId === projectId).map((l) => ({ ...l }));
  }

  async findByWorkSessionId(workSessionId: number) {
    const row = this.rows.find((l) => l.workSessionId === workSessionId);
    return row ? { ...row } : null;
  }

  async findByDate(userId: number, date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return this.rows
      .filter((l) => l.userId === userId && l.date >= start && l.date <= end)
      .map((l) => ({ ...l }));
  }

  async findAll() {
    return this.rows.map((l) => ({ ...l }));
  }

  async create(dailyLog: Omit<DailyLog, "id" | "createdAt">) {
    const row: DailyLog = { ...dailyLog, id: this.nextId++, createdAt: new Date(0) };
    this.rows.push(row);
    return { ...row };
  }

  async update(dailyLog: DailyLog) {
    const row = this.rows.find((l) => l.id === dailyLog.id);
    if (!row || row.id === undefined) throw new Error("Log not found");
    Object.assign(row, dailyLog);
    return { ...row };
  }

  async findUserById(userId: number) {
    return this.users.find((u) => u.id === userId) ?? null;
  }
}

class FakeProjectAccess {
  memberships: Array<{ projectId: number; userId: number }> = [];
  led: number[] = [];
  managed: number[] = [];
  logs: DailyLog[] = [];
  sessions: WorkSession[] = [];
  audits: LeaderLogsAudit[] = [];

  async isProjectMember(userId: number, projectId: number) {
    return this.memberships.some((m) => m.projectId === projectId && m.userId === userId);
  }

  async ledProjectIds(leaderId: number) {
    return Array.from(new Set([...this.led, ...this.managed]));
  }

  async listProjectLogs(projectIds: number[], memberUserId?: number) {
    return this.logs
      .filter((l) => l.projectId != null && projectIds.includes(l.projectId))
      .filter((l) => memberUserId === undefined || l.userId === memberUserId)
      .map((l) => ({ ...l }));
  }

  async listProjectSessions(projectIds: number[], memberUserId?: number) {
    return this.sessions
      .filter((s) => s.projectId != null && projectIds.includes(s.projectId))
      .filter((s) => memberUserId === undefined || s.userId === memberUserId)
      .map((s) => ({ ...s }));
  }

  async recordLeaderLogsAudit(audit: LeaderLogsAudit) {
    this.audits.push(audit);
  }
}

class FakeTaskVerification {
  tasks: Array<CompletedTaskRef & { completed: boolean; assignedTo: number }> = [];

  async findCompletedAssignedTasks(userId: number, taskIds: number[]) {
    return this.tasks
      .filter((t) => taskIds.includes(t.id) && t.completed && t.assignedTo === userId)
      .map(({ id, projectId }) => ({ id, projectId }));
  }
}

let workSessions: FakeWorkSessions;
let dailyLogs: FakeDailyLogs;
let projectAccess: FakeProjectAccess;
let taskVerification: FakeTaskVerification;

function deps() {
  // B6-5: os use cases de lista agora recebem o use case do lider (mesmo wiring da fabrica).
  return {
    workSessions,
    dailyLogs,
    projectAccess,
    taskVerification,
    leaderLogs: new ListProjectLogsForLeaderUseCase({ projectAccess }),
  };
}

function freeze(clock: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(clock));
}

beforeEach(() => {
  workSessions = new FakeWorkSessions();
  dailyLogs = new FakeDailyLogs();
  projectAccess = new FakeProjectAccess();
  taskVerification = new FakeTaskVerification();
  freeze(T_11Z);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StartWorkSessionUseCase", () => {
  it("closes the existing active session (truncated at the crossed pause) and creates the new one", async () => {
    freeze(T_13Z);
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });

    const session = await new StartWorkSessionUseCase(deps()).execute({ actor: ownerActor, userId: 7, actorName: "Ana" });

    const closed = await workSessions.findById(1);
    expect(closed?.status).toBe("completed");
    expect(closed?.duration).toBe(1800); // 12:00 -> 12:30 pause
    expect(session.status).toBe("active");
    expect(session.startTime).toEqual(new Date(T_13Z));
  });

  it("membership required for non-managers; MANAGE_WORK_SESSIONS skips it", async () => {
    const useCase = new StartWorkSessionUseCase(deps());
    await expect(
      useCase.execute({ actor: ownerActor, userId: 7, actorName: "Ana", projectId: 5 }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      useCase.execute({ actor: ownerActor, userId: 7, actorName: "Ana", projectId: 5 }),
    ).rejects.toThrow("Usuário não é membro do projeto informado");

    projectAccess.memberships.push({ projectId: 5, userId: 7 });
    expect((await useCase.execute({ actor: ownerActor, userId: 7, actorName: "Ana", projectId: 5 })).projectId).toBe(5);

    // gestor criando PARA OUTRO (999 vs 8): o gate passa pela PERMISSAO e o nome PEDIDO vale
    // (escopo medido na rota legado: gestor pede qualquer nome; nao-gestor escreve o proprio).
    expect((await useCase.execute({ actor: managerActor, userId: 8, userName: "Beto", projectId: 9 })).projectId).toBe(9);
  });

  it("typed validation: invalid userName and invalid startTime (messages frozen)", async () => {
    const useCase = new StartWorkSessionUseCase(deps());
    await expect(useCase.execute({ actor: ownerActor, userId: 7, actorName: "  " })).rejects.toThrow(ValidationError);
    await expect(useCase.execute({ actor: ownerActor, userId: 7, actorName: "  " })).rejects.toThrow("Dados inválidos para criar sessão de trabalho");
    await expect(
      useCase.execute({ actor: ownerActor, userId: 7, actorName: "Ana", startTime: "not-a-date" }),
    ).rejects.toThrow("startTime inválido");
  });
});

describe("CompleteWorkSessionUseCase", () => {
  it("typed NotFound/Forbidden with frozen messages", async () => {
    const useCase = new CompleteWorkSessionUseCase(deps());
    await expect(
      useCase.execute({ sessionId: 99, actor: ownerActor }),
    ).rejects.toThrow(NotFoundError);

    workSessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "active" });
    await expect(
      useCase.execute({ sessionId: 1, actor: ownerActor }),
    ).rejects.toThrow("Não autorizado a atualizar esta sessão");
  });

  it("server duration for active sessions; idempotence for completed/paused", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active" });
    workSessions.seed({ id: 2, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 1234 });
    workSessions.seed({ id: 3, userId: 7, startTime: new Date(T_11Z), status: "paused", duration: 5678 });

    const useCase = new CompleteWorkSessionUseCase(deps());
    expect((await useCase.execute({ sessionId: 1, actor: ownerActor })).duration).toBe(3600);
    expect((await useCase.execute({ sessionId: 2, actor: ownerActor })).duration).toBe(1234);
    expect((await useCase.execute({ sessionId: 3, actor: ownerActor })).duration).toBe(5678);
  });

  it("client endTime honored, truncated at crossed pause; invalid endTime -> ValidationError", async () => {
    freeze(T_13Z);
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });

    const useCase = new CompleteWorkSessionUseCase(deps());
    const completed = await useCase.execute({
      sessionId: 1,
      actor: ownerActor,
      endTime: "2026-06-15T12:45:00.000Z",
    });
    expect(completed.endTime).toEqual(new Date("2026-06-15T12:45:00.000Z"));
    expect(completed.duration).toBe(1800);

    await expect(
      useCase.execute({ sessionId: 1, actor: ownerActor, endTime: "lixo" }),
    ).rejects.toThrow("endTime inválido");
  });

  it("completedTaskIds: rejected on non-finalized; normalized + validated; replaced", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "active", projectId: 5 });
    const useCase = new CompleteWorkSessionUseCase(deps());

    await expect(
      useCase.execute({ sessionId: 1, actor: ownerActor, completedTaskIds: [10] }),
    ).rejects.toThrow("Só é possível vincular tasks em sessões finalizadas");

    taskVerification.tasks.push(
      { id: 10, projectId: 5, completed: true, assignedTo: 7 },
      { id: 11, projectId: 5, completed: true, assignedTo: 7 },
    );
    await useCase.execute({
      sessionId: 1,
      actor: ownerActor,
      endTime: "2026-06-15T11:30:00.000Z",
      completedTaskIds: [10, 10, 11, 0, -3, Number.NaN],
    });
    expect(workSessions.sessionTasks).toEqual([{ sessionId: 1, taskIds: [10, 11] }]);

    taskVerification.tasks.length = 0;
    taskVerification.tasks.push({ id: 10, projectId: 6, completed: true, assignedTo: 7 });
    await expect(
      useCase.execute({ sessionId: 1, actor: ownerActor, completedTaskIds: [10] }),
    ).rejects.toThrow("Todas as tasks vinculadas devem pertencer ao projeto da sessão");
  });

  it("upserts the daily log (auto-note frozen; explicit note trimmed; same row updated)", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active", activity: "Lab", location: "Sala 1" });

    const useCase = new CompleteWorkSessionUseCase(deps());
    const completed = await useCase.execute({ sessionId: 1, actor: ownerActor });

    const log = await dailyLogs.findByWorkSessionId(1);
    expect(log?.note).toBe("Sessão de trabalho finalizada - 60 minutos\nAtividade: Lab\nLocal: Sala 1");
    expect(log?.date).toEqual(completed.endTime);

    await useCase.execute({ sessionId: 1, actor: ownerActor, dailyLogNote: "  revisado  " });
    const all = await dailyLogs.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].note).toBe("revisado");
  });

  it("fires onWorkSessionCompleted after the log upsert; publisher errors are swallowed", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "active" });

    const events = {
      onWorkSessionCompleted: vi.fn(async (_event: { session: WorkSession; completedTaskIds?: number[] }) => undefined),
    };
    const useCase = new CompleteWorkSessionUseCase(deps(), events);
    await useCase.execute({ sessionId: 1, actor: ownerActor });

    expect(events.onWorkSessionCompleted).toHaveBeenCalledTimes(1);
    expect(events.onWorkSessionCompleted.mock.calls[0][0]).toMatchObject({ completedTaskIds: undefined });

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const brokenEvents = {
      onWorkSessionCompleted: vi.fn(async () => {
        throw new Error("gamification offline");
      }),
    };
    const useCase2 = new CompleteWorkSessionUseCase(deps(), brokenEvents);
    const completed = await useCase2.execute({ sessionId: 1, actor: ownerActor });
    expect(completed.status).toBe("completed"); // event failure never breaks completion
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("UpdateWorkSessionUseCase (server-authoritative transitions)", () => {
  it("completion: client endTime VALUE ignored, server clock wins", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active" });

    const updated = await new UpdateWorkSessionUseCase(deps()).execute({
      sessionId: 1,
      actor: ownerActor,
      endTime: "2020-01-01T00:00:00.000Z",
    });
    expect(updated.endTime).toEqual(new Date(T_11Z));
    expect(updated.duration).toBe(3600);
    expect(updated.status).toBe("completed");
  });

  it("QUIRK preserved (contract parity): re-completion DOUBLE-COUNTS the stretch", async () => {
    workSessions.seed({
      id: 1,
      userId: 7,
      startTime: new Date("2026-06-15T10:00:00.000Z"),
      status: "completed",
      duration: 3600,
      endTime: new Date(T_11Z),
    });

    const updated = await new UpdateWorkSessionUseCase(deps()).execute({
      sessionId: 1,
      actor: ownerActor,
      endTime: "2026-06-15T11:00:00.000Z",
    });
    expect(updated.duration).toBe(7200);
  });

  it("pause: ends at the missed pause, accumulates, caps at 32400; client duration ignored", async () => {
    freeze(T_13Z);
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active", duration: 600 });
    workSessions.seed({ id: 2, userId: 8, startTime: new Date("2026-06-15T03:00:00.000Z"), status: "active" });
    workSessions.seed({ id: 3, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });

    const useCase = new UpdateWorkSessionUseCase(deps());
    const paused = await useCase.execute({ sessionId: 1, actor: ownerActor, status: "paused" });
    expect(paused.endTime).toEqual(PAUSE_1230Z);
    expect(paused.duration).toBe(2400);

    const capped = await useCase.execute({ sessionId: 2, actor: betoActor, status: "paused" });
    expect(capped.duration).toBe(32400);

    const withClientDuration = await useCase.execute({
      sessionId: 3,
      actor: ownerActor,
      status: "paused",
      duration: 999999,
    });
    expect(withClientDuration.duration).toBe(1800);
  });

  it("resume starts a fresh stretch NOW, clears endTime, keeps accumulated duration", async () => {
    freeze(T_13Z);
    workSessions.seed({
      id: 1,
      userId: 7,
      startTime: new Date("2026-06-15T12:00:00.000Z"),
      status: "paused",
      duration: 1800,
      endTime: PAUSE_1230Z,
    });

    const resumed = await new UpdateWorkSessionUseCase(deps()).execute({
      sessionId: 1,
      actor: ownerActor,
      status: "active",
    });
    expect(resumed.status).toBe("active");
    expect(resumed.endTime).toBeNull();
    expect(resumed.startTime).toEqual(new Date(T_13Z));
    expect(resumed.duration).toBe(1800);
  });

  it("unknown status assigned verbatim; explicit duration coerced when not pausing", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 100 });

    const updated = await new UpdateWorkSessionUseCase(deps()).execute({
      sessionId: 1,
      actor: ownerActor,
      status: "arbitrary-status",
      duration: "4321" as never,
    });
    expect(updated.status).toBe("arbitrary-status");
    expect(updated.duration).toBe(4321);
  });

  it("typed NotFound/Forbidden/membership errors (messages frozen)", async () => {
    const useCase = new UpdateWorkSessionUseCase(deps());
    await expect(useCase.execute({ sessionId: 99, actor: noRolesActor })).rejects.toThrow(NotFoundError);

    workSessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "active" });
    await expect(
      useCase.execute({ sessionId: 1, actor: ownerActor }),
    ).rejects.toThrow("Não autorizado a atualizar esta sessão");

    workSessions.seed({ id: 2, userId: 7, startTime: new Date(T_11Z), status: "active" });
    await expect(
      useCase.execute({ sessionId: 2, actor: ownerActor, projectId: 5 }),
    ).rejects.toThrow("Usuário não é membro do projeto informado");
  });
});

describe("List/Get normalization", () => {
  it("userId+status -> ValidationError; expired active normalized BEFORE the status filter", async () => {
    await expect(new ListWorkSessionsUseCase(deps()).execute({ actor: managerActor, userId: 7, status: "active" })).rejects.toThrow(
      "Consulta de sessões inválida",
    );

    freeze(T_13Z);
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });
    workSessions.seed({ id: 2, userId: 8, startTime: new Date("2026-06-15T12:45:00.000Z"), status: "active" });

    const active = await new ListWorkSessionsUseCase(deps()).execute({ actor: managerActor, status: "active" });
    expect(active.map((s) => s.id)).toEqual([2]); // session 1 was normalized to paused and excluded

    const stored = await workSessions.findById(1);
    expect(stored?.status).toBe("paused");
    expect(stored?.endTime).toEqual(PAUSE_1230Z);
    expect(stored?.duration).toBe(1800);
  });

  it("getSessionById auto-pauses on read (persisted); missing -> null", async () => {
    freeze(T_13Z);
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });

    const useCase = new GetWorkSessionByIdUseCase(deps());
    const session = await useCase.execute(1);
    expect(session?.status).toBe("paused");
    expect(session?.duration).toBe(1800);
    expect(await useCase.execute(99)).toBeNull();
  });

  it("listDailyLogs dispatch unchanged (userId+date uses LOCAL day boundaries)", async () => {
    dailyLogs.seed({ id: 1, userId: 7, date: new Date(2026, 5, 15, 12, 0, 0), projectId: 5 });
    dailyLogs.seed({ id: 2, userId: 7, date: new Date(2026, 5, 14, 12, 0, 0), projectId: 5 });

    const useCase = new ListDailyLogsUseCase(deps());
    expect((await useCase.execute({ actor: managerActor, userId: 7, date: "2026-06-15T12:00:00" })).map((l) => l.id)).toEqual([1]);
    expect((await useCase.execute({ actor: managerActor, userId: 7 })).map((l) => l.id)).toEqual([1, 2]);
    expect((await useCase.execute({ actor: managerActor, projectId: 5 })).map((l) => l.id)).toEqual([1, 2]);
  });
});

describe("CreateDailyLogFromSessionUseCase (owner-only)", () => {
  it("no manager bypass; completed-only; user must exist (typed, messages frozen)", async () => {
    workSessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "completed" });
    workSessions.seed({ id: 2, userId: 7, startTime: new Date(T_11Z), status: "active" });

    const useCase = new CreateDailyLogFromSessionUseCase(deps());
    await expect(
      useCase.execute({ sessionId: 1, actorUserId: 7 }),
    ).rejects.toThrow("Não autorizado a registrar log desta sessão");
    await expect(
      useCase.execute({ sessionId: 1, actorUserId: 7 }),
    ).rejects.toThrow(ForbiddenError); // even with manager roles the bypass does not exist
    await expect(
      useCase.execute({ sessionId: 2, actorUserId: 7 }),
    ).rejects.toThrow("A sessão precisa estar finalizada para gerar log");

    workSessions.seed({ id: 3, userId: 99, startTime: new Date(T_11Z), status: "completed" });
    await expect(useCase.execute({ sessionId: 3, actorUserId: 99 })).rejects.toThrow(NotFoundError);
    await expect(useCase.execute({ sessionId: 3, actorUserId: 99 })).rejects.toThrow("Usuário não encontrado");
  });

  it("creates with explicit date/note or defaults (today's ISO date, null note)", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", projectId: 5 });

    const useCase = new CreateDailyLogFromSessionUseCase(deps());
    const withDate = await useCase.execute({ sessionId: 1, actorUserId: 7, date: "2026-06-14", note: "manual" });
    expect(withDate.date).toEqual(new Date("2026-06-14"));
    expect(withDate.note).toBe("manual");
    expect(withDate.projectId).toBe(5);

    const defaulted = await useCase.execute({ sessionId: 1, actorUserId: 7 });
    expect(defaulted.date).toEqual(new Date("2026-06-15"));
    expect(defaulted.note).toBeNull();
  });
});

describe("ListProjectLogsForLeaderUseCase", () => {
  it("empty scope agora e ForbiddenError SEM audit (B6-5: era early-return vazio porque a decisao de 403 morava na rota); foreign projectId -> ForbiddenError", async () => {
    const useCase = new ListProjectLogsForLeaderUseCase(deps());
    await expect(useCase.execute({ actor: userActor(42, []) })).rejects.toThrow("Acesso negado");
    expect(projectAccess.audits).toHaveLength(0);

    projectAccess.led = [5];
    await expect(useCase.execute({ actor: userActor(7, []), projectId: 8 })).rejects.toThrow("Acesso negado");
    await expect(useCase.execute({ actor: userActor(7, []), projectId: 8 })).rejects.toThrow(ForbiddenError);
  });

  it("scope union, member filter and audit written for non-empty scope", async () => {
    projectAccess.led = [5];
    projectAccess.managed = [6, 5];
    projectAccess.logs = [
      { id: 1, userId: 8, projectId: 5, date: new Date("2026-06-15"), createdAt: new Date(0) },
      { id: 2, userId: 8, projectId: 6, date: new Date("2026-06-15"), createdAt: new Date(0) },
    ];
    projectAccess.sessions = [
      { id: 10, userId: 8, userName: "Beto", startTime: new Date("2026-06-15T08:00:00Z"), projectId: 5, status: "completed" },
    ];

    const result = await new ListProjectLogsForLeaderUseCase(deps()).execute({ actor: userActor(7, []) });
    expect(result.ledProjectIds.sort()).toEqual([5, 6]);
    expect(result.logs.map((l) => l.id)).toEqual([1, 2]);

    expect(projectAccess.audits).toHaveLength(1);
    expect(projectAccess.audits[0]).toMatchObject({
      projectId: 0,
      leaderId: 7,
      requestedProjectId: null,
      memberUserId: null,
      logCount: 2,
      sessionCount: 1,
    });

    const filtered = await new ListProjectLogsForLeaderUseCase(deps()).execute({
      actor: userActor(7, []),
      projectId: 5,
      memberUserId: 99,
    });
    expect(filtered.logs).toEqual([]);
    expect(filtered.sessions).toEqual([]);
  });

  it("B6-5: a mensagem negada e a da rota chamadora (parametro deniedMessage)", async () => {
    projectAccess.led = [];
    await expect(
      new ListProjectLogsForLeaderUseCase(deps()).execute({ actor: userActor(7, []), deniedMessage: "Acesso negado." }),
    ).rejects.toThrow("Acesso negado.");
  });
});

describe("DeleteWorkSessionUseCase", () => {
  it("typed NotFound/Forbidden; owner and MANAGE_WORK_SESSIONS may delete", async () => {
    const useCase = new DeleteWorkSessionUseCase(deps());
    await expect(useCase.execute({ sessionId: 99, actor: noRolesActor })).rejects.toThrow(NotFoundError);

    workSessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "active" });
    await expect(
      useCase.execute({ sessionId: 1, actor: ownerActor }),
    ).rejects.toThrow("Não autorizado a excluir esta sessão");

    await useCase.execute({ sessionId: 1, actor: managerActor });
    expect(await workSessions.findById(1)).toBeNull();
  });
});

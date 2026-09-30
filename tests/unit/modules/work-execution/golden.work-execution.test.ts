// @vitest-environment node
/**
 * OND3-B1 (R0) — golden/characterization matrix of `WorkSessionServiceGateway` (579 lines)
 * BEFORE the Onda 3 refactor touches it. Frozen behaviors (incl. quirks):
 *
 *   - startWorkSession: closes the user's existing ACTIVE session first (server clock);
 *     projectId requires membership unless the actor has MANAGE_WORK_SESSIONS; custom
 *     startTime validated ("startTime inválido").
 *   - Server-authoritative duration: an active session closed at `closedAt` accrues
 *     min(MAX_STRETCH_SEC=32400, elapsed) but the stretch ENDS at the first missed scheduled
 *     pause (09:30/12:00/15:00/17:00 America/Sao_Paulo = 12:30/15:00/18:00/20:00 UTC in June)
 *     when one falls before `closedAt`.
 *   - completeWorkSession: duration recomputed ONLY for active sessions (completed/paused are
 *     idempotent); client endTime IS honored here (unlike updateWorkSession, where its VALUE
 *     is ignored and the server clock wins); completed session upserts a daily log with the
 *     auto-note "Sessão de trabalho finalizada - N minutos[...]" unless a note is given.
 *   - updateWorkSession QUIRK: completion branch (endTime defined) re-runs
 *     closedSessionDuration even on already-completed/paused sessions -> the stretch is
 *     DOUBLE-COUNTED (frozen, not fixed here).
 *   - listWorkSessions: normalizes expired active sessions to paused (at the missed pause
 *     instant) BEFORE filtering; status="active" therefore EXCLUDES them.
 *   - getSessionById auto-pauses an expired active session on read (persisted update).
 *   - createDailyLogFromSession: owner-only (NO manager bypass), completed-only.
 *   - listProjectLogsForLeader: scope = led projects UNION GERENTE_PROJETO memberships;
 *     writes a history audit row on every read with a NON-EMPTY scope (even with no rows);
 *     empty scope early-returns without audit.
 *
 * Seams: `@/lib/database/prisma` (fake in-memory) + fake repositories injected via the
 * gateway constructor. Time is frozen with vi fake timers (Date is deterministic).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type SessionRow = {
    id: number;
    userId: number;
    userName: string;
    startTime: Date;
    endTime: Date | null;
    duration: number | null;
    activity: string | null;
    location: string | null;
    projectId: number | null;
    status: string;
    createdAt: Date;
  };
  type LogRow = {
    id: number;
    userId: number;
    projectId: number | null;
    date: Date;
    note: string | null;
    workSessionId: number | null;
    createdAt: Date;
  };

  const sessions: SessionRow[] = [];
  const logs: LogRow[] = [];

  const state = {
    sessions,
    logs,
    memberships: [] as Array<{ projectId: number; userId: number; roles: string[] }>,
    projects: [] as Array<{ id: number; leaderId: number }>,
    tasks: [] as Array<{ id: number; projectId: number | null; completed: boolean; assignedTo: number }>,
    users: [] as Array<{ id: number; name: string }>,
    history: [] as Array<Record<string, unknown>>,
    sessionTasks: [] as Array<{ sessionId: number; taskIds: number[] }>,
    prismaLogReads: [] as Array<Record<string, unknown>>,
    prismaSessionReads: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    project_members: {
      findUnique: async (args: { where: { projectId_userId: { projectId: number; userId: number } } }) => {
        const found = state.memberships.find(
          (m) => m.projectId === args.where.projectId_userId.projectId && m.userId === args.where.projectId_userId.userId,
        );
        return found ? { id: found.projectId * 1000 + found.userId } : null;
      },
      findMany: async (args: { where: { userId: number; roles?: { has: string } } }) => {
        return state.memberships
          .filter((m) => m.userId === args.where.userId && (!args.where.roles || m.roles.includes(args.where.roles.has)))
          .map((m) => ({ projectId: m.projectId }));
      },
    },
    projects: {
      findMany: async (args: { where: { leaderId: number } }) => {
        return state.projects.filter((p) => p.leaderId === args.where.leaderId).map((p) => ({ id: p.id }));
      },
    },
    tasks: {
      findMany: async (args: { where: { id: { in: number[] }; completed: boolean; assignedTo: number } }) => {
        return state.tasks
          .filter((t) => args.where.id.in.includes(t.id) && t.completed === args.where.completed && t.assignedTo === args.where.assignedTo)
          .map((t) => ({ id: t.id, projectId: t.projectId }));
      },
    },
    daily_logs: {
      findMany: async (args: { where: { projectId: { in: number[] }; userId?: number } }) => {
        state.prismaLogReads.push(args.where as Record<string, unknown>);
        return state.logs
          .filter((log) => {
            if (log.projectId === null || !args.where.projectId.in.includes(log.projectId)) return false;
            if (args.where.userId !== undefined && log.userId !== args.where.userId) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
    },
    work_sessions: {
      findMany: async (args: { where: { projectId: { in: number[] }; userId?: number } }) => {
        state.prismaSessionReads.push(args.where as Record<string, unknown>);
        return state.sessions
          .filter((session) => {
            if (session.projectId === null || !args.where.projectId.in.includes(session.projectId)) return false;
            if (args.where.userId !== undefined && session.userId !== args.where.userId) return false;
            return true;
          })
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      },
    },
    history: {
      create: async (args: { data: Record<string, unknown> }) => {
        state.history.push(args.data);
        return { id: state.history.length };
      },
    },
  };

  function reset() {
    sessions.length = 0;
    logs.length = 0;
    state.memberships = [];
    state.projects = [];
    state.tasks = [];
    state.users = [{ id: 7, name: "Ana" }, { id: 8, name: "Beto" }];
    state.history = [];
    state.sessionTasks = [];
    state.prismaLogReads = [];
    state.prismaSessionReads = [];
  }

  return { state, logs, sessions, prisma, reset };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { DailyLog } from "@/backend/models/DailyLog";
import { WorkSession } from "@/backend/models/WorkSession";
import { WorkSessionServiceGateway } from "@/backend/modules/work-execution/infrastructure/work-session-service.gateway";

/** Mirrors backend/repositories/WorkSessionRepository (startTime desc; partial merge on update). */
class FakeWorkSessionRepository {
  private nextId = 1000; // never collides with seeded ids

  private toRow(session: WorkSession) {
    return {
      id: session.id!,
      userId: session.userId,
      userName: session.userName,
      startTime: session.startTime,
      endTime: session.endTime ?? null,
      duration: session.duration ?? null,
      activity: session.activity ?? null,
      location: session.location ?? null,
      projectId: session.projectId ?? null,
      status: session.status,
      createdAt: session.createdAt ?? new Date(0),
    };
  }

  seed(partial: Partial<WorkSession> & { id: number; userId: number; startTime: Date }): WorkSession {
    const session = new WorkSession(
      partial.userId,
      partial.userName ?? "Ana",
      partial.startTime,
      partial.endTime ?? null,
      partial.duration ?? null,
      partial.activity ?? null,
      partial.location ?? null,
      partial.projectId ?? null,
      partial.status ?? "active",
      partial.id,
      new Date(0),
    );
    harness.sessions.push(this.toRow(session));
    return session;
  }

  private fromRow(row: (typeof harness.sessions)[number]): WorkSession {
    return new WorkSession(
      row.userId, row.userName, row.startTime, row.endTime, row.duration,
      row.activity, row.location, row.projectId, row.status, row.id, row.createdAt,
    );
  }

  async create(session: WorkSession): Promise<WorkSession> {
    session.id = this.nextId++;
    const row = this.toRow(session);
    harness.sessions.push(row);
    return this.fromRow(row); // mirrors the real repo: returns the persisted row (nulls normalized)
  }

  async findById(id: number): Promise<WorkSession | null> {
    const row = harness.sessions.find((s) => s.id === id);
    return row ? this.fromRow(row) : null;
  }

  async findActiveByUserId(userId: number): Promise<WorkSession | null> {
    const rows = harness.sessions
      .filter((s) => s.userId === userId && s.status === "active")
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    return rows[0] ? this.fromRow(rows[0]) : null;
  }

  async findByUserId(userId: number): Promise<WorkSession[]> {
    return harness.sessions
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .map((row) => this.fromRow(row));
  }

  async findAll(): Promise<WorkSession[]> {
    return [...harness.sessions]
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .map((row) => this.fromRow(row));
  }

  async findByStatus(status: string): Promise<WorkSession[]> {
    return harness.sessions
      .filter((s) => s.status === status)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .map((row) => this.fromRow(row));
  }

  async update(id: number, updates: Partial<WorkSession>): Promise<WorkSession> {
    const row = harness.sessions.find((s) => s.id === id);
    if (!row) throw new Error("Session not found");
    for (const key of ["activity", "location", "startTime", "endTime", "duration", "status", "projectId", "userName"] as const) {
      if (updates[key] !== undefined) (row as Record<string, unknown>)[key] = updates[key];
    }
    return this.fromRow(row);
  }

  async delete(id: number): Promise<void> {
    const index = harness.sessions.findIndex((s) => s.id === id);
    if (index !== -1) harness.sessions.splice(index, 1);
  }

  async replaceSessionTasks(sessionId: number, taskIds: number[]): Promise<void> {
    harness.state.sessionTasks.push({ sessionId, taskIds });
  }
}

/** Mirrors backend/repositories/DailyLogRepository. */
class FakeDailyLogRepository {
  private nextId = 1;

  private clone(log: DailyLog): DailyLog {
    return new DailyLog(log.userId, log.date, log.projectId, log.note, log.workSessionId, log.id, log.createdAt);
  }

  seed(partial: Partial<DailyLog> & { id: number; userId: number; date: Date }): void {
    harness.logs.push({
      userId: partial.userId,
      projectId: partial.projectId ?? null,
      date: partial.date,
      note: partial.note ?? null,
      workSessionId: partial.workSessionId ?? null,
      createdAt: partial.createdAt ?? new Date(0),
      id: partial.id,
    });
  }

  private fromRow(row: (typeof harness.logs)[number]): DailyLog {
    return new DailyLog(row.userId, row.date, row.projectId, row.note, row.workSessionId, row.id, row.createdAt);
  }

  async create(dailyLog: DailyLog): Promise<DailyLog> {
    dailyLog.id = this.nextId++;
    harness.logs.push({
      id: dailyLog.id,
      userId: dailyLog.userId,
      projectId: dailyLog.projectId ?? null,
      date: dailyLog.date,
      note: dailyLog.note ?? null,
      workSessionId: dailyLog.workSessionId ?? null,
      createdAt: new Date(0),
    });
    return this.clone(dailyLog);
  }

  async findById(id: number): Promise<DailyLog | null> {
    const row = harness.logs.find((l) => l.id === id);
    return row ? this.fromRow(row) : null;
  }

  async findByWorkSessionId(workSessionId: number): Promise<DailyLog | null> {
    const row = harness.logs.find((l) => l.workSessionId === workSessionId);
    return row ? this.fromRow(row) : null;
  }

  async findByUserId(userId: number): Promise<DailyLog[]> {
    return harness.logs.filter((l) => l.userId === userId).map((row) => this.fromRow(row));
  }

  async findByProjectId(projectId: number): Promise<DailyLog[]> {
    return harness.logs.filter((l) => l.projectId === projectId).map((row) => this.fromRow(row));
  }

  async findByDate(userId: number, date: Date): Promise<DailyLog[]> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return harness.logs
      .filter((l) => l.userId === userId && l.date >= start && l.date <= end)
      .map((row) => this.fromRow(row));
  }

  async findAll(): Promise<DailyLog[]> {
    return harness.logs.map((row) => this.fromRow(row));
  }

  async update(dailyLog: DailyLog): Promise<DailyLog> {
    const row = harness.logs.find((l) => l.id === dailyLog.id);
    if (!row) throw new Error("Log not found");
    row.projectId = dailyLog.projectId ?? null;
    row.date = dailyLog.date;
    row.note = dailyLog.note ?? null;
    row.workSessionId = dailyLog.workSessionId ?? null;
    return this.clone(dailyLog);
  }

  async findUserById(userId: number): Promise<{ id: number; name: string } | null> {
    const user = harness.state.users.find((u) => u.id === userId);
    return user ?? null;
  }
}

// 2026-06-15 is a Monday; America/Sao_Paulo is UTC-3 (no DST since 2019).
// Scheduled pauses in UTC: 12:30 (09:30), 15:00 (12:00), 18:00 (15:00), 20:00 (17:00).
const T_11Z = "2026-06-15T11:00:00.000Z"; // SP 08:00 — no pause elapsed yet
const T_13Z = "2026-06-15T13:00:00.000Z"; // SP 10:00 — the 12:30Z pause was crossed
const PAUSE_1230Z = new Date("2026-06-15T12:30:00.000Z");

let gateway: WorkSessionServiceGateway;
let sessions: FakeWorkSessionRepository;
let logs: FakeDailyLogRepository;

function freeze(clock: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(clock));
}

beforeEach(() => {
  harness.reset();
  sessions = new FakeWorkSessionRepository();
  logs = new FakeDailyLogRepository();
  gateway = new WorkSessionServiceGateway(sessions as never, logs as never);
  freeze(T_11Z);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("golden — startWorkSession", () => {
  it("creates an active session with server startTime and null endTime/duration", async () => {
    const session = await gateway.startWorkSession({ userId: 7, userName: "Ana", activity: "Lab", location: "Sala 1" });
    expect(session.status).toBe("active");
    expect(session.startTime).toEqual(new Date(T_11Z));
    expect(session.endTime).toBeNull();
    expect(session.duration).toBeNull();
    expect(session.projectId).toBeNull();
  });

  it("closes the user's existing active session first (server clock, no pause crossed -> raw elapsed)", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active" });
    await gateway.startWorkSession({ userId: 7, userName: "Ana" });

    const closed = await sessions.findById(1);
    expect(closed?.status).toBe("completed");
    expect(closed?.endTime).toEqual(new Date(T_11Z));
    expect(closed?.duration).toBe(3600);
  });

  it("closing an active session that crossed a scheduled pause truncates the stretch at the pause", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });
    await gateway.startWorkSession({ userId: 7, userName: "Ana" });

    const closed = await sessions.findById(1);
    expect(closed?.duration).toBe(1800); // 12:00 -> 12:30 pause, NOT 13:00
    expect(closed?.endTime).toEqual(new Date(T_13Z)); // endTime is now; only duration truncates
  });

  it("projectId without membership and without MANAGE_WORK_SESSIONS -> membership error", async () => {
    await expect(
      gateway.startWorkSession({ userId: 7, userName: "Ana", projectId: 5, actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Usuário não é membro do projeto informado");
  });

  it("projectId with membership passes; MANAGE_WORK_SESSIONS skips the membership check", async () => {
    harness.state.memberships.push({ projectId: 5, userId: 7, roles: ["VOLUNTARIO"] });
    const memberSession = await gateway.startWorkSession({ userId: 7, userName: "Ana", projectId: 5, actorRoles: ["VOLUNTARIO"] });
    expect(memberSession.projectId).toBe(5);

    const managerSession = await gateway.startWorkSession({ userId: 8, userName: "Beto", projectId: 5, actorRoles: ["COORDENADOR"] });
    expect(managerSession.projectId).toBe(5);
  });

  it("invalid startTime -> 'startTime inválido'; valid custom startTime is used", async () => {
    await expect(
      gateway.startWorkSession({ userId: 7, userName: "Ana", startTime: "not-a-date" }),
    ).rejects.toThrow("startTime inválido");

    const session = await gateway.startWorkSession({ userId: 7, userName: "Ana", startTime: "2026-06-15T09:15:00.000Z" });
    expect(session.startTime).toEqual(new Date("2026-06-15T09:15:00.000Z"));
  });
});

describe("golden — completeWorkSession", () => {
  it("missing -> 'Sessão não encontrada'; other user without permission -> 'Não autorizado...'", async () => {
    await expect(
      gateway.completeWorkSession({ sessionId: 99, actorUserId: 7, actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Sessão não encontrada");

    sessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "active" });
    await expect(
      gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Não autorizado a atualizar esta sessão");
  });

  it("MANAGE_WORK_SESSIONS may complete another user's session", async () => {
    sessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "active" });
    const completed = await gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["COORDENADOR"] });
    expect(completed.status).toBe("completed");
  });

  it("active session: duration computed server-side (no pause crossed -> raw elapsed)", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active" });
    const completed = await gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] });
    expect(completed.duration).toBe(3600);
    expect(completed.endTime).toEqual(new Date(T_11Z));
  });

  it("active session crossing a pause: stretch truncated at the missed pause", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });
    const completed = await gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] });
    expect(completed.duration).toBe(1800);
  });

  it("client endTime IS honored here; stretch still truncates at a crossed pause", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });
    const completed = await gateway.completeWorkSession({
      sessionId: 1,
      actorUserId: 7,
      actorRoles: ["VOLUNTARIO"],
      endTime: "2026-06-15T12:45:00.000Z",
    });
    expect(completed.endTime).toEqual(new Date("2026-06-15T12:45:00.000Z"));
    expect(completed.duration).toBe(1800); // 12:00 -> 12:30 pause

    await expect(
      gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], endTime: "lixo" }),
    ).rejects.toThrow("endTime inválido");
  });

  it("idempotence: completed/paused sessions keep their frozen duration", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "completed", duration: 1234, endTime: new Date("2026-06-15T10:20:00.000Z") });
    sessions.seed({ id: 2, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "paused", duration: 5678, endTime: new Date("2026-06-15T10:10:00.000Z") });

    const completedAgain = await gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] });
    expect(completedAgain.duration).toBe(1234);

    const pausedCompleted = await gateway.completeWorkSession({ sessionId: 2, actorUserId: 7, actorRoles: ["VOLUNTARIO"] });
    expect(pausedCompleted.duration).toBe(5678);
  });

  it("completedTaskIds: rejected on a non-finalized session; normalized + validated; replaced", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "active", projectId: 5 });
    await expect(
      gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], completedTaskIds: [10] }),
    ).rejects.toThrow("Só é possível vincular tasks em sessões finalizadas");

    harness.state.tasks.push(
      { id: 10, projectId: 5, completed: true, assignedTo: 7 },
      { id: 11, projectId: 5, completed: true, assignedTo: 7 },
    );
    const completed = await gateway.completeWorkSession({
      sessionId: 1,
      actorUserId: 7,
      actorRoles: ["VOLUNTARIO"],
      endTime: "2026-06-15T11:30:00.000Z",
      completedTaskIds: [10, 10, 11, 0, -3, Number.NaN],
    });
    expect(completed.status).toBe("completed");
    expect(harness.state.sessionTasks).toEqual([{ sessionId: 1, taskIds: [10, 11] }]); // dedupe + filter
  });

  it("task validation: not completed/assigned by this user -> error; foreign project -> error", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 60, projectId: 5 });
    harness.state.tasks.push({ id: 10, projectId: 5, completed: false, assignedTo: 7 });
    await expect(
      gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], completedTaskIds: [10] }),
    ).rejects.toThrow("Uma ou mais tasks informadas não foram concluídas por este usuário");

    harness.state.tasks.length = 0;
    harness.state.tasks.push({ id: 10, projectId: 5, completed: true, assignedTo: 7 }, { id: 11, projectId: 6, completed: true, assignedTo: 7 });
    await expect(
      gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], completedTaskIds: [10, 11] }),
    ).rejects.toThrow("Todas as tasks vinculadas devem pertencer ao projeto da sessão");
  });

  it("upserts the daily log: auto-note format; explicit note trimmed; existing log updated", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active", activity: "Lab", location: "Sala 1" });
    const completed = await gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] });

    const log = await logs.findByWorkSessionId(1);
    expect(log?.note).toBe("Sessão de trabalho finalizada - 60 minutos\nAtividade: Lab\nLocal: Sala 1");
    expect(log?.date).toEqual(completed.endTime); // fallback = session.endTime
    expect(log?.userId).toBe(7);

    // second complete with a note -> the SAME log is updated (no duplicate row)
    await gateway.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], dailyLogNote: "  revisado  " });
    const all = await logs.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].note).toBe("revisado");
  });

  it("dailyLogDate overrides the fallback date", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 60 });
    await gateway.completeWorkSession({
      sessionId: 1,
      actorUserId: 7,
      actorRoles: ["VOLUNTARIO"],
      dailyLogDate: "2026-06-14",
    });
    const log = await logs.findByWorkSessionId(1);
    expect(log?.date).toEqual(new Date("2026-06-14"));
  });
});

describe("golden — createDailyLogFromSession", () => {
  it("missing / non-owner (NO manager bypass) / non-completed / missing user -> frozen messages", async () => {
    await expect(gateway.createDailyLogFromSession({ sessionId: 99, actorUserId: 7 })).rejects.toThrow("Sessão não encontrada");

    sessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "completed" });
    await expect(gateway.createDailyLogFromSession({ sessionId: 1, actorUserId: 7 })).rejects.toThrow(
      "Não autorizado a registrar log desta sessão",
    );
    await expect(gateway.createDailyLogFromSession({ sessionId: 1, actorUserId: 7 })).rejects.toThrow(
      "Não autorizado a registrar log desta sessão",
    );

    sessions.seed({ id: 2, userId: 7, startTime: new Date(T_11Z), status: "active" });
    await expect(gateway.createDailyLogFromSession({ sessionId: 2, actorUserId: 7 })).rejects.toThrow(
      "A sessão precisa estar finalizada para gerar log",
    );

    harness.state.users.length = 0; // session owner vanished
    sessions.seed({ id: 3, userId: 99, startTime: new Date(T_11Z), status: "completed" });
    await expect(gateway.createDailyLogFromSession({ sessionId: 3, actorUserId: 99 })).rejects.toThrow("Usuário não encontrado");
  });

  it("creates the log: explicit date/note or defaults (today's ISO date, null note)", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", projectId: 5 });

    const withDate = await gateway.createDailyLogFromSession({ sessionId: 1, actorUserId: 7, date: "2026-06-14", note: "manual" });
    expect(withDate.date).toEqual(new Date("2026-06-14"));
    expect(withDate.note).toBe("manual");
    expect(withDate.projectId).toBe(5);

    const fresh = new FakeDailyLogRepository();
    const gateway2 = new WorkSessionServiceGateway(sessions as never, fresh as never);
    const defaulted = await gateway2.createDailyLogFromSession({ sessionId: 1, actorUserId: 7 });
    expect(defaulted.date).toEqual(new Date("2026-06-15")); // today's ISO date at fake clock
    expect(defaulted.note).toBeNull();
  });
});

describe("golden — listWorkSessions (expired-active normalization)", () => {
  it("userId + status together -> 'Consulta de sessões inválida'", async () => {
    await expect(gateway.listWorkSessions({ userId: 7, status: "active" })).rejects.toThrow("Consulta de sessões inválida");
  });

  it("active session that crossed a pause is PAUSED on read (at the pause instant) with frozen duration", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });

    const rows = await gateway.listWorkSessions({ userId: 7 });
    expect(rows[0].status).toBe("paused");
    expect(rows[0].endTime).toEqual(PAUSE_1230Z);
    expect(rows[0].duration).toBe(1800);

    const stored = await sessions.findById(1);
    expect(stored?.status).toBe("paused"); // persisted, not just in-memory
  });

  it("MAX_STRETCH_SEC (32400) caps the stretch even when the pause is >9h away", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T03:00:00.000Z"), status: "active" });
    const rows = await gateway.listWorkSessions({ userId: 7 });
    expect(rows[0].duration).toBe(32400); // 03:00 -> 12:30 = 9.5h capped to 9h
  });

  it("status='active' EXCLUDES sessions normalized to paused during the same read", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });
    sessions.seed({ id: 2, userId: 8, startTime: new Date("2026-06-15T12:45:00.000Z"), status: "active" }); // after the pause -> stays active

    const active = await gateway.listWorkSessions({ status: "active" });
    expect(active.map((s) => s.id)).toEqual([2]);
  });

  it("no filters -> findAll normalized; session with no crossed pause stays active untouched", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:30:00.000Z"), status: "active" });
    const rows = await gateway.listWorkSessions({});
    expect(rows[0].status).toBe("active");
    expect(rows[0].endTime).toBeNull();
  });
});

describe("golden — listDailyLogs dispatch", () => {
  it("userId+date -> findByDate; userId -> findByUserId; projectId -> findByProjectId; else findAll", async () => {
    // Local-noon dates + local-parsed query date: the real findByDate uses LOCAL day
    // boundaries (setHours), so the golden must not depend on the machine timezone.
    logs.seed({ id: 1, userId: 7, date: new Date(2026, 5, 15, 12, 0, 0), projectId: 5 });
    logs.seed({ id: 2, userId: 7, date: new Date(2026, 5, 14, 12, 0, 0), projectId: 5 });
    logs.seed({ id: 3, userId: 8, date: new Date(2026, 5, 15, 12, 0, 0), projectId: 6 });

    expect((await gateway.listDailyLogs({ userId: 7, date: "2026-06-15T12:00:00" })).map((l) => l.id)).toEqual([1]);
    expect((await gateway.listDailyLogs({ userId: 7 })).map((l) => l.id)).toEqual([1, 2]);
    expect((await gateway.listDailyLogs({ projectId: 5 })).map((l) => l.id)).toEqual([1, 2]);
    expect((await gateway.listDailyLogs({})).map((l) => l.id)).toEqual([1, 2, 3]);
  });
});

describe("golden — listProjectLogsForLeader", () => {
  it("scope = led projects UNION GERENTE_PROJETO memberships (deduped)", async () => {
    harness.state.projects.push({ id: 5, leaderId: 7 });
    harness.state.memberships.push({ projectId: 6, userId: 7, roles: ["GERENTE_PROJETO"] }, { projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"] });

    const result = await gateway.listProjectLogsForLeader({ leaderId: 7 });
    expect(result.ledProjectIds.sort()).toEqual([5, 6]);
    expect(result.logs).toEqual([]);
    expect(result.sessions).toEqual([]);
    // Non-empty scope writes the audit row EVEN with no logs/sessions; only the
    // empty-scope early return skips it (asserted below).
    expect(harness.state.history).toHaveLength(1);

    const noScope = await gateway.listProjectLogsForLeader({ leaderId: 42 });
    expect(noScope).toEqual({ logs: [], sessions: [], ledProjectIds: [] });
    expect(harness.state.history).toHaveLength(1); // unchanged: empty scope writes NO audit
  });

  it("projectId outside the leader scope -> 'Acesso negado'", async () => {
    harness.state.projects.push({ id: 5, leaderId: 7 });
    await expect(gateway.listProjectLogsForLeader({ leaderId: 7, projectId: 8 })).rejects.toThrow("Acesso negado");
  });

  it("happy path: logs+sessions scoped, memberUserId filter, history audit written", async () => {
    harness.state.projects.push({ id: 5, leaderId: 7 });
    logs.seed({ id: 1, userId: 8, date: new Date("2026-06-15"), projectId: 5, createdAt: new Date("2026-06-15T10:00:00Z") });
    logs.seed({ id: 2, userId: 8, date: new Date("2026-06-15"), projectId: 6, createdAt: new Date("2026-06-15T09:00:00Z") });
    sessions.seed({ id: 10, userId: 8, startTime: new Date("2026-06-15T08:00:00Z"), projectId: 5, status: "completed" });

    const result = await gateway.listProjectLogsForLeader({ leaderId: 7 });
    expect(result.logs.map((l) => l.id)).toEqual([1]); // project 6 not led
    expect(result.sessions.map((s) => s.id)).toEqual([10]);

    expect(harness.state.history).toHaveLength(1);
    expect(harness.state.history[0]).toMatchObject({
      entityType: "project_logs",
      action: "read_by_project_leader",
      performedBy: 7,
    });

    const filtered = await gateway.listProjectLogsForLeader({ leaderId: 7, projectId: 5, memberUserId: 99 });
    expect(filtered.logs).toEqual([]);
    expect(filtered.sessions).toEqual([]);
  });
});

describe("golden — deleteWorkSession / getSessionById / getDailyLogById", () => {
  it("delete: missing / unauthorized messages; owner and MANAGE_WORK_SESSIONS may delete", async () => {
    await expect(gateway.deleteWorkSession({ sessionId: 99, actorUserId: 7, actorRoles: ["VOLUNTARIO"] })).rejects.toThrow("Sessão não encontrada");

    sessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "active" });
    await expect(gateway.deleteWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] })).rejects.toThrow(
      "Não autorizado a excluir esta sessão",
    );

    await gateway.deleteWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["COORDENADOR"] });
    expect(await sessions.findById(1)).toBeNull();
  });

  it("getSessionById auto-pauses an expired active session on read; missing -> null", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });

    const session = await gateway.getSessionById(1);
    expect(session?.status).toBe("paused");
    expect(session?.duration).toBe(1800);
    expect(await gateway.getSessionById(99)).toBeNull();
  });

  it("getDailyLogById is a plain passthrough", async () => {
    logs.seed({ id: 1, userId: 7, date: new Date(T_11Z) });
    expect((await gateway.getDailyLogById(1))?.id).toBe(1);
    expect(await gateway.getDailyLogById(99)).toBeNull();
  });
});

describe("golden — updateWorkSession (server-authoritative transitions)", () => {
  it("missing / unauthorized -> frozen messages", async () => {
    await expect(gateway.updateWorkSession({ sessionId: 99, actorUserId: 7, actorRoles: ["VOLUNTARIO"] })).rejects.toThrow("Sessão não encontrada");
    sessions.seed({ id: 1, userId: 8, startTime: new Date(T_11Z), status: "active" });
    await expect(gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] })).rejects.toThrow(
      "Não autorizado a atualizar esta sessão",
    );
  });

  it("completion via endTime: client VALUE ignored, server clock wins", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active" });
    const updated = await gateway.updateWorkSession({
      sessionId: 1,
      actorUserId: 7,
      actorRoles: ["VOLUNTARIO"],
      endTime: "2020-01-01T00:00:00.000Z", // malicious/stale client value
    });
    expect(updated.endTime).toEqual(new Date(T_11Z));
    expect(updated.duration).toBe(3600);
    expect(updated.status).toBe("completed");
  });

  it("completion via status='completed' on an active session", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "active" });
    const updated = await gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "completed" });
    expect(updated.status).toBe("completed");
    expect(updated.duration).toBe(3600);
  });

  it("QUIRK: completion branch on an already-completed session DOUBLE-COUNTS the stretch", async () => {
    sessions.seed({
      id: 1,
      userId: 7,
      startTime: new Date("2026-06-15T10:00:00.000Z"),
      status: "completed",
      duration: 3600,
      endTime: new Date(T_11Z),
    });
    const updated = await gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], endTime: "2026-06-15T11:00:00.000Z" });
    expect(updated.duration).toBe(7200); // 3600 + elapsed(10:00->11:00) again
  });

  it("pause: stretch ends at the missed pause instant; duration accumulates and is capped", async () => {
    freeze(T_13Z);
    sessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active", duration: 600 });
    const paused = await gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "paused" });
    expect(paused.status).toBe("paused");
    expect(paused.endTime).toEqual(PAUSE_1230Z);
    expect(paused.duration).toBe(2400); // 600 + 1800

    sessions.seed({ id: 2, userId: 8, startTime: new Date("2026-06-15T03:00:00.000Z"), status: "active" });
    const capped = await gateway.updateWorkSession({ sessionId: 2, actorUserId: 8, actorRoles: ["VOLUNTARIO"], status: "paused" });
    expect(capped.duration).toBe(32400); // cap

    // client duration is IGNORED on pause (server-computed)
    sessions.seed({ id: 3, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "active" });
    const withClientDuration = await gateway.updateWorkSession({
      sessionId: 3,
      actorUserId: 7,
      actorRoles: ["VOLUNTARIO"],
      status: "paused",
      duration: 999999,
    });
    expect(withClientDuration.duration).toBe(1800);
  });

  it("pause on a COMPLETED session falls through to a plain status assignment (no duration math)", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 1234 });
    const updated = await gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "paused" });
    expect(updated.status).toBe("paused");
    expect(updated.duration).toBe(1234);
  });

  it("resume: fresh stretch starts NOW (server clock), endTime cleared", async () => {
    freeze(T_13Z);
    sessions.seed({
      id: 1,
      userId: 7,
      startTime: new Date("2026-06-15T12:00:00.000Z"),
      status: "paused",
      duration: 1800,
      endTime: PAUSE_1230Z,
    });
    const resumed = await gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "active" });
    expect(resumed.status).toBe("active");
    expect(resumed.endTime).toBeNull();
    expect(resumed.startTime).toEqual(new Date(T_13Z));
    expect(resumed.duration).toBe(1800); // accumulated duration preserved
  });

  it("unknown status is assigned verbatim; explicit duration coerced with Number() when not pausing", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 100 });
    const updated = await gateway.updateWorkSession({
      sessionId: 1,
      actorUserId: 7,
      actorRoles: ["VOLUNTARIO"],
      status: "arbitrary-status",
      duration: "4321" as never,
      activity: "Novo",
      location: "Outro",
    });
    expect(updated.status).toBe("arbitrary-status");
    expect(updated.duration).toBe(4321);
    expect(updated.activity).toBe("Novo");
    expect(updated.location).toBe("Outro");
  });

  it("completedTaskIds allowed when command.status==='completed'; validated + replaced", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "active", projectId: 5 });
    harness.state.tasks.push({ id: 10, projectId: 5, completed: true, assignedTo: 7 });

    await expect(
      gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "completed", completedTaskIds: [10, 11] }),
    ).rejects.toThrow("Uma ou mais tasks informadas não foram concluídas por este usuário");

    harness.state.tasks.push({ id: 11, projectId: 5, completed: true, assignedTo: 7 });
    const updated = await gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "completed", completedTaskIds: [10, 11] });
    expect(updated.status).toBe("completed");
    expect(harness.state.sessionTasks).toEqual([{ sessionId: 1, taskIds: [10, 11] }]);
  });

  it("projectId change without membership -> membership error (non-managers)", async () => {
    sessions.seed({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "active" });
    await expect(
      gateway.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], projectId: 5 }),
    ).rejects.toThrow("Usuário não é membro do projeto informado");
  });
});

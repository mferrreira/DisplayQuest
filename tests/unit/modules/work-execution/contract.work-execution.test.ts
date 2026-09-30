// @vitest-environment node
/**
 * OND3-B3 (R3) — contract parity OLD (WorkSessionServiceGateway, untouched legacy class)
 * vs NEW (use cases + ports wired through createWorkExecutionModule).
 *
 * Harness per DEC-18: BOTH sides are rebuilt from the pristine seed on every call (mutations
 * of one call never leak into the next comparison) and parity is asserted at the boundary the
 * routes observe: JSON-normalized results (the legacy side returns model instances that
 * serialize via toJSON(); the new side returns the same public shape from the adapters), the
 * post-call store state (sessions/logs/sessionTasks/history rows), and errors compared by
 * MESSAGE (the error TYPES evolve from Error to DomainError — the HTTP mapping is the route
 * batch; see rota-tests).
 *
 * Frozen divergences: NONE at this boundary. Quirks (double-count on re-completion, client
 * endTime honored in complete but ignored in update, status verbatim, auto-pause on read,
 * audit on non-empty leader scope) must match on both sides — they do, by construction.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyLog } from "@/backend/models/DailyLog";
import { WorkSession } from "@/backend/models/WorkSession";
import { WorkSessionServiceGateway } from "@/backend/modules/work-execution/infrastructure/work-session-service.gateway";
import { createWorkExecutionModule } from "@/backend/modules/work-execution";
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway";

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
  updatedAt: Date;
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

type Seed = {
  sessions: SessionRow[];
  logs: LogRow[];
  memberships: Array<{ projectId: number; userId: number }>;
  gerenteMemberships: Array<{ projectId: number; userId: number }>;
  ledProjects: Array<{ id: number; leaderId: number }>;
  tasks: Array<{ id: number; projectId: number | null; completed: boolean; assignedTo: number }>;
  users: Array<{ id: number; name: string }>;
};

type Store = {
  sessions: SessionRow[];
  logs: LogRow[];
  sessionTasks: Array<{ sessionId: number; taskIds: number[] }>;
  history: Array<Record<string, unknown>>;
};

function cloneSeed(seed: Seed): Seed {
  return JSON.parse(JSON.stringify(seed, (_k, v) => (v instanceof Date ? v.toISOString() : v)), (k, v) =>
    ["startTime", "endTime", "date", "createdAt", "updatedAt"].includes(k) && typeof v === "string" ? new Date(v) : v,
  );
}

function newStore(seed: Seed): Store {
  return {
    sessions: cloneSeed(seed).sessions,
    logs: cloneSeed(seed).logs,
    sessionTasks: [],
    history: [],
  };
}

function json(value: unknown): unknown {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? undefined : JSON.parse(encoded);
}

// ------------------------------------------------------------------ shared fake repositories

function makeSessionRepo(store: Store) {
  const toModel = (row: SessionRow) =>
    new WorkSession(
      row.userId, row.userName, row.startTime, row.endTime, row.duration,
      row.activity, row.location, row.projectId, row.status, row.id, row.createdAt, row.updatedAt,
    );
  const toRow = (s: WorkSession): SessionRow => ({
    id: s.id!,
    userId: s.userId,
    userName: s.userName,
    startTime: s.startTime,
    endTime: s.endTime ?? null,
    duration: s.duration ?? null,
    activity: s.activity ?? null,
    location: s.location ?? null,
    projectId: s.projectId ?? null,
    status: s.status,
    createdAt: s.createdAt ?? new Date(0),
    updatedAt: s.updatedAt ?? new Date(0),
  });

  return {
    async findById(id: number) {
      const row = store.sessions.find((s) => s.id === id);
      return row ? toModel(row) : null;
    },
    async findActiveByUserId(userId: number) {
      const rows = store.sessions
        .filter((s) => s.userId === userId && s.status === "active")
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      return rows[0] ? toModel(rows[0]) : null;
    },
    async findByUserId(userId: number) {
      return store.sessions
        .filter((s) => s.userId === userId)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .map(toModel);
    },
    async findAll() {
      return [...store.sessions].sort((a, b) => b.startTime.getTime() - a.startTime.getTime()).map(toModel);
    },
    async findByStatus(status: string) {
      return store.sessions
        .filter((s) => s.status === status)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .map(toModel);
    },
    async create(session: WorkSession | Omit<SessionRow, "id" | "createdAt" | "updatedAt">) {
      const row = { ...toRow(session as WorkSession), id: 1000 + store.sessions.length, createdAt: new Date(0), updatedAt: new Date(0) };
      store.sessions.push(row);
      return toModel(row);
    },
    async update(id: number, updates: Partial<WorkSession>) {
      const row = store.sessions.find((s) => s.id === id);
      if (!row) throw new Error("Session not found");
      for (const key of ["userName", "startTime", "endTime", "duration", "activity", "location", "projectId", "status"] as const) {
        if (updates[key] !== undefined) (row as unknown as Record<string, unknown>)[key] = updates[key];
      }
      return toModel(row);
    },
    async delete(id: number) {
      store.sessions = store.sessions.filter((s) => s.id !== id);
    },
    async replaceSessionTasks(sessionId: number, taskIds: number[]) {
      store.sessionTasks.push({ sessionId, taskIds });
    },
  };
}

function makeLogRepo(store: Store, seed: Seed) {
  const toLog = (row: LogRow) =>
    new DailyLog(row.userId, row.date, row.projectId, row.note, row.workSessionId, row.id, row.createdAt);

  return {
    async findById(id: number) {
      const row = store.logs.find((l) => l.id === id);
      return row ? toLog(row) : null;
    },
    async findByUserId(userId: number) {
      return store.logs.filter((l) => l.userId === userId).map(toLog);
    },
    async findByProjectId(projectId: number) {
      return store.logs.filter((l) => l.projectId === projectId).map(toLog);
    },
    async findByWorkSessionId(workSessionId: number) {
      const row = store.logs.find((l) => l.workSessionId === workSessionId);
      return row ? toLog(row) : null;
    },
    async findByDate(userId: number, date: Date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return store.logs.filter((l) => l.userId === userId && l.date >= start && l.date <= end).map(toLog);
    },
    async findAll() {
      return store.logs.map(toLog);
    },
    async create(dailyLog: DailyLog | Omit<LogRow, "id" | "createdAt">) {
      const row: LogRow = {
        id: 500 + store.logs.length,
        userId: dailyLog.userId,
        projectId: dailyLog.projectId ?? null,
        date: dailyLog.date,
        note: dailyLog.note ?? null,
        workSessionId: dailyLog.workSessionId ?? null,
        createdAt: new Date(0),
      };
      store.logs.push(row);
      return toLog(row);
    },
    async update(dailyLog: DailyLog) {
      const row = store.logs.find((l) => l.id === dailyLog.id);
      if (!row) throw new Error("Log not found");
      row.projectId = dailyLog.projectId ?? null;
      row.date = dailyLog.date;
      row.note = dailyLog.note ?? null;
      row.workSessionId = dailyLog.workSessionId ?? null;
      return toLog(row);
    },
    async findUserById(userId: number) {
      return seed.users.find((u) => u.id === userId) ?? null;
    },
  };
}

// ------------------------------------------------------------------ old side (gateway + fake prisma)
// The gateway imports `@/lib/database/prisma` statically, so the fake is a static vi.mock
// delegating to a mutable world set by makeOldSide before each old-side call (the new side
// never touches prisma — its ports are injected fakes).
const world = vi.hoisted(() => ({
  seed: null as unknown as Seed | null,
  store: null as unknown as Store | null,
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    project_members: {
      findUnique: async (args: { where: { projectId_userId: { projectId: number; userId: number } } }) => {
        const seed = world.seed!;
        const found = seed.memberships.find(
          (m) => m.projectId === args.where.projectId_userId.projectId && m.userId === args.where.projectId_userId.userId,
        );
        return found ? { id: 1 } : null;
      },
      findMany: async (args: { where: { userId: number; roles?: { has: string } } }) => {
        const seed = world.seed!;
        if (args.where.roles?.has === "GERENTE_PROJETO") {
          return seed.gerenteMemberships.filter((m) => m.userId === args.where.userId).map((m) => ({ projectId: m.projectId }));
        }
        return [];
      },
    },
    projects: {
      findMany: async (args: { where: { leaderId: number } }) =>
        world.seed!.ledProjects.filter((p) => p.leaderId === args.where.leaderId).map((p) => ({ id: p.id })),
    },
    tasks: {
      findMany: async (args: { where: { id: { in: number[] }; completed: boolean; assignedTo: number } }) =>
        world.seed!.tasks
          .filter((t) => args.where.id.in.includes(t.id) && t.completed === args.where.completed && t.assignedTo === args.where.assignedTo)
          .map((t) => ({ id: t.id, projectId: t.projectId })),
    },
    daily_logs: {
      findMany: async (args: { where: { projectId: { in: number[] }; userId?: number } }) =>
        world.store!.logs
          .filter((l) => {
            if (l.projectId === null || !args.where.projectId.in.includes(l.projectId)) return false;
            if (args.where.userId !== undefined && l.userId !== args.where.userId) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    },
    work_sessions: {
      findMany: async (args: { where: { projectId: { in: number[] }; userId?: number } }) =>
        world.store!.sessions
          .filter((s) => {
            if (s.projectId === null || !args.where.projectId.in.includes(s.projectId)) return false;
            if (args.where.userId !== undefined && s.userId !== args.where.userId) return false;
            return true;
          })
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime()),
    },
    history: {
      create: async (args: { data: Record<string, unknown> }) => {
        world.store!.history.push(args.data);
        return { id: world.store!.history.length };
      },
    },
  },
}));

function makeOldSide(seed: Seed) {
  const store = newStore(seed);
  world.seed = seed;
  world.store = store;
  const sessions = makeSessionRepo(store);
  const logs = makeLogRepo(store, seed);

  const gateway = new WorkSessionServiceGateway(sessions as never, logs as never);
  return { service: gateway as WorkExecutionGateway, store };
}

// ------------------------------------------------------------------ new side (module + fake ports)

function makeNewSide(seed: Seed) {
  const store = newStore(seed);
  const workSessions = makeSessionRepo(store);
  const dailyLogs = makeLogRepo(store, seed);

  const projectAccess = {
    async isProjectMember(userId: number, projectId: number) {
      return seed.memberships.some((m) => m.projectId === projectId && m.userId === userId);
    },
    async ledProjectIds(leaderId: number) {
      const led = seed.ledProjects.filter((p) => p.leaderId === leaderId).map((p) => p.id);
      const managed = seed.gerenteMemberships.filter((m) => m.userId === leaderId).map((m) => m.projectId);
      return Array.from(new Set([...led, ...managed]));
    },
    async listProjectLogs(projectIds: number[], memberUserId?: number) {
      return store.logs
        .filter((l) => {
          if (l.projectId === null || !projectIds.includes(l.projectId)) return false;
          if (memberUserId !== undefined && l.userId !== memberUserId) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((l) => ({
          id: l.id, userId: l.userId, projectId: l.projectId, date: l.date,
          note: l.note, workSessionId: l.workSessionId, createdAt: l.createdAt,
        }));
    },
    async listProjectSessions(projectIds: number[], memberUserId?: number) {
      return store.sessions
        .filter((s) => {
          if (s.projectId === null || !projectIds.includes(s.projectId)) return false;
          if (memberUserId !== undefined && s.userId !== memberUserId) return false;
          return true;
        })
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .map((s) => ({ ...s }));
    },
    // Mirrors PrismaProjectAccess.recordLeaderLogsAudit: writes the SAME history row shape.
    async recordLeaderLogsAudit(audit: {
      projectId: number; leaderId: number; requestedProjectId: number | null;
      memberUserId: number | null; ledProjectIds: number[]; logCount: number; sessionCount: number;
    }) {
      store.history.push({
        entityType: "project_logs",
        entityId: audit.projectId,
        action: "read_by_project_leader",
        performedBy: audit.leaderId,
        description: "Líder leu logs de projetos que lidera",
        metadata: {
          requestedProjectId: audit.requestedProjectId,
          memberUserId: audit.memberUserId,
          ledProjectIds: audit.ledProjectIds,
          logCount: audit.logCount,
          sessionCount: audit.sessionCount,
        },
      });
    },
  };

  const taskVerification = {
    async findCompletedAssignedTasks(userId: number, taskIds: number[]) {
      return seed.tasks
        .filter((t) => taskIds.includes(t.id) && t.completed && t.assignedTo === userId)
        .map((t) => ({ id: t.id, projectId: t.projectId }));
    },
  };

  const serviceModule = createWorkExecutionModule({
    ports: { workSessions: workSessions as never, dailyLogs: dailyLogs as never, projectAccess: projectAccess as never, taskVerification: taskVerification as never },
  });
  return { service: serviceModule as unknown as WorkExecutionGateway, store };
}

// ------------------------------------------------------------------ parity runner

function baseSeed(): Seed {
  return {
    sessions: [],
    logs: [],
    memberships: [{ projectId: 5, userId: 7 }],
    gerenteMemberships: [],
    ledProjects: [],
    tasks: [],
    users: [{ id: 7, name: "Ana" }, { id: 8, name: "Beto" }],
  };
}

function sessionRow(partial: Partial<SessionRow> & { id: number; userId: number; startTime: Date }): SessionRow {
  return {
    userName: "Ana",
    endTime: null,
    duration: null,
    activity: null,
    location: null,
    projectId: null,
    status: "active",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  };
}

async function runParity(
  setup: (s: Seed) => void,
  call: (service: WorkExecutionGateway) => Promise<unknown>,
) {
  const s = baseSeed();
  setup(s);

  const oldSide = makeOldSide(cloneSeed(s));
  const newSide = makeNewSide(cloneSeed(s));

  let oldResult: unknown;
  let oldError: string | null = null;
  try {
    oldResult = await call(oldSide.service);
  } catch (error) {
    oldError = error instanceof Error ? error.message : String(error);
  }

  let newResult: unknown;
  let newError: string | null = null;
  try {
    newResult = await call(newSide.service);
  } catch (error) {
    newError = error instanceof Error ? error.message : String(error);
  }

  expect({ error: newError, result: json(newResult) }).toEqual({ error: oldError, result: json(oldResult) });
  expect(json(newSide.store)).toEqual(json(oldSide.store));
}

const T_11Z = "2026-06-15T11:00:00.000Z"; // SP 08:00 — no pause elapsed
const T_13Z = "2026-06-15T13:00:00.000Z"; // SP 10:00 — the 12:30Z pause was crossed

function freeze(clock: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(clock));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("contract parity — startWorkSession", () => {
  it("closes the active session and creates the new one (result + store)", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z") }));
      },
      (service) => service.startWorkSession({ userId: 7, userName: "Ana", activity: "Lab" }),
    );
  });

  it("stretch truncated at the crossed scheduled pause", async () => {
    freeze(T_13Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z") }));
      },
      (service) => service.startWorkSession({ userId: 7, userName: "Ana" }),
    );
  });

  it("membership error message (non-manager, non-member) and manager bypass", async () => {
    // freeze: the manager-bypass path CREATES a session stamped with the server clock;
    // without a frozen clock the two sides can read different real milliseconds (flaky).
    freeze(T_11Z);
    await runParity(
      () => undefined,
      (service) => service.startWorkSession({ userId: 7, userName: "Ana", projectId: 5, actorRoles: ["VOLUNTARIO"] }),
    );
    await runParity(
      () => undefined,
      (service) => service.startWorkSession({ userId: 8, userName: "Beto", projectId: 5, actorRoles: ["COORDENADOR"] }),
    );
  });

  it("invalid startTime message", async () => {
    freeze(T_11Z);
    await runParity(
      () => undefined,
      (service) => service.startWorkSession({ userId: 7, userName: "Ana", startTime: "not-a-date" }),
    );
  });
});

describe("contract parity — completeWorkSession", () => {
  it("active session: server duration + daily log auto-note (result + log row)", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), activity: "Lab", location: "Sala 1" }));
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] }),
    );
  });

  it("idempotence on completed/paused durations", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 1234, endTime: new Date("2026-06-15T10:20:00.000Z") }));
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] }),
    );
  });

  it("client endTime honored + truncation at crossed pause; invalid endTime message", async () => {
    freeze(T_13Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z") }));
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], endTime: "2026-06-15T12:45:00.000Z" }),
    );
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z") }));
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], endTime: "lixo" }),
    );
  });

  it("completedTaskIds: rejected on active; normalized + replaced; validation messages", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z), projectId: 5 }));
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], completedTaskIds: [10] }),
    );
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 60, projectId: 5 }));
        s.tasks.push({ id: 10, projectId: 5, completed: true, assignedTo: 7 }, { id: 11, projectId: 5, completed: true, assignedTo: 7 });
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], completedTaskIds: [10, 10, 11, 0, -3, Number.NaN] }),
    );
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 60, projectId: 5 }));
        s.tasks.push({ id: 10, projectId: 6, completed: true, assignedTo: 7 });
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], completedTaskIds: [10] }),
    );
  });

  it("upsert: second complete with note updates the SAME log row", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 60 }));
        s.logs.push({ id: 500, userId: 7, projectId: null, date: new Date(T_11Z), note: "antigo", workSessionId: 1, createdAt: new Date(0) });
      },
      (service) => service.completeWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], dailyLogNote: "  revisado  " }),
    );
  });
});

describe("contract parity — updateWorkSession", () => {
  it("completion: client endTime VALUE ignored (server clock)", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z") }));
      },
      (service) => service.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], endTime: "2020-01-01T00:00:00.000Z" }),
    );
  });

  it("QUIRK parity: re-completion double-counts the stretch", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T10:00:00.000Z"), status: "completed", duration: 3600, endTime: new Date(T_11Z) }));
      },
      (service) => service.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], endTime: "2026-06-15T11:00:00.000Z" }),
    );
  });

  it("pause: missed pause instant, accumulation, cap, client duration ignored", async () => {
    freeze(T_13Z);
    await runParity(
      (s) => {
        s.sessions.push(
          sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), duration: 600 }),
          sessionRow({ id: 2, userId: 8, userName: "Beto", startTime: new Date("2026-06-15T03:00:00.000Z") }),
          sessionRow({ id: 3, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z") }),
        );
      },
      async (service) => {
        const paused = await service.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "paused" });
        const capped = await service.updateWorkSession({ sessionId: 2, actorUserId: 8, actorRoles: ["VOLUNTARIO"], status: "paused" });
        const withClientDuration = await service.updateWorkSession({
          sessionId: 3,
          actorUserId: 7,
          actorRoles: ["VOLUNTARIO"],
          status: "paused",
          duration: 999999,
        });
        return [paused, capped, withClientDuration];
      },
    );
  });

  it("resume: fresh stretch at server clock, endTime cleared, duration preserved", async () => {
    freeze(T_13Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z"), status: "paused", duration: 1800, endTime: new Date("2026-06-15T12:30:00.000Z") }));
      },
      (service) => service.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "active" }),
    );
  });

  it("unknown status verbatim + duration coercion + pause on completed (plain assignment)", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(
          sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 100 }),
          sessionRow({ id: 2, userId: 7, startTime: new Date(T_11Z), status: "completed", duration: 1234 }),
        );
      },
      async (service) => {
        const arbitrary = await service.updateWorkSession({
          sessionId: 1,
          actorUserId: 7,
          actorRoles: ["VOLUNTARIO"],
          status: "arbitrary-status",
          duration: 4321,
          activity: "Novo",
          location: "Outro",
        });
        const pauseOnCompleted = await service.updateWorkSession({ sessionId: 2, actorUserId: 7, actorRoles: ["VOLUNTARIO"], status: "paused" });
        return [arbitrary, pauseOnCompleted];
      },
    );
  });

  it("membership error message on projectId change", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z) }));
      },
      (service) => service.updateWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"], projectId: 9 }),
    );
  });
});

describe("contract parity — lists, reads, logs, leader", () => {
  it("listWorkSessions status='active' excludes sessions normalized to paused (result + store)", async () => {
    freeze(T_13Z);
    await runParity(
      (s) => {
        s.sessions.push(
          sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z") }),
          sessionRow({ id: 2, userId: 8, userName: "Beto", startTime: new Date("2026-06-15T12:45:00.000Z") }),
        );
      },
      (service) => service.listWorkSessions({ status: "active" }),
    );
  });

  it("listWorkSessions userId+status invalid query message", async () => {
    freeze(T_11Z);
    await runParity(
      () => undefined,
      (service) => service.listWorkSessions({ userId: 7, status: "active" }),
    );
  });

  it("getSessionById auto-pauses on read (result + persisted store)", async () => {
    freeze(T_13Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date("2026-06-15T12:00:00.000Z") }));
      },
      (service) => service.getSessionById(1),
    );
  });

  it("createDailyLogFromSession: owner-only message + defaults (date/note/projectId)", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 8, userName: "Beto", startTime: new Date(T_11Z), status: "completed" }));
      },
      (service) => service.createDailyLogFromSession({ sessionId: 1, actorUserId: 7 }),
    );
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 7, startTime: new Date(T_11Z), status: "completed", projectId: 5 }));
      },
      (service) => service.createDailyLogFromSession({ sessionId: 1, actorUserId: 7 }),
    );
  });

  it("listProjectLogsForLeader: scope union + logs/sessions + history audit row", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.ledProjects.push({ id: 5, leaderId: 7 });
        s.gerenteMemberships.push({ projectId: 6, userId: 7 });
        s.logs.push(
          { id: 1, userId: 8, projectId: 5, date: new Date("2026-06-15"), note: "a", workSessionId: null, createdAt: new Date("2026-06-15T10:00:00Z") },
          { id: 2, userId: 8, projectId: 6, date: new Date("2026-06-15"), note: "b", workSessionId: null, createdAt: new Date("2026-06-15T09:00:00Z") },
        );
        s.sessions.push(sessionRow({ id: 10, userId: 8, userName: "Beto", startTime: new Date("2026-06-15T08:00:00Z"), projectId: 5, status: "completed" }));
      },
      (service) => service.listProjectLogsForLeader({ leaderId: 7 }),
    );
  });

  it("listProjectLogsForLeader: foreign projectId -> 'Acesso negado'; empty scope -> no audit", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.ledProjects.push({ id: 5, leaderId: 7 });
      },
      (service) => service.listProjectLogsForLeader({ leaderId: 7, projectId: 8 }),
    );
    await runParity(
      () => undefined,
      (service) => service.listProjectLogsForLeader({ leaderId: 42 }),
    );
  });

  it("deleteWorkSession: unauthorized message + owner delete (store)", async () => {
    freeze(T_11Z);
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 8, userName: "Beto", startTime: new Date(T_11Z) }));
      },
      (service) => service.deleteWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["VOLUNTARIO"] }),
    );
    await runParity(
      (s) => {
        s.sessions.push(sessionRow({ id: 1, userId: 8, userName: "Beto", startTime: new Date(T_11Z) }));
      },
      (service) => service.deleteWorkSession({ sessionId: 1, actorUserId: 7, actorRoles: ["COORDENADOR"] }),
    );
  });
});

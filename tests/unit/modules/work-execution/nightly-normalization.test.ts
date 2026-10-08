// @vitest-environment node
/**
 * OND3-B4 — the "nightly sweep" (varredura noturna 23:59 America/Sao_Paulo, AGENTS.md) is
 * implemented as LAZY normalization on read: an ACTIVE session left open overnight/weekend
 * is paused AT the first scheduled pause it crossed (09:30/12:00/15:00/17:00 SP — every
 * calendar day, weekends included; verified in domain/work/schedule.ts getMissedScheduledPause),
 * with its stretch frozen into duration capped at MAX_STRETCH_SEC (9h anti-farm).
 *
 * There is no cron caller of endAllActiveSessions in this codebase (grep measured: only the
 * repository interface); the behavior the AGENTS.md describes is delivered by
 * ListWorkSessionsUseCase/GetWorkSessionByIdUseCase normalization. These tests pin it via the
 * use cases (the recipe's "cron noturna via use case").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_STRETCH_SEC, systemActor, SYSTEM_REASONS, userActor, type WorkSession } from "@/backend/domain";
import { GetWorkSessionByIdUseCase } from "@/backend/modules/work-execution/application/use-cases/get-work-session-by-id.use-case";
import { ListProjectLogsForLeaderUseCase } from "@/backend/modules/work-execution/application/use-cases/list-project-logs-for-leader.use-case";
import { ListWorkSessionsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-work-sessions.use-case";
import { UpdateWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/update-work-session.use-case";

class FakeWorkSessions {
  rows: WorkSession[] = [];

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
    const rows = this.rows.filter((s) => s.userId === userId && s.status === "active");
    return rows[0] ? { ...rows[0] } : null;
  }

  async findByUserId(userId: number) {
    return this.rows.filter((s) => s.userId === userId).map((s) => ({ ...s }));
  }

  async findAll() {
    return this.rows.map((s) => ({ ...s }));
  }

  async findByStatus(status: string) {
    return this.rows.filter((s) => s.status === status).map((s) => ({ ...s }));
  }

  async create(session: Omit<WorkSession, "id" | "createdAt" | "updatedAt">) {
    const row: WorkSession = { ...session, id: 1000 + this.rows.length };
    this.rows.push(row);
    return { ...row };
  }

  async update(id: number, updates: Partial<WorkSession>) {
    const row = this.rows.find((s) => s.id === id);
    if (!row) throw new Error("Session not found");
    for (const key of ["startTime", "endTime", "duration", "activity", "location", "projectId", "status"] as const) {
      if (updates[key] !== undefined) (row as unknown as Record<string, unknown>)[key] = updates[key];
    }
    return { ...row };
  }

  async delete(id: number) {
    this.rows = this.rows.filter((s) => s.id !== id);
  }

  async replaceSessionTasks(sessionId: number, taskIds: number[]) {
    void sessionId;
    void taskIds;
  }
}

let workSessions: FakeWorkSessions;

function freeze(clock: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(clock));
}

beforeEach(() => {
  workSessions = new FakeWorkSessions();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nightly sweep — overnight session (lazy normalization on read)", () => {
  it("session left open since 23:00 SP is paused AT the next day's 09:30 pause, duration capped at 9h", async () => {
    // Start: Mon 2026-06-15 23:00 SP = 2026-06-16T02:00Z.
    // Sweep read: Tue 2026-06-16 23:59 SP = 2026-06-17T02:59Z.
    // First crossed pause: Tue 09:30 SP = 2026-06-16T12:30Z. Raw stretch 10h30 -> capped 32400.
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-16T02:00:00.000Z"), status: "active" });
    freeze("2026-06-17T02:59:00.000Z");

    const session = await new GetWorkSessionByIdUseCase({ workSessions }).execute(1);

    expect(session?.status).toBe("paused");
    expect(session?.endTime).toEqual(new Date("2026-06-16T12:30:00.000Z")); // paused AT the pause, not at the read
    expect(session?.duration).toBe(MAX_STRETCH_SEC);
    // Persisted, not just in-memory:
    expect((await workSessions.findById(1))?.status).toBe("paused");
  });

  it("session left open over the WEEKEND is paused at Saturday's 09:30 pause (pauses exist every day), capped", async () => {
    // Start: Fri 2026-06-19 18:00 SP = 21:00Z (after Friday's 17:00 pause).
    // Sweep read: Mon 2026-06-22 08:00 SP = 11:00Z.
    // First crossed pause: Sat 2026-06-20 09:30 SP = 12:30Z. Raw stretch 15h30 -> capped 32400.
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-19T21:00:00.000Z"), status: "active" });
    freeze("2026-06-22T11:00:00.000Z");

    const session = await new GetWorkSessionByIdUseCase({ workSessions }).execute(1);

    expect(session?.status).toBe("paused");
    expect(session?.endTime).toEqual(new Date("2026-06-20T12:30:00.000Z"));
    expect(session?.duration).toBe(MAX_STRETCH_SEC);
  });

  it("session that crossed NO pause stays active (normalization is not a blanket close)", async () => {
    // Start: Mon 08:00 SP = 11:00Z; read 09:00 SP = 12:00Z — the 09:30 pause (12:30Z) is still ahead.
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T11:00:00.000Z"), status: "active" });
    freeze("2026-06-15T12:00:00.000Z");

    const session = await new GetWorkSessionByIdUseCase({ workSessions }).execute(1);

    expect(session?.status).toBe("active");
    expect(session?.endTime).toBeNull();
    expect(session?.duration).toBeNull();
  });
});

describe("nightly sweep — list normalization (the sweep closes ALL open sessions it sees)", () => {
  it("status='active' query normalizes the overnight ones to paused and EXCLUDES them from the result", async () => {
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-21T02:00:00.000Z"), status: "active" }); // Sat 23:00 SP — overnight
    workSessions.seed({ id: 2, userId: 8, userName: "Beto", startTime: new Date("2026-06-19T21:00:00.000Z"), status: "active" }); // Fri 18:00 SP — weekend
    workSessions.seed({ id: 3, userId: 9, userName: "Caio", startTime: new Date("2026-06-22T12:45:00.000Z"), status: "active" }); // Mon 09:45 SP — no pause crossed yet
    freeze("2026-06-22T13:00:00.000Z"); // Mon 10:00 SP — the Mon 09:30 pause (12:30Z) was crossed

    // B6-5 (D4): o sweep e rotina sem pessoa — systemActor(NIGHTLY_SWEEP), o bypass declarado
    // (DEC-54): varredura crua, sem resolucao de escopo.
    const leaderLogs = new ListProjectLogsForLeaderUseCase({
      projectAccess: {
        async isProjectMember() { return false; },
        async ledProjectIds() { return []; },
        async listProjectLogs() { return []; },
        async listProjectSessions() { return []; },
        async recordLeaderLogsAudit() { return undefined; },
      },
    });
    const active = await new ListWorkSessionsUseCase({ workSessions, leaderLogs }).execute({
      actor: systemActor(SYSTEM_REASONS.NIGHTLY_SWEEP),
      status: "active",
    });
    expect(active.map((s) => s.id)).toEqual([3]);

    const stored1 = await workSessions.findById(1);
    expect(stored1?.status).toBe("paused");
    expect(stored1?.endTime).toEqual(new Date("2026-06-21T12:30:00.000Z")); // FIRST crossed pause (Sun Jun 21 09:30 SP)
    expect(stored1?.duration).toBe(32400); // 02:00Z -> 12:30Z = 10h30 capped

    const stored2 = await workSessions.findById(2);
    expect(stored2?.status).toBe("paused");
    expect(stored2?.endTime).toEqual(new Date("2026-06-20T12:30:00.000Z")); // Sat 09:30 SP
    expect(stored2?.duration).toBe(32400);

    expect((await workSessions.findById(3))?.status).toBe("active"); // untouched
  });
});

describe("nightly sweep — explicit pause at 23:59 freezes at the crossed pause, not at the read", () => {
  it("pause command on a session that crossed 15:00/17:00 pauses ends the stretch at 15:00 SP", async () => {
    // Start: Mon 14:00 SP = 17:00Z. Pause command at 23:59 SP = 2026-06-16T02:59Z.
    // First crossed pause: 15:00 SP = 18:00Z -> duration 1h (the 17:00 pause is NOT counted).
    workSessions.seed({ id: 1, userId: 7, startTime: new Date("2026-06-15T17:00:00.000Z"), status: "active" });
    freeze("2026-06-16T02:59:00.000Z");

    const paused = await new UpdateWorkSessionUseCase({
      workSessions,
      projectAccess: {
        async isProjectMember() { return false; },
        async ledProjectIds() { return []; },
        async listProjectLogs() { return []; },
        async listProjectSessions() { return []; },
        async recordLeaderLogsAudit() { return undefined; },
      },
      taskVerification: { async findCompletedAssignedTasks() { return []; } },
    }).execute({ sessionId: 1, actor: userActor(7, ["VOLUNTARIO"]), status: "paused" });

    expect(paused.status).toBe("paused");
    expect(paused.endTime).toEqual(new Date("2026-06-15T18:00:00.000Z"));
    expect(paused.duration).toBe(3600);
  });
});

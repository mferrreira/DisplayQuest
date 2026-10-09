// @vitest-environment node
/**
 * OND3-B4 — G4 roundtrip smoke of the work-execution module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma (no mocks):
 *   startWorkSession -> updateWorkSession(pause) -> updateWorkSession(resume) ->
 *   completeWorkSession (daily-log auto-note upsert) -> complete again (log UPSERT on the
 *   SAME row, duration idempotent) -> listWorkSessions -> deleteWorkSession (daily log
 *   cascades) using `createWorkExecutionModule()` exactly as the composition root builds it
 *   (use cases over the thin Prisma adapters). No events publisher is wired here on purpose:
 *   the gamification side effects are exercised by the gamification wave.
 *
 * Only rows created by this file are deleted in afterAll (user delete cascades the session +
 * log); seeded data is left in place.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createWorkExecutionModule } from "@/backend/modules/work-execution";
import { ForbiddenError, userActor } from "@/backend/domain";

const workModule = createWorkExecutionModule();
const uniqueEmail = `g4-work-${Date.now()}@test.local`;
const userName = "G4 Work Volunteer";
let userId = 0;
let sessionId = 0;

// B6-5 (D4): os comandos carregam ActorRef. O harness opera como o DONO (self) e um ator sem
// gestao de FORA do store (id 999) para provar a negacao — a decisao sai da PERMISSAO.
const ownerActor = () => userActor(userId, ["VOLUNTARIO"]);
const strangerActor = () => userActor(999, ["VOLUNTARIO"]);

describe("G4 roundtrip — work-execution (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: { name: userName, email: uniqueEmail, password: "g4-dummy-hash", status: "active" },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      // users -> work_sessions onDelete: Cascade -> daily_logs onDelete: Cascade
      await prisma.users.delete({ where: { id: userId } });
    }
  });

  it("startWorkSession persists an ACTIVE row with server startTime and null endTime/duration", async () => {
    const session = await workModule.startWorkSession({ actor: ownerActor(), userId, actorName: userName, activity: "Lab G4" });
    sessionId = session.id!;

    const row = await prisma.work_sessions.findUnique({ where: { id: sessionId } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("active");
    expect(row?.endTime).toBeNull();
    expect(row?.duration).toBeNull();
    expect(row?.activity).toBe("Lab G4");
    expect(row?.startTime.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("pause freezes the stretch (server-computed, capped) and persists status=paused", async () => {
    const paused = await workModule.updateWorkSession({
      sessionId,
      actor: ownerActor(),
      status: "paused",
    });

    expect(paused.status).toBe("paused");
    expect(paused.endTime).toBeInstanceOf(Date);
    expect(paused.duration).toBeGreaterThanOrEqual(0);
    expect(paused.duration).toBeLessThanOrEqual(32400);

    const row = await prisma.work_sessions.findUnique({ where: { id: sessionId } });
    expect(row?.status).toBe("paused");
    expect(row?.endTime).not.toBeNull();
  });

  it("resume starts a fresh stretch NOW with endTime cleared and accumulated duration preserved", async () => {
    const before = await prisma.work_sessions.findUnique({ where: { id: sessionId } });
    const resumed = await workModule.updateWorkSession({
      sessionId,
      actor: ownerActor(),
      status: "active",
    });

    expect(resumed.status).toBe("active");
    expect(resumed.endTime).toBeNull();
    expect(resumed.duration).toBe(before?.duration ?? 0);
    expect(resumed.startTime.getTime()).toBeGreaterThanOrEqual(before!.endTime!.getTime());
  });

  it("completeWorkSession closes at the server clock and UPSERTS the daily log with the auto-note", async () => {
    const completed = await workModule.completeWorkSession({
      sessionId,
      actor: ownerActor(),
    });

    expect(completed.status).toBe("completed");
    expect(completed.duration).toBeGreaterThanOrEqual(0);
    expect(completed.duration).toBeLessThanOrEqual(32400);

    const log = await prisma.daily_logs.findUnique({ where: { workSessionId: sessionId } });
    expect(log).not.toBeNull();
    expect(log?.userId).toBe(userId);
    expect(String(log?.note)).toContain("Sessão de trabalho finalizada");
    expect(String(log?.note)).toContain("Atividade: Lab G4");
  });

  it("completing again is idempotent on duration and UPDATES the SAME log row (note trimmed)", async () => {
    const firstLog = await prisma.daily_logs.findUnique({ where: { workSessionId: sessionId } });

    const again = await workModule.completeWorkSession({
      sessionId,
      actor: ownerActor(),
      dailyLogNote: "  revisado  ",
    });

    expect(again.duration).toBe((await prisma.work_sessions.findUnique({ where: { id: sessionId } }))?.duration);

    const logs = await prisma.daily_logs.findMany({ where: { workSessionId: sessionId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(firstLog?.id);
    expect(logs[0].note).toBe("revisado");
  });

  it("listWorkSessions(userId) returns the completed session; getSessionById reads it back; outro sem gestao e barrado (B6-5)", async () => {
    const sessions = await workModule.listWorkSessions({ actor: ownerActor(), userId });
    expect(sessions.map((s) => s.id)).toContain(sessionId);

    const single = await workModule.getSessionById(sessionId);
    expect(single?.id).toBe(sessionId);
    expect(single?.status).toBe("completed");

    // gate medido na rota legado (ensureSelfOrPermission): nao-gestor pedindo outro usuario e 403.
    await expect(workModule.listWorkSessions({ actor: strangerActor(), userId })).rejects.toThrow(ForbiddenError);
  });

  it("deleteWorkSession removes the session and the daily log cascades", async () => {
    await workModule.deleteWorkSession({ sessionId, actor: ownerActor() });

    expect(await prisma.work_sessions.findUnique({ where: { id: sessionId } })).toBeNull();
    expect(await prisma.daily_logs.findUnique({ where: { workSessionId: sessionId } })).toBeNull();
  });
});

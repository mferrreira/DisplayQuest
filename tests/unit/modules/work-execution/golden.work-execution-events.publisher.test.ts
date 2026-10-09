// @vitest-environment node
/**
 * OND3-B1 (R0) — golden of `WorkExecutionEventsPublisher` (35 lines).
 *
 * Frozen behavior: the publisher is a pure dispatcher to the gamification module:
 *   - session without id -> NO-OP (no awards at all).
 *   - awardFromWorkSession is ALWAYS first (userId, workSessionId, durationSeconds,
 *     completedTaskIds passed through verbatim, undefined allowed).
 *   - task awards run SEQUENTIALLY after it, one per completedTaskIds entry; empty/undefined
 *     array -> no task awards.
 *
 * The gamification dependency is injected via `dependencies.gamificationModule` (the factory
 * default `createGamificationModule()` is never called when a module is provided — this is the
 * seam OND3-B2 will replace with ports per the allow-list entry
 * `rg04-infrastructure-work-execution`).
 */
import { describe, expect, it, vi } from "vitest";

import { WorkExecutionEventsPublisher } from "@/backend/modules/work-execution/infrastructure/work-execution-events.publisher";
import type { WorkSession } from "@/backend/domain";

function makeSession(overrides: Partial<WorkSession> = {}): WorkSession {
  return {
    id: 1,
    userId: 7,
    userName: "Ana",
    startTime: new Date("2026-06-15T10:00:00.000Z"),
    endTime: new Date("2026-06-15T11:00:00.000Z"),
    duration: 3600,
    status: "completed",
    ...overrides,
  };
}

function makePublisher() {
  const gamificationModule = {
    awardFromWorkSession: vi.fn(async (_args: {
      userId: number;
      workSessionId: number;
      durationSeconds?: number | null;
      completedTaskIds?: number[];
    }) => undefined),
    awardFromTaskCompletion: vi.fn(async (_args: { userId: number; taskId: number }) => undefined),
  };
  const publisher = new WorkExecutionEventsPublisher(gamificationModule as never);
  return { publisher, gamificationModule };
}

describe("golden — WorkExecutionEventsPublisher.onWorkSessionCompleted", () => {
  it("session without id -> no-op", async () => {
    const { publisher, gamificationModule } = makePublisher();
    await publisher.onWorkSessionCompleted({ session: makeSession({ id: undefined }) });
    expect(gamificationModule.awardFromWorkSession).not.toHaveBeenCalled();
    expect(gamificationModule.awardFromTaskCompletion).not.toHaveBeenCalled();
  });

  it("no completedTaskIds -> only awardFromWorkSession, args passed verbatim", async () => {
    const { publisher, gamificationModule } = makePublisher();
    await publisher.onWorkSessionCompleted({ session: makeSession() });

    expect(gamificationModule.awardFromWorkSession).toHaveBeenCalledTimes(1);
    expect(gamificationModule.awardFromWorkSession).toHaveBeenCalledWith({
      userId: 7,
      workSessionId: 1,
      durationSeconds: 3600,
      completedTaskIds: undefined,
    });
    expect(gamificationModule.awardFromTaskCompletion).not.toHaveBeenCalled();
  });

  it("empty completedTaskIds -> no task awards", async () => {
    const { publisher, gamificationModule } = makePublisher();
    await publisher.onWorkSessionCompleted({ session: makeSession(), completedTaskIds: [] });
    expect(gamificationModule.awardFromTaskCompletion).not.toHaveBeenCalled();
  });

  it("completedTaskIds -> session award FIRST, then sequential per-task awards in order", async () => {
    const { publisher, gamificationModule } = makePublisher();
    const calls: string[] = [];
    gamificationModule.awardFromWorkSession.mockImplementation(async () => {
      calls.push("session");
    });
    gamificationModule.awardFromTaskCompletion.mockImplementation(async () => {
      calls.push("task");
    });

    await publisher.onWorkSessionCompleted({ session: makeSession(), completedTaskIds: [10, 11] });

    expect(calls).toEqual(["session", "task", "task"]);
    expect(gamificationModule.awardFromTaskCompletion.mock.calls.map((c) => c[0])).toEqual([
      { userId: 7, taskId: 10 },
      { userId: 7, taskId: 11 },
    ]);
  });
});

// @vitest-environment node
/**
 * OND4-B2 — unit tests of the pure task domain (backend/domain/task/task-rules.ts).
 * Each frozen quirk from the OND4-B1 golden matrix has a direct test here so the
 * contract suite (OND4-B3) can rely on them.
 */
import { describe, expect, it } from "vitest";

import {
  appendFixInstruction,
  applyAssigneeIds,
  approvalDecision,
  awardPointsForCompletion,
  calculateLatePenalty,
  canBeCompleted,
  canCreateGlobalQuest,
  canListAllTasks,
  canManipulateStatusOnly,
  canModifyCompletedTask,
  dedupeTasksById,
  fallThroughStatusPatch,
  isClaimable,
  isCompletePermissionDenied,
  isForeignPublicMoveDenied,
  isLeaderSelfCompleteDenied,
  isProgressAlreadyCompleted,
  isPublicProgressOnlyUpdate,
  isReviewRequestTransition,
  isStatusOnlyUpdate,
  normalizeAssigneeIds,
  POINTS_PER_TASK,
  progressPatchForCompletion,
  progressPatchForStatus,
  serializeTask,
  statusOnlyPatch,
  usesPublicProgressBranch,
  withActorProgress,
  type Task,
} from "@/backend/domain";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const PAST = new Date("2026-06-14T09:00:00.000Z");

function taskData(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "T1",
    description: null,
    status: "to-do",
    priority: "medium",
    assignedTo: null,
    projectId: null,
    dueDate: null,
    points: 0,
    completed: false,
    completedAt: null,
    taskVisibility: "delegated",
    isGlobal: false,
    groupTaskId: null,
    createdBy: null,
    toJSON: () => serializeTask(taskData(overrides)),
    ...overrides,
  };
}

describe("payload classification", () => {
  it("isPublicProgressOnlyUpdate: non-empty subset of {status, assignedTo}", () => {
    expect(isPublicProgressOnlyUpdate({ status: "done" })).toBe(true);
    expect(isPublicProgressOnlyUpdate({ status: "done", assignedTo: 7 })).toBe(true);
    expect(isPublicProgressOnlyUpdate({})).toBe(false);
    expect(isPublicProgressOnlyUpdate({ status: "done", title: "x" })).toBe(false);
  });

  it("isStatusOnlyUpdate: non-empty subset of {status}", () => {
    expect(isStatusOnlyUpdate({ status: "done" })).toBe(true);
    expect(isStatusOnlyUpdate({ status: "done", assignedTo: 7 })).toBe(false);
    expect(isStatusOnlyUpdate({})).toBe(false);
  });

  it("normalizeAssigneeIds: dedupe + integers > 0 only; non-array -> []", () => {
    expect(normalizeAssigneeIds({ assigneeIds: [8, 8, 9, 0, -1, 3.5] })).toEqual([8, 9]);
    expect(normalizeAssigneeIds({ assigneeIds: "7" })).toEqual([]);
    expect(normalizeAssigneeIds({})).toEqual([]);
  });

  it("dedupeTasksById: first occurrence wins; id-less rows always pass", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 1 }, {}, {}];
    expect(dedupeTasksById(rows)).toEqual([{ id: 1 }, { id: 2 }, {}, {}]);
  });
});

describe("status transitions", () => {
  it("statusOnlyPatch ALWAYS rewrites completedAt (done ? now : null)", () => {
    expect(statusOnlyPatch("done", NOW)).toEqual({ status: "done", completed: true, completedAt: NOW });
    expect(statusOnlyPatch("to-do", NOW)).toEqual({ status: "to-do", completed: false, completedAt: null });
  });

  it("fallThroughStatusPatch: completedAt set only INTO done, cleared only OUT of done", () => {
    expect(fallThroughStatusPatch("in-progress", "done", NOW)).toEqual({
      status: "done",
      completed: true,
      completedAt: NOW,
    });
    expect(fallThroughStatusPatch("done", "done", NOW).completedAt).toBeUndefined(); // stays
    expect(fallThroughStatusPatch("done", "to-do", NOW)).toEqual({
      status: "to-do",
      completed: false,
      completedAt: null,
    });
    expect(fallThroughStatusPatch("to-do", "in-progress", NOW).completedAt).toBeUndefined();
  });

  it("isReviewRequestTransition: only the transition INTO in-review", () => {
    expect(isReviewRequestTransition("in-progress", "in-review")).toBe(true);
    expect(isReviewRequestTransition("in-review", "in-review")).toBe(false);
    expect(isReviewRequestTransition("in-review", "adjust")).toBe(false);
  });
});

describe("completion / award arithmetic (plan-v3 OND1-B1: calendar days, POINTS_PER_TASK)", () => {
  it("calculateLatePenalty: dias inteiros de calendário × POINTS_PER_TASK; on-time/undated -> 0", () => {
    expect(calculateLatePenalty({ dueDate: null }, NOW)).toBe(0);
    expect(calculateLatePenalty({ dueDate: "2026-06-15T12:00:00.000Z" }, NOW)).toBe(0);
    expect(calculateLatePenalty({ dueDate: "2026-06-13T12:00:00.000Z" }, NOW)).toBe(20);
    expect(calculateLatePenalty({ dueDate: "2026-06-14T13:00:00.000Z" }, NOW)).toBe(10); // 1 dia civil
  });

  it("o bug que originou o plano: prazo HOJE (date-only), entregue HOJE -> 10, não 0", () => {
    expect(calculateLatePenalty({ dueDate: "2026-06-15" }, NOW)).toBe(0);
    expect(awardPointsForCompletion({ dueDate: "2026-06-15" }, NOW)).toBe(10);
  });

  it("awardPointsForCompletion CAN go negative (preservado por decisão — DEC-39)", () => {
    expect(awardPointsForCompletion({ dueDate: "2026-06-13T12:00:00.000Z" }, NOW)).toBe(-10);
  });

  it("award não lê task.points: sem prazo vale POINTS_PER_TASK (DEC-30, DEC-40)", () => {
    expect(awardPointsForCompletion({ dueDate: null }, NOW)).toBe(POINTS_PER_TASK);
  });

  it("canBeCompleted: not done AND (public OR has owner)", () => {
    expect(canBeCompleted(taskData({ status: "in-progress", assignedTo: 9 }))).toBe(true);
    expect(canBeCompleted(taskData({ status: "in-progress", assignedTo: null }))).toBe(false);
    expect(canBeCompleted(taskData({ status: "in-progress", assignedTo: null, taskVisibility: "public" }))).toBe(true);
    expect(canBeCompleted(taskData({ status: "done", assignedTo: 9 }))).toBe(false);
  });

  it("isClaimable: non-public, non-global, no assignedTo column (assignees table is the caller's half)", () => {
    expect(isClaimable(taskData())).toBe(true);
    expect(isClaimable(taskData({ assignedTo: 9 }))).toBe(false);
    expect(isClaimable(taskData({ taskVisibility: "public" }))).toBe(false);
    expect(isClaimable(taskData({ isGlobal: true }))).toBe(false);
  });
});

describe("task_user_progress semantics", () => {
  it("progressPatchForStatus: pickedAt sticky, completedAt rewritten, awardedPoints preserved", () => {
    expect(progressPatchForStatus(null, "in-progress", NOW)).toEqual({
      status: "in-progress",
      pickedAt: NOW,
      completedAt: null,
      awardedPoints: 0,
    });
    expect(progressPatchForStatus(null, "to-do", NOW).pickedAt).toBeNull();
    expect(progressPatchForStatus({ pickedAt: PAST, awardedPoints: 5 }, "done", NOW)).toEqual({
      status: "done",
      pickedAt: PAST,
      completedAt: NOW,
      awardedPoints: 5,
    });
  });

  it("progressPatchForCompletion: pickedAt sticky, completedAt = now, awarded = computed", () => {
    expect(progressPatchForCompletion({ pickedAt: PAST }, NOW, -10)).toEqual({
      status: "done",
      pickedAt: PAST,
      completedAt: NOW,
      awardedPoints: -10,
    });
    expect(progressPatchForCompletion(null, NOW, 3).pickedAt).toEqual(NOW);
  });

  it("isProgressAlreadyCompleted: completedAt OR status done", () => {
    expect(isProgressAlreadyCompleted(null)).toBe(false);
    expect(isProgressAlreadyCompleted({ completedAt: PAST, status: "in-progress" })).toBe(true);
    expect(isProgressAlreadyCompleted({ completedAt: null, status: "done" })).toBe(true);
  });
});

describe("read-model clone", () => {
  it("withActorProgress overrides status/completed/completedAt/assignedTo and keeps a working toJSON", () => {
    const task = taskData({ status: "in-progress", completed: true, completedAt: PAST, assignedTo: 8 });

    const clone = withActorProgress(task, { status: "done", completedAt: NOW }, 9);

    expect(clone.status).toBe("done");
    expect(clone.completed).toBe(true);
    expect(clone.completedAt).toEqual(NOW);
    expect(clone.assignedTo).toBe(9);
    expect(clone.title).toBe("T1");
    // toJSON survives the clone (prototype methods do not survive spread — attached explicitly)
    expect(typeof clone.toJSON).toBe("function");
    expect(clone.toJSON().completedAt).toBe(NOW.toISOString());
  });

  it("withActorProgress(null) presents the task as untouched to-do owned by nobody", () => {
    const clone = withActorProgress(taskData({ status: "in-progress" }), { status: "to-do", completedAt: null }, null);
    expect([clone.status, clone.completed, clone.completedAt, clone.assignedTo]).toEqual(["to-do", false, null, null]);
  });

  it("serializeTask matches models/Task.toJSON shape (completedAt ISO, assigneeIds defaulted)", () => {
    const json = serializeTask(taskData({ completedAt: NOW, assigneeIds: undefined }));
    expect(json.completedAt).toBe(NOW.toISOString());
    expect(json.assigneeIds).toEqual([]);
    expect(json.groupTaskId).toBeNull();
    expect(Object.keys(json)).toEqual([
      "id", "title", "description", "status", "priority", "assignedTo", "assigneeIds",
      "projectId", "dueDate", "points", "completed", "completedAt", "taskVisibility",
      "isGlobal", "groupTaskId", "createdBy",
    ]);
  });
});

describe("assignee attachment", () => {
  it("table unavailable (null) -> fallback [assignedTo]", () => {
    expect(applyAssigneeIds({ assignedTo: 5, assigneeIds: [] }, null)).toEqual({
      assignedTo: 5,
      assigneeIds: [5],
    });
    expect(applyAssigneeIds({ assignedTo: null, assigneeIds: [] }, null)).toEqual({
      assignedTo: null,
      assigneeIds: [],
    });
  });

  it("table available -> assignedTo = first assignee, falling back to the existing value", () => {
    expect(applyAssigneeIds({ assignedTo: 5, assigneeIds: [] }, [7, 5])).toEqual({
      assignedTo: 7,
      assigneeIds: [7, 5],
    });
    expect(applyAssigneeIds({ assignedTo: 5, assigneeIds: [] }, [])).toEqual({
      assignedTo: 5,
      assigneeIds: [],
    });
  });
});

describe("rejection FIX line", () => {
  it("appends blank-line + FIX (todayLabel): reason; empty description -> FIX line alone", () => {
    expect(appendFixInstruction("Desc original", "precisa de testes", "15/06/2026")).toBe(
      "Desc original\n\nFIX (15/06/2026): precisa de testes",
    );
    expect(appendFixInstruction("   ", "motivo", "15/06/2026")).toBe("FIX (15/06/2026): motivo");
    expect(appendFixInstruction(null, "motivo", "15/06/2026")).toBe("FIX (15/06/2026): motivo");
  });
});

describe("visibility / authorisation policy", () => {
  it("canListAllTasks: COORDENADOR/GERENTE/COLABORADOR only", () => {
    expect(canListAllTasks(["COORDENADOR"])).toBe(true);
    expect(canListAllTasks(["COLABORADOR"])).toBe(true);
    expect(canListAllTasks(["GERENTE_PROJETO"])).toBe(false);
    expect(canListAllTasks(["VOLUNTARIO"])).toBe(false);
  });

  it("canCreateGlobalQuest follows MANAGE_USERS", () => {
    expect(canCreateGlobalQuest(["COORDENADOR"])).toBe(true);
    expect(canCreateGlobalQuest(["GERENTE"])).toBe(true);
    expect(canCreateGlobalQuest(["GERENTE_PROJETO"])).toBe(false);
  });

  it("usesPublicProgressBranch: public + table available + progress-only payload", () => {
    expect(usesPublicProgressBranch("public", true, { status: "done" })).toBe(true);
    expect(usesPublicProgressBranch("public", false, { status: "done" })).toBe(false);
    expect(usesPublicProgressBranch("delegated", true, { status: "done" })).toBe(false);
    expect(usesPublicProgressBranch("public", true, { status: "done", title: "x" })).toBe(false);
  });

  it("isForeignPublicMoveDenied: another assignee without manage permissions", () => {
    expect(isForeignPublicMoveDenied(8, 9, false)).toBe(true);
    expect(isForeignPublicMoveDenied(8, 9, true)).toBe(false);
    expect(isForeignPublicMoveDenied(9, 9, false)).toBe(false); // self
    expect(isForeignPublicMoveDenied(null, 9, false)).toBe(false); // clearing
    expect(isForeignPublicMoveDenied(undefined, 9, false)).toBe(false); // absent
  });

  it("canManipulateStatusOnly: non-public AND assigned", () => {
    expect(canManipulateStatusOnly("delegated", true)).toBe(true);
    expect(canManipulateStatusOnly("delegated", false)).toBe(false);
    expect(canManipulateStatusOnly("public", true)).toBe(false);
  });

  it("canModifyCompletedTask: role list OR project creator/leader bypass", () => {
    expect(canModifyCompletedTask(["COORDENADOR"], false)).toBe(true);
    expect(canModifyCompletedTask(["LABORATORISTA"], false)).toBe(true);
    expect(canModifyCompletedTask(["VOLUNTARIO"], true)).toBe(true); // leader bypass
    expect(canModifyCompletedTask(["VOLUNTARIO"], false)).toBe(false);
  });

  it("isCompletePermissionDenied: non-public needs assignment or manage", () => {
    expect(isCompletePermissionDenied("delegated", false, false, false)).toBe(true);
    expect(isCompletePermissionDenied("delegated", true, false, false)).toBe(false);
    expect(isCompletePermissionDenied("delegated", false, true, false)).toBe(false);
    expect(isCompletePermissionDenied("public", false, false, false)).toBe(false);
  });

  it("isLeaderSelfCompleteDenied: GERENTE_PROJETO + leader + assigned", () => {
    expect(isLeaderSelfCompleteDenied(true, true, true)).toBe(true);
    expect(isLeaderSelfCompleteDenied(true, true, false)).toBe(false);
    expect(isLeaderSelfCompleteDenied(true, false, true)).toBe(false);
    expect(isLeaderSelfCompleteDenied(false, true, true)).toBe(false);
  });

  it("approvalDecision: self-deny, MANAGE_USERS allow, leader-check, no-permission", () => {
    expect(approvalDecision({ canApproveAny: false, isSelf: true, canApproveProjectTask: true })).toEqual({
      allowed: false,
      reason: "self",
    });
    expect(approvalDecision({ canApproveAny: true, isSelf: true, canApproveProjectTask: false })).toEqual({
      allowed: true,
    });
    expect(approvalDecision({ canApproveAny: false, isSelf: false, canApproveProjectTask: true })).toEqual({
      allowed: "needs-leader-check",
    });
    expect(approvalDecision({ canApproveAny: false, isSelf: false, canApproveProjectTask: false })).toEqual({
      allowed: false,
      reason: "no-permission",
    });
  });
});

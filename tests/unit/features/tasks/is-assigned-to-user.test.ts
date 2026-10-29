import { describe, expect, it } from "vitest";
import { isAssignedToUser } from "@/features/tasks/utils/is-assigned-to-user";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

describe("isAssignedToUser", () => {
  it("matches via assigneeIds", () => {
    const task = makeTask({ assigneeIds: [7, 9] });
    expect(isAssignedToUser(task, 9)).toBe(true);
    expect(isAssignedToUser(task, 8)).toBe(false);
  });

  it("matches via legacy assignedTo when assigneeIds is empty", () => {
    const task = makeTask({ assignedTo: 5, assigneeIds: [] });
    expect(isAssignedToUser(task, 5)).toBe(true);
    expect(isAssignedToUser(task, 6)).toBe(false);
  });

  it("returns false without a userId or with empty assignment data", () => {
    expect(isAssignedToUser(makeTask({}), undefined)).toBe(false);
    expect(isAssignedToUser(makeTask({}), null)).toBe(false);
    expect(isAssignedToUser(makeTask({ assignedTo: null, assigneeIds: [] }), 1)).toBe(false);
  });

  // R10 (plan-v11, S10): quest global pública sem responsável conta como atribuída a todo usuário.
  it("global public quest with no assignee is assigned to any user", () => {
    const quest = makeTask({ isGlobal: true, taskVisibility: "public", projectId: null, assignedTo: null, assigneeIds: [] });
    expect(isAssignedToUser(quest, 1)).toBe(true);
    expect(isAssignedToUser(quest, 42)).toBe(true);
    expect(isAssignedToUser(quest, undefined)).toBe(false);
    expect(isAssignedToUser(quest, null)).toBe(false);
  });

  it("public quest with no assignee and no project is assigned to any user", () => {
    const quest = makeTask({ isGlobal: false, taskVisibility: "public", projectId: null, assignedTo: null, assigneeIds: [] });
    expect(isAssignedToUser(quest, 1)).toBe(true);
    expect(isAssignedToUser(quest, 42)).toBe(true);
  });

  it("a global public quest that DOES have assignees keeps the normal check", () => {
    const quest = makeTask({ isGlobal: true, taskVisibility: "public", projectId: null, assigneeIds: [7, 9] });
    expect(isAssignedToUser(quest, 9)).toBe(true);
    expect(isAssignedToUser(quest, 1)).toBe(false);
  });

  it("a global public quest tied to a project does not open to everyone", () => {
    const quest = makeTask({ isGlobal: true, taskVisibility: "public", projectId: 5, assignedTo: null, assigneeIds: [] });
    expect(isAssignedToUser(quest, 1)).toBe(false);
  });

  it("a global quest opens to everyone regardless of visibility, a plain delegated one does not", () => {
    const globalDelegated = makeTask({ isGlobal: true, taskVisibility: "delegated", projectId: null, assignedTo: null, assigneeIds: [] });
    expect(isAssignedToUser(globalDelegated, 1)).toBe(true);
    const plain = makeTask({ taskVisibility: "delegated", projectId: null, assignedTo: null, assigneeIds: [] });
    expect(isAssignedToUser(plain, 1)).toBe(false);
  });
});

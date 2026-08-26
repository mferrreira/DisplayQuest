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
});

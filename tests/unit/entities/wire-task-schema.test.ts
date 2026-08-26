/**
 * Wire schema tolerance tests — verifies wireTaskSchema handles dirty wire data (D-18/D-19).
 * The strict taskSchema stays as-is; the wire layer normalizes legacy/empty values.
 */
import { describe, it, expect, vi } from "vitest";
import { wireTaskSchema, wireTaskStatus, wireTaskPriority } from "@/entities/task";

const VALID_TASK = {
  id: 1,
  title: "Test task",
  description: "desc",
  status: "in-progress",
  priority: "medium",
  assignedTo: null,
  assigneeIds: [],
  projectId: 1,
  dueDate: null,
  points: 10,
  completed: false,
  completedAt: null,
  taskVisibility: "public",
  isGlobal: false,
};

describe("wireTaskStatus", () => {
  it("passes valid status through", () => {
    expect(wireTaskStatus.parse("done")).toBe("done");
    expect(wireTaskStatus.parse("in-progress")).toBe("in-progress");
  });

  it("maps legacy status 'completed' to 'done'", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(wireTaskStatus.parse("completed")).toBe("done");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("maps legacy status 'pending' to 'to-do'", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(wireTaskStatus.parse("pending")).toBe("to-do");
    warn.mockRestore();
  });

  it("maps unknown status to 'to-do'", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(wireTaskStatus.parse("bogus")).toBe("to-do");
    warn.mockRestore();
  });
});

describe("wireTaskPriority", () => {
  it("passes valid priority through", () => {
    expect(wireTaskPriority.parse("low")).toBe("low");
    expect(wireTaskPriority.parse("medium")).toBe("medium");
    expect(wireTaskPriority.parse("high")).toBe("high");
    expect(wireTaskPriority.parse("urgent")).toBe("urgent");
  });

  it("maps empty string to 'medium'", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(wireTaskPriority.parse("")).toBe("medium");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("maps unknown priority to 'medium'", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(wireTaskPriority.parse("critical")).toBe("medium");
    warn.mockRestore();
  });
});

describe("wireTaskSchema", () => {
  it("parses a valid task", () => {
    const result = wireTaskSchema.safeParse(VALID_TASK);
    expect(result.success).toBe(true);
  });

  it("parses task with empty priority (D-19: live DB has rows with priority='')", () => {
    const task = { ...VALID_TASK, priority: "" };
    const result = wireTaskSchema.safeParse(task);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("medium");
    }
  });

  it("parses task with legacy status", () => {
    const task = { ...VALID_TASK, status: "completed" };
    const result = wireTaskSchema.safeParse(task);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("done");
    }
  });

  it("parses task with both dirty status and priority", () => {
    const task = { ...VALID_TASK, status: "in_progress", priority: "" };
    const result = wireTaskSchema.safeParse(task);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("in-progress");
      expect(result.data.priority).toBe("medium");
    }
  });
});

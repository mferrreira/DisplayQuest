// @vitest-environment node
/**
 * OND4-B3 (R3) — contract parity suite: LEGACY TaskServiceGateway (untouched, DEC-15) vs
 * the NEW use-case wiring (DEC-17/18), both over the SAME in-memory world.
 *
 * Harness (DEC-18): every case rebuilds BOTH sides from a pristine seed, then compares
 *   1. the JSON-observable result (task.toJSON() / null),
 *   2. the full store state (tasks, task_assignees, task_user_progress, users,
 *      notifications, awards),
 *   3. errors compared by MESSAGE (typed DomainErrors must carry the legacy messages).
 *
 * Clock frozen at 2026-06-15T12:00:00Z (Mon 09:00 SP).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskServiceGateway } from "@/backend/modules/task-management/infrastructure/task-service.gateway";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import { toTaskView, type ITask } from "@/backend/domain";
import { Task } from "@/backend/models/Task";
import type { CreateTaskCommand } from "@/backend/modules/task-management/application/contracts";
import type { TaskRepository } from "@/backend/repositories/TaskRepository";
import type { TaskAssigneeRepository } from "@/backend/repositories/TaskAssigneeRepository";
import type { TaskUserProgressRepository } from "@/backend/repositories/TaskUserProgressRepository";
import type { UserRepository } from "@/backend/repositories/UserRepository";
import type { ProjectRepository } from "@/backend/repositories/ProjectRepository";
import type { NotificationsModule } from "@/backend/modules/notifications";
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events";
import type {
  TaskNotificationEvent,
} from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskUserProgressRecord } from "@/backend/modules/task-management/application/ports/task-progress.repository";

const NOW = new Date("2026-06-15T12:00:00.000Z");

type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedTo: number | null;
  projectId: number | null;
  dueDate: string | null;
  points: number;
  completed: boolean;
  completedAt: Date | null;
  taskVisibility: string;
  isGlobal: boolean;
  groupTaskId: number | null;
  createdBy: number | null;
};
type AssigneeRow = { id: number; taskId: number; userId: number; assignedBy: number | null; assignedAt: Date };
type ProgressRow = {
  id: number;
  taskId: number;
  userId: number;
  status: string;
  pickedAt: Date | null;
  completedAt: Date | null;
  awardedPoints: number;
};
type UserRow = { id: number; name: string; roles: string[]; completedTasks: number };

let world: {
  tasks: TaskRow[];
  assignees: AssigneeRow[];
  progress: ProgressRow[];
  users: UserRow[];
  memberships: Array<{ projectId: number; userId: number }>;
  projects: Array<{ id: number; leaderId: number | null; createdBy: number | null }>;
  notifications: Array<Record<string, unknown>>;
  awards: Array<Record<string, unknown>>;
  assigneeAvailable: boolean;
  progressAvailable: boolean;
  nextTaskId: number;
  nextAssigneeId: number;
  nextProgressId: number;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  world = {
    tasks: [],
    assignees: [],
    progress: [],
    users: [],
    memberships: [],
    projects: [],
    notifications: [],
    awards: [],
    assigneeAvailable: true,
    progressAvailable: true,
    nextTaskId: 1,
    nextAssigneeId: 1,
    nextProgressId: 1,
  };
});

// ---- seeding ---------------------------------------------------------------

function seedTask(partial: Partial<TaskRow> & { id: number; title?: string }): TaskRow {
  const row: TaskRow = {
    title: `T${partial.id}`,
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
    ...partial,
  };
  world.tasks.push(row);
  return row;
}

function seedUser(id: number, name: string, roles: string[], completedTasks = 0) {
  world.users.push({ id, name, roles, completedTasks });
}

function seedProject(id: number, leaderId: number | null, createdBy: number | null = null) {
  world.projects.push({ id, leaderId, createdBy });
}

function seedMembership(projectId: number, userId: number) {
  world.memberships.push({ projectId, userId });
}

function seedAssignee(taskId: number, userId: number, assignedAt: string) {
  world.assignees.push({
    id: world.nextAssigneeId++,
    taskId,
    userId,
    assignedBy: null,
    assignedAt: new Date(assignedAt),
  });
}

function seedProgress(partial: Partial<ProgressRow> & { taskId: number; userId: number }) {
  world.progress.push({
    id: world.nextProgressId++,
    taskId: partial.taskId,
    userId: partial.userId,
    status: partial.status ?? "to-do",
    pickedAt: partial.pickedAt ?? null,
    completedAt: partial.completedAt ?? null,
    awardedPoints: partial.awardedPoints ?? 0,
  });
}

// ---- shared row/view helpers -----------------------------------------------

function rowFromITask(data: ITask) {
  return {
    title: data.title,
    description: data.description ?? null,
    status: data.status as string,
    priority: data.priority as string,
    assignedTo: data.assignedTo ?? null,
    projectId: data.projectId ?? null,
    dueDate: data.dueDate ?? null,
    points: data.points,
    completed: data.completed,
    completedAt: (data.completedAt as Date | null) ?? null,
    taskVisibility: data.taskVisibility as string,
    isGlobal: data.isGlobal ?? false,
    groupTaskId: data.groupTaskId ?? null,
    createdBy: data.createdBy ?? null,
  };
}

function viewFromRow(row: TaskRow) {
  // Same view the REAL new adapter builds (toTaskView + [assignedTo] fallback).
  return toTaskView({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as ITask["status"],
    priority: row.priority as ITask["priority"],
    assignedTo: row.assignedTo,
    assigneeIds: row.assignedTo ? [row.assignedTo] : [],
    projectId: row.projectId,
    dueDate: row.dueDate,
    points: row.points,
    completed: row.completed,
    completedAt: row.completedAt,
    taskVisibility: row.taskVisibility as ITask["taskVisibility"],
    isGlobal: row.isGlobal,
    groupTaskId: row.groupTaskId,
    createdBy: row.createdBy,
  });
}

// ---- the two sides over the SAME world --------------------------------------

function buildLegacy() {
  const taskRepo = {
    findById: async (id: number) => {
      const row = world.tasks.find((t) => t.id === id);
      return row ? legacyTaskFromRow(row) : null;
    },
    findAll: async () => [...world.tasks].sort((a, b) => b.id - a.id).map((row) => legacyTaskFromRow(row)),
    findByAssigneeId: async (userId: number) =>
      world.tasks
        .filter((t) => t.assignedTo === userId)
        .sort((a, b) => b.id - a.id)
        .map((row) => legacyTaskFromRow(row)),
    create: async (task: { toPrisma(): Omit<TaskRow, "id"> }) => {
      const row: TaskRow = { id: world.nextTaskId++, ...task.toPrisma() };
      world.tasks.push(row);
      return legacyTaskFromRow(row);
    },
    update: async (id: number, task: { toPrisma(): Omit<TaskRow, "id"> }) => {
      const row = world.tasks.find((t) => t.id === id);
      if (!row) throw new Error("Task row missing");
      Object.assign(row, task.toPrisma());
      return legacyTaskFromRow(row);
    },
    delete: async (id: number) => {
      world.tasks = world.tasks.filter((t) => t.id !== id);
      world.assignees = world.assignees.filter((a) => a.taskId !== id);
      world.progress = world.progress.filter((p) => p.taskId !== id);
    },
  };

  const assigneeRepo = {
    isAvailable: () => world.assigneeAvailable,
    listUserIdsByTaskId: async (taskId: number) =>
      world.assignees
        .filter((a) => a.taskId === taskId)
        .sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime())
        .map((a) => a.userId),
    listTaskIdsByUserId: async (userId: number) => world.assignees.filter((a) => a.userId === userId).map((a) => a.taskId),
    listUserIdsByTaskIds: async (taskIds: number[]) => {
      const map = new Map<number, number[]>();
      for (const a of [...world.assignees].sort((x, y) => x.assignedAt.getTime() - y.assignedAt.getTime())) {
        if (!taskIds.includes(a.taskId)) continue;
        const arr = map.get(a.taskId);
        if (arr) arr.push(a.userId);
        else map.set(a.taskId, [a.userId]);
      }
      return map;
    },
    isUserAssigned: async (taskId: number, userId: number) =>
      world.assignees.some((a) => a.taskId === taskId && a.userId === userId),
    replaceAssignees: async (taskId: number, userIds: number[], assignedBy?: number | null) => {
      const normalized = Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)));
      world.assignees = world.assignees.filter((a) => a.taskId !== taskId);
      for (const userId of normalized) {
        world.assignees.push({ id: world.nextAssigneeId++, taskId, userId, assignedBy: assignedBy ?? null, assignedAt: new Date() });
      }
    },
  };

  const progressRepo = {
    isAvailable: () => world.progressAvailable,
    findByTaskAndUser: async (taskId: number, userId: number) => {
      const row = world.progress.find((p) => p.taskId === taskId && p.userId === userId);
      return row ? { ...row } : null;
    },
    findByTaskIdsAndUser: async (taskIds: number[], userId: number) =>
      world.progress.filter((p) => taskIds.includes(p.taskId) && p.userId === userId).map((p) => ({ ...p })),
    upsertForTaskUser: async (input: {
      taskId: number;
      userId: number;
      status: string;
      pickedAt?: Date | null;
      completedAt?: Date | null;
      awardedPoints?: number;
    }) => {
      const row = world.progress.find((p) => p.taskId === input.taskId && p.userId === input.userId);
      if (row) {
        row.status = input.status;
        if (input.pickedAt !== undefined) row.pickedAt = input.pickedAt;
        if (input.completedAt !== undefined) row.completedAt = input.completedAt;
        if (input.awardedPoints !== undefined) row.awardedPoints = input.awardedPoints;
        return { ...row };
      }
      const created: ProgressRow = {
        id: world.nextProgressId++,
        taskId: input.taskId,
        userId: input.userId,
        status: input.status,
        pickedAt: input.pickedAt ?? null,
        completedAt: input.completedAt ?? null,
        awardedPoints: input.awardedPoints ?? 0,
      };
      world.progress.push(created);
      return { ...created };
    },
  };

  const userRepo = {
    findById: async (id: number) => {
      const row = world.users.find((u) => u.id === id);
      return row ? { ...row } : null;
    },
    update: async (user: { id?: number; completedTasks?: number }) => {
      const row = world.users.find((u) => u.id === user.id);
      if (!row) throw new Error("User row missing");
      if (user.completedTasks !== undefined) row.completedTasks = user.completedTasks;
      return { ...row };
    },
    getUserProjectMemberships: async (userId: number) =>
      world.memberships.filter((m) => m.userId === userId).map((m) => ({ projectId: m.projectId })),
  };

  const projectRepo = {
    findById: async (id: number) => {
      const row = world.projects.find((p) => p.id === id);
      return row ? { ...row } : null;
    },
  };

  const notifications = {
    publishEvent: async (event: Record<string, unknown>) => {
      world.notifications.push(event);
    },
  };

  const taskProgressEvents = {
    onTaskCompleted: async (event: { userId: number; taskId: number; taskPoints: number }) => {
      world.awards.push({ ...event });
    },
  };

  const gateway = new TaskServiceGateway(
    taskRepo as unknown as TaskRepository,
    assigneeRepo as unknown as TaskAssigneeRepository,
    progressRepo as unknown as TaskUserProgressRepository,
    userRepo as unknown as UserRepository,
    projectRepo as unknown as ProjectRepository,
    notifications as unknown as NotificationsModule,
    createIdentityAccessModule(),
    taskProgressEvents as unknown as TaskProgressEvents,
  );

  // The OLD ListTasksForActorUseCase composition (gateway calls), reproduced verbatim.
  const listTasksForActor = async (query: { actorId: number; actorRoles: string[]; projectId?: number }) => {
    const scopedTasks = await gateway.listTasksForUser(query.actorId, query.actorRoles);
    const sharedTasks = await gateway.listGlobalTasks();
    if (query.projectId) {
      const projectScoped = scopedTasks.filter((task) => task.projectId === query.projectId);
      const projectShared = sharedTasks.filter(
        (task) => task.projectId === query.projectId && task.taskVisibility === "public",
      );
      return await gateway.applyActorProgress(dedupe([...projectScoped, ...projectShared]), query.actorId);
    }
    return await gateway.applyActorProgress(dedupe([...scopedTasks, ...sharedTasks]), query.actorId);
  };

  return {
    getTaskById: (taskId: number) => gateway.getTaskById(taskId),
    listTasksForActor,
    listActorProjectIds: (actorId: number) => gateway.listActorProjectIds(actorId),
    createTask: (command: CreateTaskCommand, actorId: number) => gateway.createTask(command, actorId),
    createTaskBacklog: (tasks: CreateTaskCommand[], actorId: number) => gateway.createTaskBacklog(tasks, actorId),
    updateTask: (command: { taskId: number; actorId: number; data: Record<string, unknown> }) =>
      gateway.updateTask(command),
    deleteTask: (command: { taskId: number; actorId: number }) => gateway.deleteTask(command),
    completeTask: (command: { taskId: number; userId: number }) => gateway.completeTask(command),
    approveTask: (command: { taskId: number; approverId: number }) => gateway.approveTask(command),
    rejectTask: (command: { taskId: number; approverId: number; reason?: string }) => gateway.rejectTask(command),
  };
}

function buildNew() {
  const tasks = {
    findById: async (id: number) => {
      const row = world.tasks.find((t) => t.id === id);
      return row ? viewFromRow(row) : null;
    },
    findAll: async () => [...world.tasks].sort((a, b) => b.id - a.id).map(viewFromRow),
    findByAssigneeId: async (userId: number) =>
      world.tasks
        .filter((t) => t.assignedTo === userId)
        .sort((a, b) => b.id - a.id)
        .map(viewFromRow),
    create: async (data: ITask) => {
      const row: TaskRow = { id: world.nextTaskId++, ...rowFromITask(data) };
      world.tasks.push(row);
      return viewFromRow(row);
    },
    update: async (id: number, data: ITask) => {
      const row = world.tasks.find((t) => t.id === id);
      if (!row) throw new Error("Task row missing");
      Object.assign(row, rowFromITask(data));
      return viewFromRow(row);
    },
    delete: async (id: number) => {
      world.tasks = world.tasks.filter((t) => t.id !== id);
      world.assignees = world.assignees.filter((a) => a.taskId !== id);
      world.progress = world.progress.filter((p) => p.taskId !== id);
    },
  };

  const assignees = {
    isAvailable: () => world.assigneeAvailable,
    listUserIdsByTaskId: async (taskId: number) =>
      world.assignees
        .filter((a) => a.taskId === taskId)
        .sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime())
        .map((a) => a.userId),
    listTaskIdsByUserId: async (userId: number) => world.assignees.filter((a) => a.userId === userId).map((a) => a.taskId),
    listUserIdsByTaskIds: async (taskIds: number[]) => {
      const map = new Map<number, number[]>();
      for (const a of [...world.assignees].sort((x, y) => x.assignedAt.getTime() - y.assignedAt.getTime())) {
        if (!taskIds.includes(a.taskId)) continue;
        const arr = map.get(a.taskId);
        if (arr) arr.push(a.userId);
        else map.set(a.taskId, [a.userId]);
      }
      return map;
    },
    isUserAssigned: async (taskId: number, userId: number) =>
      world.assignees.some((a) => a.taskId === taskId && a.userId === userId),
    replaceAssignees: async (taskId: number, userIds: number[], assignedBy?: number | null) => {
      const normalized = Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)));
      world.assignees = world.assignees.filter((a) => a.taskId !== taskId);
      for (const userId of normalized) {
        world.assignees.push({ id: world.nextAssigneeId++, taskId, userId, assignedBy: assignedBy ?? null, assignedAt: new Date() });
      }
    },
  };

  const progress = {
    isAvailable: () => world.progressAvailable,
    findByTaskAndUser: async (taskId: number, userId: number): Promise<TaskUserProgressRecord | null> => {
      const row = world.progress.find((p) => p.taskId === taskId && p.userId === userId);
      return row ? { ...row, status: row.status as TaskUserProgressRecord["status"] } : null;
    },
    findByTaskIdsAndUser: async (taskIds: number[], userId: number): Promise<TaskUserProgressRecord[]> =>
      world.progress
        .filter((p) => taskIds.includes(p.taskId) && p.userId === userId)
        .map((p) => ({ ...p, status: p.status as TaskUserProgressRecord["status"] })),
    upsert: async (input: {
      taskId: number;
      userId: number;
      status: string;
      pickedAt?: Date | null;
      completedAt?: Date | null;
      awardedPoints?: number;
    }) => {
      const row = world.progress.find((p) => p.taskId === input.taskId && p.userId === input.userId);
      if (row) {
        row.status = input.status;
        if (input.pickedAt !== undefined) row.pickedAt = input.pickedAt;
        if (input.completedAt !== undefined) row.completedAt = input.completedAt;
        if (input.awardedPoints !== undefined) row.awardedPoints = input.awardedPoints;
        return;
      }
      world.progress.push({
        id: world.nextProgressId++,
        taskId: input.taskId,
        userId: input.userId,
        status: input.status,
        pickedAt: input.pickedAt ?? null,
        completedAt: input.completedAt ?? null,
        awardedPoints: input.awardedPoints ?? 0,
      });
    },
    listCompletedByTaskIds: async (taskIds: number[]) =>
      world.progress
        .filter((p) => taskIds.includes(p.taskId) && p.completedAt != null)
        .map((p) => ({ taskId: p.taskId, userId: p.userId })),
    listSessionCompletionsByTaskIds: async (_taskIds: number[]) => [],
  };

  const actors = {
    findById: async (id: number) => {
      const row = world.users.find((u) => u.id === id);
      return row ? { ...row } : null;
    },
    incrementCompletedTasks: async (userId: number) => {
      const row = world.users.find((u) => u.id === userId);
      if (!row) throw new Error("User row missing");
      row.completedTasks += 1;
    },
    getUserProjectMemberships: async (userId: number) =>
      world.memberships.filter((m) => m.userId === userId).map((m) => ({ projectId: m.projectId })),
    listActiveUsers: async () => [],
  };

  const projects = {
    findById: async (id: number) => {
      const row = world.projects.find((p) => p.id === id);
      return row ? { ...row } : null;
    },
  };

  const notifications = {
    publishEvent: async (event: TaskNotificationEvent) => {
      world.notifications.push({ ...event });
    },
  };

  const events = {
    onTaskCompleted: async (event: { userId: number; taskId: number; taskPoints: number }) => {
      world.awards.push({ ...event });
    },
  };

  return createTaskManagementModule({ tasks, assignees, progress, actors, projects, notifications, events });
}

// Legacy Task instances (models/Task) — the golden harness shape.
function legacyTaskFromRow(row: TaskRow): Task {
  return Task.fromPrisma({ ...row });
}

function dedupe<T extends { id?: number }>(tasks: T[]) {
  const seen = new Set<number>();
  return tasks.filter((task) => {
    if (!task.id) return true;
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

// ---- parity runner -----------------------------------------------------------

type Side = ReturnType<typeof buildLegacy> | ReturnType<typeof buildNew>;

function snapshotWorld() {
  return JSON.parse(JSON.stringify({
    tasks: world.tasks,
    assignees: world.assignees,
    progress: world.progress,
    users: world.users,
    memberships: world.memberships,
    projects: world.projects,
    notifications: world.notifications,
    awards: world.awards,
  }));
}

async function runSide(build: () => Side, call: (side: Side) => Promise<unknown>) {
  const side = build();
  let result: unknown = null;
  let error: string | null = null;
  try {
    const raw = await call(side);
    result = raw === undefined ? null : JSON.parse(JSON.stringify(raw));
  } catch (thrown) {
    error = (thrown as Error).message;
  }
  return { result, error, world: snapshotWorld() };
}

async function parity(seed: () => void, call: (side: Side) => Promise<unknown>) {
  // SEQUENTIAL: both sides share the module-level `world`; the legacy run must fully
  // finish before the world is rebuilt for the new side (DEC-18: pristine seed per side).
  world = freshWorld();
  seed();
  const legacyRun = await runSide(buildLegacy, call);

  world = freshWorld();
  seed();
  const freshRun = await runSide(buildNew, call);

  expect(freshRun.error).toBe(legacyRun.error);
  expect(freshRun.result).toEqual(legacyRun.result);
  expect(freshRun.world).toEqual(legacyRun.world);
}

function freshWorld() {
  return {
    tasks: [],
    assignees: [],
    progress: [],
    users: [],
    memberships: [],
    projects: [],
    notifications: [],
    awards: [],
    assigneeAvailable: true,
    progressAvailable: true,
    nextTaskId: 1,
    nextAssigneeId: 1,
    nextProgressId: 1,
  };
}

function baseCommand(overrides: Partial<CreateTaskCommand> = {}): CreateTaskCommand {
  return {
    title: "Nova task",
    status: "to-do",
    priority: "medium",
    points: 0,
    taskVisibility: "delegated",
    ...overrides,
  } as CreateTaskCommand;
}

// ---- parity cases ------------------------------------------------------------

describe("contract — reads", () => {
  it("getTaskById attaches assignees (assignedTo = assignees[0])", () => {
    return parity(
      () => {
        seedTask({ id: 1, assignedTo: 5 });
        seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");
        seedAssignee(1, 5, "2026-06-11T11:00:00.000Z");
      },
      (side) => side.getTaskById(1),
    );
  });

  it("listTasksForActor (COORDENADOR): findAll DESC + batch attach + progress overlay", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedTask({ id: 1, assignedTo: 5 });
        seedTask({ id: 2, taskVisibility: "public" });
        seedTask({ id: 3, isGlobal: true, taskVisibility: "public" });
        seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");
        seedProgress({ taskId: 2, userId: 1, status: "in-progress", pickedAt: new Date("2026-06-14T09:00:00.000Z") });
      },
      (side) => side.listTasksForActor({ actorId: 1, actorRoles: ["COORDENADOR"] }),
    );
  });

  it("listTasksForActor (VOLUNTARIO): union + global append + progress overlay", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, assignedTo: 9 });
        seedTask({ id: 2, assignedTo: 8 });
        seedTask({ id: 3, projectId: 100 });
        seedTask({ id: 4, taskVisibility: "public" });
        seedTask({ id: 5, taskVisibility: "public", projectId: 100 });
        seedAssignee(2, 9, "2026-06-10T10:00:00.000Z");
        seedMembership(100, 9);
        seedProject(100, 10);
        seedProgress({ taskId: 4, userId: 9, status: "done", completedAt: NOW });
      },
      (side) => side.listTasksForActor({ actorId: 9, actorRoles: ["VOLUNTARIO"] }),
    );
  });

  it("listTasksForActor with projectId query", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, projectId: 100 });
        seedTask({ id: 2, taskVisibility: "public", projectId: 100 });
        seedTask({ id: 3, projectId: 200 });
        seedMembership(100, 9);
        seedProject(100, 10);
      },
      (side) => side.listTasksForActor({ actorId: 9, actorRoles: ["VOLUNTARIO"], projectId: 100 }),
    );
  });

  it("listActorProjectIds", () => {
    return parity(
      () => {
        seedMembership(100, 9);
        seedMembership(200, 9);
      },
      (side) => side.listActorProjectIds(9),
    );
  });
});

describe("contract — create", () => {
  it("single assignee: createdBy forced, assignees synced", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedUser(7, "Beto", ["VOLUNTARIO"]);
      },
      (side) => side.createTask(baseCommand({ assigneeIds: [7], createdBy: 999 }), 1),
    );
  });

  it("individual fan-out: one task per assignee, shared groupTaskId", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedUser(7, "A", ["VOLUNTARIO"]);
        seedUser(8, "B", ["VOLUNTARIO"]);
        seedUser(9, "C", ["VOLUNTARIO"]);
      },
      (side) => side.createTask(baseCommand({ assigneeIds: [7, 8, 9] }), 1),
    );
  });

  it("shared mode: one task, all assignees", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedUser(7, "A", ["VOLUNTARIO"]);
        seedUser(8, "B", ["VOLUNTARIO"]);
      },
      (side) => side.createTask(baseCommand({ assigneeIds: [7, 8], creationMode: "shared" }), 1),
    );
  });

  it("global quest without MANAGE_USERS -> same error message", () => {
    return parity(
      () => {
        seedUser(1, "Líder", ["GERENTE_PROJETO"]);
      },
      (side) => side.createTask(baseCommand({ isGlobal: true }), 1),
    );
  });

  it("global quest with COORDENADOR: forced nulls/public", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedProject(100, 2);
      },
      (side) =>
        side.createTask(baseCommand({ isGlobal: true, assignedTo: 7, projectId: 100, assigneeIds: [7] }), 1),
    );
  });

  it("validation errors carry the legacy messages", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
      },
      (side) => side.createTask(baseCommand({ title: "  " }), 1),
    );
  });

  it("unknown project / unknown assignee -> same error", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
      },
      (side) => side.createTask(baseCommand({ projectId: 999 }), 1),
    );
  });

  it("createTaskBacklog creates all in order", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
      },
      (side) => side.createTaskBacklog([baseCommand({ title: "A" }), baseCommand({ title: "B" })], 1),
    );
  });
});

describe("contract — update", () => {
  it("public progress-only branch: row untouched, progress row written", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, taskVisibility: "public" });
      },
      (side) => side.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } }),
    );
  });

  it("public progress done: pickedAt sticky, awardedPoints preserved", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, taskVisibility: "public" });
        seedProgress({ taskId: 1, userId: 9, status: "in-progress", pickedAt: new Date("2026-06-14T09:00:00.000Z"), awardedPoints: 5 });
      },
      (side) => side.updateTask({ taskId: 1, actorId: 9, data: { status: "done" } }),
    );
  });

  it("public foreign assignee without manage -> same error", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, taskVisibility: "public" });
      },
      (side) => side.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress", assignedTo: 8 } }),
    );
  });

  it("D-41 claim: unclaimed task pulled to in-progress", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, projectId: 100 });
        seedProject(100, 10);
        seedMembership(100, 9);
      },
      (side) => side.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } }),
    );
  });

  it("status-only on someone else's task -> same error", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, assignedTo: 8 });
      },
      (side) => side.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } }),
    );
  });

  it("status-only done by assigned volunteer + in-review notification", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, assignedTo: 9, status: "in-progress", projectId: 100, title: "Relatório" });
        seedProject(100, 10);
        seedMembership(100, 9);
      },
      async (side) => {
        const done = await side.updateTask({ taskId: 1, actorId: 9, data: { status: "done" } });
        const back = await side.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } });
        const review = await side.updateTask({ taskId: 1, actorId: 9, data: { status: "in-review" } });
        return [done, back, review];
      },
    );
  });

  it("fall-through: fields + assigneeIds normalization + dueDate", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedUser(8, "B", ["VOLUNTARIO"]);
        seedUser(9, "C", ["VOLUNTARIO"]);
        seedTask({ id: 1, description: "desc", assignedTo: 7 });
        seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");
      },
      (side) =>
        side.updateTask({
          taskId: 1,
          actorId: 1,
          data: { title: "Novo", description: null, priority: "high", points: 20, dueDate: "2026-07-01", assigneeIds: [8, 8, 9, 0] },
        }),
    );
  });

  it("completed-task gate: volunteer denied", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, projectId: 100, completed: true });
        seedProject(100, 10);
        seedMembership(100, 9);
      },
      (side) => side.updateTask({ taskId: 1, actorId: 9, data: { title: "X" } }),
    );
  });

  it("negative points -> same error, row untouched", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedTask({ id: 1 });
      },
      (side) => side.updateTask({ taskId: 1, actorId: 1, data: { points: -1 } }),
    );
  });
});

describe("contract — delete", () => {
  it("delete cascades assignees + progress, no permission check", () => {
    return parity(
      () => {
        seedTask({ id: 1 });
        seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");
        seedProgress({ taskId: 1, userId: 7, status: "in-progress" });
      },
      (side) => side.deleteTask({ taskId: 1, actorId: 42 }),
    );
  });

  it("unknown task -> same error", () => {
    return parity(() => undefined, (side) => side.deleteTask({ taskId: 999, actorId: 1 }));
  });
});

describe("contract — complete", () => {
  it("delegated assigned volunteer -> in-review, no counter/award", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, assignedTo: 9, status: "in-progress", points: 10 });
      },
      (side) => side.completeTask({ taskId: 1, userId: 9 }),
    );
  });

  it("public with progress table: per-user done, counter++, award, row untouched", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, taskVisibility: "public", points: 10 });
      },
      (side) => side.completeTask({ taskId: 1, userId: 9 }),
    );
  });

  it("public second completion -> same error", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, taskVisibility: "public" });
        seedProgress({ taskId: 1, userId: 9, status: "done", completedAt: new Date("2026-06-14T09:00:00.000Z") });
      },
      (side) => side.completeTask({ taskId: 1, userId: 9 }),
    );
  });

  it("late penalty goes negative on both sides", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, taskVisibility: "public", points: 10, dueDate: "2026-06-13T12:00:00.000Z" });
      },
      (side) => side.completeTask({ taskId: 1, userId: 9 }),
    );
  });

  it("public WITHOUT progress table: row closed + assignedTo persisted", () => {
    return parity(
      () => {
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, taskVisibility: "public", points: 4 });
        world.progressAvailable = false;
      },
      (side) => side.completeTask({ taskId: 1, userId: 9 }),
    );
  });

  it("leader assigned to own task -> same error", () => {
    return parity(
      () => {
        seedUser(10, "Líder", ["GERENTE_PROJETO"]);
        seedTask({ id: 1, assignedTo: 10, projectId: 100 });
        seedProject(100, 10);
      },
      (side) => side.completeTask({ taskId: 1, userId: 10 }),
    );
  });

  it("COLABORADOR completing an unclaimed task claims it (D-41)", () => {
    return parity(
      () => {
        seedUser(9, "Cola", ["COLABORADOR"]);
        seedTask({ id: 1 });
      },
      (side) => side.completeTask({ taskId: 1, userId: 9 }),
    );
  });
});

describe("contract — approve / reject", () => {
  it("COORDENADOR self-approval allowed: done + counter + award + notification", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedTask({ id: 1, assignedTo: 1, status: "in-review", points: 10 });
        seedAssignee(1, 1, "2026-06-10T10:00:00.000Z");
      },
      (side) => side.approveTask({ taskId: 1, approverId: 1 }),
    );
  });

  it("project leader approves member's task", () => {
    return parity(
      () => {
        seedUser(10, "Líder", ["GERENTE_PROJETO"]);
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, assignedTo: 9, status: "in-review", projectId: 100, points: 5 });
        seedProject(100, 10);
      },
      (side) => side.approveTask({ taskId: 1, approverId: 10 }),
    );
  });

  it("self-approval without MANAGE_USERS -> same error", () => {
    return parity(
      () => {
        seedUser(10, "Líder", ["GERENTE_PROJETO"]);
        seedTask({ id: 1, assignedTo: 10, status: "in-review", projectId: 100 });
        seedProject(100, 10);
      },
      (side) => side.approveTask({ taskId: 1, approverId: 10 }),
    );
  });

  it("non-leader GERENTE_PROJETO -> same error", () => {
    return parity(
      () => {
        seedUser(10, "Outro", ["GERENTE_PROJETO"]);
        seedTask({ id: 1, assignedTo: 9, status: "in-review", projectId: 100 });
        seedProject(100, 11);
      },
      (side) => side.approveTask({ taskId: 1, approverId: 10 }),
    );
  });

  it("0-point approval: counter++ without award", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, assignedTo: 9, status: "in-review", points: 0 });
      },
      (side) => side.approveTask({ taskId: 1, approverId: 1 }),
    );
  });

  it("reject with reason: adjust + FIX line + notification", () => {
    return parity(
      () => {
        seedUser(10, "Líder", ["GERENTE_PROJETO"]);
        seedUser(9, "Ana", ["VOLUNTARIO"]);
        seedTask({ id: 1, assignedTo: 9, status: "in-review", projectId: 100, description: "Desc original" });
        seedProject(100, 10);
      },
      (side) => side.rejectTask({ taskId: 1, approverId: 10, reason: "  precisa de testes  " }),
    );
  });

  it("reject without reason: description untouched", () => {
    return parity(
      () => {
        seedUser(1, "Coord", ["COORDENADOR"]);
        seedTask({ id: 1, assignedTo: 9, status: "in-review", description: "Desc original" });
      },
      (side) => side.rejectTask({ taskId: 1, approverId: 1 }),
    );
  });
});

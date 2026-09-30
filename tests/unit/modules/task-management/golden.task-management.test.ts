// @vitest-environment node
/**
 * OND4-B1 (R0) — golden/characterization matrix of `TaskServiceGateway` (928 lines)
 * BEFORE the Onda 4 refactor touches it. Frozen behaviors (incl. quirks):
 *
 *   - RBAC seams (real identity-access): MANAGE_USERS = COORDENADOR/GERENTE;
 *     MANAGE_TASKS = COORDENADOR/GERENTE/GERENTE_PROJETO/COLABORADOR/PESQUISADOR.
 *   - listTasksForUser: COORDENADOR/GERENTE/COLABORADOR see findAll (id DESC) WITHOUT
 *     attachAssigneeIds (assigneeIds fall back to [assignedTo]); others see the deduped
 *     union assigned(assignedTo) + task_assignees + project-membership tasks.
 *   - updateTask has THREE non-manager branches: (1) public progress-only updates live in
 *     task_user_progress and NEVER touch the task row; (2) D-41 claim: pulling an UNCLAIMED
 *     task to "in-progress" makes the actor the owner; (3) status-only updates require
 *     assignment on non-public tasks ("Usuário não pode manipular esta tarefa"). Any other
 *     body falls through to the membership gate.
 *   - completeTask: delegated tasks land in "in-review" (completed=true, completedAt NOT
 *     set, no counter/award — those live in approveTask); public/global land "done" with
 *     per-user progress (row untouched when task_user_progress is available) and award
 *     points - latePenalty (daysLate = ceil(diff/24h) * points, CAN GO NEGATIVE).
 *   - approve/reject: only MANAGE_USERS or the project's own leader; never self (isSelf
 *     checked AFTER attachAssigneeIds rewrites assignedTo to assignees[0]).
 *   - deleteTask has NO permission check at all (frozen quirk).
 *   - TaskRepository.update is a FULL replacement via toPrisma (assigneeIds are persisted
 *     only through task_assignees).
 *
 * Seams: the gateway's constructor dependencies (5 repositories + notifications +
 * identity-access + awards) are injected as in-memory fakes; identity-access is the REAL
 * pure module (pins RBAC). Clock frozen at 2026-06-15T12:00:00Z (Mon 09:00 SP).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskServiceGateway } from "@/backend/modules/task-management/infrastructure/task-service.gateway";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createTaskProgressEvents } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events";
import { Task } from "@/backend/models/Task";
import type { TaskRepository } from "@/backend/repositories/TaskRepository";
import type { TaskAssigneeRepository } from "@/backend/repositories/TaskAssigneeRepository";
import type { TaskUserProgressRepository } from "@/backend/repositories/TaskUserProgressRepository";
import type { UserRepository } from "@/backend/repositories/UserRepository";
import type { ProjectRepository } from "@/backend/repositories/ProjectRepository";
import type { NotificationsModule } from "@/backend/modules/notifications";
import type {
  CreateTaskCommand,
} from "@/backend/modules/task-management/application/contracts";
import type { TaskCompletedEvent } from "@/backend/modules/task-management/application/ports/task-progress.events";

const NOW = new Date("2026-06-15T12:00:00.000Z"); // Mon 09:00 America/Sao_Paulo

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
type ProjectRow = { id: number; leaderId: number | null; createdBy: number | null };

let world: {
  tasks: TaskRow[];
  assignees: AssigneeRow[];
  progress: ProgressRow[];
  users: UserRow[];
  memberships: Array<{ projectId: number; userId: number }>;
  projects: ProjectRow[];
  notifications: Array<Record<string, unknown>>;
  awards: Array<Record<string, unknown>>;
  assigneeAvailable: boolean;
  progressAvailable: boolean;
  nextTaskId: number;
  nextAssigneeId: number;
  nextProgressId: number;
};

let gateway: TaskServiceGateway;

function fromRow(row: TaskRow) {
  // Mirrors the real TaskRepository: NO taskAssignees include -> assigneeIds falls back
  // to [assignedTo] (Task.fromPrisma).
  return { ...row };
}

// The fake repositories return real Task instances built the way the real TaskRepository
// does it (Task.fromPrisma over a row WITHOUT the taskAssignees include).
function taskFromRow(row: TaskRow): Task {
  return Task.fromPrisma(fromRow(row));
}

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

  const taskRepo = {
    findById: async (id: number) => {
      const row = world.tasks.find((t) => t.id === id);
      return row ? taskFromRow(row) : null;
    },
    findAll: async () =>
      [...world.tasks].sort((a, b) => b.id - a.id).map((row) => taskFromRow(row)),
    findByAssigneeId: async (userId: number) =>
      world.tasks
        .filter((t) => t.assignedTo === userId)
        .sort((a, b) => b.id - a.id)
        .map((row) => taskFromRow(row)),
    create: async (task: { toPrisma(): Omit<TaskRow, "id"> }) => {
      const row: TaskRow = { id: world.nextTaskId++, ...task.toPrisma() };
      world.tasks.push(row);
      return taskFromRow(row);
    },
    update: async (id: number, task: { toPrisma(): Omit<TaskRow, "id"> }) => {
      const row = world.tasks.find((t) => t.id === id);
      if (!row) throw new Error("Task row missing");
      Object.assign(row, task.toPrisma()); // FULL replacement, like prisma.update(data: toPrisma())
      return taskFromRow(row);
    },
    delete: async (id: number) => {
      world.tasks = world.tasks.filter((t) => t.id !== id);
      world.assignees = world.assignees.filter((a) => a.taskId !== id); // FK onDelete: Cascade
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
    listTaskIdsByUserId: async (userId: number) =>
      world.assignees.filter((a) => a.userId === userId).map((a) => a.taskId),
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
        world.assignees.push({
          id: world.nextAssigneeId++,
          taskId,
          userId,
          assignedBy: assignedBy ?? null,
          assignedAt: new Date(),
        });
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
    onTaskCompleted: async (event: TaskCompletedEvent) => {
      world.awards.push({ ...event });
    },
  };

  gateway = new TaskServiceGateway(
    taskRepo as unknown as TaskRepository,
    assigneeRepo as unknown as TaskAssigneeRepository,
    progressRepo as unknown as TaskUserProgressRepository,
    userRepo as unknown as UserRepository,
    projectRepo as unknown as ProjectRepository,
    notifications as unknown as NotificationsModule,
    createIdentityAccessModule(),
    taskProgressEvents,
  );
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- seeding helpers -------------------------------------------------------

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

function seedUser(id: number, name: string, roles: string[], completedTasks = 0): UserRow {
  const row = { id, name, roles, completedTasks };
  world.users.push(row);
  return row;
}

function seedProject(id: number, leaderId: number | null, createdBy: number | null = null): ProjectRow {
  const row = { id, leaderId, createdBy };
  world.projects.push(row);
  return row;
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

function seedProgress(partial: Partial<ProgressRow> & { taskId: number; userId: number }): ProgressRow {
  const row: ProgressRow = {
    id: world.nextProgressId++,
    taskId: partial.taskId,
    userId: partial.userId,
    status: partial.status ?? "to-do",
    pickedAt: partial.pickedAt ?? null,
    completedAt: partial.completedAt ?? null,
    awardedPoints: partial.awardedPoints ?? 0,
  };
  world.progress.push(row);
  return row;
}

async function grabError(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

function taskRow(id: number) {
  return world.tasks.find((t) => t.id === id);
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

// ---- getTaskById ------------------------------------------------------------

describe("getTaskById", () => {
  it("returns null for unknown id", async () => {
    expect(await gateway.getTaskById(999)).toBeNull();
  });

  it("attaches assignees ordered by assignedAt ASC and rewrites assignedTo to the FIRST assignee", async () => {
    seedTask({ id: 1, assignedTo: 5 });
    seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");
    seedAssignee(1, 5, "2026-06-11T11:00:00.000Z");

    const task = await gateway.getTaskById(1);

    expect(task?.assigneeIds).toEqual([7, 5]);
    expect(task?.assignedTo).toBe(7); // assignees[0] wins over the row's assignedTo
  });

  it("without assignee rows: assigneeIds [] when the table is available; [assignedTo] only as fallback when unavailable", async () => {
    seedTask({ id: 1, assignedTo: 5 });
    seedTask({ id: 2, assignedTo: null });

    expect((await gateway.getTaskById(1))?.assigneeIds).toEqual([]); // table available, no rows
    expect((await gateway.getTaskById(2))?.assignedTo).toBeNull();

    world.assigneeAvailable = false;
    expect((await gateway.getTaskById(1))?.assigneeIds).toEqual([5]); // fallback [assignedTo]
    expect((await gateway.getTaskById(2))?.assigneeIds).toEqual([]);
  });
});

// ---- listTasksForUser -------------------------------------------------------

describe("listTasksForUser", () => {
  it("COORDENADOR sees ALL tasks ordered by id DESC, WITHOUT task_assignees attachment", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, assignedTo: 5 });
    seedTask({ id: 2 });
    seedTask({ id: 3 });
    seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");

    const tasks = await gateway.listTasksForUser(1, ["COORDENADOR"]);

    expect(tasks.map((t) => t.id)).toEqual([3, 2, 1]);
    expect(tasks.find((t) => t.id === 1)?.assigneeIds).toEqual([5]); // fallback, NOT [7]
  });

  it("COLABORADOR (MANAGE_TASKS but not MANAGE_USERS) also sees ALL tasks", async () => {
    seedUser(1, "Cola", ["COLABORADOR"]);
    seedTask({ id: 1 });
    seedTask({ id: 2 });

    expect((await gateway.listTasksForUser(1, ["COLABORADOR"])).map((t) => t.id)).toEqual([2, 1]);
  });

  it("VOLUNTARIO sees the deduped union: assigned -> task_assignees -> project membership", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9 }); // assigned via column
    seedTask({ id: 2, assignedTo: 8 }); // assigned via task_assignees only
    seedTask({ id: 3, projectId: 100 }); // visible via membership
    seedTask({ id: 4, taskVisibility: "public" }); // public, no project/assignee -> NOT visible
    seedTask({ id: 5, assignedTo: 8, projectId: 200 }); // other project -> NOT visible
    seedAssignee(2, 9, "2026-06-10T10:00:00.000Z");
    seedAssignee(1, 9, "2026-06-10T10:00:00.000Z"); // also in task_assignees -> deduped
    seedMembership(100, 9);

    const tasks = await gateway.listTasksForUser(9, ["VOLUNTARIO"]);

    expect(tasks.map((t) => t.id)).toEqual([1, 2, 3]);
  });
});

// ---- listGlobalTasks / listActorProjectIds ----------------------------------

describe("listGlobalTasks", () => {
  it("includes isGlobal OR public-without-project; excludes public-with-project and delegated", async () => {
    seedTask({ id: 1, isGlobal: true, taskVisibility: "public" });
    seedTask({ id: 2, taskVisibility: "public" });
    seedTask({ id: 3, taskVisibility: "public", projectId: 100 });
    seedTask({ id: 4, taskVisibility: "delegated" });

    expect((await gateway.listGlobalTasks()).map((t) => t.id)).toEqual([2, 1]);
  });
});

describe("listActorProjectIds", () => {
  it("maps project_members rows to projectIds", async () => {
    seedMembership(100, 9);
    seedMembership(200, 9);

    expect(await gateway.listActorProjectIds(9)).toEqual([100, 200]);
  });
});

// ---- createTask --------------------------------------------------------------

describe("createTask", () => {
  it("rejects when the creator does not exist", async () => {
    expect(
      await grabError(() => gateway.createTask(baseCommand(), 999)),
    ).toBe("Criador não encontrado");
  });

  it("validates title (required, <=200) and points (>=0) via Task.create", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);

    expect(await grabError(() => gateway.createTask(baseCommand({ title: "  " }), 1))).toBe(
      "Título da tarefa é obrigatório",
    );
    expect(await grabError(() => gateway.createTask(baseCommand({ title: "x".repeat(201) }), 1))).toBe(
      "Título da tarefa não pode ter mais de 200 caracteres",
    );
    expect(await grabError(() => gateway.createTask(baseCommand({ points: -5 }), 1))).toBe(
      "Pontos da tarefa não podem ser negativos",
    );
  });

  it("single assignee: assignedTo = assigneeIds[0], assignees persisted, createdBy forced to actor", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedUser(7, "Beto", ["VOLUNTARIO"]);

    const task = await gateway.createTask(
      baseCommand({ assigneeIds: [7], createdBy: 999 }),
      1,
    );

    expect(task.assignedTo).toBe(7);
    expect(task.assigneeIds).toEqual([7]);
    expect(taskRow(1)?.createdBy).toBe(1); // command.createdBy is OVERRIDDEN by actorId
    expect(world.assignees.map((a) => [a.taskId, a.userId, a.assignedBy])).toEqual([[1, 7, 1]]);
  });

  it("individual mode (default) fans out one task per assignee sharing groupTaskId = first created id", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedUser(7, "A", ["VOLUNTARIO"]);
    seedUser(8, "B", ["VOLUNTARIO"]);
    seedUser(9, "C", ["VOLUNTARIO"]);

    const first = await gateway.createTask(baseCommand({ assigneeIds: [7, 8, 9] }), 1);

    expect(world.tasks.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(world.tasks.map((t) => [t.assignedTo, t.groupTaskId])).toEqual([
      [7, 1],
      [8, 1],
      [9, 1],
    ]);
    expect(world.assignees.map((a) => [a.taskId, a.userId])).toEqual([
      [1, 7],
      [2, 8],
      [3, 9],
    ]);
    expect(first.id).toBe(1);
    expect(first.assignedTo).toBe(7);
    expect(first.assigneeIds).toEqual([7]);
  });

  it("shared mode creates ONE task with all assignees", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedUser(7, "A", ["VOLUNTARIO"]);
    seedUser(8, "B", ["VOLUNTARIO"]);

    const task = await gateway.createTask(
      baseCommand({ assigneeIds: [7, 8], creationMode: "shared" }),
      1,
    );

    expect(world.tasks.map((t) => t.id)).toEqual([1]);
    expect(task.assignedTo).toBe(7);
    expect(task.assigneeIds).toEqual([7, 8]);
    expect(world.assignees.map((a) => a.userId)).toEqual([7, 8]);
  });

  it("global quest requires MANAGE_USERS on the CREATOR's roles", async () => {
    seedUser(1, "Líder", ["GERENTE_PROJETO"]); // has MANAGE_TASKS but NOT MANAGE_USERS

    expect(
      await grabError(() => gateway.createTask(baseCommand({ isGlobal: true }), 1)),
    ).toBe("Usuário não tem permissão para criar quests globais");
  });

  it("global quest forces assignedTo=null, projectId=null, visibility=public, no assignees", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedProject(100, 2);

    const task = await gateway.createTask(
      baseCommand({ isGlobal: true, assignedTo: 7, projectId: 100, assigneeIds: [7], taskVisibility: "delegated" }),
      1,
    );

    const row = taskRow(1)!;
    expect([row.assignedTo, row.projectId, row.taskVisibility, row.isGlobal]).toEqual([null, null, "public", true]);
    expect(world.assignees).toHaveLength(0);
    expect([task.assignedTo, task.assigneeIds]).toEqual([null, []]);
  });

  it("rejects unknown project and unknown assignees", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);

    expect(await grabError(() => gateway.createTask(baseCommand({ projectId: 999 }), 1))).toBe(
      "Projeto não encontrado",
    );
    expect(await grabError(() => gateway.createTask(baseCommand({ assigneeIds: [77] }), 1))).toBe(
      "Usuário não encontrado",
    );
  });

  it("status 'done' at creation sets completedAt but leaves completed=false (Task.create quirk)", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);

    const task = await gateway.createTask(baseCommand({ status: "done", completed: false }), 1);

    const row = taskRow(1)!;
    expect(row.completed).toBe(false);
    expect(row.completedAt).toEqual(NOW);
    expect(task.completed).toBe(false);
  });
});

describe("createTaskBacklog", () => {
  it("creates every task sequentially and returns them in order", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);

    const created = await gateway.createTaskBacklog(
      [baseCommand({ title: "A" }), baseCommand({ title: "B" })],
      1,
    );

    expect(created.map((t) => [t.id, t.title])).toEqual([[1, "A"], [2, "B"]]);
  });
});

// ---- updateTask --------------------------------------------------------------

describe("updateTask — not found gates", () => {
  it("rejects unknown task and unknown actor", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1 });

    expect(
      await grabError(() => gateway.updateTask({ taskId: 999, actorId: 9, data: { status: "done" } })),
    ).toBe("Tarefa não encontrada");
    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 999, data: { status: "done" } })),
    ).toBe("Usuário não encontrado");
  });
});

describe("updateTask — public progress-only branch (task_user_progress, row untouched)", () => {
  it("volunteer moves a public task to in-progress: progress row created, TASK ROW UNTOUCHED", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public" });

    const result = await gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } });

    expect(taskRow(1)?.status).toBe("to-do"); // row NEVER updated by this branch
    expect(world.progress).toHaveLength(1);
    expect(world.progress[0]).toMatchObject({
      taskId: 1,
      userId: 9,
      status: "in-progress",
      pickedAt: NOW,
      completedAt: null,
      awardedPoints: 0,
    });
    expect([result.status, result.completed, result.completedAt, result.assignedTo]).toEqual([
      "in-progress",
      false,
      null,
      9,
    ]);
  });

  it("done: completedAt=now, existing pickedAt and awardedPoints PRESERVED", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public" });
    const past = new Date("2026-06-14T09:00:00.000Z");
    seedProgress({ taskId: 1, userId: 9, status: "in-progress", pickedAt: past, awardedPoints: 5 });

    const result = await gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "done" } });

    expect(world.progress[0]).toMatchObject({ status: "done", pickedAt: past, completedAt: NOW, awardedPoints: 5 });
    expect([result.status, result.completed, result.completedAt]).toEqual(["done", true, NOW]);
  });

  it("assignedTo another user without manage permissions is rejected", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public" });

    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress", assignedTo: 8 } })),
    ).toBe("Usuário não pode mover task pública em nome de outro usuário");
  });

  it("MANAGE_TASKS actor CAN move the public task on behalf of another user", async () => {
    seedUser(9, "Cola", ["COLABORADOR"]);
    seedTask({ id: 1, taskVisibility: "public" });

    const result = await gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress", assignedTo: 8 } });

    expect(world.progress[0].userId).toBe(8);
    expect(result.assignedTo).toBe(8);
  });

  it("public task WITH projectId requires project membership", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public", projectId: 100 });
    seedProject(100, 10);

    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } })),
    ).toBe("Usuário não pertence ao projeto desta tarefa");
  });
});

describe("updateTask — D-41 claim (pull unclaimed task to in-progress)", () => {
  it("unclaimed delegated task: actor becomes owner (column + task_assignees) and status persists", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, projectId: 100 });
    seedProject(100, 10);
    seedMembership(100, 9);

    const result = await gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } });

    expect(taskRow(1)?.assignedTo).toBe(9);
    expect(taskRow(1)?.status).toBe("in-progress");
    expect(world.assignees.map((a) => [a.taskId, a.userId, a.assignedBy])).toEqual([[1, 9, 9]]);
    expect([result.assignedTo, result.assigneeIds]).toEqual([9, [9]]);
  });

  it("already-owned task is NOT claimed; unassigned actor gets 'não pode manipular'", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 8, projectId: 100 });
    seedProject(100, 10);
    seedMembership(100, 9);

    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } })),
    ).toBe("Usuário não pode manipular esta tarefa");
    expect(taskRow(1)?.assignedTo).toBe(8);
  });

  it("claim on a task with a project requires membership", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, projectId: 100 });
    seedProject(100, 10);

    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } })),
    ).toBe("Usuário não pertence ao projeto desta tarefa");
  });

  it("claim is skipped for public tasks (progress branch owns them)", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public" });

    await gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } });

    expect(taskRow(1)?.assignedTo).toBeNull(); // claim never ran
    expect(world.assignees).toHaveLength(0);
  });
});

describe("updateTask — status-only branch for non-managers", () => {
  it("assigned volunteer: status/completed/completedAt transitions persist on the row", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-progress" });

    const result = await gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "done" } });

    expect(taskRow(1)).toMatchObject({ status: "done", completed: true, completedAt: NOW });
    expect(result.assigneeIds).toEqual([]); // attachAssigneeIds: table available, no rows -> []
  });

  it("transition INTO in-review notifies the project leader (TASK_REVIEW_REQUEST)", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-progress", projectId: 100, title: "Relatório" });
    seedProject(100, 10);
    seedMembership(100, 9);

    await gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-review" } });

    expect(taskRow(1)?.status).toBe("in-review");
    expect(world.notifications).toHaveLength(1);
    expect(world.notifications[0]).toMatchObject({
      eventType: "TASK_REVIEW_REQUEST",
      title: "Tarefa em Revisão",
      message: 'Ana marcou a tarefa "Relatório" como "Em Revisão"',
      triggeredByUserId: 9,
      audience: { mode: "USER_IDS", userIds: [10] },
    });
  });

  it("public status-only WITHOUT task_user_progress available -> 'não pode manipular'", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public" });
    world.progressAvailable = false;

    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 9, data: { status: "in-progress" } })),
    ).toBe("Usuário não pode manipular esta tarefa");
  });
});

describe("updateTask — fall-through gates", () => {
  it("non-manager without project -> 'não pode modificar'; with project without membership -> 'não pertence'", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1 });
    seedTask({ id: 2, projectId: 100 });
    seedProject(100, 10);

    expect(await grabError(() => gateway.updateTask({ taskId: 1, actorId: 9, data: { title: "X" } }))).toBe(
      "Usuário não pode modificar esta tarefa",
    );
    expect(await grabError(() => gateway.updateTask({ taskId: 2, actorId: 9, data: { title: "X" } }))).toBe(
      "Usuário não pertence ao projeto desta tarefa",
    );
  });

  it("completed tasks need COORDENADOR/LABORATORISTA/GERENTE_PROJETO/GERENTE or project creator/leader", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedUser(11, "Líder voluntário", ["VOLUNTARIO"]);
    seedTask({ id: 1, projectId: 100, completed: true });
    seedTask({ id: 2, projectId: 100, completed: true });
    seedProject(100, 11); // leader is a plain VOLUNTARIO -> exercises the leader bypass
    seedMembership(100, 9);
    seedMembership(100, 11);

    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 9, data: { title: "X" } })),
    ).toBe("Não é possível modificar tarefas concluídas sem permissões adequadas");

    const result = await gateway.updateTask({ taskId: 2, actorId: 11, data: { title: "Ajustado" } });
    expect(result.title).toBe("Ajustado");
  });

  it("manager applies field updates; description null becomes ''; negative points rejected", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, description: "desc" });

    const result = await gateway.updateTask({
      taskId: 1,
      actorId: 1,
      data: { title: "Novo título", description: null, priority: "high", points: 20, dueDate: "2026-07-01" },
    });

    expect(taskRow(1)).toMatchObject({
      title: "Novo título",
      description: "", // String(null || "") — frozen quirk
      priority: "high",
      points: 20,
      dueDate: "2026-07-01",
    });
    expect(result.description).toBe("");

    expect(
      await grabError(() => gateway.updateTask({ taskId: 1, actorId: 1, data: { points: -1 } })),
    ).toBe("Pontos não podem ser negativos");
  });

  it("assigneeIds update: dedup + drop non-positive, assignedTo = first, task_assignees replaced", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedUser(8, "B", ["VOLUNTARIO"]);
    seedUser(9, "C", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 7 });
    seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");

    const result = await gateway.updateTask({
      taskId: 1,
      actorId: 1,
      data: { assigneeIds: [8, 8, 9, 0, -1] },
    });

    expect(taskRow(1)?.assignedTo).toBe(8);
    expect(world.assignees.map((a) => a.userId)).toEqual([8, 9]);
    expect([result.assignedTo, result.assigneeIds]).toEqual([8, [8, 9]]);
  });

  it("assignedTo null clears the column and the assignee rows", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, assignedTo: 7 });
    seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");

    const result = await gateway.updateTask({ taskId: 1, actorId: 1, data: { assignedTo: null } });

    expect(taskRow(1)?.assignedTo).toBeNull();
    expect(world.assignees).toHaveLength(0);
    expect(result.assigneeIds).toEqual([]);
  });

  it("manager status transitions: done sets completedAt once; reverting to to-do clears it", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, status: "in-progress" });

    await gateway.updateTask({ taskId: 1, actorId: 1, data: { status: "done" } });
    expect(taskRow(1)).toMatchObject({ completed: true, completedAt: NOW });

    await gateway.updateTask({ taskId: 1, actorId: 1, data: { status: "to-do" } });
    expect(taskRow(1)).toMatchObject({ status: "to-do", completed: false, completedAt: null });
  });

  it("manager path also notifies the leader on transition into in-review", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, status: "in-progress", projectId: 100, title: "Relatório" });
    seedProject(100, 10);

    await gateway.updateTask({ taskId: 1, actorId: 1, data: { status: "in-review" } });

    expect(world.notifications[0]).toMatchObject({ eventType: "TASK_REVIEW_REQUEST" });
  });
});

// ---- deleteTask --------------------------------------------------------------

describe("deleteTask", () => {
  it("rejects unknown task", async () => {
    expect(await grabError(() => gateway.deleteTask({ taskId: 999, actorId: 9 }))).toBe(
      "Tarefa não encontrada",
    );
  });

  it("NO permission check: any actor deletes any task; assignees/progress cascade", async () => {
    seedTask({ id: 1 });
    seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");
    seedProgress({ taskId: 1, userId: 7, status: "in-progress" });

    await gateway.deleteTask({ taskId: 1, actorId: 42 }); // actor does not even exist

    expect(world.tasks).toHaveLength(0);
    expect(world.assignees).toHaveLength(0);
    expect(world.progress).toHaveLength(0);
  });
});

// ---- completeTask ------------------------------------------------------------

describe("completeTask", () => {
  it("rejects unknown task and already-completed task", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, completed: true });

    expect(await grabError(() => gateway.completeTask({ taskId: 999, userId: 9 }))).toBe(
      "Tarefa não encontrada",
    );
    expect(await grabError(() => gateway.completeTask({ taskId: 1, userId: 9 }))).toBe(
      "Tarefa já concluída",
    );
  });

  it("non-public unassigned volunteer cannot complete", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 8 });

    expect(await grabError(() => gateway.completeTask({ taskId: 1, userId: 9 }))).toBe(
      "Usuário não pode concluir tarefa atribuída a outro usuário",
    );
  });

  it("delegated assigned volunteer lands in 'in-review': completed=true, completedAt NOT set, no counter/award", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-progress", points: 10 });

    const result = await gateway.completeTask({ taskId: 1, userId: 9 });

    expect(taskRow(1)).toMatchObject({ status: "in-review", completed: true, completedAt: null });
    expect(result.status).toBe("in-review");
    expect(world.users.find((u) => u.id === 9)?.completedTasks).toBe(0);
    expect(world.awards).toHaveLength(0);
  });

  it("project leader assigned to the task cannot complete their own task", async () => {
    seedUser(10, "Líder", ["GERENTE_PROJETO"]);
    seedTask({ id: 1, assignedTo: 10, projectId: 100 });
    seedProject(100, 10);

    expect(await grabError(() => gateway.completeTask({ taskId: 1, userId: 10 }))).toBe(
      "Líderes de projeto não podem concluir suas próprias tasks. Delegue para outro membro da equipe.",
    );
  });

  it("public task with progress table: per-user progress 'done', counter++, award, ROW UNTOUCHED", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public", points: 10 });

    const result = await gateway.completeTask({ taskId: 1, userId: 9 });

    expect(world.progress[0]).toMatchObject({
      taskId: 1,
      userId: 9,
      status: "done",
      pickedAt: NOW,
      completedAt: NOW,
      awardedPoints: 10,
    });
    expect(world.users.find((u) => u.id === 9)?.completedTasks).toBe(1);
    expect(world.awards).toEqual([{ userId: 9, taskId: 1, taskPoints: 10 }]);
    expect(taskRow(1)).toMatchObject({ status: "to-do", completed: false, assignedTo: null });
    expect([result.status, result.completed, result.assignedTo]).toEqual(["done", true, 9]);
  });

  it("public task cannot be completed twice by the same user", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public" });
    seedProgress({ taskId: 1, userId: 9, status: "done", completedAt: new Date("2026-06-14T09:00:00.000Z") });

    expect(await grabError(() => gateway.completeTask({ taskId: 1, userId: 9 }))).toBe(
      "Tarefa pública já concluída por este usuário",
    );
  });

  it("late penalty: daysLate = ceil(diff/24h) * points, awardedPoints CAN GO NEGATIVE", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public", points: 10, dueDate: "2026-06-13T12:00:00.000Z" }); // 2 days late

    await gateway.completeTask({ taskId: 1, userId: 9 });

    expect(world.progress[0].awardedPoints).toBe(-10); // 10 - 2*10
    expect(world.awards).toEqual([{ userId: 9, taskId: 1, taskPoints: -10 }]);
  });

  it("public task WITHOUT progress table: assignedTo persisted, status done, counter++, award", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public", points: 4 });
    world.progressAvailable = false;

    const result = await gateway.completeTask({ taskId: 1, userId: 9 });

    expect(taskRow(1)).toMatchObject({ status: "done", completed: true, completedAt: NOW, assignedTo: 9 });
    expect(world.users.find((u) => u.id === 9)?.completedTasks).toBe(1);
    expect(world.awards).toEqual([{ userId: 9, taskId: 1, taskPoints: 4 }]);
    expect(result.assignedTo).toBe(9);
    expect(result.assigneeIds).toEqual([]); // no task_assignees rows were synced
  });

  it("global task with progress table behaves like public (per-user progress, row untouched)", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, taskVisibility: "public", isGlobal: true, points: 3 });

    await gateway.completeTask({ taskId: 1, userId: 9 });

    expect(world.progress[0]).toMatchObject({ status: "done", awardedPoints: 3 });
    expect(taskRow(1)?.status).toBe("to-do");
  });

  it("status 'done' but completed=false -> 'Tarefa não pode ser completada'", async () => {
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, status: "done", completed: false });

    expect(await grabError(() => gateway.completeTask({ taskId: 1, userId: 9 }))).toBe(
      "Tarefa não pode ser completada",
    );
  });

  it("MANAGE_TASKS actor completing an unclaimed delegated task claims it (D-41) and lands in-review", async () => {
    seedUser(9, "Cola", ["COLABORADOR"]);
    seedTask({ id: 1 }); // unclaimed, no project

    const result = await gateway.completeTask({ taskId: 1, userId: 9 });

    expect(taskRow(1)).toMatchObject({ assignedTo: 9, status: "in-review", completed: true });
    expect(world.assignees.map((a) => [a.taskId, a.userId, a.assignedBy])).toEqual([[1, 9, 9]]);
    expect(result.assigneeIds).toEqual([9]);
    expect(world.awards).toHaveLength(0);
  });
});

// ---- approveTask -------------------------------------------------------------

describe("approveTask", () => {
  it("rejects tasks not in-review and unknown approver", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-progress" });

    expect(await grabError(() => gateway.approveTask({ taskId: 1, approverId: 1 }))).toBe(
      "Tarefa não está em revisão",
    );
    expect(await grabError(() => gateway.approveTask({ taskId: 999, approverId: 1 }))).toBe(
      "Tarefa não encontrada",
    );
    seedTask({ id: 2, assignedTo: 9, status: "in-review" });
    expect(await grabError(() => gateway.approveTask({ taskId: 2, approverId: 999 }))).toBe(
      "Usuário aprovador não encontrado",
    );
  });

  it("self-approval is forbidden without MANAGE_USERS (even for the project leader)", async () => {
    seedUser(10, "Líder", ["GERENTE_PROJETO"]);
    seedTask({ id: 1, assignedTo: 10, status: "in-review", projectId: 100 });
    seedProject(100, 10);

    expect(await grabError(() => gateway.approveTask({ taskId: 1, approverId: 10 }))).toBe(
      "Líder não pode aprovar a própria tarefa. Solicite um gerente ou coordenador.",
    );
  });

  it("COORDENADOR self-approval is allowed: done + counter + award + TASK_APPROVED", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, assignedTo: 1, status: "in-review", points: 10 });
    seedAssignee(1, 1, "2026-06-10T10:00:00.000Z");

    const result = await gateway.approveTask({ taskId: 1, approverId: 1 });

    expect(taskRow(1)).toMatchObject({ status: "done", completed: true, completedAt: NOW });
    expect(world.users.find((u) => u.id === 1)?.completedTasks).toBe(1);
    expect(world.awards).toEqual([{ userId: 1, taskId: 1, taskPoints: 10 }]);
    expect(world.notifications[0]).toMatchObject({
      eventType: "TASK_APPROVED",
      title: "Tarefa Aprovada",
      message: 'Sua tarefa "T1" foi aprovada! Você recebeu os pontos.',
      audience: { mode: "USER_IDS", userIds: [1] },
    });
    expect(result.assigneeIds).toEqual([1]); // repo fallback, NOT attachAssigneeIds
  });

  it("project leader approves a member's task", async () => {
    seedUser(10, "Líder", ["GERENTE_PROJETO"]);
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-review", projectId: 100, points: 5 });
    seedProject(100, 10);

    await gateway.approveTask({ taskId: 1, approverId: 10 });

    expect(world.users.find((u) => u.id === 9)?.completedTasks).toBe(1);
    expect(world.awards).toEqual([{ userId: 9, taskId: 1, taskPoints: 5 }]);
  });

  it("GERENTE_PROJETO who is NOT the project leader is rejected", async () => {
    seedUser(10, "Outro líder", ["GERENTE_PROJETO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-review", projectId: 100 });
    seedProject(100, 11);

    expect(await grabError(() => gateway.approveTask({ taskId: 1, approverId: 10 }))).toBe(
      "Usuário não é líder do projeto",
    );
  });

  it("GERENTE_PROJETO on a task WITHOUT project has no approval authority", async () => {
    seedUser(10, "Líder", ["GERENTE_PROJETO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-review" });

    expect(await grabError(() => gateway.approveTask({ taskId: 1, approverId: 10 }))).toBe(
      "Usuário não tem permissão para aprovar esta tarefa",
    );
  });

  it("0-point approval still counts the completion (counter++, no award event)", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-review", points: 0 });

    await gateway.approveTask({ taskId: 1, approverId: 1 });

    expect(world.users.find((u) => u.id === 9)?.completedTasks).toBe(1);
    expect(world.awards).toHaveLength(0);
  });
});

// ---- rejectTask --------------------------------------------------------------

describe("rejectTask", () => {
  it("rejects tasks not in-review", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-progress" });

    expect(await grabError(() => gateway.rejectTask({ taskId: 1, approverId: 1 }))).toBe(
      "Tarefa não está em revisão",
    );
  });

  it("self-rejection is forbidden without MANAGE_USERS", async () => {
    seedUser(10, "Líder", ["GERENTE_PROJETO"]);
    seedTask({ id: 1, assignedTo: 10, status: "in-review", projectId: 100 });
    seedProject(100, 10);

    expect(await grabError(() => gateway.rejectTask({ taskId: 1, approverId: 10 }))).toBe(
      "Líder não pode rejeitar a própria tarefa. Solicite um gerente ou coordenador.",
    );
  });

  it("reject with reason: status adjust + FIX line appended (pt-BR date) + TASK_REJECTED notification", async () => {
    seedUser(10, "Líder", ["GERENTE_PROJETO"]);
    seedUser(9, "Ana", ["VOLUNTARIO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-review", projectId: 100, description: "Desc original" });
    seedProject(100, 10);

    const result = await gateway.rejectTask({ taskId: 1, approverId: 10, reason: "  precisa de testes  " });

    expect(taskRow(1)).toMatchObject({
      status: "adjust",
      completed: false,
      completedAt: null,
      description: "Desc original\n\nFIX (15/06/2026): precisa de testes",
    });
    expect(result.description).toBe("Desc original\n\nFIX (15/06/2026): precisa de testes");
    expect(world.notifications[0]).toMatchObject({
      eventType: "TASK_REJECTED",
      title: "Tarefa Rejeitada",
      message: 'Sua tarefa "T1" precisa de ajustes. Motivo: precisa de testes',
      data: { taskId: 1, taskTitle: "T1", reason: "precisa de testes" },
      audience: { mode: "USER_IDS", userIds: [9] },
    });
  });

  it("reject without reason leaves the description untouched", async () => {
    seedUser(1, "Coord", ["COORDENADOR"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-review", description: "Desc original" });

    await gateway.rejectTask({ taskId: 1, approverId: 1 });

    expect(taskRow(1)?.description).toBe("Desc original");
    expect(world.notifications[0]).toMatchObject({
      message: 'Sua tarefa "T1" precisa de ajustes.',
    });
  });

  it("non-leader GERENTE_PROJETO with project is rejected", async () => {
    seedUser(10, "Outro", ["GERENTE_PROJETO"]);
    seedTask({ id: 1, assignedTo: 9, status: "in-review", projectId: 100 });
    seedProject(100, 11);

    expect(await grabError(() => gateway.rejectTask({ taskId: 1, approverId: 10 }))).toBe(
      "Usuário não é líder do projeto",
    );
  });
});

// ---- applyActorProgress ------------------------------------------------------

describe("applyActorProgress", () => {
  it("without progress table it is just batch assignee attachment", async () => {
    seedTask({ id: 1, taskVisibility: "public" });
    seedTask({ id: 2, assignedTo: 8 });
    seedAssignee(1, 7, "2026-06-10T10:00:00.000Z");
    world.progressAvailable = false;

    const tasks = await gateway.applyActorProgress(
      [(await gateway.getTaskById(1))!, (await gateway.getTaskById(2))!],
      9,
    );

    expect(tasks.map((t) => [t.id, t.assigneeIds, t.assignedTo])).toEqual([
      [1, [7], 7],
      [2, [], 8], // no assignee rows: assignedTo preserved, assigneeIds []
    ]);
  });

  it("public task WITHOUT progress row -> clone at 'to-do' with assignedTo null", async () => {
    seedTask({ id: 1, taskVisibility: "public", status: "in-progress" });
    seedTask({ id: 2, assignedTo: 8, status: "in-progress" });

    const tasks = await gateway.applyActorProgress(
      [(await gateway.getTaskById(1))!, (await gateway.getTaskById(2))!],
      9,
    );

    expect(tasks[0]).toMatchObject({ status: "to-do", completed: false, completedAt: null, assignedTo: null });
    expect(tasks[1]).toMatchObject({ status: "in-progress", assignedTo: 8 }); // non-public untouched
  });

  it("public task WITH progress row -> clone reflects the actor's own progress", async () => {
    seedTask({ id: 1, taskVisibility: "public", status: "to-do" });
    const past = new Date("2026-06-14T09:00:00.000Z");
    seedProgress({ taskId: 1, userId: 9, status: "in-progress", pickedAt: past });

    const [task] = await gateway.applyActorProgress([(await gateway.getTaskById(1))!], 9);

    expect(task).toMatchObject({ status: "in-progress", completed: false, completedAt: null, assignedTo: 9 });
  });
});

// ---- events publisher (gamification-task-progress.events) --------------------

describe("golden — TaskProgressEvents publisher", () => {
  it("forwards onTaskCompleted to the awards port (OND4-B3 seam: TaskAwardPort, DEC-21)", async () => {
    const award = vi.fn(async () => undefined);
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: award },
    });

    await events.onTaskCompleted({ userId: 7, taskId: 3, taskPoints: 10 });

    expect(award).toHaveBeenCalledWith({ userId: 7, taskId: 3, taskPoints: 10 });
  });

  it("skips events without userId/taskId", async () => {
    const award = vi.fn(async () => undefined);
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: award },
    });

    await events.onTaskCompleted({ userId: 0, taskId: 3, taskPoints: 10 });
    await events.onTaskCompleted({ userId: 7, taskId: 0, taskPoints: 10 });

    expect(award).not.toHaveBeenCalled();
  });
});

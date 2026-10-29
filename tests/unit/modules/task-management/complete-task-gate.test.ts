// @vitest-environment node
/**
 * S13 (plan-v11, R12) — o gate de gestão para mover uma tarefa de `done`.
 *
 * A regra (R12) não é uma coluna nova nem um movimento do quadro: ela é o que decide se o PUT
 * aceita o `status` que TIRA a tarefa de `done`. Quem escreve de fora do `done` é a gestão de
 * tarefa (COORDENADOR, GERENTE, GERENTE_PROJETO, criador/líder do projeto); o responsável sem
 * gestão recebe Forbidden, e o gate corre ANTES de qualquer escrita. A reversão de pontos (R13)
 * é provada no roundtrip G4; aqui ela aparece só como o evento que a saída dispara, para marcar
 * que a gestão aceita e o responsável nem chega.
 *
 * O módulo é o REAL sobre portas falsas (a lição medida do B6-2a: um duplo de módulo faz a
 * recusa SUMIR do teste em vez de falhar — aqui quem decide é `updateTask`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, toTaskView, userActor, type Task } from "@/backend/domain";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import type { TaskActorRecord } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

const VOLUNTARIO = ["VOLUNTARIO"];
const COORDENADOR = ["COORDENADOR"]; // MANAGE_TASKS + MANAGE_USERS
const GERENTE = ["GERENTE"]; // MANAGE_TASKS
const GERENTE_PROJETO = ["GERENTE_PROJETO"]; // MANAGE_TASKS

// Mundo em memória.
type Store = {
  tasks: Map<number, Task>;
  assignees: Map<number, number[]>;
  memberships: Map<number, number[]>;
  roles: Map<number, string[]>;
  reversals: Array<{ userId: number; taskId: number; projectId: number | null }>;
};

let store: Store;

function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return toTaskView({
    id: overrides.id,
    title: overrides.title ?? "Tarefa concluída",
    description: null,
    status: overrides.status ?? "done",
    priority: overrides.priority ?? "medium",
    assignedTo: overrides.assignedTo ?? 7,
    assigneeIds: overrides.assigneeIds ?? (overrides.assignedTo ?? 7 ? [overrides.assignedTo ?? 7] : []),
    projectId: overrides.projectId ?? 3,
    dueDate: overrides.dueDate ?? null,
    points: overrides.points ?? 10,
    completed: overrides.completed ?? true,
    completedAt: overrides.completedAt ?? new Date("2026-10-15T12:00:00.000Z"),
    taskVisibility: overrides.taskVisibility ?? "delegated",
    isGlobal: overrides.isGlobal ?? false,
    groupTaskId: overrides.groupTaskId ?? null,
    createdBy: overrides.createdBy ?? 1,
    subtasks: overrides.subtasks ?? [],
  });
}

function addTask(overrides: Partial<Task> & { id: number }): Task {
  const task = makeTask(overrides);
  store.tasks.set(task.id!, task);
  if (task.assignedTo) store.assignees.set(task.id!, [task.assignedTo]);
  return task;
}

function buildModule() {
  const tasks: TaskRepositoryPort = {
    async create(data) {
      const { subtasks: _ignored, ...rest } = data;
      const task = toTaskView({ ...rest, id: 100 });
      store.tasks.set(task.id!, task);
      return task;
    },
    async update(id, data) {
      const { subtasks: _ignored, ...rest } = data;
      const task = toTaskView({ ...rest, id });
      store.tasks.set(id, task);
      return task;
    },
    async findById(id) {
      return store.tasks.get(id) ?? null;
    },
    async findAll() {
      return [...store.tasks.values()];
    },
    async findByAssigneeId(userId) {
      return [...store.tasks.values()].filter((task) => task.assignedTo === userId);
    },
    async delete(id) {
      store.tasks.delete(id);
    },
  };

  const subtasks: TaskSubtasksPort = {
    async listByTaskId(taskId) {
      return [];
    },
    async listByTaskIds(taskIds) {
      const grouped = new Map<number, []>();
      for (const taskId of taskIds) grouped.set(taskId, []);
      return grouped;
    },
    async findById(subtaskId) {
      return null;
    },
    async countOpenByTaskId(taskId) {
      return 0;
    },
    async create(taskId, title) {
      return { id: 1, taskId, title, completed: false, completedAt: null, createdAt: new Date() };
    },
    async createMany(taskId, titles) {
      return titles.map((title) => ({ id: 1, taskId, title, completed: false, completedAt: null, createdAt: new Date() }));
    },
    async update(subtaskId, data) {
      return { id: subtaskId, taskId: 0, title: "", completed: false, completedAt: null, createdAt: new Date() };
    },
    async reorder(taskId, orderedIds) {
      return [];
    },
    async delete(subtaskId) {},
  };

  const assignees: TaskAssigneesPort = {
    isAvailable: () => true,
    async listUserIdsByTaskId(taskId) {
      return store.assignees.get(taskId) ?? [];
    },
    async listTaskIdsByUserId(userId) {
      return [...store.assignees.entries()].filter(([, ids]) => ids.includes(userId)).map(([id]) => id);
    },
    async listUserIdsByTaskIds(taskIds) {
      const map = new Map<number, number[]>();
      taskIds.forEach((id) => map.set(id, store.assignees.get(id) ?? []));
      return map;
    },
    async isUserAssigned(taskId, userId) {
      return (store.assignees.get(taskId) ?? []).includes(userId);
    },
    async replaceAssignees(taskId, userIds) {
      store.assignees.set(taskId, userIds);
    },
  };

  const actors = {
    async findById(id: number): Promise<TaskActorRecord | null> {
      const roles = store.roles.get(id);
      if (!roles) return null;
      return { id, name: `Usuário ${id}`, roles, completedTasks: 0 };
    },
    async incrementCompletedTasks(userId: number) {},
    async getUserProjectMemberships(userId: number) {
      return (store.memberships.get(userId) ?? []).map((projectId) => ({ projectId }));
    },
    async listActiveUsers() {
      return [];
    },
  };

  const projects: TaskProjectsPort = {
    async findById(id) {
      if (id !== 3) return null;
      return { id: 3, leaderId: 1, createdBy: 1 };
    },
  };

  const progress: TaskProgressPort = {
    isAvailable: () => false,
    async findByTaskAndUser() {
      return null;
    },
    async findByTaskIdsAndUser() {
      return [];
    },
    async upsert() {},
    async listCompletedByTaskIds() {
      return [];
    },
    async listSessionCompletionsByTaskIds() {
      return [];
    },
  };

  const notifications: TaskNotificationsPort = {
    async publishEvent() {
      return null;
    },
  };

  const events = {
    async onTaskCompleted() {
      return null;
    },
    async onTaskUncompleted(event: { userId: number; taskId: number; projectId: number | null }) {
      store.reversals.push(event);
      return 10;
    },
  };

  return createTaskManagementModule({ tasks, subtasks, assignees, actors, projects, progress, notifications, events });
}

let taskModule: ReturnType<typeof buildModule>;

beforeEach(() => {
  store = {
    tasks: new Map(),
    assignees: new Map(),
    memberships: new Map([[7, [3]], [8, [3]]]),
    roles: new Map([
      [1, COORDENADOR],
      [7, VOLUNTARIO], // responsável sem gestão
      [8, VOLUNTARIO],
      [9, GERENTE_PROJETO], // gestão de tarefa, não líder/criador do projeto
      [10, GERENTE], // gestão de tarefa
    ]),
    reversals: [],
  };
  taskModule = buildModule();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("S13 · R12 — só gestão de tarefa move a tarefa para fora de done", () => {
  it("responsável sem gestão: Forbidden ao tirar de done, e a tarefa não se move", async () => {
    addTask({ id: 60, status: "done", assignedTo: 7 });

    await expect(
      taskModule.updateTask({ taskId: 60, actor: userActor(7, VOLUNTARIO), data: { status: "in-progress" } }),
    ).rejects.toThrow(ForbiddenError);
    expect(store.tasks.get(60)!.status).toBe("done");
    expect(store.reversals).toHaveLength(0);
  });

  it("responsável sem gestão também não cai no fall-through com corpo extra", async () => {
    addTask({ id: 61, status: "done", assignedTo: 7 });

    await expect(
      taskModule.updateTask({ taskId: 61, actor: userActor(7, VOLUNTARIO), data: { status: "to-do", title: "reaberta" } }),
    ).rejects.toThrow(ForbiddenError);
    expect(store.tasks.get(61)!.status).toBe("done");
  });

  it("COORDENADOR move para in-progress: aceita, dispara a reversão do crédito do responsável", async () => {
    addTask({ id: 62, status: "done", assignedTo: 7 });

    const updated = await taskModule.updateTask({ taskId: 62, actor: userActor(1, COORDENADOR), data: { status: "in-progress" } });

    expect(updated.status).toBe("in-progress");
    expect(store.tasks.get(62)!.completed).toBe(false);
    expect(store.reversals).toEqual([{ userId: 7, taskId: 62, projectId: 3 }]);
  });

  it("GERENTE_PROJETO move de done: aceita (gerência de tarefa, não precisa ser líder do projeto)", async () => {
    addTask({ id: 63, status: "done", assignedTo: 7 });

    const updated = await taskModule.updateTask({ taskId: 63, actor: userActor(9, GERENTE_PROJETO), data: { status: "adjust" } });

    expect(updated.status).toBe("adjust");
    expect(store.reversals).toHaveLength(1);
  });

  it("criador/líder do projeto move: aceita mesmo sem papel de gestão global", async () => {
    // Líder do projeto 3 sem papel global (criador==líder==1), sem MANAGE_TASKS: cai no
    // fall-through com membership, e o gate de concluída libera o criador/líder.
    addTask({ id: 64, status: "done", assignedTo: 7 });

    const updated = await taskModule.updateTask({ taskId: 64, actor: userActor(1, []), data: { status: "to-do" } });

    expect(updated.status).toBe("to-do");
    expect(store.reversals).toHaveLength(1);
  });

  it("movimento que não sai de done não dispara reversão", async () => {
    addTask({ id: 65, status: "in-review", assignedTo: 7 });

    const updated = await taskModule.updateTask({ taskId: 65, actor: userActor(1, COORDENADOR), data: { status: "in-progress" } });

    expect(updated.status).toBe("in-progress");
    expect(store.reversals).toHaveLength(0);
  });
});

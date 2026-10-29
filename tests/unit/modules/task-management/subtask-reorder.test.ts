// @vitest-environment node
/**
 * S09 (plan-v11, R9) — ReorderTaskSubtasksUseCase sobre portas falsas, com o módulo REAL.
 *
 * Ordem medida e congelada em teste, como nos irmãos de V4-4: **ator → existência da mãe →
 * autoridade → janela → ids válidos → escrita**. Autoridade antes de estado (mesma precedência
 * 403-antes-de-409 do B6-2b), e a janela de edição da lista (DEC-80) governa a reordenação
 * também: arrastar é mexer na lista.
 *
 * Harness do arquivo irmão (subtask-use-cases.test.ts): mundo em memória, módulo real
 * (`createTaskManagementModule`), portas falsas. A porta nova `reorder` grava sortOrder por
 * posição no índice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  subtaskWindowMessage,
  toTaskView,
  userActor,
  type ISubtask,
  type Task,
} from "@/backend/domain";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import type { TaskActorRecord } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

type Row = { id: number; taskId: number; title: string; completed: boolean; completedAt: Date | null; createdAt: Date; sortOrder: number };

let rows: Row[];
let tasks: Map<number, Task>;
let seq: { subtask: number };

function addTask(overrides: Partial<Task> & { id: number }): Task {
  const task = toTaskView({
    id: overrides.id,
    title: overrides.title ?? "Tarefa mãe",
    description: null,
    status: overrides.status ?? "in-progress",
    priority: "medium",
    assignedTo: overrides.assignedTo ?? 7,
    assigneeIds: overrides.assigneeIds ?? [overrides.assignedTo ?? 7],
    projectId: overrides.projectId ?? 3,
    dueDate: null,
    points: overrides.points ?? 10,
    completed: overrides.completed ?? false,
    completedAt: null,
    taskVisibility: overrides.taskVisibility ?? "delegated",
    isGlobal: false,
    groupTaskId: null,
    createdBy: overrides.createdBy ?? 1,
    subtasks: [],
  });
  tasks.set(task.id!, task);
  return task;
}

function addSubtask(taskId: number, title: string): Row {
  const row = {
    id: ++seq.subtask,
    taskId,
    title,
    completed: false,
    completedAt: null,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    sortOrder: seq.subtask,
  };
  rows.push(row);
  return row;
}

function buildModule() {
  const tasksPort: TaskRepositoryPort = {
    async update(id, data) {
      const { subtasks: _ignored, ...rest } = data;
      const task = toTaskView({ ...rest, id });
      tasks.set(id, task);
      return task;
    },
    async findById(id) {
      return tasks.get(id) ?? null;
    },
    async findAll() {
      return [...tasks.values()];
    },
    async findByAssigneeId(userId) {
      return [...tasks.values()].filter((task) => task.assignedTo === userId);
    },
    async create(data) {
      return toTaskView({ ...data, id: 999 });
    },
    async delete(id) {
      tasks.delete(id);
    },
  };

  const subtasksPort: TaskSubtasksPort = {
    async listByTaskId(taskId) {
      return rows
        .filter((r) => r.taskId === taskId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((r) => ({ ...r }));
    },
    async listByTaskIds(taskIds) {
      const grouped = new Map<number, ISubtask[]>();
      for (const taskId of taskIds) grouped.set(taskId, await this.listByTaskId(taskId));
      return grouped;
    },
    async findById(subtaskId) {
      const r = rows.find((r) => r.id === subtaskId);
      return r ? { ...r } : null;
    },
    async countOpenByTaskId(taskId) {
      return rows.filter((r) => r.taskId === taskId && !r.completed).length;
    },
    async create(taskId, title) {
      const r = addSubtask(taskId, title);
      return { ...r };
    },
    async createMany(taskId, titles) {
      titles.forEach((title) => addSubtask(taskId, title));
      return await this.listByTaskId(taskId);
    },
    async update(subtaskId, data) {
      const r = rows.find((r) => r.id === subtaskId);
      if (!r) throw new Error("subtask inexistente no fake");
      if (data.title !== undefined) r.title = data.title;
      if (data.completed !== undefined) r.completed = data.completed;
      if (data.completedAt !== undefined) r.completedAt = data.completedAt;
      return { ...r };
    },
    async delete(subtaskId) {
      rows = rows.filter((r) => r.id !== subtaskId);
    },
    async reorder(taskId, orderedIds) {
      orderedIds.forEach((id, index) => {
        const r = rows.find((r) => r.id === id && r.taskId === taskId);
        if (!r) throw new Error("id fora da mãe no fake");
        r.sortOrder = index;
      });
      return await this.listByTaskId(taskId);
    },
  };

  const assignees: TaskAssigneesPort = {
    isAvailable: () => true,
    async listUserIdsByTaskId(taskId) {
      return [tasks.get(taskId)?.assignedTo ?? -1];
    },
    async listTaskIdsByUserId(userId) {
      return [...tasks.values()].filter((t) => t.assignedTo === userId).map((t) => t.id!);
    },
    async listUserIdsByTaskIds(taskIds) {
      const map = new Map<number, number[]>();
      taskIds.forEach((id) => map.set(id, [tasks.get(id)?.assignedTo ?? -1]));
      return map;
    },
    async isUserAssigned(taskId, userId) {
      return tasks.get(taskId)?.assignedTo === userId;
    },
    async replaceAssignees(taskId, userIds) {},
  };

  const actors = {
    async findById(id: number): Promise<TaskActorRecord | null> {
      const roles = id === 1 ? ["COORDENADOR"] : id === 7 ? ["VOLUNTARIO"] : id === 9 ? ["VOLUNTARIO"] : null;
      if (!roles) return null;
      return { id, name: `Usuário ${id}`, roles, completedTasks: 0 };
    },
    async incrementCompletedTasks(userId: number) {},
    async getUserProjectMemberships(userId: number) {
      return [];
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
    isAvailable: () => true,
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
    async publishEvent() {},
  };

  return createTaskManagementModule({
    tasks: tasksPort,
    assignees,
    progress,
    actors,
    projects,
    notifications,
    subtasks: subtasksPort,
    activities: { async findById() { return null; }, async listByProjectId() { return []; } } as never,
  });
}

const OWNER = userActor(7, ["VOLUNTARIO"]);
const GESTAO = userActor(1, ["COORDENADOR"]);
const ESTRANHO = userActor(9, ["VOLUNTARIO"]);

describe("ReorderTaskSubtasksUseCase (R9)", () => {
  beforeEach(() => {
    rows = [];
    tasks = new Map();
    seq = { subtask: 0 };
    addTask({ id: 501, assignedTo: 7 });
    addSubtask(501, "Ligar a fonte");
    addSubtask(501, "Ajustar o zero");
    addSubtask(501, "Medir o ruído");
  });

  it("dono reordena e a nova ordem fica gravada na porta", async () => {
    const module = buildModule();
    const ids = rows.map((r) => r.id); // A, B, C
    const result = await module.reorderTaskSubtasks({ taskId: 501, actorId: 7, orderedIds: [ids[1], ids[2], ids[0]] });
    expect(result.subtasks.map((s) => s.title)).toEqual(["Ajustar o zero", "Medir o ruído", "Ligar a fonte"]);
    expect(rows.find((r) => r.id === ids[1])!.sortOrder).toBe(0);
    expect(rows.find((r) => r.id === ids[0])!.sortOrder).toBe(2);
  });

  it("gestão do projeto também reordena", async () => {
    const module = buildModule();
    const ids = rows.map((r) => r.id);
    const result = await module.reorderTaskSubtasks({ taskId: 501, actorId: 1, orderedIds: [ids[2], ids[0], ids[1]] });
    expect(result.subtasks.map((s) => s.title)).toEqual(["Medir o ruído", "Ligar a fonte", "Ajustar o zero"]);
  });

  it("estranho sem autoridade recebe Forbidden, antes de qualquer leitura de estado", async () => {
    const module = buildModule();
    const ids = rows.map((r) => r.id);
    await expect(
      module.reorderTaskSubtasks({ taskId: 501, actorId: 9, orderedIds: [ids[1], ids[0], ids[2]] })
    ).rejects.toThrow(ForbiddenError);
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3]); // nada foi escrito
  });

  it("mãe em done: janela da lista responde com 409 e a frase congelada (DEC-80)", async () => {
    const module = buildModule();
    tasks.get(501)!.status = "done";
    const ids = rows.map((r) => r.id);
    await expect(
      module.reorderTaskSubtasks({ taskId: 501, actorId: 1, orderedIds: [ids[1], ids[2], ids[0]] })
    ).rejects.toThrow(subtaskWindowMessage("done"));
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3]);
  });

  it("ids que não são a lista exata são recusados (400)", async () => {
    const module = buildModule();
    const ids = rows.map((r) => r.id);
    await expect(
      module.reorderTaskSubtasks({ taskId: 501, actorId: 7, orderedIds: [ids[0], ids[1]] })
    ).rejects.toThrow(ValidationError);
    await expect(
      module.reorderTaskSubtasks({ taskId: 501, actorId: 7, orderedIds: [ids[0], ids[0], ids[2]] })
    ).rejects.toThrow(ValidationError);
    await expect(
      module.reorderTaskSubtasks({ taskId: 501, actorId: 7, orderedIds: [ids[0], ids[1], 999] })
    ).rejects.toThrow(ValidationError);
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3]);
  });

  it("mãe inexistente: 404 antes da autoridade", async () => {
    const module = buildModule();
    await expect(
      module.reorderTaskSubtasks({ taskId: 404, actorId: 1, orderedIds: [1] })
    ).rejects.toThrow(NotFoundError);
  });
});

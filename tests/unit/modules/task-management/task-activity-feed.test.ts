// @vitest-environment node
/**
 * Feed "Atividade recente" — o ponto de escrita e o MODULO (os metodos mutadores), nao os use
 * cases. Este arquivo congela o que o modulo faz com a porta `activity` injetada:
 *
 *   1. criar tarefa grava CREATE com o status de destino;
 *   2. mover status grava MOVE; editar SEM status (so titulo) NAO grava nada — o feed nao vira
 *      diario de renomeio;
 *   3. concluir grava COMPLETE so quando o status resultante e "done" (quest global/publica);
 *      quando o servidor devolve "in-review" (tarefa de projeto), grava MOVE — o feed nao pode
 *      dizer "concluiu" antes da aprovacao (dono, 2026-10-19); aprovar grava COMPLETE (com o
 *      approverId, que nao e ator); rejeitar grava MOVE;
 *   4. sem porta injetada (roundtrip G4, testes de use case) nada e gravido e `listActivity`
 *      devolve lista vazia — o modulo nao pode quebrar por falta de bucket de atividade;
 *   5. `listActivity` e so a leitura da porta (o modulo nao rearitmética nada).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { toTaskView, userActor, type Task } from "@/backend/domain";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import type { TaskActorRecord } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type {
  TaskActivitiesPort,
  TaskActivityRecord,
} from "@/backend/modules/task-management/application/ports/task-activities.port";
import type {
  TaskActivityEntry,
  TaskActivityItem,
  TaskActivityPort,
} from "@/backend/modules/task-management/application/ports/task-activity.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

const PROJECT = 3;
const coordinatorActor = () => userActor(1, ["COORDENADOR"]);

let tasks: Map<number, Task>;
let appended: TaskActivityEntry[];
let seq: { task: number };
let purgedCutoffs: Date[];
let purgedCount: number;
let returnedSince: Date | undefined;

function buildModule(withActivity: boolean) {
  const taskRepo: TaskRepositoryPort = {
    async create(data) {
      const { subtasks: _ignored, ...rest } = data;
      const task = toTaskView({ ...rest, id: ++seq.task });
      tasks.set(task.id!, task);
      return task;
    },
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
    async delete(id) {
      tasks.delete(id);
    },
  };

  const activities: TaskActivitiesPort = {
    async findActivityById(activityId) {
      return { id: activityId, projectId: PROJECT } satisfies TaskActivityRecord;
    },
  };

  const subtasks: TaskSubtasksPort = {
    async listByTaskId() {
      return [];
    },
    async listByTaskIds() {
      return new Map();
    },
    async findById() {
      return null;
    },
    async countOpenByTaskId() {
      return 0;
    },
    async create() {
      throw new Error("subtask nao e assunto deste arquivo");
    },
    async createMany() {
      throw new Error("subtask nao e assunto deste arquivo");
    },
    async update() {
      throw new Error("subtask nao e assunto deste arquivo");
    },
    async delete() {
      throw new Error("subtask nao e assunto deste arquivo");
    },
  };

  const assignees: TaskAssigneesPort = {
    isAvailable: () => true,
    async listUserIdsByTaskId() {
      return [];
    },
    async listTaskIdsByUserId() {
      return [];
    },
    async listUserIdsByTaskIds() {
      return new Map();
    },
    async isUserAssigned() {
      return false;
    },
    async replaceAssignees() {},
  };

  const actors = {
    async findById(id: number): Promise<TaskActorRecord | null> {
      if (id !== 1) return null;
      return { id, name: "Coordenador", roles: ["COORDENADOR"], completedTasks: 0 };
    },
    async incrementCompletedTasks() {},
    async getUserProjectMemberships() {
      return [];
    },
    async listActiveUsers() {
      return [];
    },
  };

  const projects: TaskProjectsPort = {
    async findById(id) {
      if (id !== PROJECT) return null;
      return { id, leaderId: 1, createdBy: 1 };
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

  const activity: TaskActivityPort = {
    async append(entry) {
      appended.push(entry);
    },
    async listRecent(limit, since): Promise<TaskActivityItem[]> {
      const items: TaskActivityItem[] = [
        {
          id: 1,
          action: "CREATE",
          taskId: 1,
          taskTitle: "Lida",
          toStatus: "to-do",
          actorId: 1,
          actorName: "Coordenador",
          at: "2026-10-16T12:00:00.000Z",
        },
      ];
      if (since) returnedSince = since;
      return items.slice(0, limit);
    },
    async purgeOlderThan(cutoff) {
      purgedCutoffs.push(cutoff);
      return purgedCount;
    },
  };

  return createTaskManagementModule({
    tasks: taskRepo,
    subtasks,
    assignees,
    actors,
    projects,
    progress,
    notifications,
    activities,
    activity: withActivity ? activity : undefined,
  });
}

type TaskModule = ReturnType<typeof buildModule>;

// O corpo de criacao e parcial no teste (a rota tambem e); o `as never` e o mesmo do molde
// task-activity-link.test.ts — o use case normaliza e preenche o resto.
const createTask = (mod: TaskModule, data: Record<string, unknown>, actor = coordinatorActor()) =>
  mod.createTask(data as never, actor);

beforeEach(() => {
  tasks = new Map();
  appended = [];
  seq = { task: 0 };
  purgedCutoffs = [];
  purgedCount = 0;
  returnedSince = undefined;
});

describe("registro de atividade no modulo (porta injetada)", () => {
  it("criar tarefa grava CREATE com o status de destino", async () => {
    const mod = buildModule(true);
    const task = await createTask(mod, { title: "Nova etapa", projectId: PROJECT });

    expect(appended).toEqual([
      { taskId: task.id, taskTitle: "Nova etapa", actorId: 1, action: "CREATE", toStatus: task.status },
    ]);
  });

  it("mudar status grava MOVE com o status resultante", async () => {
    const mod = buildModule(true);
    const task = await createTask(mod, { title: "Tarefa", projectId: PROJECT });
    appended.length = 0;

    await mod.updateTask({ actor: coordinatorActor(), taskId: task.id!, data: { status: "in-progress" } });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ action: "MOVE", taskId: task.id, toStatus: "in-progress", actorId: 1 });
  });

  it("editar SEM status (so titulo) nao grava nada — o feed nao e diario de renomeio", async () => {
    const mod = buildModule(true);
    const task = await createTask(mod, { title: "Tarefa", projectId: PROJECT });
    appended.length = 0;

    await mod.updateTask({ actor: coordinatorActor(), taskId: task.id!, data: { title: "Renomeada" } });

    expect(appended).toEqual([]);
  });

  it("concluir tarefa de projeto (cai em Em Revisao) grava MOVE, nao COMPLETE — a conclusao de fato e a aprovacao (dono, 2026-10-19)", async () => {
    const mod = buildModule(true);
    const task = await createTask(mod, { title: "Concluir", projectId: PROJECT, status: "in-progress" });
    appended.length = 0;

    const result = await mod.completeTask({ actor: coordinatorActor(), taskId: task.id! });

    expect(result.task.status).toBe("in-review");
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ action: "MOVE", taskId: task.id, toStatus: "in-review", actorId: 1 });
  });

  it("concluir quest global (cai em Concluido) grava COMPLETE com o status resultante", async () => {
    const mod = buildModule(true);
    const task = await createTask(mod, { title: "Quest global", isGlobal: true, status: "in-progress" });
    appended.length = 0;

    const result = await mod.completeTask({ actor: coordinatorActor(), taskId: task.id! });

    expect(result.task.status).toBe("done");
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ action: "COMPLETE", taskId: task.id, toStatus: "done", actorId: 1 });
  });

  it("aprovar grava COMPLETE usando o approverId (que nao e ator)", async () => {
    const mod = buildModule(true);
    const task = await createTask(mod, { title: "Aprovar", projectId: PROJECT, status: "in-review" });
    appended.length = 0;

    const result = await mod.approveTask({ taskId: task.id!, approverId: 1 });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ action: "COMPLETE", taskId: task.id, toStatus: result.task.status, actorId: 1 });
  });

  it("rejeitar grava MOVE", async () => {
    const mod = buildModule(true);
    const task = await createTask(mod, { title: "Rejeitar", projectId: PROJECT, status: "in-review" });
    appended.length = 0;

    const updated = await mod.rejectTask({ taskId: task.id!, approverId: 1, reason: "falta prova" });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ action: "MOVE", taskId: task.id, toStatus: updated.status, actorId: 1 });
  });
});

describe("sem porta de atividade (roundtrip G4, testes de use case)", () => {
  it("o modulo nao quebra e listActivity devolve lista vazia", async () => {
    const mod = buildModule(false);
    const task = await createTask(mod, { title: "Sem feed", projectId: PROJECT });

    expect(task.id).toBeTruthy();
    await expect(mod.listActivity(10)).resolves.toEqual([]);
  });

  it("a limpeza vira no-op (0) — nao ha bucket de atividade para limpar", async () => {
    const mod = buildModule(false);
    await expect(mod.purgeTaskActivity(new Date("2026-10-17T03:00:00.000Z"))).resolves.toBe(0);
  });
});

describe("listActivity e a leitura da porta", () => {
  it("devolve o que a porta lista, sem o modulo rearitmética", async () => {
    const mod = buildModule(true);
    const items = await mod.listActivity(5);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: "CREATE", taskTitle: "Lida", actorName: "Coordenador" });
  });

  it("repassa o corte do dia corrente para a porta (V6-11k: o feed e so de hoje)", async () => {
    const mod = buildModule(true);
    const since = new Date("2026-10-17T03:00:00.000Z");

    await mod.listActivity(5, since);

    expect(returnedSince).toEqual(since);
  });
});

describe("purgeTaskActivity e a limpeza da porta (V6-11k)", () => {
  it("repassa o corte do cron e devolve quantos registros saíram", async () => {
    const mod = buildModule(true);
    purgedCount = 7;
    const cutoff = new Date("2026-10-17T03:00:00.000Z");

    const removed = await mod.purgeTaskActivity(cutoff);

    expect(removed).toBe(7);
    expect(purgedCutoffs).toEqual([cutoff]);
  });
});

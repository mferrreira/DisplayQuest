// @vitest-environment node
/**
 * V5-6 (DEC-99) — a ligação da tarefa com a linha do cronograma, sobre o MÓDULO REAL com portas
 * falsas (a lição medida do B6-2a: duplo de módulo faz a recusa SUMIR do teste em vez de falhar).
 *
 * O que este arquivo congela:
 *   1. A ligação é decidida ANTES de qualquer escrita. Uma recusa não deixa tarefa nascida sem
 *      vínculo — deixa nenhuma tarefa. No fan-out individual isso importa duas vezes: N tarefas
 *      com vínculo inválido seriam N linhas erradas.
 *   2. A checagem é de PROJETO, não de existência: atividade que existe mas é de outro projeto é
 *      recusada nomeando o motivo. A FK do schema não decide isso (ela não sabe qual projeto a
 *      tarefa declara).
 *   3. `activityId` ausente no corpo do update não apaga o vínculo. O corpo é parcial.
 *   4. Id com forma inválida é recusado nomeando o campo, e a porta de atividade NEM é consultada
 *      (sem isso, `Number("abc")` viraria NaN e o erro viria do Prisma, não da regra).
 *   5. O gate de campo continua decidindo sobre o corpo CRU: `activityId` de quem não tem
 *      MANAGE_TASKS barra com 403, como `{points: 5}` barra hoje.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  NotFoundError,
  TASK_ACTIVITY_GLOBAL_MESSAGE,
  TASK_ACTIVITY_INVALID_MESSAGE,
  TASK_ACTIVITY_NOT_FOUND_MESSAGE,
  TASK_ACTIVITY_PROJECT_MESSAGE,
  ValidationError,
  resolveTaskActivityLink,
  toTaskView,
  userActor,
  type Task,
} from "@/backend/domain";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import type { TaskActorRecord } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type {
  TaskActivitiesPort,
  TaskActivityRecord,
} from "@/backend/modules/task-management/application/ports/task-activities.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

const PROJECT = 3;
const OTHER_PROJECT = 5;
const ACTIVITY = 40; // do PROJECT
const FOREIGN_ACTIVITY = 41; // do OTHER_PROJECT

const coordinatorActor = () => userActor(1, ["COORDENADOR"]);
const voluntarioActor = () => userActor(7, ["VOLUNTARIO"]);

type Store = {
  tasks: Map<number, Task>;
  activities: Map<number, TaskActivityRecord>;
  assignees: Map<number, number[]>;
  roles: Map<number, string[]>;
  activityLookups: number[];
};

let store: Store;
let seq: { task: number };

function buildModule() {
  const tasks: TaskRepositoryPort = {
    // O adaptador real escreve a lista fixa de colunas; o fake espelha `toRow` inclusive no
    // que ele IGNORA (subtasks não é coluna de tasks).
    async create(data) {
      const { subtasks: _ignored, ...rest } = data;
      const task = toTaskView({ ...rest, id: ++seq.task });
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

  const activities: TaskActivitiesPort = {
    async findActivityById(activityId) {
      store.activityLookups.push(activityId);
      return store.activities.get(activityId) ?? null;
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
      throw new Error("subtask não é assunto deste arquivo");
    },
    async createMany() {
      throw new Error("subtask não é assunto deste arquivo");
    },
    async update() {
      throw new Error("subtask não é assunto deste arquivo");
    },
async reorder(taskId: number, orderedIds: number[]) {
      return await this.listByTaskId(taskId)
    },
        async delete() {
      throw new Error("subtask não é assunto deste arquivo");
    },
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
    async incrementCompletedTasks() {},
    async getUserProjectMemberships(userId: number) {
      return userId === 7 || userId === 8 ? [{ projectId: PROJECT }] : [];
    },
    async listActiveUsers() {
      return [];
    },
  };

  const projects: TaskProjectsPort = {
    async findById(id) {
      if (id !== PROJECT && id !== OTHER_PROJECT) return null;
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

  return createTaskManagementModule({
    tasks,
    subtasks,
    assignees,
    actors,
    projects,
    progress,
    notifications,
    activities,
  });
}

let taskModule: ReturnType<typeof buildModule>;

beforeEach(() => {
  store = {
    tasks: new Map(),
    activities: new Map([
      [ACTIVITY, { id: ACTIVITY, projectId: PROJECT }],
      [FOREIGN_ACTIVITY, { id: FOREIGN_ACTIVITY, projectId: OTHER_PROJECT }],
    ]),
    assignees: new Map(),
    roles: new Map([
      [1, ["COORDENADOR"]],
      [7, ["VOLUNTARIO"]],
      [8, ["VOLUNTARIO"]],
    ]),
    activityLookups: [],
  };
  seq = { task: 0 };
  taskModule = buildModule();
});

const createTask = (data: Record<string, unknown>, actor = coordinatorActor()) =>
  taskModule.createTask(data as never, actor);

describe("criação de tarefa com linha do cronograma", () => {
  it("grava a chave da atividade na tarefa", async () => {
    const task = await createTask({ title: "Ler os artigos da etapa", projectId: PROJECT, activityId: ACTIVITY });

    expect(task.activityId).toBe(ACTIVITY);
    expect(store.tasks.size).toBe(1);
  });

  it("sem atividade no corpo a tarefa nasce sem vínculo", async () => {
    const task = await createTask({ title: "Tarefa solta", projectId: PROJECT });

    expect(task.activityId).toBeNull();
  });

  it("atividade de outro projeto é recusada nomeando o motivo, e nenhuma tarefa nasce", async () => {
    await expect(
      createTask({ title: "Tarefa atravessada", projectId: PROJECT, activityId: FOREIGN_ACTIVITY }),
    ).rejects.toThrow(TASK_ACTIVITY_PROJECT_MESSAGE);

    // A recusa é antes da escrita: não existe "tarefa criada sem vínculo" como resíduo.
    expect(store.tasks.size).toBe(0);
  });

  it("atividade inexistente é NotFound", async () => {
    await expect(
      createTask({ title: "Tarefa órfã", projectId: PROJECT, activityId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(store.tasks.size).toBe(0);
  });

  it("quest global não tem atividade do cronograma", async () => {
    await expect(
      createTask({ title: "Quest com etapa", isGlobal: true, activityId: ACTIVITY }),
    ).rejects.toThrow(TASK_ACTIVITY_GLOBAL_MESSAGE);

    expect(store.tasks.size).toBe(0);
  });

  it("id com forma inválida é recusado nomeando o campo, sem consultar a porta", async () => {
    await expect(
      createTask({ title: "Tarefa com lixo no campo", projectId: PROJECT, activityId: "abc" }),
    ).rejects.toThrow(TASK_ACTIVITY_INVALID_MESSAGE);

    // Sem esta ordem o erro viria do Prisma (`NaN` no where), não da regra.
    expect(store.activityLookups).toEqual([]);
    expect(store.tasks.size).toBe(0);
  });

  it("o fan-out individual propaga o MESMO vínculo às N cópias", async () => {
    const first = await createTask({
      title: "Etapa para dois bolsistas",
      projectId: PROJECT,
      activityId: ACTIVITY,
      assigneeIds: [7, 8],
      creationMode: "individual",
    });

    const created = [...store.tasks.values()];
    expect(created).toHaveLength(2);
    expect(created.map((task) => task.activityId)).toEqual([ACTIVITY, ACTIVITY]);
    expect(first.activityId).toBe(ACTIVITY);
  });

  it("o fan-out individual com vínculo inválido não cria nenhuma das N", async () => {
    await expect(
      createTask({
        title: "Etapa atravessada para dois",
        projectId: PROJECT,
        activityId: FOREIGN_ACTIVITY,
        assigneeIds: [7, 8],
        creationMode: "individual",
      }),
    ).rejects.toThrow(TASK_ACTIVITY_PROJECT_MESSAGE);

    expect(store.tasks.size).toBe(0);
  });
});

describe("edição do vínculo", () => {
  beforeEach(async () => {
    // A tarefa já nasce com o vínculo: `createTask` escreve no store pela porta fake, que
    // espelha `toRow` do adaptador. Reescrever por fora seria montar estado que o sistema
    // nunca montaria.
    await createTask({ title: "Etapa marcada", projectId: PROJECT, activityId: ACTIVITY });
  });

  it("corpo sem activityId não apaga o vínculo (o corpo é parcial)", async () => {
    const taskId = [...store.tasks.keys()][0];

    const updated = await taskModule.updateTask({
      actor: coordinatorActor(),
      taskId,
      data: { title: "Etapa marcada (renomeada)" },
    });

    expect(updated.title).toBe("Etapa marcada (renomeada)");
    expect(updated.activityId).toBe(ACTIVITY);
  });

  it("activityId nulo no corpo desliga a tarefa da etapa", async () => {
    const taskId = [...store.tasks.keys()][0];

    const updated = await taskModule.updateTask({
      actor: coordinatorActor(),
      taskId,
      data: { activityId: null },
    });

    expect(updated.activityId).toBeNull();
  });

  it("atividade de outro projeto recusa e não escreve a metade que era válida", async () => {
    const taskId = [...store.tasks.keys()][0];

    await expect(
      taskModule.updateTask({
        actor: coordinatorActor(),
        taskId,
        data: { title: "Título novo", activityId: FOREIGN_ACTIVITY },
      }),
    ).rejects.toThrow(TASK_ACTIVITY_PROJECT_MESSAGE);

    // A garantia é do use case: ele mergeia sobre cópia e só chama `update` depois de decidir
    // todos os campos. Provar aqui é provar a compensação, não a função pura.
    const untouched = store.tasks.get(taskId)!;
    expect(untouched.title).toBe("Etapa marcada");
    expect(untouched.activityId).toBe(ACTIVITY);
  });

  it("quem não tem MANAGE_TASKS com activityId no corpo leva 403 (gate sobre o corpo cru)", async () => {
    const taskId = [...store.tasks.keys()][0];

    await expect(
      taskModule.updateTask({
        actor: voluntarioActor(),
        taskId,
        data: { activityId: ACTIVITY },
      }),
    ).rejects.toThrow("Sem permissão para editar tarefa");
  });
});

describe("a regra pura da ligação", () => {
  const activity = { id: ACTIVITY, projectId: PROJECT };

  it("ausente, nulo e vazio são a mesma coisa: sem vínculo", () => {
    for (const value of [undefined, null, ""]) {
      expect(resolveTaskActivityLink({ activityId: value, activity: null, projectId: PROJECT, isGlobal: false })).toBeNull();
    }
  });

  it("a atividade do mesmo projeto devolve o id dela, não o id recebido", () => {
    // É o que impede `activityId: "40"` (string do corpo) de virar string na coluna.
    expect(resolveTaskActivityLink({ activityId: "40", activity, projectId: PROJECT, isGlobal: false })).toBe(ACTIVITY);
  });

  it("tarefa sem projeto não pode apontar para etapa de projeto", () => {
    expect(() =>
      resolveTaskActivityLink({ activityId: ACTIVITY, activity, projectId: null, isGlobal: false }),
    ).toThrow(ValidationError);
  });
});

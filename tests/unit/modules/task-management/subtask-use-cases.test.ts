// @vitest-environment node
/**
 * plan-v4 · V4-4 — os casos de uso de subtask e os três pontos onde a trava entra nos casos
 * de uso que já existiam (`updateTask`, `completeTask`, `approveTask`).
 *
 * Escrito ANTES do código. Cobertura nova de propósito: o módulo `task-management` não tinha
 * teste nenhum de caso de uso sobre portas falsas — só regras puras (`domain.*.test.ts`) e o
 * roundtrip G4 com Prisma real. A trava é exatamente o tipo de regra que precisa ser provada
 * sem banco, porque o que ela faz é **não escrever**.
 *
 * As portas são todas falsas e o módulo é o REAL (`createTaskManagementModule`), então quem
 * decide é o código de produção (a lição medida do B6-2a: duplo de módulo faz a recusa sumir
 * do teste em vez de falhar).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, ValidationError, toTaskView, userActor, type ISubtask, type Task } from "@/backend/domain";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import type { CreateTaskCommand } from "@/backend/modules/task-management/application/contracts";
import type { TaskActorRecord } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

// ---------------------------------------------------------------------------
// Mundo em memória
// ---------------------------------------------------------------------------

const VOLUNTARIO = ["VOLUNTARIO"];
const COORDENADOR = ["COORDENADOR"]; // MANAGE_USERS
const GERENTE_PROJETO = ["GERENTE_PROJETO"];
// B6-7 (D4): createTask passou a exigir ActorRef com MANAGE_TASKS (o gate da rota POST,
// congelado "Sem permissão para criar tarefa"). O criador do fixture e o coordenador 1.
const coordinatorActor = () => userActor(1, COORDENADOR);

type Store = {
  tasks: Map<number, Task>;
  subtasks: Map<number, ISubtask & { id: number; taskId: number }>;
  assignees: Map<number, number[]>;
  memberships: Map<number, number[]>; // userId -> projectIds
  roles: Map<number, string[]>;
  published: Array<{ eventType: string; audience: number[] }>;
  awards: Array<{ userId: number; taskId: number; taskPoints: number }>;
  completedTasks: number[];
};

let store: Store;
let seq: { task: number; subtask: number };

function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return toTaskView({
    id: overrides.id,
    title: overrides.title ?? "Tarefa mãe",
    description: null,
    status: overrides.status ?? "in-progress",
    priority: overrides.priority ?? "medium",
    assignedTo: overrides.assignedTo ?? 7,
    assigneeIds: overrides.assigneeIds ?? (overrides.assignedTo ?? 7 ? [overrides.assignedTo ?? 7] : []),
    projectId: overrides.projectId ?? 3,
    dueDate: overrides.dueDate ?? null,
    points: overrides.points ?? 10,
    completed: overrides.completed ?? false,
    completedAt: overrides.completedAt ?? null,
    taskVisibility: overrides.taskVisibility ?? "delegated",
    isGlobal: overrides.isGlobal ?? false,
    groupTaskId: overrides.groupTaskId ?? null,
    createdBy: overrides.createdBy ?? 1,
    subtasks: overrides.subtasks ?? [],
  });
}

function addTask(overrides: Partial<Task> & { id: number }) {
  const task = makeTask(overrides);
  store.tasks.set(task.id!, task);
  if (task.assignedTo) store.assignees.set(task.id!, [task.assignedTo]);
  return task;
}

function addSubtask(taskId: number, title: string, completed = false, completedAt: Date | null = null) {
  const row = { id: ++seq.subtask, taskId, title, completed, completedAt, createdAt: new Date("2026-10-01T12:00:00.000Z") };
  store.subtasks.set(row.id, row);
  return row;
}

function buildModule() {
  const tasks: TaskRepositoryPort = {
    // O adaptador real escreve uma lista fixa de colunas e IGNORA `subtasks` (toRow em
    // prisma-task.repository.ts). O fake espelha isso: subtask não é coluna de tasks.
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

  const subtasks: TaskSubtasksPort = {
    async listByTaskId(taskId) {
      return [...store.subtasks.values()].filter((row) => row.taskId === taskId).sort((a, b) => a.id - b.id);
    },
    async listByTaskIds(taskIds) {
      const grouped = new Map<number, ISubtask[]>();
      for (const taskId of taskIds) grouped.set(taskId, await this.listByTaskId(taskId));
      return grouped;
    },
    async findById(subtaskId) {
      return store.subtasks.get(subtaskId) ?? null;
    },
    async countOpenByTaskId(taskId) {
      return [...store.subtasks.values()].filter((row) => row.taskId === taskId && !row.completed).length;
    },
    async create(taskId, title) {
      return addSubtask(taskId, title);
    },
    async createMany(taskId, titles) {
      titles.forEach((title) => addSubtask(taskId, title));
      return await this.listByTaskId(taskId);
    },
    async update(subtaskId, data) {
      const row = store.subtasks.get(subtaskId);
      if (!row) throw new Error("subtask inexistente no fake");
      const next = { ...row };
      if (data.title !== undefined) next.title = data.title;
      if (data.completed !== undefined) next.completed = data.completed;
      if (data.completedAt !== undefined) next.completedAt = data.completedAt;
      store.subtasks.set(subtaskId, next);
      return next;
    },
    async delete(subtaskId) {
      store.subtasks.delete(subtaskId);
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
    async incrementCompletedTasks(userId: number) {
      store.completedTasks.push(userId);
    },
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
    async publishEvent(event) {
      store.published.push({ eventType: event.eventType, audience: event.audience.userIds });
      return null;
    },
  };

  const events = {
    async onTaskCompleted(event: { userId: number; taskId: number; taskPoints: number }) {
      store.awards.push(event);
      return event.taskPoints;
    },
  };

  return createTaskManagementModule({ tasks, subtasks, assignees, actors, projects, progress, notifications, events });
}

let taskModule: ReturnType<typeof buildModule>;

beforeEach(() => {
  // Os casos de uso chamam `new Date()` (o domínio recebe `now` por parâmetro; os casos de uso
  // são o lugar onde o relógio entra). Congelar é o que permite provar a penalidade de atraso.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
  store = {
    tasks: new Map(),
    subtasks: new Map(),
    assignees: new Map(),
    memberships: new Map([[7, [3]], [8, [3]]]),
    roles: new Map([
      [1, COORDENADOR],
      [7, VOLUNTARIO],
      [8, VOLUNTARIO],
      [9, GERENTE_PROJETO],
      [11, VOLUNTARIO], // não é do projeto nem responsável
    ]),
    published: [],
    awards: [],
    completedTasks: [],
  };
  seq = { task: 0, subtask: 0 };
  taskModule = buildModule();
});

afterEach(() => {
  vi.useRealTimers();
});

const createSubtask = (taskId: number, actorId: number, title: string) =>
  taskModule.createTaskSubtask({ taskId, actorId, title });
const updateSubtask = (command: { taskId: number; subtaskId: number; actorId: number; title?: string; completed?: boolean }) =>
  taskModule.updateTaskSubtask(command);
const deleteSubtask = (taskId: number, subtaskId: number, actorId: number) =>
  taskModule.deleteTaskSubtask({ taskId, subtaskId, actorId });

/** `CreateTaskCommand` é o contrato do módulo e exige as colunas todas; o teste só quer falar de subtask. */
function newTask(overrides: Partial<CreateTaskCommand> & { title: string }): CreateTaskCommand {
  return {
    description: null,
    status: "to-do",
    priority: "medium",
    assignedTo: null,
    assigneeIds: undefined,
    projectId: null,
    dueDate: null,
    completed: false,
    taskVisibility: "delegated",
    isGlobal: false,
    groupTaskId: null,
    createdBy: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("V4-4 · criar subtask junto com a mãe", () => {
  it("a base gravada em tasks.points passa a ser 10 + 5·n (DEC-97)", async () => {
    const task = await taskModule.createTask(
      newTask({ title: "Montar a bancada", assignedTo: 7, projectId: 3, subtasks: [{ title: "Comprar parafusos" }, { title: "Ajustar o suporte" }] }),
      coordinatorActor(),
    );

    expect(task.points).toBe(20);
    expect(store.subtasks.size).toBe(2);
  });

  it("sem subtask a mãe vale exatamente 10 como antes", async () => {
    const task = await taskModule.createTask(newTask({ title: "Sem subtask", assignedTo: 7, projectId: 3 }), coordinatorActor());
    expect(task.points).toBe(10);
  });

  it("modo individual: cada cópia recebe as SUAS subtasks, cada uma com trava e prêmio próprios", async () => {
    await taskModule.createTask(
      newTask({ title: "Limpeza", projectId: 3, assigneeIds: [7, 8], creationMode: "individual", subtasks: [{ title: "Desligar equipamentos" }] }),
      coordinatorActor(),
    );

    const tasks = [...store.tasks.values()];
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.points)).toEqual([15, 15]);
    const byTask = [...store.subtasks.values()];
    expect(byTask).toHaveLength(2);
    expect(new Set(byTask.map((row) => row.taskId))).toEqual(new Set(tasks.map((task) => task.id)));
  });

  it("título vazio é recusado antes de qualquer escrita", async () => {
    await expect(
      taskModule.createTask(newTask({ title: "Com subtask ruim", assignedTo: 7, projectId: 3, subtasks: [{ title: "   " }] }), coordinatorActor()),
    ).rejects.toThrow(ValidationError);
    expect(store.tasks.size).toBe(0);
  });

  it("tarefa pública e quest global não têm subtask (D-D)", async () => {
    await expect(
      taskModule.createTask(newTask({ title: "Pública", projectId: 3, taskVisibility: "public", subtasks: [{ title: "x" }] }), coordinatorActor()),
    ).rejects.toThrow(ValidationError);
    await expect(
      taskModule.createTask(newTask({ title: "Global", isGlobal: true, subtasks: [{ title: "x" }] }), coordinatorActor()),
    ).rejects.toThrow(ValidationError);
  });

  it("criar subtask depois da mãe: a base da mãe é sincronizada (DEC-97)", async () => {
    const mother = addTask({ id: 40, points: 10 });
    const result = await createSubtask(mother.id!, 7, "Ler o protocolo");

    expect(result.subtask.title).toBe("Ler o protocolo");
    expect(result.subtask.completed).toBe(false);
    expect(store.tasks.get(40)!.points).toBe(15);
  });
});

describe("V4-4 · DEC-57 — a trava nos três caminhos que terminam a mãe", () => {
  it("PUT status → Em Revisão com subtask aberta: 400 dizendo quantas faltam, e a mãe não se move", async () => {
    const mother = addTask({ id: 41, status: "in-progress" });
    addSubtask(41, "Uma aberta", false);
    addSubtask(41, "Outra aberta", false);

    await expect(taskModule.updateTask({ taskId: 41, actor: userActor(7, VOLUNTARIO), data: { status: "in-review" } })).rejects.toThrow(/as 2 subtasks restantes/);
    expect(store.tasks.get(41)!.status).toBe("in-progress");
  });

  it("a trava vale vindo de A Fazer também — fecha o atalho do quadro", async () => {
    const mother = addTask({ id: 42, status: "to-do" });
    addSubtask(42, "Aberta", false);

    await expect(taskModule.updateTask({ taskId: 42, actor: userActor(7, VOLUNTARIO), data: { status: "in-review" } })).rejects.toThrow(ValidationError);
    await expect(taskModule.updateTask({ taskId: 42, actor: userActor(1, COORDENADOR), data: { status: "done" } })).rejects.toThrow(ValidationError);
  });

  it("voltar para A Fazer, Em Andamento ou Ajustes com subtask aberta é livre", async () => {
    addTask({ id: 43, status: "in-progress" });
    addSubtask(43, "Aberta", false);

    expect((await taskModule.updateTask({ taskId: 43, actor: userActor(7, VOLUNTARIO), data: { status: "adjust" } })).status).toBe("adjust");
    expect((await taskModule.updateTask({ taskId: 43, actor: userActor(7, VOLUNTARIO), data: { status: "to-do" } })).status).toBe("to-do");
    expect((await taskModule.updateTask({ taskId: 43, actor: userActor(7, VOLUNTARIO), data: { status: "in-progress" } })).status).toBe("in-progress");
  });

  it("concluir (PATCH complete) com subtask aberta é recusado", async () => {
    addTask({ id: 44, status: "in-progress" });
    addSubtask(44, "Aberta", false);

    await expect(taskModule.completeTask({ taskId: 44, actor: userActor(7, VOLUNTARIO), userId: 7 })).rejects.toThrow(/a subtask restante/);
    expect(store.tasks.get(44)!.status).toBe("in-progress");
    expect(store.awards).toEqual([]);
  });

  it("aprovar com subtask aberta é recusado, e ninguém é creditado", async () => {
    addTask({ id: 45, status: "in-review", completed: true });
    addSubtask(45, "Aberta", false);

    await expect(taskModule.approveTask({ taskId: 45, approverId: 1 })).rejects.toThrow(/antes de aprovar a tarefa/);
    expect(store.tasks.get(45)!.status).toBe("in-review");
    expect(store.awards).toEqual([]);
    expect(store.completedTasks).toEqual([]);
  });

  it("com todas as subtasks concluídas, os mesmos caminhos passam", async () => {
    addTask({ id: 46, status: "in-progress" });
    addSubtask(46, "Feita", true, new Date("2026-10-10T12:00:00.000Z"));

    const moved = await taskModule.updateTask({ taskId: 46, actor: userActor(7, VOLUNTARIO), data: { status: "in-review" } });
    expect(moved.status).toBe("in-review");
  });
});

describe("V4-4 · janela — criar/renomear/apagar só enquanto a mãe não está em revisão nem concluída", () => {
  it("mãe em Em Revisão recusa criar e apagar (409, estado do mundo)", async () => {
    addTask({ id: 47, status: "in-review" });
    const existing = addSubtask(47, "Já existente");

    await expect(createSubtask(47, 7, "Nova")).rejects.toThrow(ConflictError);
    await expect(deleteSubtask(47, existing.id, 7)).rejects.toThrow(ConflictError);
    expect(store.subtasks.size).toBe(1);
  });

  it("mãe em Ajustes aceita renomear", async () => {
    addTask({ id: 48, status: "adjust" });
    const row = addSubtask(48, "Texto errado");

    const result = await updateSubtask({ taskId: 48, subtaskId: row.id, actorId: 7, title: "Texto certo" });
    expect(result.subtask.title).toBe("Texto certo");
  });

  it("marcar em Em Revisão é recusado pela trava de status da DEC-98; DESMARCAR continua aberto", async () => {
    addTask({ id: 49, status: "in-review" });
    const row = addSubtask(49, "Aberta");

    await expect(
      updateSubtask({ taskId: 49, subtaskId: row.id, actorId: 7, completed: true }),
    ).rejects.toThrow(/precisa estar em Andamento/);
    expect(store.subtasks.get(row.id)!.completed).toBe(false);

    // Corrigir uma marcação errada não é marcação: a mãe em revisão aceita desmarcar.
    const marked = addSubtask(49, "Já marcada", true, new Date("2026-10-10T12:00:00.000Z"));
    const result = await updateSubtask({ taskId: 49, subtaskId: marked.id, actorId: 7, completed: false });
    expect(result.subtask.completed).toBe(false);
    expect(result.task.status).toBe("in-review"); // não houve auto-move: a mãe já está lá
  });

  it("apagar uma subtask derruba a base da mãe (10 + 5·n recalculado)", async () => {
    addTask({ id: 50, points: 25 });
    const row = addSubtask(50, "Sobra");
    addSubtask(50, "Fica");

    await deleteSubtask(50, row.id, 7);
    expect(store.tasks.get(50)!.points).toBe(15);
  });

  it("concluir subtask não mexe na base: a base conta subtasks, não concluídas", async () => {
    addTask({ id: 51, points: 20 });
    const row = addSubtask(51, "Concluída agora");

    const result = await updateSubtask({ taskId: 51, subtaskId: row.id, actorId: 7, completed: true });
    expect(result.task.points).toBe(20);
  });
});

describe("V4-4 · autoridade — a mesma de editar a mãe", () => {
  it("responsável da mãe opera", async () => {
    addTask({ id: 52, assignedTo: 7 });
    expect((await createSubtask(52, 7, "Pelo responsável")).subtask.title).toBe("Pelo responsável");
  });

  it("membro do projeto que não é responsável opera", async () => {
    addTask({ id: 53, assignedTo: 7 });
    expect((await createSubtask(53, 8, "Pelo colega do projeto")).subtask.id).toBeGreaterThan(0);
  });

  it("quem tem MANAGE_USERS opera", async () => {
    addTask({ id: 54, assignedTo: 7 });
    expect((await createSubtask(54, 1, "Pelo coordenador")).subtask.id).toBeGreaterThan(0);
  });

  it("quem não é responsável nem do projeto é barrado antes de qualquer escrita", async () => {
    addTask({ id: 55, assignedTo: 7 });
    await expect(createSubtask(55, 11, "Intruso")).rejects.toThrow(ForbiddenError);
    expect(store.subtasks.size).toBe(0);
  });

  it("subtask de tarefa pública não existe — a recusa é 400, não 403", async () => {
    addTask({ id: 56, taskVisibility: "public", assignedTo: null });
    await expect(createSubtask(56, 1, "Não tem")).rejects.toThrow(ValidationError);
  });

  it("subtask inexistente é 404 e não mexe na mãe", async () => {
    addTask({ id: 57 });
    await expect(updateSubtask({ taskId: 57, subtaskId: 999, actorId: 7, completed: true })).rejects.toThrow(/Subtask não encontrada/);
    expect(store.tasks.get(57)!.points).toBe(10);
  });
});

describe("V4-4 · auto-mover a mãe quando a última subtask é concluída", () => {
  it("a última subtask concluída move a mãe de Em Andamento para Em Revisão e avisa o líder", async () => {
    addTask({ id: 58, status: "in-progress" });
    const done = addSubtask(58, "Já feita", true, new Date("2026-10-10T12:00:00.000Z"));
    const last = addSubtask(58, "A última", false);

    const result = await updateSubtask({ taskId: 58, subtaskId: last.id, actorId: 7, completed: true });

    expect(result.task.status).toBe("in-review");
    expect(store.tasks.get(58)!.status).toBe("in-review");
    expect(store.published).toEqual([{ eventType: "TASK_REVIEW_REQUEST", audience: [1] }]);
    // Auto-mover não é concluir: ninguém é creditado nem conta tarefa concluída.
    expect(store.awards).toEqual([]);
    expect(store.completedTasks).toEqual([]);
    expect(done.completed).toBe(true);
  });

  it("ainda há subtask aberta: a mãe fica onde está", async () => {
    addTask({ id: 59, status: "in-progress" });
    const first = addSubtask(59, "Primeira");
    addSubtask(59, "Segunda", false);

    const result = await updateSubtask({ taskId: 59, subtaskId: first.id, actorId: 7, completed: true });
    expect(result.task.status).toBe("in-progress");
    expect(store.published).toEqual([]);
  });

  it("mãe em A Fazer nem aceita a marcação (DEC-98): quem não começou não entra na fila sozinho", async () => {
    addTask({ id: 60, status: "to-do" });
    const row = addSubtask(60, "Única");

    await expect(
      updateSubtask({ taskId: 60, subtaskId: row.id, actorId: 7, completed: true }),
    ).rejects.toThrow(/precisa estar em Andamento/);
    expect(store.subtasks.get(row.id)!.completed).toBe(false);
    expect(store.tasks.get(60)!.status).toBe("to-do");
    expect(store.published).toEqual([]);
  });

  it("desmarcar uma subtask concluída não move nada", async () => {
    addTask({ id: 61, status: "in-progress" });
    const row = addSubtask(61, "Tinha sido marcada", true, new Date("2026-10-10T12:00:00.000Z"));

    const result = await updateSubtask({ taskId: 61, subtaskId: row.id, actorId: 7, completed: false });
    expect(result.subtask.completed).toBe(false);
    expect(result.subtask.completedAt).toBeNull();
    expect(result.task.status).toBe("in-progress");
  });
});

describe("V4-4/V4-5 · DEC-97 — o prêmio creditado na aprovação é a mãe + 5 por subtask concluída", () => {
  it("mãe no prazo com duas subtasks no prazo credita 20", async () => {
    // A aprovação acontece NO dia do prazo: sem isto o relógio congelado do beforeEach (15/10)
    // aprovaria uma tarefa com prazo 20/10 adiantada, e a mãe valeria 15, não 10.
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    addTask({ id: 62, status: "in-review", completed: true, dueDate: "2026-10-20", assignedTo: 7 });
    addSubtask(62, "No prazo", true, new Date("2026-10-20T12:00:00.000Z"));
    addSubtask(62, "No prazo também", true, new Date("2026-10-20T12:00:00.000Z"));

    const result = await taskModule.approveTask({ taskId: 62, approverId: 1 });

    expect(result.awardedPoints).toBe(20);
    expect(store.awards).toEqual([{ userId: 7, taskId: 62, taskPoints: 20 }]);
  });

  it("o exemplo da DEC-78 recalculado pela DEC-97: mãe −40, base com 3 subtasks 25 → −25", async () => {
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));
    addTask({ id: 63, status: "in-review", completed: true, dueDate: "2026-10-20", assignedTo: 7 });
    addSubtask(63, "Adiantada", true, new Date("2026-10-19T12:00:00.000Z"));
    addSubtask(63, "Um dia atrasada", true, new Date("2026-10-21T12:00:00.000Z"));
    addSubtask(63, "Quatro dias atrasada", true, new Date("2026-10-24T12:00:00.000Z"));

    // O instante de conclusão de CADA subtask não pesa mais: só a contagem entra na base
    // (10 + 3·5 = 25) e o atraso da mãe (5 dias × 10) desconta uma vez só.
    const result = await taskModule.approveTask({ taskId: 63, approverId: 1 });
    expect(result.awardedPoints).toBe(-25);
  });

  it("tarefa sem subtask continua creditando exatamente o que creditava antes", async () => {
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    addTask({ id: 64, status: "in-review", completed: true, dueDate: "2026-10-20", assignedTo: 7 });

    const result = await taskModule.approveTask({ taskId: 64, approverId: 1 });
    expect(result.awardedPoints).toBe(10);
  });
});

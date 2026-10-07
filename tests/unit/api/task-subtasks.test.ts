// @vitest-environment node
/**
 * plan-v4 · V4-4 — o contrato HTTP das subtasks.
 *
 * O módulo é o REAL sobre portas falsas (a lição medida do B6-2a: `vi.mock` do módulo inteiro faz
 * a recusa SUMIR do teste em vez de falhar, porque a rota não decide mais e o duplo também não).
 * Quem decide aqui é `CreateTaskSubtaskUseCase` / `UpdateTaskUseCase` / `ApproveTaskUseCase` de
 * produção; só a sessão é dobrada.
 *
 * O que este arquivo fixa e nenhuma teste de caso de uso fixa: o status HTTP. A trava é 400, a
 * janela é 409, a autoridade é 403 — e a precedência entre elas é comportamento observável.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createTaskManagementModule } from "@/backend/modules/task-management";
import type { ISubtask, Task } from "@/backend/domain";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
}));

type World = {
  tasks: Map<number, Task>;
  subtasks: Map<number, ISubtask & { id: number; taskId: number }>;
  assignees: Map<number, number[]>;
  memberships: Map<number, number[]>;
  roles: Map<number, string[]>;
  published: string[];
  awards: number[];
};

let world: World;
let seq = 0;

function task(overrides: Partial<Task> & { id: number }): Task {
  return {
    id: overrides.id,
    title: overrides.title ?? "Tarefa mãe",
    description: null,
    status: overrides.status ?? "in-progress",
    priority: overrides.priority ?? "medium",
    assignedTo: overrides.assignedTo ?? 7,
    assigneeIds: overrides.assigneeIds ?? [overrides.assignedTo ?? 7],
    projectId: overrides.projectId ?? 3,
    dueDate: overrides.dueDate ?? null,
    points: overrides.points ?? 10,
    completed: overrides.completed ?? false,
    completedAt: overrides.completedAt ?? null,
    taskVisibility: overrides.taskVisibility ?? "delegated",
    isGlobal: overrides.isGlobal ?? false,
    groupTaskId: null,
    createdBy: 1,
    subtasks: overrides.subtasks ?? [],
    toJSON() {
      const { toJSON, ...data } = this;
      return {
        ...data,
        subtasks: (data.subtasks ?? []).map((subtask: ISubtask) => ({
          id: subtask.id ?? null,
          taskId: subtask.taskId ?? null,
          title: subtask.title,
          completed: subtask.completed,
          completedAt: subtask.completedAt ? new Date(subtask.completedAt).toISOString() : null,
        })),
      };
    },
  } as Task;
}

function addTask(overrides: Partial<Task> & { id: number }) {
  const created = task(overrides);
  world.tasks.set(created.id!, created);
  if (created.assignedTo) world.assignees.set(created.id!, [created.assignedTo]);
  return created;
}

function addSubtask(taskId: number, title: string, completed = false) {
  const row = {
    id: ++seq,
    taskId,
    title,
    completed,
    completedAt: completed ? new Date("2026-10-10T12:00:00.000Z") : null,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
  };
  world.subtasks.set(row.id, row);
  return row;
}

vi.mock("@/backend/composition/root", () => {
  const boom = (name: string) => async () => {
    throw new Error(`porta não deveria ser usada neste teste: ${name}`);
  };

  const tasks: TaskRepositoryPort = {
    async findById(id) {
      return world.tasks.get(id) ?? null;
    },
    async update(id, data) {
      const { subtasks: _ignored, ...rest } = data;
      const updated = task({ ...(rest as Task), id });
      world.tasks.set(id, updated);
      return updated;
    },
    findAll: boom("tasks.findAll"),
    findByAssigneeId: boom("tasks.findByAssigneeId"),
    create: boom("tasks.create"),
    delete: boom("tasks.delete"),
  };

  const subtasks: TaskSubtasksPort = {
    async listByTaskId(taskId) {
      return [...world.subtasks.values()].filter((row) => row.taskId === taskId).sort((a, b) => a.id - b.id);
    },
    async listByTaskIds(taskIds) {
      const grouped = new Map<number, ISubtask[]>();
      taskIds.forEach((taskId) => grouped.set(taskId, [...world.subtasks.values()].filter((row) => row.taskId === taskId)));
      return grouped;
    },
    async findById(subtaskId) {
      return world.subtasks.get(subtaskId) ?? null;
    },
    async countOpenByTaskId(taskId) {
      return [...world.subtasks.values()].filter((row) => row.taskId === taskId && !row.completed).length;
    },
    async create(taskId, title) {
      const row = { id: ++seq, taskId, title, completed: false, completedAt: null, createdAt: new Date() };
      world.subtasks.set(row.id, row);
      return row;
    },
    createMany: boom("subtasks.createMany"),
    async update(subtaskId, data) {
      const row = world.subtasks.get(subtaskId);
      if (!row) throw new Error("subtask inexistente no fake");
      const next = { ...row, ...data };
      world.subtasks.set(subtaskId, next);
      return next;
    },
    async delete(subtaskId) {
      world.subtasks.delete(subtaskId);
    },
  };

  const assignees = {
    isAvailable: () => true,
    async listUserIdsByTaskId(taskId: number) {
      return world.assignees.get(taskId) ?? [];
    },
    async listTaskIdsByUserId(userId: number) {
      return [...world.assignees.entries()].filter(([, ids]) => ids.includes(userId)).map(([id]) => id);
    },
    async listUserIdsByTaskIds(taskIds: number[]) {
      const map = new Map<number, number[]>();
      taskIds.forEach((id) => map.set(id, world.assignees.get(id) ?? []));
      return map;
    },
    async isUserAssigned(taskId: number, userId: number) {
      return (world.assignees.get(taskId) ?? []).includes(userId);
    },
    async replaceAssignees(taskId: number, userIds: number[]) {
      world.assignees.set(taskId, userIds);
    },
  };

  const actors = {
    async findById(id: number) {
      const roles = world.roles.get(id);
      if (!roles) return null;
      return { id, name: `Usuário ${id}`, roles, completedTasks: 0 };
    },
    async incrementCompletedTasks(userId: number) {
      world.awards.push(userId);
    },
    async getUserProjectMemberships(userId: number) {
      return (world.memberships.get(userId) ?? []).map((projectId) => ({ projectId }));
    },
    async listActiveUsers() {
      return [];
    },
  };

  return {
    getBackendComposition: () => ({
      taskManagement: createTaskManagementModule({
        tasks,
        subtasks,
        assignees,
        actors,
        projects: { findById: async (id: number) => (id === 3 ? { id: 3, leaderId: 1, createdBy: 1 } : null) },
        progress: {
          isAvailable: () => false,
          findByTaskAndUser: async () => null,
          findByTaskIdsAndUser: async () => [],
          upsert: async () => undefined,
          listCompletedByTaskIds: async () => [],
          listSessionCompletionsByTaskIds: async () => [],
        },
        notifications: {
          async publishEvent(event) {
            world.published.push(event.eventType);
            return null;
          },
        },
        events: {
          async onTaskCompleted(event) {
            world.awards.push(event.taskPoints);
            return event.taskPoints;
          },
        },
      }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { POST as createSubtaskRoute } from "@/app/api/tasks/[id]/subtasks/route";
import { DELETE as deleteSubtaskRoute, PATCH as patchSubtaskRoute } from "@/app/api/tasks/[id]/subtasks/[subtaskId]/route";
import { PATCH as completeTaskRoute } from "@/app/api/tasks/[id]/route";
import { POST as approveTaskRoute } from "@/app/api/tasks/[id]/approve/route";
import { PUT as putTaskRoute } from "@/app/api/tasks/[id]/route";

/** Array porque `requireApiActor` normaliza com `normalizeRoles` — string solta vira `[]`. */
const VOLUNTARIO = ["VOLUNTARIO"];
const COORDENADOR = ["COORDENADOR"];

function login(roles: string[], id = 7) {
  mocks.session = { id, email: "u@lab.com", name: `Usuário ${id}`, roles, status: "active" };
}

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
  world = {
    tasks: new Map(),
    subtasks: new Map(),
    assignees: new Map(),
    memberships: new Map([[7, [3]]]),
    roles: new Map([
      [1, COORDENADOR],
      [7, VOLUNTARIO],
      [11, VOLUNTARIO],
    ]),
    published: [],
    awards: [],
  };
  seq = 0;
  mocks.session = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/tasks/[id]/subtasks", () => {
  it("201 com a subtask e a mãe de base nova", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 100, points: 10 });

    const response = await createSubtaskRoute(request("/api/tasks/100/subtasks", "POST", { title: "Ler o protocolo" }), context({ id: "100" }));
    expect(response.status).toBe(201);

    const body = await read(response);
    expect(body.subtask).toMatchObject({ title: "Ler o protocolo", completed: false });
    expect(body.task.points).toBe(15); // DEC-97: 10 + 5·n
  });

  it("400 quando o título está vazio", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 101 });

    const response = await createSubtaskRoute(request("/api/tasks/101/subtasks", "POST", { title: "  " }), context({ id: "101" }));
    expect(response.status).toBe(400);
    expect((await read(response)).error).toContain("Título da subtask é obrigatório");
  });

  it("409 quando a mãe já está em revisão — é o estado do mundo, não a transição", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 102, status: "in-review" });

    const response = await createSubtaskRoute(request("/api/tasks/102/subtasks", "POST", { title: "Tarde demais" }), context({ id: "102" }));
    expect(response.status).toBe(409);
    expect((await read(response)).error).toContain("em revisão");
  });

  it("403 para quem não é responsável nem do projeto — antes de qualquer recusa de estado", async () => {
    login(VOLUNTARIO, 11);
    addTask({ id: 103, status: "in-review" }); // estado que também daria 409

    const response = await createSubtaskRoute(request("/api/tasks/103/subtasks", "POST", { title: "Intruso" }), context({ id: "103" }));
    expect(response.status).toBe(403);
    expect(world.subtasks.size).toBe(0);
  });

  it("404 para tarefa que não existe", async () => {
    login(COORDENADOR, 1);
    const response = await createSubtaskRoute(request("/api/tasks/999/subtasks", "POST", { title: "x" }), context({ id: "999" }));
    expect(response.status).toBe(404);
  });

  it("401 sem sessão", async () => {
    addTask({ id: 104 });
    const response = await createSubtaskRoute(request("/api/tasks/104/subtasks", "POST", { title: "x" }), context({ id: "104" }));
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/tasks/[id]/subtasks/[subtaskId]", () => {
  it("200 ao concluir a última subtask, e a mãe vai para revisão sozinha", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 105, status: "in-progress" });
    addSubtask(105, "Já feita", true);
    const last = addSubtask(105, "A última");

    const response = await patchSubtaskRoute(
      request(`/api/tasks/105/subtasks/${last.id}`, "PATCH", { completed: true }),
      context({ id: "105", subtaskId: String(last.id) }),
    );
    expect(response.status).toBe(200);

    const body = await read(response);
    expect(body.subtask.completed).toBe(true);
    expect(body.task.status).toBe("in-review");
    expect(world.published).toEqual(["TASK_REVIEW_REQUEST"]);
  });

  it("404 para subtask de outra tarefa", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 106 });
    addTask({ id: 107 });
    const foreign = addSubtask(107, "De outra mãe");

    const response = await patchSubtaskRoute(
      request(`/api/tasks/106/subtasks/${foreign.id}`, "PATCH", { completed: true }),
      context({ id: "106", subtaskId: String(foreign.id) }),
    );
    expect(response.status).toBe(404);
    expect(foreign.completed).toBe(false);
  });

  it("200 ao renomear", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 108 });
    const row = addSubtask(108, "Texto errado");

    const response = await patchSubtaskRoute(
      request(`/api/tasks/108/subtasks/${row.id}`, "PATCH", { title: "Texto certo" }),
      context({ id: "108", subtaskId: String(row.id) }),
    );
    expect(response.status).toBe(200);
    expect((await read(response)).subtask.title).toBe("Texto certo");
  });

  it("409 ao marcar fora de Em Andamento (DEC-98) — a frase é a do domínio", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 116, status: "to-do" });
    const row = addSubtask(116, "Aberta");

    const response = await patchSubtaskRoute(
      request(`/api/tasks/116/subtasks/${row.id}`, "PATCH", { completed: true }),
      context({ id: "116", subtaskId: String(row.id) }),
    );
    expect(response.status).toBe(409);
    expect((await read(response)).error).toBe("A tarefa precisa estar em Andamento para marcar subtasks.");
    expect(world.subtasks.get(row.id)!.completed).toBe(false);
  });

  it("200 ao DESMARCAR fora de Em Andamento — corrigir não é marcar", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 117, status: "in-review" });
    const row = addSubtask(117, "Marcada por engano", true);

    const response = await patchSubtaskRoute(
      request(`/api/tasks/117/subtasks/${row.id}`, "PATCH", { completed: false }),
      context({ id: "117", subtaskId: String(row.id) }),
    );
    expect(response.status).toBe(200);
    expect((await read(response)).subtask.completed).toBe(false);
  });
});

describe("DELETE /api/tasks/[id]/subtasks/[subtaskId]", () => {
  it("200 e a base da mãe cai junto (10 + 5·n recalculado, DEC-97)", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 109, points: 25 });
    addSubtask(109, "Fica");
    const doomed = addSubtask(109, "Sobra");

    const response = await deleteSubtaskRoute(
      request(`/api/tasks/109/subtasks/${doomed.id}`, "DELETE"),
      context({ id: "109", subtaskId: String(doomed.id) }),
    );
    expect(response.status).toBe(200);
    expect((await read(response)).task.points).toBe(15);
  });

  it("409 quando a mãe está concluída", async () => {
    login(COORDENADOR, 1);
    addTask({ id: 110, status: "done", completed: true });
    const row = addSubtask(110, "Junto com a mãe", true);

    const response = await deleteSubtaskRoute(
      request(`/api/tasks/110/subtasks/${row.id}`, "DELETE"),
      context({ id: "110", subtaskId: String(row.id) }),
    );
    expect(response.status).toBe(409);
  });
});

describe("V4-4 · a trava nos três caminhos HTTP que terminam a mãe", () => {
  it("PUT status → Em Revisão com subtask aberta: 400 dizendo quantas faltam", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 111, status: "in-progress" });
    addSubtask(111, "Aberta 1");
    addSubtask(111, "Aberta 2");

    const response = await putTaskRoute(request("/api/tasks/111", "PUT", { status: "in-review" }), context({ id: "111" }));
    expect(response.status).toBe(400);
    expect((await read(response)).error).toContain("as 2 subtasks restantes");
    expect(world.tasks.get(111)!.status).toBe("in-progress");
  });

  it("PATCH action=complete com subtask aberta: 400", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 112, status: "in-progress" });
    addSubtask(112, "Aberta");

    const response = await completeTaskRoute(request("/api/tasks/112", "PATCH", { action: "complete" }), context({ id: "112" }));
    expect(response.status).toBe(400);
    expect((await read(response)).error).toContain("subtask restante");
  });

  it("POST approve com subtask aberta: 400, e ninguém é creditado", async () => {
    login(COORDENADOR, 1);
    addTask({ id: 113, status: "in-review", completed: true });
    addSubtask(113, "Aberta");

    const response = await approveTaskRoute(request("/api/tasks/113", "POST"), context({ id: "113" }));
    expect(response.status).toBe(400);
    expect((await read(response)).error).toContain("aprovar a tarefa");
    expect(world.awards).toEqual([]);
  });

  it("a mesma aprovação passa quando não há subtask aberta", async () => {
    login(COORDENADOR, 1);
    addTask({ id: 114, status: "in-review", completed: true, dueDate: "2026-10-15" });
    addSubtask(114, "Concluída no prazo", true);

    const response = await approveTaskRoute(request("/api/tasks/114", "POST"), context({ id: "114" }));
    expect(response.status).toBe(200);
    const body = await read(response);
    // mãe 10 (aprovada no dia do prazo, relógio congelado em 15/10) + 5 da subtask concluída.
    // O instante em que a subtask foi feita não pesa mais: desde a DEC-97 ela é +5 fixo.
    expect(body.awardedPoints).toBe(15);
  });
});

describe("GET /api/tasks/[id] — o read model carrega as subtasks (DEC-79)", () => {
  it("a resposta traz a lista, com id, título e conclusão", async () => {
    login(VOLUNTARIO, 7);
    addTask({ id: 115, points: 20 });
    addSubtask(115, "Uma");
    addSubtask(115, "Duas", true);

    const { GET } = await import("@/app/api/tasks/[id]/route");
    const response = await GET(request("/api/tasks/115", "GET"), context({ id: "115" }));
    expect(response.status).toBe(200);

    const body = await read(response);
    expect(body.task.subtasks).toEqual([
      { id: expect.any(Number), taskId: 115, title: "Uma", completed: false, completedAt: null },
      { id: expect.any(Number), taskId: 115, title: "Duas", completed: true, completedAt: "2026-10-10T12:00:00.000Z" },
    ]);
  });
});

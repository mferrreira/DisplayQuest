// @vitest-environment node
/**
 * V5-6 (DEC-99) — o contrato HTTP da ligação tarefa × atividade do cronograma.
 *
 * O módulo é o REAL sobre portas falsas (a lição medida do B6-2a: duplo do módulo faz a recusa
 * SUMIR do teste em vez de falhar). Só sessão e banco são dobrados. O que um teste de caso de
 * uso não fixa e este fixa: o STATUS HTTP e a precedência entre eles.
 *
 *   atividade válida            → 201/200 com `activityId` no read model
 *   atividade de outro projeto  → 400 nomeando o motivo
 *   atividade inexistente       → 404
 *   id sem forma                → 400 nomeando o campo (não é 500 do Prisma por NaN)
 *   quest global com atividade  → 400
 *   corpo de nao-gestor com activityId → 403, antes de qualquer 400 de corpo
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createTaskManagementModule } from "@/backend/modules/task-management";
import {
  TASK_ACTIVITY_GLOBAL_MESSAGE,
  TASK_ACTIVITY_INVALID_MESSAGE,
  TASK_ACTIVITY_PROJECT_MESSAGE,
  toTaskView,
  type Task,
} from "@/backend/domain";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

const PROJECT = 3;
const OTHER_PROJECT = 5;
const ACTIVITY = 40;
const FOREIGN_ACTIVITY = 41;

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
}));

type World = {
  tasks: Map<number, Task>;
  activities: Map<number, { id: number; projectId: number }>;
  assignees: Map<number, number[]>;
  memberships: Map<number, number[]>;
  roles: Map<number, string[]>;
  activityLookups: number[];
};

let world: World;
let seq = 0;

function task(overrides: Partial<Task> & { id: number }): Task {
  return toTaskView({
    id: overrides.id,
    title: overrides.title ?? "Tarefa da etapa",
    description: null,
    status: overrides.status ?? "to-do",
    priority: overrides.priority ?? "medium",
    assignedTo: overrides.assignedTo ?? 7,
    assigneeIds: overrides.assigneeIds ?? [overrides.assignedTo ?? 7],
    projectId: overrides.projectId ?? PROJECT,
    dueDate: overrides.dueDate ?? null,
    points: overrides.points ?? 10,
    completed: overrides.completed ?? false,
    completedAt: overrides.completedAt ?? null,
    taskVisibility: overrides.taskVisibility ?? "delegated",
    isGlobal: overrides.isGlobal ?? false,
    groupTaskId: overrides.groupTaskId ?? null,
    createdBy: overrides.createdBy ?? 1,
    activityId: overrides.activityId ?? null,
    subtasks: overrides.subtasks ?? [],
  });
}

vi.mock("@/backend/composition/root", () => {
  const boom = (name: string) => async () => {
    throw new Error(`porta não deveria ser usada neste teste: ${name}`);
  };

  const tasks: TaskRepositoryPort = {
    async findById(id) {
      return world.tasks.get(id) ?? null;
    },
    async create(data) {
      const { subtasks: _ignored, ...rest } = data;
      const created = task({ ...(rest as Task), id: ++seq });
      world.tasks.set(created.id!, created);
      return created;
    },
    async update(id, data) {
      const { subtasks: _ignored, ...rest } = data;
      const updated = task({ ...(rest as Task), id });
      world.tasks.set(id, updated);
      return updated;
    },
    findAll: boom("tasks.findAll"),
    findByAssigneeId: boom("tasks.findByAssigneeId"),
    delete: boom("tasks.delete"),
  };

  return {
    getBackendComposition: () => ({
      taskManagement: createTaskManagementModule({
        tasks,
        subtasks: {
          listByTaskId: async () => [],
          listByTaskIds: async () => new Map(),
          findById: async () => null,
          countOpenByTaskId: async () => 0,
          create: boom("subtasks.create"),
          createMany: boom("subtasks.createMany"),
          update: boom("subtasks.update"),
          delete: boom("subtasks.delete"),
        },
        assignees: {
          isAvailable: () => true,
          async listUserIdsByTaskId(taskId: number) {
            return world.assignees.get(taskId) ?? [];
          },
          listTaskIdsByUserId: async () => [],
          listUserIdsByTaskIds: async () => new Map(),
          isUserAssigned: async () => true,
          async replaceAssignees(taskId: number, userIds: number[]) {
            world.assignees.set(taskId, userIds);
          },
        },
        actors: {
          async findById(id: number) {
            const roles = world.roles.get(id);
            if (!roles) return null;
            return { id, name: `Usuário ${id}`, roles, completedTasks: 0 };
          },
          incrementCompletedTasks: async () => undefined,
          async getUserProjectMemberships(userId: number) {
            return (world.memberships.get(userId) ?? []).map((projectId) => ({ projectId }));
          },
          listActiveUsers: async () => [],
        },
        projects: {
          async findById(id: number) {
            if (id !== PROJECT && id !== OTHER_PROJECT) return null;
            return { id, leaderId: 1, createdBy: 1 };
          },
        },
        progress: {
          isAvailable: () => false,
          findByTaskAndUser: async () => null,
          findByTaskIdsAndUser: async () => [],
          upsert: async () => undefined,
          listCompletedByTaskIds: async () => [],
          listSessionCompletionsByTaskIds: async () => [],
        },
        notifications: { publishEvent: async () => null },
        // V5-6 (DEC-99): a leitura mínima da atividade. Registrar a consulta é o que permite
        // provar que id sem forma NEM chega aqui.
        activities: {
          async findActivityById(activityId: number) {
            world.activityLookups.push(activityId);
            return world.activities.get(activityId) ?? null;
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

import { POST as createTaskRoute } from "@/app/api/tasks/route";
import { PUT as putTaskRoute } from "@/app/api/tasks/[id]/route";

/** Array porque `requireApiActor` normaliza com `normalizeRoles` — string solta vira `[]`. */
const COORDENADOR = ["COORDENADOR"];
const VOLUNTARIO = ["VOLUNTARIO"];

function login(roles: string[], id = 1) {
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
  world = {
    tasks: new Map(),
    activities: new Map([
      [ACTIVITY, { id: ACTIVITY, projectId: PROJECT }],
      [FOREIGN_ACTIVITY, { id: FOREIGN_ACTIVITY, projectId: OTHER_PROJECT }],
    ]),
    assignees: new Map(),
    memberships: new Map([[7, [PROJECT]]]),
    roles: new Map([
      [1, COORDENADOR],
      [7, VOLUNTARIO],
    ]),
    activityLookups: [],
  };
  seq = 0;
  mocks.session = null;
});

describe("POST /api/tasks com linha do cronograma", () => {
  it("cria a tarefa com a chave da atividade no read model", async () => {
    login(COORDENADOR);

    const response = await createTaskRoute(
      request("/api/tasks", "POST", { title: "Ler os artigos", projectId: PROJECT, activityId: ACTIVITY }),
    );
    const body = await read(response);

    expect(response.status).toBe(201);
    expect(body.task.activityId).toBe(ACTIVITY);
  });

  it("atividade de outro projeto é 400 nomeando o motivo", async () => {
    login(COORDENADOR);

    const response = await createTaskRoute(
      request("/api/tasks", "POST", { title: "Atravessada", projectId: PROJECT, activityId: FOREIGN_ACTIVITY }),
    );

    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe(TASK_ACTIVITY_PROJECT_MESSAGE);
    expect(world.tasks.size).toBe(0);
  });

  it("atividade inexistente é 404", async () => {
    login(COORDENADOR);

    const response = await createTaskRoute(
      request("/api/tasks", "POST", { title: "Órfã", projectId: PROJECT, activityId: 999 }),
    );

    expect(response.status).toBe(404);
  });

  it("id sem forma é 400 nomeando o campo, e a porta de atividade não é consultada", async () => {
    login(COORDENADOR);

    const response = await createTaskRoute(
      request("/api/tasks", "POST", { title: "Lixo no campo", projectId: PROJECT, activityId: "abc" }),
    );

    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe(TASK_ACTIVITY_INVALID_MESSAGE);
    expect(world.activityLookups).toEqual([]);
  });

  it("quest global com atividade é 400", async () => {
    login(COORDENADOR);

    const response = await createTaskRoute(
      request("/api/tasks", "POST", { title: "Quest com etapa", isGlobal: true, activityId: ACTIVITY }),
    );

    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe(TASK_ACTIVITY_GLOBAL_MESSAGE);
  });
});

describe("PUT /api/tasks/[id] com linha do cronograma", () => {
  function seedTask(overrides: Partial<Task> = {}): Task & { id: number } {
    const created = task({ id: ++seq, ...overrides });
    world.tasks.set(created.id!, created);
    // `id` é opcional no `Task` (o record ainda não inserido não tem); aqui ele sempre tem.
    return created as Task & { id: number };
  }

  it("escreve a chave e devolve no read model", async () => {
    login(COORDENADOR);
    const seeded = seedTask({ activityId: null });

    const response = await putTaskRoute(
      request(`/api/tasks/${seeded.id}`, "PUT", { activityId: ACTIVITY }),
      context({ id: String(seeded.id) }),
    );
    const body = await read(response);

    expect(response.status).toBe(200);
    expect(body.task.activityId).toBe(ACTIVITY);
  });

  it("corpo sem a chave não apaga o vínculo", async () => {
    login(COORDENADOR);
    const seeded = seedTask({ activityId: ACTIVITY });

    const response = await putTaskRoute(
      request(`/api/tasks/${seeded.id}`, "PUT", { title: "Renomeada" }),
      context({ id: String(seeded.id) }),
    );
    const body = await read(response);

    expect(response.status).toBe(200);
    expect(body.task.activityId).toBe(ACTIVITY);
  });

  it("atividade de outro projeto é 400 e a tarefa fica intacta", async () => {
    login(COORDENADOR);
    const seeded = seedTask({ title: "Etapa marcada", activityId: ACTIVITY });

    const response = await putTaskRoute(
      request(`/api/tasks/${seeded.id}`, "PUT", { title: "Título novo", activityId: FOREIGN_ACTIVITY }),
      context({ id: String(seeded.id) }),
    );

    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe(TASK_ACTIVITY_PROJECT_MESSAGE);
    expect(world.tasks.get(seeded.id)!.title).toBe("Etapa marcada");
  });

  it("quem não tem MANAGE_TASKS com activityId no corpo leva 403", async () => {
    login(VOLUNTARIO, 7);
    const seeded = seedTask({ assignedTo: 7, activityId: ACTIVITY });

    const response = await putTaskRoute(
      request(`/api/tasks/${seeded.id}`, "PUT", { activityId: null }),
      context({ id: String(seeded.id) }),
    );

    expect(response.status).toBe(403);
    expect(world.tasks.get(seeded.id)!.activityId).toBe(ACTIVITY);
  });
});

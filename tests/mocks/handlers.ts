/**
 * MSW request handlers.
 *
 * RULE (constitution §1 / EXECUTION-PLAN R4): every handler shape MUST be derived from the
 * real backend route/gateway source — never invented. Contract tests assert handler payloads
 * against entities/ Zod schemas so mocks cannot drift into fiction.
 *
 * Registered so far: tasks (E2/T2.2 — shapes from app/api/tasks/** route source).
 * Per-domain handlers are added in their epic.
 */
import { HttpResponse, http } from "msw";
import { z } from "zod";
import { taskSchema, taskSubtaskSchema, taskUserProgressSchema, type Task } from "@/entities/task";
import { userSchema, type User } from "@/entities/user";
import { projectSchema, type Project } from "@/entities/project";
import { labEventSchema, type LabEvent } from "@/entities/lab";
// plan-v4 · V4-5 — o mock usa as MESMAS funções do domínio que a rota real usa (trava, janela,
// mensagens). Um mock que reimplementasse a regra poderia ficar verde enquanto a produção mente.
import {
  openSubtasksCount,
  openSubtasksMessage,
  subtaskWindowMessage,
  SUBTASK_BLOCKED_TARGETS,
  SUBTASK_EDITABLE_STATUSES,
  POINTS_PER_TASK,
  normalizeNewSubtasks,
} from "@/backend/domain";
import { boardFixture, makeTask } from "./fixtures/tasks";
import { boardUsersFixture, makeUser } from "./fixtures/users";
import { boardProjectsFixture, makeProject } from "./fixtures/projects";
import { labEventsFixture, makeLabEvent } from "./fixtures/lab-events";

// ---- in-memory store (per test file via server.use / resetHandlers) ----
let tasks: ReturnType<typeof boardFixture> = boardFixture();
let nextSubtaskId = 900;

export function resetTaskStore() {
  tasks = boardFixture();
  nextSubtaskId = 900;
}
export function getTaskStore() {
  return tasks;
}
export function seedTasks(overrides: Partial<Task>[]) {
  tasks = overrides.map((o) => makeTask(o));
}

// ---- wire schemas (mirror route responses) ----
const taskListResponse = z.object({ tasks: z.array(taskSchema) });
const taskResponse = z.object({ task: taskSchema });
// plan-v3 OND4-A: concluir/aprovar devolvem o prêmio creditado (route.ts de [id] e [id]/approve).
// O shape segue a rota real — `awardedTo` é o responsável pela tarefa, quase nunca quem
// aprovou, e `null` nos dois significa "ninguém creditado agora" (tarefa em revisão, ou o
// caminho sem award). Um mock que devolvesse só `{ task }` quebraria o schema do cliente.
const awardedTaskResponse = z.object({
  task: taskSchema,
  awardedTo: z.number().int().nullable(),
  awardedPoints: z.number().int().nullable(),
});
const backlogResponse = z.object({ tasks: z.array(taskSchema), createdCount: z.number().int() });
// plan-v4 · V4-4 (DEC-79) — a resposta de uma operação de subtask carrega a MÃE junto, igual à
// rota real (app/api/tasks/[id]/subtasks/**). Sem a mãe, o mock não exercita o auto-move.
const subtaskResponse = z.object({ subtask: taskSubtaskSchema, task: taskSchema });
const deleteResponse = z.object({ success: z.boolean() });
const progressResponse = z.object({ progress: z.array(taskUserProgressSchema) });

const jsonError = (message: string, status: number) =>
  HttpResponse.json({ error: message }, { status });

/**
 * A pessoa logada no mock. Os handlers não leem sessão, mas o servidor real credita **o ator**
 * da requisição (`requireApiActor` → `userToAward`), então o mock precisa de um id para o
 * `awardedTo` da conclusão (OND4-A). É o mesmo id da pessoa do fixture (`boardUsersFixture`,
 * o coordenador 2) e é o que a suíte do quadro afirma em `mockUser`.
 */
const MOCK_ACTOR_ID = 2;

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export const taskHandlers = [
  // GET /api/tasks — route.ts:13–52 (actor-scoped server-side; projectId filter w/ membership)
  http.get("*/api/tasks", async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    let result = tasks;
    if (projectId) {
      const pid = Number(projectId);
      if (Number.isNaN(pid)) return jsonError("projectId inválido", 400);
      result = tasks.filter((t) => t.projectId === pid);
    }
    return HttpResponse.json(taskListResponse.parse({ tasks: result }));
  }),

  // POST /api/tasks — route.ts:55–120 (single or backlog; MANAGE_TASKS enforced by gateway tests)
  http.post("*/api/tasks", async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    if (Array.isArray(body?.tasks)) {
      if (body.tasks.length === 0) return jsonError("Nenhuma task informada para backlog", 400);
      const created = (body.tasks as Partial<Task>[]).map((t) => makeTask(t));
      tasks = [...tasks, ...created];
      return HttpResponse.json(
        backlogResponse.parse({ tasks: created, createdCount: created.length }),
        { status: 201 },
      );
    }
    // V4-5c (DEC-82): a mãe nasce com a lista, igual à rota real (app/api/tasks/route.ts:114), e
    // a base gravada acompanha: 10 + 10·n (DEC-83). Sem isto o mock aceitaria a mãe sem lista e o
    // teste do formulário provava o input, não o estado gravado.
    const { subtasks: rawSubtasks, ...restOfBody } = body as Record<string, unknown>;
    let subtaskTitles: string[];
    try {
      subtaskTitles = normalizeNewSubtasks(rawSubtasks).map((s) => s.title);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Subtasks inválidas", 400);
    }
    const created = makeTask({
      ...(restOfBody as Partial<Task>),
      points: POINTS_PER_TASK * (1 + subtaskTitles.length),
    });
    created.subtasks = subtaskTitles.map((title) => ({
      id: nextSubtaskId++,
      taskId: created.id,
      title,
      completed: false,
      completedAt: null,
    }));
    tasks = [...tasks, created];
    return HttpResponse.json(taskResponse.parse({ task: created }), { status: 201 });
  }),

  // GET /api/tasks/global-progress — registered BEFORE [id] so "global-progress" isn't captured as :id
  http.get("*/api/tasks/global-progress", async () => {
    await delay();
    return HttpResponse.json(progressResponse.parse({ progress: [] }));
  }),

  // GET/PUT/PATCH/DELETE /api/tasks/[id]
  http.get("*/api/tasks/:id", async ({ params }) => {
    await delay();
    const task = tasks.find((t) => t.id === Number(params.id));
    if (!task) return jsonError("Tarefa não encontrada", 404);
    return HttpResponse.json(taskResponse.parse({ task }));
  }),

  http.put("*/api/tasks/:id", async ({ request, params }) => {
    await delay();
    const id = Number(params.id);
    const body = (await request.json()) as Partial<typeof tasks[number]>;
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    // gateway :191 — status-only updates by non-managers hit different path; handlers stay shape-faithful
    const updated = { ...tasks[idx], ...body } as (typeof tasks)[number];
    if (body.status !== undefined) {
      // plan-v4 · V4-5 — a mock espelha a trava real (DEC-57/DEC-80): a mãe não alcança
      // `in-review` nem `done` com subtask aberta, vindo de qualquer coluna. A mensagem é a
      // mesma função do domínio, para o mock não inventar vocabulário.
      const open = openSubtasksCount(tasks[idx].subtasks ?? []);
      if (open > 0 && SUBTASK_BLOCKED_TARGETS.includes(body.status)) {
        return jsonError(openSubtasksMessage(open, body.status === "done" ? "complete" : "review"), 400);
      }
      updated.completed = body.status === "done";
      updated.completedAt = body.status === "done" ? new Date().toISOString() : null;
    }
    tasks[idx] = updated;
    return HttpResponse.json(taskResponse.parse({ task: updated }));
  }),

  // PATCH /api/tasks/[id] { action: "complete", userId? } — [id]/route.ts complete path
  http.patch("*/api/tasks/:id", async ({ request, params }) => {
    await delay();
    const id = Number(params.id);
    const body = (await request.json()) as { action?: string; userId?: number };
    if (body.action !== "complete") return jsonError("Ação não suportada", 400);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    const task = tasks[idx];
    if (task.completed) return jsonError("Tarefa já concluída", 400);
    // plan-v4 · V4-5 — trava também no caminho `action: "complete"` (DEC-57).
    const openComplete = openSubtasksCount(task.subtasks ?? []);
    if (openComplete > 0) return jsonError(openSubtasksMessage(openComplete, "complete"), 400);
    const updated: typeof task = {
      ...task,
      // gateway :401 — public/global → done; delegated/private → in-review
      status: task.isGlobal || task.taskVisibility === "public" ? "done" : "in-review",
      completed: true,
      completedAt: new Date().toISOString(),
    };
    tasks[idx] = updated;
    // O caminho `done` credita QUEM CONCLUIU — o ator da requisição, não o responsável: é o que
    // o caso de uso faz (`userToAward = userId`), e é o que o roundtrip G4 fixa em
    // `awardedTo === anaId`. O caminho `in-review` não credita ninguém: o prêmio fica para a
    // aprovação, e aí é `null`, não 0 (OND4-A / DEC-48).
    const closesTask = updated.status === "done";
    return HttpResponse.json(
      awardedTaskResponse.parse({
        task: updated,
        awardedTo: closesTask ? MOCK_ACTOR_ID : null,
        awardedPoints: closesTask ? 10 : null,
      }),
    );
  }),

  // POST /api/tasks/[id]/approve — [id]/approve/route.ts (must be in-review)
  http.post("*/api/tasks/:id/approve", async ({ params }) => {
    await delay();
    const idx = tasks.findIndex((t) => t.id === Number(params.id));
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    const task = tasks[idx];
    if (task.status !== "in-review") return jsonError("Tarefa não está em revisão", 400);
    // plan-v4 · V4-5 — "nada termina com subtask aberta" vale também na aprovação (DEC-80).
    const openApprove = openSubtasksCount(task.subtasks ?? []);
    if (openApprove > 0) return jsonError(openSubtasksMessage(openApprove, "approve"), 400);
    const updated: typeof task = {
      ...task,
      status: "done",
      completed: true,
      completedAt: new Date().toISOString(),
    };
    tasks[idx] = updated;
    // A aprovação credita o RESPONSÁVEL pela tarefa (OND4-A: `awardPointsForCompletion` com
    // `task.assignedTo`), não quem aprovou — e sem responsável, ninguém é creditado.
    return HttpResponse.json(
      awardedTaskResponse.parse({
        task: updated,
        awardedTo: updated.assignedTo ?? null,
        awardedPoints: updated.assignedTo ? 10 : null,
      }),
    );
  }),

  // POST /api/tasks/[id]/reject — [id]/reject/route.ts (must be in-review; appends FIX line)
  http.post("*/api/tasks/:id/reject", async ({ request, params }) => {
    await delay();
    const idx = tasks.findIndex((t) => t.id === Number(params.id));
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    const task = tasks[idx];
    if (task.status !== "in-review") return jsonError("Tarefa não está em revisão", 400);
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason?.trim();
    const today = new Intl.DateTimeFormat("pt-BR").format(new Date());
    const fixLine = reason ? `FIX (${today}): ${reason}` : null;
    const updated: typeof task = {
      ...task,
      status: "adjust",
      completed: false,
      completedAt: null,
      description: fixLine
        ? task.description?.trim()
          ? `${task.description.trim()}\n\n${fixLine}`
          : fixLine
        : task.description,
    };
    tasks[idx] = updated;
    return HttpResponse.json(taskResponse.parse({ task: updated }));
  }),

  // ---- plan-v4 · V4-5 — subtasks (shapes de app/api/tasks/[id]/subtasks/**/route.ts) ----
  // A resposta carrega a MÃE junto: as duas consequências de mexer numa subtask são da mãe
  // (a base do prêmio e o auto-move para "Em Revisão"). Mock sem a mãe não exercita o cartão.
  http.post("*/api/tasks/:id/subtasks", async ({ request, params }) => {
    await delay();
    const id = Number(params.id);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    const task = tasks[idx];
    if (!SUBTASK_EDITABLE_STATUSES.includes(task.status)) {
      return jsonError(subtaskWindowMessage(task.status), 409);
    }
    const body = (await request.json()) as { title?: string };
    const title = (body?.title ?? "").trim();
    if (!title) return jsonError("O título da subtask é obrigatório", 400);
    const subtask = taskSubtaskSchema.parse({
      id: nextSubtaskId++,
      taskId: id,
      title,
      completed: false,
      completedAt: null,
    });
    const updated: typeof task = {
      ...task,
      subtasks: [...(task.subtasks ?? []), subtask],
      points: task.points + POINTS_PER_TASK,
    };
    tasks[idx] = updated;
    return HttpResponse.json(subtaskResponse.parse({ subtask, task: updated }), { status: 201 });
  }),

  http.patch("*/api/tasks/:id/subtasks/:subtaskId", async ({ request, params }) => {
    await delay();
    const id = Number(params.id);
    const subtaskId = Number(params.subtaskId);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    const task = tasks[idx];
    const subtask = (task.subtasks ?? []).find((s) => s.id === subtaskId);
    if (!subtask) return jsonError("Subtask não encontrada", 404);
    const body = (await request.json()) as { title?: string; completed?: boolean };

    // Janela (DEC-80): renomear mexe na lista, então obedece à janela; concluir NÃO obedece —
    // concluir é justamente o que destrava a mãe. Só `done` fecha a conclusão.
    if (body.title !== undefined && !SUBTASK_EDITABLE_STATUSES.includes(task.status)) {
      return jsonError(subtaskWindowMessage(task.status), 409);
    }
    if (body.completed === false && task.status === "done") {
      return jsonError(subtaskWindowMessage(task.status), 409);
    }

    const nextSubtask = taskSubtaskSchema.parse({
      ...subtask,
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.completed !== undefined
        ? {
            completed: body.completed,
            completedAt: body.completed ? new Date().toISOString() : null,
          }
        : {}),
    });
    const subtasks = (task.subtasks ?? []).map((s) => (s.id === subtaskId ? nextSubtask : s));
    // DEC-81 — a ÚLTIMA subtask concluída move a mãe de `in-progress` para `in-review`.
    const stillOpen = subtasks.filter((s) => !s.completed).length;
    const autoMoved = nextSubtask.completed && stillOpen === 0 && task.status === "in-progress";
    const updated: typeof task = {
      ...task,
      subtasks,
      ...(autoMoved ? { status: "in-review" as const } : {}),
    };
    tasks[idx] = updated;
    return HttpResponse.json(subtaskResponse.parse({ subtask: nextSubtask, task: updated }));
  }),

  http.delete("*/api/tasks/:id/subtasks/:subtaskId", async ({ params }) => {
    await delay();
    const id = Number(params.id);
    const subtaskId = Number(params.subtaskId);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    const task = tasks[idx];
    if (!SUBTASK_EDITABLE_STATUSES.includes(task.status)) {
      return jsonError(subtaskWindowMessage(task.status), 409);
    }
    const subtask = (task.subtasks ?? []).find((s) => s.id === subtaskId);
    if (!subtask) return jsonError("Subtask não encontrada", 404);
    const updated: typeof task = {
      ...task,
      subtasks: (task.subtasks ?? []).filter((s) => s.id !== subtaskId),
      points: Math.max(0, task.points - POINTS_PER_TASK),
    };
    tasks[idx] = updated;
    return HttpResponse.json(subtaskResponse.parse({ subtask, task: updated }));
  }),

  http.delete("*/api/tasks/:id", async ({ params }) => {
    await delay();
    const id = Number(params.id);
    const exists = tasks.some((t) => t.id === id);
    if (!exists) return jsonError("Tarefa não encontrada", 404);
    tasks = tasks.filter((t) => t.id !== id);
    return HttpResponse.json(deleteResponse.parse({ success: true }));
  }),
];

// ---- users store (shapes from app/api/users/** route: GET -> { users }, POST/PUT -> { user }) ----
let users: User[] = boardUsersFixture();

export function resetUserStore() {
  users = boardUsersFixture();
}
export function getUserStore() {
  return users;
}
export function seedUsers(overrides: Partial<User>[]) {
  users = overrides.map((o) => makeUser(o));
}

const userListResponse = z.object({ users: z.array(userSchema) });
const userResponse = z.object({ user: userSchema });

export const userHandlers = [
  http.get("*/api/users", async () => {
    await delay();
    return HttpResponse.json(userListResponse.parse({ users }));
  }),

  http.get("*/api/users/:id", async ({ params }) => {
    await delay();
    const user = users.find((u) => u.id === Number(params.id));
    if (!user) return jsonError("Usuário não encontrado", 404);
    return HttpResponse.json(userResponse.parse({ user }));
  }),

  http.post("*/api/users", async ({ request }) => {
    await delay();
    const body = (await request.json()) as Partial<User>;
    const created = makeUser(body);
    users = [...users, created];
    return HttpResponse.json(userResponse.parse({ user: created }), { status: 201 });
  }),

  http.put("*/api/users/:id", async ({ request, params }) => {
    await delay();
    const id = Number(params.id);
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return jsonError("Usuário não encontrado", 404);
    const body = (await request.json()) as Partial<User>;
    const updated = { ...users[idx], ...body } as User;
    users[idx] = updated;
    return HttpResponse.json(userResponse.parse({ user: updated }));
  }),
];

// ---- projects store (app/api/projects/route.ts: GET -> { projects }, POST -> { project }) ----
let projects: Project[] = boardProjectsFixture();

export function resetProjectStore() {
  projects = boardProjectsFixture();
}
export function getProjectStore() {
  return projects;
}
export function seedProjects(overrides: Partial<Project>[]) {
  projects = overrides.map((o) => makeProject(o));
}

const projectListResponse = z.object({ projects: z.array(projectSchema) });
const projectResponse = z.object({ project: projectSchema });

export const projectHandlers = [
  http.get("*/api/projects", async () => {
    await delay();
    return HttpResponse.json(projectListResponse.parse({ projects }));
  }),

  http.get("*/api/projects/:id", async ({ params }) => {
    await delay();
    const project = projects.find((p) => p.id === Number(params.id));
    if (!project) return jsonError("Projeto não encontrado", 404);
    return HttpResponse.json(projectResponse.parse({ project }));
  }),
];

// ---- lab events store (app/api/lab-events/**: GET ?day&month&year -> { events },
//      GET /upcoming?days -> { events }, POST -> { event }, PATCH -> { event }, DELETE -> { success }) ----
let labEvents: LabEvent[] = labEventsFixture();

export function resetLabEventStore() {
  labEvents = labEventsFixture();
}
export function getLabEventStore() {
  return labEvents;
}
export function seedLabEvents(events: LabEvent[]) {
  labEvents = events.map((e) => makeLabEvent(e));
}

const labEventsResponse = z.object({ events: z.array(labEventSchema) });
const labEventResponse = z.object({ event: labEventSchema });

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const labEventHandlers = [
  // GET /api/lab-events/upcoming — registered BEFORE /:id so "upcoming" is not captured as :id
  http.get("*/api/lab-events/upcoming", async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const rawDays = Number(url.searchParams.get("days") ?? 14);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 0), 90) : 14;
    const from = startOfToday();
    const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
    const events = labEvents
      .filter((e) => {
        const d = new Date(e.date);
        return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return HttpResponse.json(labEventsResponse.parse({ events }));
  }),

  // GET /api/lab-events?day&month&year — one day window (route parses local Y/M/D)
  http.get("*/api/lab-events", async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const day = Number(url.searchParams.get("day"));
    const month = Number(url.searchParams.get("month"));
    const year = Number(url.searchParams.get("year"));
    let events = labEvents;
    if ([day, month, year].every((v) => Number.isFinite(v))) {
      const from = new Date(year, month - 1, day, 0, 0, 0, 0);
      const to = new Date(year, month - 1, day, 23, 59, 59, 999);
      events = events.filter((e) => {
        const d = new Date(e.date);
        return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
      });
    }
    return HttpResponse.json(labEventsResponse.parse({ events }));
  }),

  http.post("*/api/lab-events", async ({ request }) => {
    await delay();
    const body = (await request.json()) as Partial<LabEvent>;
    const created = makeLabEvent(body);
    labEvents = [...labEvents, created];
    return HttpResponse.json(labEventResponse.parse({ event: created }), { status: 201 });
  }),

  http.patch("*/api/lab-events/:id", async ({ request, params }) => {
    await delay();
    const id = Number(params.id);
    const idx = labEvents.findIndex((e) => e.id === id);
    if (idx === -1) return jsonError("Evento não encontrado", 404);
    const body = (await request.json()) as Partial<LabEvent>;
    const updated = { ...labEvents[idx], ...body } as LabEvent;
    labEvents[idx] = updated;
    return HttpResponse.json(labEventResponse.parse({ event: updated }));
  }),

  http.delete("*/api/lab-events/:id", async ({ params }) => {
    await delay();
    const id = Number(params.id);
    const exists = labEvents.some((e) => e.id === id);
    if (!exists) return jsonError("Evento não encontrado", 404);
    labEvents = labEvents.filter((e) => e.id !== id);
    return HttpResponse.json(deleteResponse.parse({ success: true }));
  }),
];

export const handlers = [...taskHandlers, ...userHandlers, ...projectHandlers, ...labEventHandlers];

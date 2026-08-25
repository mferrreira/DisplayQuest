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
import { taskSchema, taskUserProgressSchema, type Task } from "@/entities/task";
import { boardFixture, makeTask } from "./fixtures/tasks";

// ---- in-memory store (per test file via server.use / resetHandlers) ----
let tasks: ReturnType<typeof boardFixture> = boardFixture();

export function resetTaskStore() {
  tasks = boardFixture();
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
const backlogResponse = z.object({ tasks: z.array(taskSchema), createdCount: z.number().int() });
const deleteResponse = z.object({ success: z.boolean() });
const progressResponse = z.object({ progress: z.array(taskUserProgressSchema) });

const jsonError = (message: string, status: number) =>
  HttpResponse.json({ error: message }, { status });

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
    const created = makeTask(body as Partial<Task>);
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
    const updated: typeof task = {
      ...task,
      // gateway :401 — public/global → done; delegated/private → in-review
      status: task.isGlobal || task.taskVisibility === "public" ? "done" : "in-review",
      completed: true,
      completedAt: new Date().toISOString(),
    };
    tasks[idx] = updated;
    return HttpResponse.json(taskResponse.parse({ task: updated }));
  }),

  // POST /api/tasks/[id]/approve — [id]/approve/route.ts (must be in-review)
  http.post("*/api/tasks/:id/approve", async ({ params }) => {
    await delay();
    const idx = tasks.findIndex((t) => t.id === Number(params.id));
    if (idx === -1) return jsonError("Tarefa não encontrada", 404);
    const task = tasks[idx];
    if (task.status !== "in-review") return jsonError("Tarefa não está em revisão", 400);
    const updated: typeof task = {
      ...task,
      status: "done",
      completed: true,
      completedAt: new Date().toISOString(),
    };
    tasks[idx] = updated;
    return HttpResponse.json(taskResponse.parse({ task: updated }));
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

  http.delete("*/api/tasks/:id", async ({ params }) => {
    await delay();
    const id = Number(params.id);
    const exists = tasks.some((t) => t.id === id);
    if (!exists) return jsonError("Tarefa não encontrada", 404);
    tasks = tasks.filter((t) => t.id !== id);
    return HttpResponse.json(deleteResponse.parse({ success: true }));
  }),
];

export const handlers = [...taskHandlers];

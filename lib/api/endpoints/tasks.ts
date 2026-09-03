/**
 * Tasks endpoints — REAL shapes verified from app/api/tasks/route.ts (:45 `{ tasks }`)
 * and backend/models/Task.ts toJSON (:119–136).
 */
import { z } from "zod";
import { apiFetch, qs, type QueryParams } from "@/lib/api/client";
import { wireTaskSchema, taskUserProgressSchema, type Task } from "@/entities/task";

const taskListResponse = z.object({ tasks: z.array(wireTaskSchema) });
const taskResponse = z.object({ task: wireTaskSchema });
const progressResponse = z.object({ progress: z.array(taskUserProgressSchema) });
const deleteResponse = z.object({ success: z.boolean() });

/** Client-side filter params (nuqs-backed in E2); the server filters by session actor. */
/** Client-side filter params (nuqs-backed in E2); the server filters by session actor.
 *  Intersects QueryParams so it flows straight into qs(). */
export type TaskFilters = QueryParams & {
  projectId?: number;
  overdue?: boolean;
  search?: string;
  /** Filtro por pessoa — resolved CLIENT-side (tasks scoped server-side by actor).
   *  Subsumes the old `mine` toggle: selecting the current user's id = "minhas tarefas". */
  assigneeId?: number;
};

export const tasksApi = {
  /** GET /api/tasks — actor-scoped server-side; query params are convenience only. */
  list(params: TaskFilters = {}, signal?: AbortSignal): Promise<Task[]> {
    return apiFetch({
      path: `/api/tasks${qs(params)}`,
      schema: taskListResponse,
      signal,
    }).then((r) => r.tasks);
  },

  getById(id: number, signal?: AbortSignal) {
    return apiFetch({ path: `/api/tasks/${id}`, schema: taskResponse, signal });
  },

  create(body: unknown) {
    return apiFetch({ path: "/api/tasks", method: "POST", body, schema: taskResponse });
  },

  createBacklog(tasks: unknown[]) {
    return apiFetch({
      path: "/api/tasks",
      method: "POST",
      body: { tasks },
      schema: z.object({ tasks: z.array(wireTaskSchema), createdCount: z.number().int() }),
    });
  },

  update(id: number, body: unknown) {
    return apiFetch({
      path: `/api/tasks/${id}`,
      method: "PUT",
      body,
      schema: taskResponse,
    });
  },

  complete(id: number, userId?: number) {
    return apiFetch({
      path: `/api/tasks/${id}`,
      method: "PATCH",
      body: { action: "complete", ...(userId ? { userId } : {}) },
      schema: taskResponse,
    });
  },

  approve(id: number) {
    return apiFetch({ path: `/api/tasks/${id}/approve`, method: "POST", body: {}, schema: taskResponse });
  },

  reject(id: number, reason?: string) {
    return apiFetch({
      path: `/api/tasks/${id}/reject`,
      method: "POST",
      body: reason ? { reason } : {},
      schema: taskResponse,
    });
  },

  remove(id: number) {
    return apiFetch({ path: `/api/tasks/${id}`, method: "DELETE", schema: deleteResponse });
  },

  globalProgress(userId: number) {
    return apiFetch({
      path: `/api/tasks/global-progress${qs({ userId })}`,
      schema: progressResponse,
    });
  },
};

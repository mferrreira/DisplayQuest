/**
 * Tasks endpoints — REAL shapes verified from app/api/tasks/route.ts (:45 `{ tasks }`)
 * and backend/models/Task.ts toJSON (:119–136).
 */
import { z } from "zod";
import { apiFetch, qs, type QueryParams } from "@/lib/api/client";
import { taskSchema, taskUserProgressSchema, type Task } from "@/entities/task";

const taskListResponse = z.object({ tasks: z.array(taskSchema) });
const taskResponse = z.object({ task: taskSchema });
const progressResponse = z.object({ progress: z.array(taskUserProgressSchema) });
const deleteResponse = z.object({ success: z.boolean() });

/** Client-side filter params (nuqs-backed in E2); the server filters by session actor. */
export interface TaskFilters {
  projectId?: number;
  overdue?: boolean;
  search?: string;
}

export const tasksApi = {
  /** GET /api/tasks — actor-scoped server-side; query params are convenience only. */
  list(params: QueryParams = {}, signal?: AbortSignal): Promise<Task[]> {
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
      schema: z.object({ tasks: z.array(taskSchema), createdCount: z.number().int() }),
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

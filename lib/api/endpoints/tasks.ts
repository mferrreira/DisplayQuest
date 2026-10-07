/**
 * Tasks endpoints — REAL shapes verified from app/api/tasks/route.ts (:45 `{ tasks }`)
 * and backend/models/Task.ts toJSON (:119–136).
 */
import { z } from "zod";
import { apiFetch, qs, type QueryParams } from "@/lib/api/client";
import { taskSubtaskSchema, wireTaskSchema, taskUserProgressSchema, type Task, type TaskSubtask } from "@/entities/task";

const taskListResponse = z.object({ tasks: z.array(wireTaskSchema) });
const taskResponse = z.object({ task: wireTaskSchema });

/**
 * plan-v4 · V4-4 — a resposta de uma operação de subtask carrega a MÃE junto. As duas
 * consequências de mexer numa subtask são da mãe: a base do prêmio (10 + 5·n) muda, e a última
 * subtask concluída move a mãe para "Em Revisão". Sem a mãe na resposta, o cliente teria que
 * recarregar o quadro para ver o que acabou de acontecer.
 */
const subtaskMutationResponse = z.object({ subtask: taskSubtaskSchema, task: wireTaskSchema });

/**
 * plan-v3 OND4-A (AC-P3-08) — a resposta de concluir/aprovar carrega o prêmio creditado.
 *
 * `awardedTo` e `awardedPoints` são o par, e o cliente só deve animar o próprio contador quando
 * `awardedTo` é a pessoa logada: a aprovação credita o **responsável** pela tarefa, quase nunca
 * quem aprovou. `null` nos dois = ninguém creditado (tarefa delegada foi para revisão; o award
 * não rodou). `awardedPoints: 0` com `awardedTo` presente = o award já existia e nada mudou —
 * caso diferente de `null`, e a interface trata os dois como "sem delta".
 */
const awardedTaskResponse = z.object({
  task: wireTaskSchema,
  awardedTo: z.number().int().nullable(),
  awardedPoints: z.number().int().nullable(),
});
const progressResponse = z.object({ progress: z.array(taskUserProgressSchema) });
const deleteResponse = z.object({ success: z.boolean() });

export interface AwardedTaskResponse {
  task: Task;
  awardedTo: number | null;
  awardedPoints: number | null;
}

export interface SubtaskMutationResponse {
  subtask: TaskSubtask;
  task: Task;
}

/** Client-side filter params (nuqs-backed in E2); the server filters by session actor. */
/** Client-side filter params (nuqs-backed in E2); the server filters by session actor.
 *  Intersects QueryParams so it flows straight into qs(). */
export type TaskFilters = QueryParams & {
  projectId?: number;
  overdue?: boolean;
  /** Vence hoje — combina com `overdue` em OR (qualquer um ativo filtra). */
  dueToday?: boolean;
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

  complete(id: number, userId?: number): Promise<AwardedTaskResponse> {
    return apiFetch({
      path: `/api/tasks/${id}`,
      method: "PATCH",
      body: { action: "complete", ...(userId ? { userId } : {}) },
      schema: awardedTaskResponse,
    });
  },

  approve(id: number): Promise<AwardedTaskResponse> {
    return apiFetch({
      path: `/api/tasks/${id}/approve`,
      method: "POST",
      body: {},
      schema: awardedTaskResponse,
    });
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

  /** plan-v4 · V4-4 — criar subtask de uma mãe que já existe. */
  createSubtask(id: number, title: string): Promise<SubtaskMutationResponse> {
    return apiFetch({
      path: `/api/tasks/${id}/subtasks`,
      method: "POST",
      body: { title },
      schema: subtaskMutationResponse,
    });
  },

  /** Renomear e/ou concluir. Concluir a última move a mãe para "Em Revisão". */
  updateSubtask(
    id: number,
    subtaskId: number,
    data: { title?: string; completed?: boolean },
  ): Promise<SubtaskMutationResponse> {
    return apiFetch({
      path: `/api/tasks/${id}/subtasks/${subtaskId}`,
      method: "PATCH",
      body: data,
      schema: subtaskMutationResponse,
    });
  },

  removeSubtask(id: number, subtaskId: number): Promise<SubtaskMutationResponse> {
    return apiFetch({
      path: `/api/tasks/${id}/subtasks/${subtaskId}`,
      method: "DELETE",
      schema: subtaskMutationResponse,
    });
  },

  globalProgress(userId: number) {
    return apiFetch({
      path: `/api/tasks/global-progress${qs({ userId })}`,
      schema: progressResponse,
    });
  },
};

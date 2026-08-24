/**
 * Work sessions endpoints — REAL shape verified from app/api/work-sessions/route.ts:
 * this domain wraps EVERYTHING in `{ data }` (:46, :60, :89, :151, :157). Do not "normalize".
 */
import { z } from "zod";
import { apiFetch, qs, type QueryParams } from "@/lib/api/client";
import { workSessionSchema, type WorkSession } from "@/entities/work-session";

const sessionEnvelope = z.object({ data: workSessionSchema });
const sessionListEnvelope = z.object({ data: z.array(workSessionSchema) });

export const workSessionsApi = {
  list(params: QueryParams = {}, signal?: AbortSignal): Promise<WorkSession[]> {
    return apiFetch({
      path: `/api/work-sessions${qs(params)}`,
      schema: sessionListEnvelope,
      signal,
    }).then((r) => r.data);
  },

  active(userId?: number): Promise<WorkSession[]> {
    return workSessionsApi.list({ active: "true", ...(userId ? { userId } : {}) });
  },

  create(body: unknown): Promise<WorkSession> {
    return apiFetch({
      path: "/api/work-sessions",
      method: "POST",
      body,
      schema: sessionEnvelope,
    }).then((r) => r.data);
  },

  patch(
    id: number,
    body: { status?: string; endTime?: string; activity?: string; dailyLogNote?: string; dailyLogDate?: string },
  ): Promise<WorkSession> {
    return apiFetch({
      path: `/api/work-sessions/${id}`,
      method: "PATCH",
      body,
      schema: sessionEnvelope,
    }).then((r) => r.data);
  },

  remove(id: number) {
    return apiFetch({
      path: `/api/work-sessions/${id}`,
      method: "DELETE",
      schema: z.object({ success: z.boolean() }),
    });
  },
};

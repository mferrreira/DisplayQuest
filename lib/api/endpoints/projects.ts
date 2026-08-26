/**
 * Projects endpoints — REAL shapes verified from app/api/projects/route.ts:
 * GET → `{ projects }` (:24), POST → `{ project }` (:69), errors `{ error }`.
 */
import { z } from "zod";
import { apiFetch, qs, type QueryParams } from "@/lib/api/client";
import { projectSchema } from "@/entities/project";
import { userSchema } from "@/entities/user";

const projectListResponse = z.object({ projects: z.array(projectSchema) });
const projectResponse = z.object({ project: projectSchema });

export const projectsApi = {
  list(params: QueryParams = {}, signal?: AbortSignal) {
    return apiFetch({
      path: `/api/projects${qs(params)}`,
      schema: projectListResponse,
      signal,
    }).then((r) => r.projects);
  },

  create(body: unknown) {
    return apiFetch({ path: "/api/projects", method: "POST", body, schema: projectResponse });
  },

  getById(id: number, signal?: AbortSignal) {
    return apiFetch({ path: `/api/projects/${id}`, schema: projectResponse, signal });
  },

  update(id: number, body: unknown) {
    return apiFetch({
      path: `/api/projects/${id}`,
      method: "PUT",
      body,
      schema: projectResponse,
    });
  },

  remove(id: number) {
    return apiFetch({
      path: `/api/projects/${id}`,
      method: "DELETE",
      schema: z.object({ success: z.boolean() }),
    });
  },

  members(id: number) {
    // Shape per spec/api-contracts.md; re-verify against route source in E4 before relying on it.
    return apiFetch({
      path: `/api/projects/${id}/members`,
      schema: z.object({ members: z.array(z.record(z.unknown())) }),
    });
  },

  volunteers(id: number) {
    return apiFetch({
      path: `/api/projects/${id}/volunteers`,
      schema: z.object({ volunteers: z.array(userSchema) }),
    }).then((r) => r.volunteers);
  },
};

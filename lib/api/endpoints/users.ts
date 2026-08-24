/**
 * Users endpoints — REAL shapes verified from app/api/users/route.ts:
 * GET → `{ users }` (:16), POST → `{ user }` (:48).
 */
import { z } from "zod";
import { apiFetch, qs, type QueryParams } from "@/lib/api/client";
import { userSchema, type User } from "@/entities/user";

const userListResponse = z.object({ users: z.array(userSchema) });
const userResponse = z.object({ user: userSchema });

export const usersApi = {
  list(params: QueryParams = {}, signal?: AbortSignal): Promise<User[]> {
    return apiFetch({
      path: `/api/users${qs(params)}`,
      schema: userListResponse,
      signal,
    }).then((r) => r.users);
  },

  create(body: unknown) {
    return apiFetch({ path: "/api/users", method: "POST", body, schema: userResponse });
  },

  getById(id: number, signal?: AbortSignal) {
    return apiFetch({ path: `/api/users/${id}`, schema: userResponse, signal });
  },

  update(id: number, body: unknown) {
    return apiFetch({
      path: `/api/users/${id}`,
      method: "PUT",
      body,
      schema: userResponse,
    });
  },

  addPoints(id: number, points: number) {
    return apiFetch({
      path: `/api/users/${id}`,
      method: "PATCH",
      body: { action: "addPoints", points },
      schema: userResponse,
    });
  },

  leaderboard(type: "points" | "tasks" = "points", limit?: number) {
    return apiFetch({
      path: `/api/users/leaderboard${qs({ type, limit })}`,
      schema: z.object({ leaderboard: z.array(userSchema) }),
    }).then((r) => r.leaderboard);
  },
};

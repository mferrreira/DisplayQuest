/**
 * Notifications endpoints — REAL shapes verified from route source (E1/T1.4b re-verification):
 *
 * GET  /api/notifications            → `{ success: true, notifications }` (route.ts:21)
 * GET  /api/notifications?count=true → `{ success: true, count }`        (route.ts:17)
 * PUT  /api/notifications/[id]       → body MUST be `{ action: "markAsRead" }`
 *                                       ([id]/route.ts:14 — PATCH is NOT implemented; a
 *                                       previous PATCH/{read} assumption was WRONG and
 *                                       returned 400 "Ação não suportada". D-14.)
 * DELETE /api/notifications/[id]     → `{ success: true, message }`
 * POST /api/notifications/mark-all-read → ok; body {}
 */
import { z } from "zod";
import { apiFetch, qs } from "@/lib/api/client";
import { notificationSchema } from "@/entities/notification";

export const notificationsApi = {
  list(params: { unread?: boolean } = {}) {
    return apiFetch({
      path: `/api/notifications${qs(params)}`,
      schema: z.object({
        success: z.boolean().optional(),
        notifications: z.array(notificationSchema),
      }),
    }).then((r) => r.notifications);
  },

  unreadCount() {
    return apiFetch({
      path: "/api/notifications?count=true",
      schema: z.object({
        success: z.boolean().optional(),
        count: z.number().int(),
      }),
    }).then((r) => r.count);
  },

  markRead(id: number) {
    return apiFetch({
      path: `/api/notifications/${id}`,
      method: "PUT",
      body: { action: "markAsRead" },
      schema: z.unknown(),
    }).then(() => undefined);
  },

  markAllRead() {
    return apiFetch({
      path: "/api/notifications/mark-all-read",
      method: "POST",
      body: {},
      schema: z.unknown(),
    }).then(() => undefined);
  },

  remove(id: number) {
    return apiFetch({
      path: `/api/notifications/${id}`,
      method: "DELETE",
      schema: z.unknown(),
    }).then(() => undefined);
  },
};

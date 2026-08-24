/**
 * Notifications endpoints — REAL shape verified from app/api/notifications/route.ts:
 * GET → `{ success: true, notifications }` (:21). The success flag is part of the wire
 * contract and is parsed then discarded.
 */
import { z } from "zod";
import { apiFetch, qs, type QueryParams } from "@/lib/api/client";
import { notificationSchema } from "@/entities/notification";

export const notificationsApi = {
  list(params: QueryParams = {}) {
    return apiFetch({
      path: `/api/notifications${qs(params)}`,
      schema: z.object({
        success: z.boolean().optional(),
        notifications: z.array(notificationSchema),
      }),
    }).then((r) => r.notifications);
  },

  markRead(id: number) {
    return apiFetch({
      path: `/api/notifications/${id}`,
      method: "PATCH",
      body: { read: true },
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
};

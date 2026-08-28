/**
 * Lab events endpoints — REAL shapes verified from app/api/lab-events/route.ts
 * (GET `{ events }`, POST `{ event }`), app/api/lab-events/[id]/route.ts
 * (PATCH `{ event }`, DELETE `{ success }`) and
 * app/api/lab-events/upcoming/route.ts (GET `{ events }`).
 */
import { z } from "zod";
import { apiFetch, qs } from "@/lib/api/client";
import { labEventSchema } from "@/entities/lab";

const labEventsResponse = z.object({ events: z.array(labEventSchema) });
const labEventResponse = z.object({ event: labEventSchema });
const deleteResponse = z.object({ success: z.boolean() });

export const labEventsApi = {
  /** GET /api/lab-events — events for one day (server parses local Y/M/D). */
  listByDate(day: number, month: number, year: number, signal?: AbortSignal) {
    return apiFetch({
      path: `/api/lab-events${qs({ day, month, year })}`,
      schema: labEventsResponse,
      signal,
    }).then((r) => r.events);
  },

  /** GET /api/lab-events/upcoming — events from today forward (days defaulted/clamped server-side). */
  upcoming(days = 14, signal?: AbortSignal) {
    return apiFetch({
      path: `/api/lab-events/upcoming${qs({ days })}`,
      schema: labEventsResponse,
      signal,
    }).then((r) => r.events);
  },

  create(body: { date: string; note: string }) {
    return apiFetch({
      path: "/api/lab-events",
      method: "POST",
      body,
      schema: labEventResponse,
    }).then((r) => r.event);
  },

  update(id: number, body: { date?: string; note?: string }) {
    return apiFetch({
      path: `/api/lab-events/${id}`,
      method: "PATCH",
      body,
      schema: labEventResponse,
    }).then((r) => r.event);
  },

  remove(id: number) {
    return apiFetch({ path: `/api/lab-events/${id}`, method: "DELETE", schema: deleteResponse });
  },
};
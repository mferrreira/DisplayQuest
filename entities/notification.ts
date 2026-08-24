/**
 * NOTIFICATION entity — prisma/schema.prisma `notifications` (:402–416).
 * ⚠ `data` is a STRINGIFIED JSON column (schema comment :408) — parse defensively at call site.
 */
import { z } from "zod";
import { dateTimeString, nullableDateTimeString } from "./user";

export const notificationSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  /** Stringified JSON per schema.prisma:408 — use safeNotificationData() to unwrap. */
  data: z.string().nullable().optional(),
  read: z.boolean().default(false),
  createdAt: dateTimeString,
  readAt: nullableDateTimeString.optional(),
});
export type Notification = z.infer<typeof notificationSchema>;

export function safeNotificationData(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

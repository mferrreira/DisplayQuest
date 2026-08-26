/**
 * WORK SESSION + DAILY LOG entities — prisma/schema.prisma `work_sessions` (:261–278),
 * `work_session_tasks` (:280–290), `daily_logs` (:164–175).
 * State machine: active ↔ paused → completed (+ optional daily log). product-model.md.
 */
import { z } from "zod";
import { dateTimeString, nullableDateTimeString } from "./user";

export const workSessionStatusSchema = z.enum(["active", "paused", "completed"]);

export const workSessionTaskSchema = z.object({
  id: z.number().int(),
  workSessionId: z.number().int(),
  taskId: z.number().int(),
  createdAt: dateTimeString,
});

export const workSessionSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  startTime: dateTimeString,
  endTime: nullableDateTimeString.optional(),
  /** Accumulated seconds while paused; null while running. Client MUST derive elapsed from startTime math. */
  duration: z.number().nullable().optional(),
  activity: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  projectId: z.number().int().nullable().optional(),
  status: workSessionStatusSchema.default("active"),
  createdAt: dateTimeString.optional(),
  updatedAt: dateTimeString.optional(),
  tasks: z.array(workSessionTaskSchema).optional(),
});
export type WorkSession = z.infer<typeof workSessionSchema>;

export const dailyLogSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  projectId: z.number().int().nullable().optional(),
  date: dateTimeString,
  note: z.string().nullable().optional(),
  createdAt: dateTimeString.optional(),
  workSessionId: z.number().int().nullable().optional(),
});
export type DailyLog = z.infer<typeof dailyLogSchema>;

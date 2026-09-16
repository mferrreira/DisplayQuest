/**
 * LABORATORY entities — prisma/schema.prisma `lab_responsibilities` (:154–162),
 * `laboratory_schedules` (:232–240), `user_schedules` (:222–230),
 * `lab_events` (:300–308). All time-of-day fields are plain Strings ("HH:mm" convention).
 */
import { z } from "zod";

export const labResponsibilitySchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  startTime: z.string(), // DB String — parse defensively
  endTime: z.string().nullable().optional(), // null while active
  pausedAt: z.string().nullable().optional(), // ISO; null = running
  totalPausedMs: z.number().int().default(0),
  notes: z.string().nullable().optional(),
});
export type LabResponsibility = z.infer<typeof labResponsibilitySchema>;

export const laboratoryScheduleSchema = z.object({
  id: z.number().int(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  notes: z.string().nullable().optional(),
});
export type LaboratorySchedule = z.infer<typeof laboratoryScheduleSchema>;

export const userScheduleSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
});
export type UserSchedule = z.infer<typeof userScheduleSchema>;

export const labEventSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  date: z.string(), // DateTime column, JSON-transported — parse defensively
  note: z.string(),
  createdAt: z.string().optional(), // "Criado em" on detail dialog; missing on legacy rows
});
export type LabEvent = z.infer<typeof labEventSchema>;

/** Shared shape for schedule grids that render both lab defaults and personal availability. */
export const scheduleSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
});
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

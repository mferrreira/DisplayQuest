/**
 * REPORT entities — prisma/schema.prisma `weekly_reports` (:177–187),
 * `weekly_hours_history` (:310–319), `project_reports` (:189–206), `report_attachments` (:208–220).
 */
import { z } from "zod";
import { dateTimeString } from "./user";

/** Source: lib/constants/report-periods.ts + app/api/project-reports/route.ts validation. */
export const reportPeriodTypeSchema = z.enum(["weekly", "biweekly", "monthly", "semiannual", "annual"]);

export const weeklyReportSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  weekStart: dateTimeString,
  weekEnd: dateTimeString,
  totalLogs: z.number().int(),
  summary: z.string().nullable().optional(),
  createdAt: dateTimeString.optional(),
});
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;

export const weeklyHoursHistorySchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  weekStart: dateTimeString,
  weekEnd: dateTimeString,
  totalHours: z.number(),
  createdAt: dateTimeString.optional(),
});
export type WeeklyHoursHistory = z.infer<typeof weeklyHoursHistorySchema>;

export const reportAttachmentSchema = z.object({
  id: z.number().int(),
  reportId: z.number().int(),
  fileName: z.string(),
  storedPath: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  uploadedBy: z.number().int(),
  createdAt: dateTimeString.optional(),
});
export type ReportAttachment = z.infer<typeof reportAttachmentSchema>;

export const projectReportSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  authorId: z.number().int(),
  periodType: reportPeriodTypeSchema,
  periodStart: dateTimeString,
  periodEnd: dateTimeString,
  title: z.string().nullable().optional(),
  content: z.string(),
  createdAt: dateTimeString.optional(),
  updatedAt: dateTimeString.optional(),
  attachments: z.array(reportAttachmentSchema).optional(),
});
export type ProjectReport = z.infer<typeof projectReportSchema>;

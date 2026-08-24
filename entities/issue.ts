/**
 * ISSUE entity — prisma/schema.prisma `issues` (:349–363), enums IssueStatus/IssuePriority.
 * Lifecycle: open → in_progress → resolved | closed (+ reopen mapping per E5.4 spec).
 */
import { z } from "zod";
import { dateTimeString, nullableDateTimeString } from "./user";

export const issueStatusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);
export const issuePrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const issueSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string(),
  status: issueStatusSchema.default("open"),
  priority: issuePrioritySchema.default("medium"),
  category: z.string().nullable().optional(),
  reporterId: z.number().int(),
  assigneeId: z.number().int().nullable().optional(),
  createdAt: dateTimeString,
  updatedAt: dateTimeString.optional(),
  resolvedAt: nullableDateTimeString.optional(),
});
export type Issue = z.infer<typeof issueSchema>;

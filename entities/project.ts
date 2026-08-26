/**
 * PROJECT entity — mirrors prisma/schema.prisma `model projects` (:49–65) and
 * `model project_members` (:67–77).
 * ⚠ projects.createdAt is `String` in the DB (not DateTime) — do not "fix" here.
 */
import { z } from "zod";
import { dateTimeString, userRoleSchema } from "./user";

export const projectSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string(), // DB stores String — defensive parsing at UI layer only
  createdBy: z.number().int(),
  leaderId: z.number().int().nullable().optional(),
  status: z.string(), // active | completed | archived (plain String column)
  links: z.unknown().nullable().optional(), // Json? — shape owned by backend
});
export type Project = z.infer<typeof projectSchema>;

export const projectMemberSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  userId: z.number().int(),
  joinedAt: dateTimeString,
  roles: z.array(userRoleSchema),
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

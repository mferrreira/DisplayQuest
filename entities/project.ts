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
  // V5-2b (DEC-61/63): datas civis `YYYY-MM-DD` (String no schema, como createdAt/dueDate).
  // Opcionais: o parse não pode quebrar contra uma resposta de uma instância ainda sem a
  // migration aplicada. V8-1 (DEC-215): o `points` do projeto saiu junto da coluna.
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  editalNumber: z.string().nullable().optional(),
  processNumber: z.string().nullable().optional(),
  // V5-4a (DEC-140): nº PROPPI.
  proppiNumber: z.string().nullable().optional(),
  // V5-2d (DEC-102): chave do objeto no bucket (logo/banner). Opcional: o parse não pode quebrar
  // contra uma instância ainda sem a migration aplicada.
  logoKey: z.string().nullable().optional(),
  bannerKey: z.string().nullable().optional(),
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

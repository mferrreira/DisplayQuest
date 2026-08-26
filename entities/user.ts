/**
 * USER entity — mirrors prisma/schema.prisma `model users` (:10–47) + enums UserRole/ProfileVisibility.
 * JSON transport: DateTime fields arrive as ISO strings via NextResponse.json.
 */
import { z } from "zod";

export const userRoleSchema = z.enum([
  "COORDENADOR",
  "GERENTE",
  "LABORATORISTA",
  "PESQUISADOR",
  "GERENTE_PROJETO",
  "COLABORADOR",
  "VOLUNTARIO",
]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const profileVisibilitySchema = z.enum(["public", "members_only", "private"]);
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;

/** Accepts anything `Date.parse` understands (server serializes Prisma DateTime to ISO string). */
export const dateTimeString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "invalid datetime string" });

export const nullableDateTimeString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "invalid datetime string" })
  .nullable();

export const userStatusSchema = z.enum(["pending", "active", "rejected", "suspended"]);

export const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  points: z.number().int(),
  completedTasks: z.number().int(),
  password: z.string().nullable().optional(), // never sent by API responses that matter; defensive
  status: userStatusSchema,
  weekHours: z.number(),
  createdAt: dateTimeString.optional(), // not always sent by list endpoints
  currentWeekHours: z.number().optional(), // not always sent by list endpoints
  roles: z.array(userRoleSchema),
  avatar: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  profileVisibility: profileVisibilitySchema.default("public"),
});
export type User = z.infer<typeof userSchema>;

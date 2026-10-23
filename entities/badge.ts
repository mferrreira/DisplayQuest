/**
 * BADGE entities — prisma/schema.prisma `badges` (:321–334), `user_badges` (:336–347),
 * enum BadgeCategory. NOTE: gamification module today only touches users/history tables
 * (AGENTS.md) — badge CRUD routes exist and are used by the admin badge manager.
 */
import { z } from "zod";
import { dateTimeString } from "./user";

export const badgeCategorySchema = z.enum(["achievement", "milestone", "special", "social"]);

export const badgeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  category: badgeCategorySchema,
  criteria: z.unknown().nullable().optional(), // Json? — owned by backend rules
  // V8-6 (DEC-218): o Json dos efeitos equipáveis, na mesma regra do critério — a lista de verbos e
  // tiers é fechada no domínio (`trophy-effects.ts`) e a leitura é defensiva; a trilha de wire só
  // carrega o Json.
  effects: z.unknown().nullable().optional(), // Json? — owned by backend rules
  isActive: z.boolean().default(true),
  createdAt: dateTimeString.optional(),
  createdBy: z.number().int(),
});
export type Badge = z.infer<typeof badgeSchema>;

export const userBadgeSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  badgeId: z.number().int(),
  earnedAt: dateTimeString,
  earnedBy: z.number().int().nullable().optional(),
  // V8-6 (DEC-218): qual dos troféus conquistados está equipado. Opcional no wire: as linhas
  // anteriores à coluna (e os fixtures antigos) não a declaram — `UserRecord.coins` na V8-5 é o
  // precedente de por que ausente não é apagado.
  /** APIs may embed the badge definition; optional until T0.5 confirms per-endpoint shape. */
  badge: badgeSchema.optional(),
  equipped: z.boolean().optional(),
});
export type UserBadge = z.infer<typeof userBadgeSchema>;

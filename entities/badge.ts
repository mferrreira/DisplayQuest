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
  /** APIs may embed the badge definition; optional until T0.5 confirms per-endpoint shape. */
  badge: badgeSchema.optional(),
});
export type UserBadge = z.infer<typeof userBadgeSchema>;

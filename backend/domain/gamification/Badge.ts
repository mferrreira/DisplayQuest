/**
 * Badge / UserBadge — pure domain contracts of the gamification aggregate (SPEC §4.5).
 *
 * Type-only mirrors of `backend/models/Badge.ts` (interface + class fields). The award/
 * progression rules currently living in `backend/modules/gamification/domain/engines/*` move
 * to this folder as pure rules in OND6-B2, reading data through a port instead of a repository.
 */

export type BadgeCategory = "achievement" | "milestone" | "special" | "social";

export interface BadgeCriteria {
  points?: number;
  tasks?: number;
  projects?: number;
  workSessions?: number;
  weeklyHours?: number;
  consecutiveDays?: number;
  specialCondition?: string;
}

export interface Badge {
  id?: number;
  name: string;
  description: string;
  icon?: string | null | undefined;
  color?: string | null | undefined;
  category: BadgeCategory;
  criteria?: BadgeCriteria | null;
  isActive: boolean;
  createdAt?: Date;
  createdBy: number;
}

export interface UserBadge {
  id?: number;
  userId: number;
  badgeId: number;
  earnedAt?: Date;
  earnedBy?: number | null;
}

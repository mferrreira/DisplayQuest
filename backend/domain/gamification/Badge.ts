/**
 * Badge / UserBadge — pure domain contracts of the gamification aggregate (SPEC §4.5).
 *
 * Authored here: the type-only mirror source (`backend/models/Badge.ts`) was removed in D-2
 * (DEC-142), and this is the only Badge vocabulary in the codebase. The award/
 * progression rules currently living in `backend/modules/gamification/domain/engines/*` move
 * to this folder as pure rules in OND6-B2, reading data through a port instead of a repository.
 */

import type { BadgeCriteriaV2 } from "@/backend/domain/gamification/metric-registry";

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

/** Todo `criteria` que chega do JSON da tabela: as duas gerações do formato. */
export type BadgeCriteriaJson = BadgeCriteria | BadgeCriteriaV2 | null | undefined;

export interface Badge {
  id?: number;
  name: string;
  description: string;
  icon?: string | null | undefined;
  color?: string | null | undefined;
  category: BadgeCategory;
  criteria?: BadgeCriteria | BadgeCriteriaV2 | null;
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

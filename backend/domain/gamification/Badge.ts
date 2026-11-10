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

/** Passiva do badge (plan-v15 R8): bônus de prêmio ou redução de penalidade, em fração. */
export interface BadgeEffectBonus {
  kind: "bonus";
  pct: number;
}

export interface BadgeEffectPenaltyReduction {
  kind: "penaltyReduction";
  pct: number;
}

export type BadgeEffect = BadgeEffectBonus | BadgeEffectPenaltyReduction;

export interface Badge {
  id?: number;
  name: string;
  description: string;
  icon?: string | null | undefined;
  color?: string | null | undefined;
  category: BadgeCategory;
  criteria?: BadgeCriteria | BadgeCriteriaV2 | null;
  slug?: string | null;
  effect?: BadgeEffect | null;
  /** plan-v16 S01 (DEC-243): CHAVE do ícone no bucket, nunca um caminho de disco. */
  iconKey?: string | null;
  isActive: boolean;
  createdAt?: Date;
  /** plan-v15 S09 (R5): badge de catálogo instala sem autor — `null` é leitura, escrita (badge-rules) continua exigindo número. */
  createdBy: number | null;
}

export interface UserBadge {
  id?: number;
  userId: number;
  badgeId: number;
  earnedAt?: Date;
  earnedBy?: number | null;
  equipped?: boolean;
  badge?: Badge;
}

/**
 * PassiveRules — plan-v15 S05/S06 (MODELO R10). O multiplicador entra na ESCRITA do
 * prêmio, depois da regra pura; as regras puras (taskAwardPoints, penalidade, Hamilton)
 * continuam intocadas. Cap do bônus: +100% — a soma de pct é limitada a 1, o
 * multiplicador não passa de 2. A redução de penalidade é limitada a 100% e nunca
 * transforma penalidade em prêmio (o corte em >= 0 é do S06).
 */

import type { BadgeEffect } from "@/backend/domain/gamification/Badge";

export const BONUS_CAP_PCT = 1;
export const PENALTY_REDUCTION_CAP_PCT = 1;

export function bonusMultiplier(effects: BadgeEffect[]): number {
  const sum = effects.filter((e) => e.kind === "bonus").reduce((s, e) => s + e.pct, 0);
  return 1 + Math.min(sum, BONUS_CAP_PCT);
}

export function penaltyReductionTotal(effects: BadgeEffect[]): number {
  const sum = effects.filter((e) => e.kind === "penaltyReduction").reduce((s, e) => s + e.pct, 0);
  return Math.min(sum, PENALTY_REDUCTION_CAP_PCT);
}

/** Prêmio final = round(prêmio × bônus). Negativo atravessa multiplicado (DEC-39 sem piso). */
export function applyPassiveBonus(points: number, effects: BadgeEffect[]): number {
  return Math.round(points * bonusMultiplier(effects));
}

/**
 * EquipRules — plan-v15 S04 (MODELO R9, estados "Equipar exige"). Função pura de decisão:
 * o use case lê o estado (conquistada, badge existe, passiva, slots, self) e passa aqui;
 * a violação devolvida vira a DomainError com a frase congelada. Ordem da checagem é a do
 * estado declarado no MODELO: self, conquistada, passiva, slot — ela não pode mudar.
 */

import type { BadgeEffect } from "@/backend/domain/gamification/Badge";

export const EQUIP_SLOT_MAX = 3;

/** Frase congelada do MODELO ("Slot cheio: 409 com a frase ..."). */
export const SLOT_FULL_MESSAGE = "Slots de passiva cheios";
export const EQUIP_DENIED_MESSAGE = "Não autorizado";
export const NOT_EARNED_MESSAGE = "Usuário não possui este badge";
export const BADGE_NOT_FOUND_MESSAGE = "Badge não encontrado";
export const NO_PASSIVE_MESSAGE = "Badge sem passiva não é equipável";

export type EquipViolation = "denied" | "not-earned" | "badge-not-found" | "no-passive" | "slot-full";

export interface EquipGateState {
  isSelf: boolean;
  earned: boolean;
  badgeExists: boolean;
  passive: boolean;
  equippedCount: number;
  targetEquipped: boolean;
}

export function hasPassive(effect: BadgeEffect | null | undefined): boolean {
  return effect != null;
}

export function equipViolation(state: EquipGateState): EquipViolation | null {
  if (!state.isSelf) return "denied";
  if (!state.earned) return "not-earned";
  if (!state.badgeExists) return "badge-not-found";
  if (!state.passive) return "no-passive";
  // Desequipar nunca é bloqueado por slot; só a equipagem disputa os 3 slots.
  if (state.targetEquipped && state.equippedCount >= EQUIP_SLOT_MAX) return "slot-full";
  return null;
}

/** Texto do efeito para a tela: "+10% pontos" / "-15% penalidade". */
export function equipEffectLabel(effect: BadgeEffect): string {
  const pct = Math.round(effect.pct * 100);
  return effect.kind === "bonus" ? `+${pct}% pontos` : `-${pct}% penalidade`;
}

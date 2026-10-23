/**
 * backend/domain/gamification/trophy-equip-rules.ts — o vocabulário do equipar/desequipar
 * (plan-v8 V8-6, DEC-218).
 *
 * O que a onda decide aqui, e não no use case: as frases congeladas, a ação aceita e a chave da
 * linha de auditoria. O teto de slots é a escada (`elo-rules.ts`, `trophySlotsForElo`), e a
 * autoridade é o ator (`requireActorSelf`) — este arquivo nomeia as consequências das duas.
 *
 * Equipar acima do slot responde com UMA frase só da escada (`trophySlotMessage`), contada pelo elo
 * do momento: quem está em BRONZE ouve "permite equipar até 0 troféus" e quem está em OURO com dois
 * equipados ouve a mesma família de frase. Duas frases diferentes seriam duas regras.
 */

import { ValidationError } from "@/backend/domain/errors/DomainError";

export const TROPHY_EQUIP_ACTIONS = ["equip", "unequip"] as const;

export type TrophyEquipAction = (typeof TROPHY_EQUIP_ACTIONS)[number];

export const TROPHY_EQUIP_ACTIONS_MESSAGE = "Ação inválida";

export function parseTrophyEquipAction(raw: unknown): TrophyEquipAction {
  if (typeof raw === "string" && (TROPHY_EQUIP_ACTIONS as readonly string[]).includes(raw)) {
    return raw as TrophyEquipAction;
  }
  throw new ValidationError(TROPHY_EQUIP_ACTIONS_MESSAGE);
}

/** DEC-218 / MODELO §6: "a pessoa equipa" — a gestão concede e remove (MANAGE_USERS), mas não equipar. */
export const TROPHY_EQUIP_DENIED_MESSAGE = "Só a própria pessoa pode equipar seus troféus.";

/** A pessoa não tem o troféu: não há o que equipar. */
export const TROPHY_NOT_EARNED_MESSAGE = "Usuário não possui este troféu";

/** O troféu existe, mas não está no catálogo (rota de equip por id forjado). */
export const TROPHY_BADGE_NOT_FOUND_MESSAGE = "Badge não encontrado";

/**
 * A linha de auditoria do movimento de troféu. Uma por estado que mudou de verdade (equipar o que
 * já está equipado e desequipar o que não está equipam nada e não escrevem linha — o livro-caixa
 * registra o que aconteceu).
 *
 * A chave nomeia a pessoa e o troféu porque `entityId` é a pessoa e `performedBy` é quem assinou;
 * a linha continua legível depois de o troféu ser removido do catálogo (`user_badges` cascadeia,
 * `history` não).
 */
export function trophyEquipDescription(action: TrophyEquipAction, userId: number, badgeId: number): string {
  return `GAMIFICATION:TROPHY_${action.toUpperCase()}:${userId}:${badgeId}`;
}

/** O estado do equip na linha de auditoria: quantos estavam equipados antes e depois. */
export function trophyEquipAudit(action: TrophyEquipAction, badgeId: number, before: number, after: number) {
  return {
    domain: "gamification",
    action,
    badgeId,
    equippedBefore: before,
    equippedAfter: after,
  };
}

/** A conta do slot, feita sobre a contagem lida (o número que recusa é o mesmo que a UI mostra). */
export function canEquipWithinSlots(equippedCount: number, slots: number): boolean {
  return equippedCount < slots;
}

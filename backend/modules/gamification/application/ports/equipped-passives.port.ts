import type { BadgeEffect } from "@/backend/domain";

/**
 * EquippedPassivesPort — plan-v15 S05 (MODELO R10): as passivas equipadas de uma pessoa,
 * na ordem em que estão equipadas. Leitura só do que vale: `user_badges.equipped = true`
 * com `badges.effect` não nulo. Badge inativa equipada também entra — a regra de escrita
 * é sobre o efeito, e a desativação de badge é decisão que ainda não existe no plano.
 */
export interface EquippedPassivesPort {
  listEquippedEffects(userId: number): Promise<BadgeEffect[]>;
}

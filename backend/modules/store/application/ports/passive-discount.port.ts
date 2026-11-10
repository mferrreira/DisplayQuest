import type { BadgeEffect } from "@/backend/domain";

/**
 * PassiveDiscountPort — plan-v15 S08 (R14, padrão DEC-21): a loja não conhece badges nem
 * a tabela `user_badges`; quem conhece é o gamification, injetado no composition root.
 * O default da fábrica é o no-op (sem desconto) para que testes de unit e a instalação
 * sem wiring continuem exatamente com o preço da tabela.
 */
export interface PassiveDiscountPort {
  bonusEffectsFor(userId: number): Promise<BadgeEffect[]>;
}

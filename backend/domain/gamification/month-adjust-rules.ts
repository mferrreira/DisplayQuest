import { ValidationError } from "@/backend/domain/errors";

/**
 * plan-v9 S05 (MODELO §6, CA12; ADR-006/DEC-228) — aritmética do ajuste do placar do mês.
 *
 * A DEC-228 manda espelhar o trinômio do SALDO (DEC-60, UpdateUserPointsUseCase): `set` escreve
 * valor absoluto e aceita negativo, porque o placar também fica negativo (o mesmo atraso sem
 * piso da DEC-39 alcança a trilha do mês); `add` tem chão em 0 (Math.max); `remove` exige
 * suficiência e não aceita negativo. O que NUNCA muda um mês fechado: estas regras não leem nem
 * escrevem `month_history` — toque no placar vivo é só a coluna do mês corrente, por definição.
 *
 * Mensagens congeladas aqui porque a recusa tem que NOMEAR o que recusou; a rota e o use case
 * dizem a mesma frase (padrão MONTH_CLOSE_DENIED_MESSAGE).
 */
export const MONTH_ADJUST_DENIED_MESSAGE =
  "Apenas coordenadores e gerentes podem ajustar o placar do mês";

export const MONTH_ADJUST_INSUFFICIENT_MESSAGE = "Placar do mês insuficiente para remover esse valor";

export const MONTH_ADJUST_NON_NEGATIVE_MESSAGE = "Pontos devem ser um número não negativo";

export type MonthPointsAction = "set" | "add" | "remove";

export const MONTH_POINTS_ACTIONS: readonly MonthPointsAction[] = ["set", "add", "remove"] as const;

/** Vocabulário da ação, recusado nomeando os valores que a regra aceita. */
export function monthPointsActionOf(value: unknown): MonthPointsAction {
  if (typeof value !== "string" || !MONTH_POINTS_ACTIONS.includes(value as MonthPointsAction)) {
    throw new ValidationError("Ação inválida", { details: { action: String(value) } });
  }
  return value as MonthPointsAction;
}

export interface MonthAdjustInput {
  action: MonthPointsAction
  /** Valor do ajuste (o delta em add/remove; o valor absoluto em set). */
  points: number
  /** Placar do mês lido antes da escrita — a suficiência do remove consulta ele. */
  current: number
}

/** Valor seguinte do placar do mês na régua do trinômio. A rota e o use case chamam a MESMA regra. */
export function nextMonthPoints(input: MonthAdjustInput): number {
  if (Number.isNaN(input.current)) {
    throw new ValidationError("Placar do mês inválido", { details: { current: String(input.current) } });
  }
  if (input.action === "set") {
    // DEC-228/DEC-60: `set` aceita negativo — a escala do placar produz totais negativos e a
    // administração precisa conseguir escrevê-los de volta.
    return input.points;
  }
  if (input.points < 0) {
    throw new ValidationError(MONTH_ADJUST_NON_NEGATIVE_MESSAGE, { details: { points: input.points } });
  }
  if (input.action === "add") {
    // Chão em 0, o mesmo `Math.max` do saldo da DEC-60: o ajuste nunca empurra o placar para baixo.
    return Math.max(0, input.current + input.points);
  }
  if (input.current < input.points) {
    throw new ValidationError(MONTH_ADJUST_INSUFFICIENT_MESSAGE);
  }
  return input.current - input.points;
}

/**
 * A chave da linha de auditoria em `history` (DEC-228: cada ajuste vira linha com quem, quando,
 * para quem e de→para). Um mês na descrição resolve o mês sem depender do payload. A ação é
 * DISTINTA de GAMIFICATION_AWARD de propósito: a dedupe da premiação consulta
 * (action, description, entityId) e um ajuste não pode zerar um prêmio futuro.
 */
export const MONTH_ADJUST_HISTORY_ACTION = "GAMIFICATION_MONTH_ADJUST";

export function monthAdjustDescription(month: string): string {
  return `GAMIFICATION:MONTH_POINTS_ADJUST:${month}`;
}

/**
 * backend/domain/gamification/trophy-effects.ts — o efeito do troféu equipado no instantâneo do
 * credit (plan-v8 V8-6, DEC-218/219).
 *
 * MODELO §6 (rodada 4): o admin cria troféu ESCOLHENDO verbo e tier de uma lista fechada —
 * "nenhum número livre". Por isso `TrophyEffect` não tem campo numérico: o número mora no tier, e o
 * `tsc` não deixa um efeito inventar percentual. O admin escolhe `Tier2`; o que Tier2 vale é
 * decidido aqui, uma vez.
 *
 * Verbos (MODELO §6): `pontos_tarefa +%`, `pontos_sessao +%`, `moedas_atividade +%` e
 * `penalidade −%` (reduz penalidade de atraso). Cada fonte de credit tem o SEU verbo de boost:
 * tarefa → `pontos_tarefa`, sessão → `pontos_sessao`, moeda de atividade → `moedas_atividade`.
 * XP não tem verbo: a trilha da temporada é volume bruto com aritmética própria (DEC-214), e um
 * boost de troféu no XP seria uma segunda escala numa trilha que já tem a dela.
 *
 * "Lido no instantâneo do credit" é literal: quem decide o valor é o conjunto de troféus equipados
 * NO MOMENTO da escrita. O que já foi creditado não se recalcula — não existe recalculação
 * retroativa em nenhum lugar do sistema, e é por isso que equipar um troféu hoje não muda o número
 * de ontem.
 *
 * Aritmética (congelada em teste):
 *   - boost aplica sobre o valor da régua ANTES da penalidade; penalidade reduzida aplica sobre a
 *     penalidade. Boost nenhum multiplica penalidade, e penalidade nenhuma sobrevive ao boost —
 *     boostear um valor já descontado multiplicaria a punição.
 *   - `Math.round` nos dois lados (a aritmética fracionária da casa, DEC-97/103): as colunas são Int.
 *   - redução de penalidade tem teto de 100%: três troféus Tier3 de `penalidade` (45%) não chegam
 *     lá, mas o teto existe para que a soma de um vocabulário futuro não transforme punição em prêmio.
 *   - sem troféu equipado, o valor é exatamente o que a régua produziu (os golden de tarefa/sessão/
 *     atividade continuam valendo palavra por palavra).
 *
 * Calibração: os percentuais por tier não vêm do MODELO (§6 nomeia tiers, não números; §9 deixa
 * calibração numérica adiada). 5/10/15% é estimativa da casa, pinada em teste e aberta ao dono em
 * ASK-V8-25 — o mesmo regime aceito para as constantes de XP (ASK-V8-21) e os umbrais de elo
 * (ASK-V8-22).
 */

import { ValidationError } from "@/backend/domain/errors/DomainError";

export const TROPHY_EFFECT_VERBS = [
  "pontos_tarefa",
  "pontos_sessao",
  "moedas_atividade",
  "penalidade",
] as const;

export type TrophyEffectVerb = (typeof TROPHY_EFFECT_VERBS)[number];

export const TROPHY_TIERS = ["Tier1", "Tier2", "Tier3"] as const;

export type TrophyTier = (typeof TROPHY_TIERS)[number];

/** O número que cada tier vale. Único lugar do sistema onde ele existe. */
export const TROPHY_TIER_PERCENT: Record<TrophyTier, number> = {
  Tier1: 0.05,
  Tier2: 0.1,
  Tier3: 0.15,
};

/**
 * O efeito, na forma gravada em `badges.effects` (Json no schema, DEC-218). `{ verb, tier }` sem
 * número: a gramática fechada é o tipo.
 */
export interface TrophyEffect {
  verb: TrophyEffectVerb;
  tier: TrophyTier;
}

/** O verbo de boost de cada fonte de credit. `penalidade` não é boost de fonte nenhuma. */
export const TROPHY_BOOST_VERB_BY_SOURCE = {
  TASK_COMPLETED: "pontos_tarefa",
  WORK_SESSION_COMPLETED: "pontos_sessao",
  ACTIVITY_COMPLETED: "moedas_atividade",
} as const satisfies Record<string, TrophyEffectVerb>;

export function isTrophyEffectVerb(value: unknown): value is TrophyEffectVerb {
  return typeof value === "string" && (TROPHY_EFFECT_VERBS as readonly string[]).includes(value);
}

export function isTrophyTier(value: unknown): value is TrophyTier {
  return typeof value === "string" && (TROPHY_TIERS as readonly string[]).includes(value);
}

/**
 * Validação/normalização do que o painel manda (`effects`). Ausente ou vazio é "troféu sem efeito"
 * — o catálogo existente é inteiro assim, e a virada não pode exigir efeito de todo troféu.
 *
 * As mensagens são congeladas em teste: o painel mostra a frase, e uma frase nova por validação é
 * o jeito de o admin não saber o que errou.
 */
export function normalizeTrophyEffects(raw: unknown): TrophyEffect[] {
  if (raw === undefined || raw === null) return [];
  if (raw === "") return [];

  if (!Array.isArray(raw)) {
    throw new ValidationError("Efeitos do troféu devem ser uma lista");
  }

  const effects: TrophyEffect[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new ValidationError("Efeito do troféu deve ter verbo e tier");
    }
    const candidate = item as Record<string, unknown>;
    for (const key of Object.keys(candidate)) {
      if (key !== "verb" && key !== "tier") {
        // "Nenhum número livre" (MODELO 6) é a regra do FORMATO, não só do formulário: um efeito com
        // `percent` seria o percentual voltando pela porta do Json, e o `tsc` não vê o campo.
        throw new ValidationError("Efeito do troféu só tem verbo e tier");
      }
    }
    if (!isTrophyEffectVerb(candidate.verb)) {
      throw new ValidationError("Verbo de efeito do troféu inválido");
    }
    if (!isTrophyTier(candidate.tier)) {
      throw new ValidationError("Tier de efeito do troféu inválido");
    }
    const effect: TrophyEffect = { verb: candidate.verb, tier: candidate.tier };
    if (effects.some((existing) => existing.verb === effect.verb && existing.tier === effect.tier)) {
      throw new ValidationError("Efeito do troféu duplicado");
    }
    effects.push(effect);
  }

  return effects;
}

/** O que está gravado no catálogo, lido de volta. Efeito inválido no banco não concede nada. */
export function readTrophyEffects(raw: unknown): TrophyEffect[] {
  try {
    return normalizeTrophyEffects(raw);
  } catch {
    return [];
  }
}

/** A soma dos percentuais de um verbo entre os troféus equipados. Somam: três Tier3 = 45%. */
export function trophyVerbBonusPercent(effects: ReadonlyArray<TrophyEffect>, verb: TrophyEffectVerb): number {
  return effects
    .filter((effect) => effect.verb === verb)
    .reduce((total, effect) => total + TROPHY_TIER_PERCENT[effect.tier], 0);
}

/** A redução de penalidade pedida pelos troféus equipados, com teto de 100%. */
export function trophyPenaltyReductionPercent(effects: ReadonlyArray<TrophyEffect>): number {
  return Math.min(1, trophyVerbBonusPercent(effects, "penalidade"));
}

export interface TrophyCreditRequest {
  /** O verbo de boost desta fonte de credit (`pontos_tarefa`, `pontos_sessao` ou `moedas_atividade`). */
  boostVerb: TrophyEffectVerb;
  /** O valor que a régua produziu, sem efeito de troféu — o número que cairia na coluna hoje. */
  amount: number;
  /**
   * A penalidade que a régua JÁ descontou nesse valor (>= 0). Existe como parâmetro separado
   * porque a redução precisa de uma componente que o total não mostra: `10 − 3×10 = −20` não diz
   * quanto deles é punição. Ausente é 0 — sessão e moeda de atividade chegam sem penalidade
   * separada (a moeda tem o desconto embutido antes da distribuição Hamilton, DEC-164).
   */
  penalty?: number | null;
  /** Os efeitos dos troféus EQUIPADOS da pessoa, lidos no instante do credit. */
  effects: ReadonlyArray<TrophyEffect>;
}

export interface TrophyCredit {
  /** O valor que vai para a coluna da trilha. */
  amount: number;
  /** O valor da régua, sem efeito. */
  baseAmount: number;
  /** O que o boost somou (`boostedBase − base`). 0 sem boost. */
  bonus: number;
  penaltyBefore: number;
  penaltyAfter: number;
  /** O que a redução devolveu à pessoa. 0 sem efeito de penalidade. */
  penaltyReduced: number;
  /** Os efeitos que entraram na conta (os equipados na fonte). */
  effects: TrophyEffect[];
}

/**
 * O credit com o efeito aplicado. Sem efeito equipado, devolve o valor da régua sem tocar nele —
 * é o que mantém os golden de premiação intactos quando ninguém tem troféu.
 */
export function applyTrophyCredit(request: TrophyCreditRequest): TrophyCredit {
  const penaltyBefore = Math.max(0, request.penalty ?? 0);
  const base = {
    baseAmount: request.amount,
    penaltyBefore,
    penaltyAfter: penaltyBefore,
    penaltyReduced: 0,
    effects: [...request.effects],
  };

  if (request.effects.length === 0) {
    return { ...base, amount: request.amount, bonus: 0 };
  }

  const boostPercent = trophyVerbBonusPercent(request.effects, request.boostVerb);
  const penaltyPercent = trophyPenaltyReductionPercent(request.effects);

  // O valor da régua antes da penalidade. Só existe penalidade quando o chamador declarou uma;
  // sem ela, o próprio amount é a base.
  const prePenalty = request.amount + penaltyBefore;
  const boostedBase = boostPercent > 0 ? Math.round(prePenalty * (1 + boostPercent)) : prePenalty;
  const penaltyAfter = penaltyPercent > 0 ? Math.round(penaltyBefore * (1 - penaltyPercent)) : penaltyBefore;

  return {
    amount: boostedBase - penaltyAfter,
    baseAmount: request.amount,
    bonus: boostedBase - prePenalty,
    penaltyBefore,
    penaltyAfter,
    penaltyReduced: penaltyBefore - penaltyAfter,
    effects: [...request.effects],
  };
}

/**
 * A linha de auditoria do efeito no ledger. Entra em `newValues` só quando houve efeito: linha sem
 * efeito continua exatamente como era antes da onda.
 */
export interface TrophyCreditLedger {
  verb: TrophyEffectVerb;
  effects: TrophyEffect[];
  baseAmount: number;
  bonus: number;
  penaltyBefore: number;
  penaltyAfter: number;
}

export function trophyCreditLedger(credit: TrophyCredit, verb: TrophyEffectVerb): TrophyCreditLedger | null {
  if (credit.effects.length === 0) return null;
  return {
    verb,
    effects: credit.effects,
    baseAmount: credit.baseAmount,
    bonus: credit.bonus,
    penaltyBefore: credit.penaltyBefore,
    penaltyAfter: credit.penaltyAfter,
  };
}

/** Rótulo do efeito para o painel (o admin vê o que o verbo faz, não só o token). */
export const TROPHY_EFFECT_LABELS: Record<TrophyEffectVerb, string> = {
  pontos_tarefa: "Pontos de tarefa +%",
  pontos_sessao: "Pontos de sessão +%",
  moedas_atividade: "Moedas de atividade +%",
  penalidade: "Penalidade de atraso −%",
};

export const TROPHY_TIER_LABELS: Record<TrophyTier, string> = {
  Tier1: "Tier 1 (5%)",
  Tier2: "Tier 2 (10%)",
  Tier3: "Tier 3 (15%)",
};

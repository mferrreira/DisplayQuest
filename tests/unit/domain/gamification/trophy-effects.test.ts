/**
 * plan-v8 V8-6 (DEC-218/219) — o efeito do troféu equipado, lido no instantâneo do credit.
 *
 * O formato é a regra: `TrophyEffect` é `{ verb, tier }` e o número mora no tier
 * (`TROPHY_TIER_PERCENT`). "Nenhum número livre" (MODELO §6) não é só o formulário do painel — um
 * efeito com `percent` escrito no Json seria o percentual voltando pela porta do `badges.effects`,
 * e o `tsc` não vê o campo (a coluna é Json). Por isso a recusa é testada aqui, na regra pura.
 *
 * A aritmética congelada:
 *   - boost sobre a base ANTES da penalidade (boostear um valor já descontado multiplicaria a punição);
 *   - redução de penalidade com teto de 100% (punição não vira prêmio);
 *   - `Math.round` nos dois lados (as colunas são Int, a aritmética fracionária da casa DEC-97/103);
 *   - sem troféu equipado o valor é exatamente o da régua — é o que mantém os golden de
 *     tarefa/sessão/atividade intactos quando ninguém tem troféu;
 *   - cada fonte tem o SEU verbo de boost, e XP não tem verbo nenhum (DEC-214: volume bruto).
 *
 * Calibração: 5/10/15% é estimativa da casa, não número do MODELO (§9 adia calibração numérica) —
 * por isso está aberto ao dono em ASK-V8-25, no mesmo regime das constantes de XP (ASK-V8-21) e dos
 * umbrais de elo (ASK-V8-22). Este arquivo é o lugar onde o número existe uma vez.
 */
import { describe, expect, it } from "vitest";

import {
  TROPHY_BOOST_VERB_BY_SOURCE,
  TROPHY_EFFECT_LABELS,
  TROPHY_EFFECT_VERBS,
  TROPHY_TIER_LABELS,
  TROPHY_TIER_PERCENT,
  TROPHY_TIERS,
  applyTrophyCredit,
  isTrophyEffectVerb,
  isTrophyTier,
  normalizeTrophyEffects,
  readTrophyEffects,
  trophyCreditLedger,
  trophyPenaltyReductionPercent,
  trophyVerbBonusPercent,
  type TrophyEffect,
} from "@/backend/domain/gamification";

describe("domain/gamification: o vocabulário do efeito (DEC-218)", () => {
  it("quatro verbos e três tiers, fechados, cada um com rótulo para o painel", () => {
    expect(TROPHY_EFFECT_VERBS).toEqual(["pontos_tarefa", "pontos_sessao", "moedas_atividade", "penalidade"]);
    expect(TROPHY_TIERS).toEqual(["Tier1", "Tier2", "Tier3"]);
    expect(Object.keys(TROPHY_EFFECT_LABELS)).toEqual([...TROPHY_EFFECT_VERBS]);
    expect(Object.keys(TROPHY_TIER_LABELS)).toEqual([...TROPHY_TIERS]);
    // Cada verbo nomeia o que faz, porque o admin escolhe pelo rótulo e não pelo token.
    expect(TROPHY_EFFECT_LABELS.pontos_tarefa).toContain("+%");
    expect(TROPHY_EFFECT_LABELS.penalidade).toContain("−%");

    expect(isTrophyEffectVerb("penalidade")).toBe(true);
    expect(isTrophyEffectVerb("xp")).toBe(false);
    expect(isTrophyTier("Tier3")).toBe(true);
    expect(isTrophyTier("tier1")).toBe(false);
  });

  it("o boost de cada fonte é o verbo daquela fonte, e XP não tem verbo", () => {
    expect(TROPHY_BOOST_VERB_BY_SOURCE).toEqual({
      TASK_COMPLETED: "pontos_tarefa",
      WORK_SESSION_COMPLETED: "pontos_sessao",
      ACTIVITY_COMPLETED: "moedas_atividade",
    });
    expect(Object.values(TROPHY_BOOST_VERB_BY_SOURCE)).not.toContain("penalidade");
    expect(TROPHY_BOOST_VERB_BY_SOURCE).not.toHaveProperty("MANUAL_ADJUSTMENT");
  });

  it("o tier é o lugar onde o número existe uma vez", () => {
    expect(TROPHY_TIER_PERCENT).toEqual({ Tier1: 0.05, Tier2: 0.1, Tier3: 0.15 });
  });

  it("ausente, nulo, vazio e string vazia significam o mesmo: troféu sem efeito", () => {
    // O catálogo inteiro é assim antes da onda, e a virada não pode exigir efeito de todo troféu.
    expect(normalizeTrophyEffects(undefined)).toEqual([]);
    expect(normalizeTrophyEffects(null)).toEqual([]);
    expect(normalizeTrophyEffects([])).toEqual([]);
    expect(normalizeTrophyEffects("")).toEqual([]);
  });

  it("o formato é recusado nomeando o erro, e o número livre não passa pela porta do Json", () => {
    expect(() => normalizeTrophyEffects("boost 10%")).toThrow("Efeitos do troféu devem ser uma lista");
    expect(() => normalizeTrophyEffects([null])).toThrow("Efeito do troféu deve ter verbo e tier");
    expect(() => normalizeTrophyEffects(["pontos_tarefa"])).toThrow("Efeito do troféu deve ter verbo e tier");
    expect(() => normalizeTrophyEffects([{ verb: "xp", tier: "Tier1" }])).toThrow("Verbo de efeito do troféu inválido");
    expect(() => normalizeTrophyEffects([{ verb: "pontos_tarefa", tier: "Tier4" }])).toThrow("Tier de efeito do troféu inválido");
    expect(() => normalizeTrophyEffects([{ tier: "Tier1" }])).toThrow("Verbo de efeito do troféu inválido");
    expect(() => normalizeTrophyEffects([{ verb: "pontos_tarefa", tier: "Tier1", percent: 40 }]))
      .toThrow("Efeito do troféu só tem verbo e tier");
    expect(() => normalizeTrophyEffects([{ verb: "pontos_tarefa", tier: "Tier1", bonus: 40 }]))
      .toThrow("Efeito do troféu só tem verbo e tier");
    expect(() => normalizeTrophyEffects([
      { verb: "pontos_tarefa", tier: "Tier1" },
      { verb: "pontos_tarefa", tier: "Tier1" },
    ])).toThrow("Efeito do troféu duplicado");
    // Verbo igual com tier diferente é dois efeitos: somam (ver o bloco da soma).
    expect(normalizeTrophyEffects([
      { verb: "penalidade", tier: "Tier1" },
      { verb: "penalidade", tier: "Tier2" },
    ])).toEqual([
      { verb: "penalidade", tier: "Tier1" },
      { verb: "penalidade", tier: "Tier2" },
    ]);
  });

  it("o que está gravado no catálogo é lido sem quebrar: efeito inválido no banco não concede nada", () => {
    expect(readTrophyEffects([{ verb: "pontos_tarefa", tier: "Tier2" }])).toEqual([{ verb: "pontos_tarefa", tier: "Tier2" }]);
    // Json corrompido (linha de antes da onda, ou edição fora do painel) devolve lista vazia em vez de
    // estourar o credit — o mesmo espírito do critério ilegível (`badgeCriteriaMet` corta em falso).
    expect(readTrophyEffects([{ verb: "xp", tier: "Tier9" }])).toEqual([]);
    expect(readTrophyEffects("nonsense")).toEqual([]);
    expect(readTrophyEffects(null)).toEqual([]);
  });
});

describe("domain/gamification: a soma dos efeitos equipados", () => {
  const effects: TrophyEffect[] = [
    { verb: "pontos_tarefa", tier: "Tier1" },
    { verb: "pontos_tarefa", tier: "Tier3" },
    { verb: "penalidade", tier: "Tier3" },
  ];

  it("somam os tiers do mesmo verbo, e verbo diferente não interfere", () => {
    expect(trophyVerbBonusPercent(effects, "pontos_tarefa")).toBeCloseTo(0.2, 10);
    expect(trophyVerbBonusPercent(effects, "pontos_sessao")).toBe(0);
    expect(trophyVerbBonusPercent([], "pontos_tarefa")).toBe(0);
  });

  it("três Tier3 de penalidade chegariam a 45%, e o teto de 100% existe para um vocabulário futuro", () => {
    expect(trophyPenaltyReductionPercent(effects)).toBeCloseTo(0.15, 10);
    const stacked: TrophyEffect[] = [
      { verb: "penalidade", tier: "Tier3" },
      { verb: "penalidade", tier: "Tier3" },
      { verb: "penalidade", tier: "Tier3" },
      { verb: "penalidade", tier: "Tier3" },
      { verb: "penalidade", tier: "Tier3" },
      { verb: "penalidade", tier: "Tier3" },
      { verb: "penalidade", tier: "Tier3" },
    ];
    expect(trophyVerbBonusPercent(stacked, "penalidade")).toBeCloseTo(1.05, 10);
    expect(trophyPenaltyReductionPercent(stacked)).toBe(1);
  });
});

describe("domain/gamification: applyTrophyCredit no instantâneo do credit (DEC-219)", () => {
  it("sem troféu equipado, o valor é exatamente o da régua (os golden continuam valendo)", () => {
    const plain = applyTrophyCredit({ boostVerb: "pontos_tarefa", amount: -20, penalty: 30, effects: [] });
    expect(plain).toEqual({
      amount: -20,
      baseAmount: -20,
      bonus: 0,
      penaltyBefore: 30,
      penaltyAfter: 30,
      penaltyReduced: 0,
      effects: [],
    });
  });

  it("o boost incide sobre o valor ANTES da penalidade, nunca sobre o valor já descontado", () => {
    // Régua: base 100, atraso 30 → total 70. Com Tier2 (10%): 100 → 110 mantendo os 30 → 80.
    // Se o boost incidisse sobre 70, o resultado seria 77 e a punição teria sido boosteada junto.
    const credit = applyTrophyCredit({ boostVerb: "pontos_tarefa", amount: 70, penalty: 30, effects: [{ verb: "pontos_tarefa", tier: "Tier2" }] });
    expect(credit.amount).toBe(80);
    expect(credit.baseAmount).toBe(70);
    expect(credit.bonus).toBe(10);
    expect(credit.penaltyBefore).toBe(30);
    expect(credit.penaltyAfter).toBe(30);
    expect(credit.penaltyReduced).toBe(0);
  });

  it("sem penalidade declarada, o próprio valor é a base do boost", () => {
    // Sessão e moeda de atividade chegam sem componente separada: a moeda tem o desconto embutido
    // antes da distribuição Hamilton (DEC-164), e a sessão não tem atraso.
    const session = applyTrophyCredit({ boostVerb: "pontos_sessao", amount: 30, effects: [{ verb: "pontos_sessao", tier: "Tier1" }] });
    expect(session.amount).toBe(32); // round(30 × 1,05) = 31,5 → 32
    expect(session.bonus).toBe(2);
    expect(session.penaltyBefore).toBe(0);

    const coins = applyTrophyCredit({ boostVerb: "moedas_atividade", amount: 450, effects: [{ verb: "moedas_atividade", tier: "Tier3" }] });
    expect(coins.amount).toBe(518); // round(450 × 1,15)
    expect(coins.bonus).toBe(68);
  });

  it("o verbo do troféu não boosteia outra fonte: troféu de tarefa não muda sessão", () => {
    const credit = applyTrophyCredit({ boostVerb: "pontos_sessao", amount: 30, effects: [{ verb: "pontos_tarefa", tier: "Tier3" }] });
    expect(credit.amount).toBe(30);
    expect(credit.bonus).toBe(0);
    // O efeito continua registrado na linha (foi lido no instantâneo), só não entrou na conta desta fonte.
    expect(credit.effects).toEqual([{ verb: "pontos_tarefa", tier: "Tier3" }]);
  });

  it("penalidade reduzida sem boost: a redução devolve valor à pessoa e não cria prêmio", () => {
    // Régua: base 100, atraso 4 dias × 10 = 40 → 60. Tier3 de `penalidade` (15%): 40 → 34 → 66.
    const credit = applyTrophyCredit({ boostVerb: "pontos_tarefa", amount: 60, penalty: 40, effects: [{ verb: "penalidade", tier: "Tier3" }] });
    expect(credit.amount).toBe(66);
    expect(credit.penaltyAfter).toBe(34);
    expect(credit.penaltyReduced).toBe(6);
    expect(credit.bonus).toBe(0);

    // Teto: redução de 100% zera a penalidade, e o valor volta à base cheia — nunca acima dela.
    const maxed = applyTrophyCredit({
      boostVerb: "pontos_tarefa",
      amount: 60,
      penalty: 40,
      effects: [
        { verb: "penalidade", tier: "Tier3" },
        { verb: "penalidade", tier: "Tier3" },
        { verb: "penalidade", tier: "Tier3" },
        { verb: "penalidade", tier: "Tier3" },
        { verb: "penalidade", tier: "Tier3" },
        { verb: "penalidade", tier: "Tier3" },
        { verb: "penalidade", tier: "Tier3" },
      ],
    });
    expect(maxed.penaltyAfter).toBe(0);
    expect(maxed.amount).toBe(100);
  });

  it("boost e redução juntos, e o valor creditado é Int (Math.round dos dois lados)", () => {
    // Base 70 depois de 25 descontados (95 antes do atraso). Dois Tier1 em verbos diferentes: 5% de
    // boost e 5% de redução. round(95 × 1,05) = 100 (99,75 → 100); round(25 × 0,95) = 24 (23,75 → 24);
    // 100 − 24 = 76. Nenhum dos dois lados fraciona a coluna.
    const credit = applyTrophyCredit({
      boostVerb: "pontos_tarefa",
      amount: 70,
      penalty: 25,
      effects: [
        { verb: "pontos_tarefa", tier: "Tier1" },
        { verb: "penalidade", tier: "Tier1" },
      ],
    });
    expect(credit.amount).toBe(76);
    expect(Number.isInteger(credit.amount)).toBe(true);
    expect(credit.bonus).toBe(5);
    expect(credit.penaltyAfter).toBe(24);
    expect(credit.penaltyReduced).toBe(1);
  });

  it("o atraso do caminho de tarefa não tem piso: um total negativo continua negativo com efeito", () => {
    // DEC-39: a premiação de tarefa pode ficar negativa e sem piso. O efeito não introduz piso — ele só
    // conta a componente: a base antes do atraso é 10 (−40 + 50), Tier2 a leva a 11, e os 50 continuam.
    const credit = applyTrophyCredit({ boostVerb: "pontos_tarefa", amount: -40, penalty: 50, effects: [{ verb: "pontos_tarefa", tier: "Tier2" }] });
    expect(credit.amount).toBe(-39);
    expect(credit.baseAmount).toBe(-40);
    expect(credit.bonus).toBe(1);
    expect(credit.penaltyAfter).toBe(50);
  });

  it("penalidade negativa declarada entra como 0: o número que reduz é o que a régua puniu", () => {
    const credit = applyTrophyCredit({ boostVerb: "pontos_tarefa", amount: 20, penalty: -30, effects: [{ verb: "penalidade", tier: "Tier3" }] });
    expect(credit.penaltyBefore).toBe(0);
    expect(credit.penaltyAfter).toBe(0);
    expect(credit.amount).toBe(20);
  });
});

describe("domain/gamification: a linha de auditoria do efeito no ledger", () => {
  it("sem efeito equipado, não há linha de efeito: a linha do credit continua exatamente a de antes", () => {
    const credit = applyTrophyCredit({ boostVerb: "pontos_tarefa", amount: 10, effects: [] });
    expect(trophyCreditLedger(credit, "pontos_tarefa")).toBeNull();
  });

  it("com efeito, a linha declara verbo, efeitos, base e o que o efeito fez", () => {
    const credit = applyTrophyCredit({ boostVerb: "pontos_tarefa", amount: 70, penalty: 30, effects: [{ verb: "pontos_tarefa", tier: "Tier2" }] });
    expect(trophyCreditLedger(credit, "pontos_tarefa")).toEqual({
      verb: "pontos_tarefa",
      effects: [{ verb: "pontos_tarefa", tier: "Tier2" }],
      baseAmount: 70,
      bonus: 10,
      penaltyBefore: 30,
      penaltyAfter: 30,
    });
  });
});

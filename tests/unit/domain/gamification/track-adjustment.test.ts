// @vitest-environment node
/**
 * plan-v8 V8-5 (DEC-215 + ASK-V8-24 + DEC-222) — a regra pura do ajuste manual de trilha.
 *
 * Por que a aritmética mora aqui e não no caso de uso (onde morava antes, em
 * `UpdateUserPointsUseCase`): o ajuste escreve saldo e linha de auditoria num $transaction só, e
 * o adaptador do ledger é o dono da escrita. Se a aritmética ficasse no caso de uso, o adaptador
 * receberia um número calculado fora da transação — dois writers do mesmo saldo, com o intervalo
 * entre eles disponível para outro ajuste concorrente. Com a regra no domínio, o adaptador lê o
 * saldo dentro da transação e aplica a REGUA; o `Math.max` do chão e a checagem de suficiência são
 * a mesma função nos dois lados (o duplo do teste de rota chama esta função, não uma cópia —
 * lição DEC-90).
 *
 * Congelado aqui: os quirks da trilha pontos (DEC-60: `set` aceita negativo; chão do `add`;
 * suficiência do `remove`), a assimetria da moeda (DEC-222: nenhuma das três ações aceita saldo
 * negativo), as frases nomeando a trilha, o vocabulário fechado do `parseBalanceTrack`, e a chave
 * da linha de auditoria.
 */
import { describe, expect, it } from "vitest";

import {
  COINS_GAMIFICATION_TRACK,
  POINTS_GAMIFICATION_TRACK,
  allowsNegativeAdjustment,
  applyTrackAdjustment,
  parseBalanceTrack,
  trackAdjustmentDescription,
  trackLabel,
  trackLabelSentence,
} from "@/backend/domain";
import { ValidationError } from "@/backend/domain/errors";

describe("applyTrackAdjustment — trilha PONTOS (quirks do V4-6 preservados)", () => {
  it("add tem chão em 0 mesmo com delta negativo (QUIRK congelado da OND2-B2)", () => {
    expect(applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "add", 7, 0)).toBe(7);
    expect(applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "add", -50, 30)).toBe(0);
  });

  it("remove recusando negativo e exigindo suficiência, com as frases exatas", () => {
    expect(() => applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "remove", -1, 10)).toThrow(ValidationError);
    expect(() => applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "remove", -1, 10)).toThrow("Pontos não podem ser negativos");
    expect(() => applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "remove", 999, 10)).toThrow(
      "Usuário não possui pontos suficientes",
    );
    expect(applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "remove", 10, 10)).toBe(0);
  });

  it("set é valor absoluto e aceita negativo (DEC-60): a premiação produz total negativo (DEC-39)", () => {
    expect(applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "set", -20, 120)).toBe(-20);
    // O estado medido no Gerente da instância real: de zero para -31030 sem objeção.
    expect(applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "set", -31030, 0)).toBe(-31030);
    expect(applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "set", 42, 0)).toBe(42);
  });
});

describe("applyTrackAdjustment — trilha COINS (DEC-222: saldo de moeda nunca negativo)", () => {
  it("as três ações sobre a moeda usam a MESMA gramática", () => {
    expect(applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "add", 300, 0)).toBe(300);
    expect(applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "remove", 100, 300)).toBe(200);
    expect(applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "set", 50, 300)).toBe(50);
  });

  it("`set` de moeda negativa é recusado — a única assimetria entre as duas trilhas", () => {
    expect(() => applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "set", -20, 0)).toThrow(ValidationError);
    expect(() => applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "set", -20, 0)).toThrow(
      "Moedas devem ser um número não negativo",
    );
    // E a regra que decide a recusa é uma só, consumida pela rota e pela régua:
    expect(allowsNegativeAdjustment(POINTS_GAMIFICATION_TRACK, "set")).toBe(true);
    expect(allowsNegativeAdjustment(COINS_GAMIFICATION_TRACK, "set")).toBe(false);
    expect(allowsNegativeAdjustment(POINTS_GAMIFICATION_TRACK, "add")).toBe(false);
    expect(allowsNegativeAdjustment(POINTS_GAMIFICATION_TRACK, "remove")).toBe(false);
  });

  it("`remove` de moeda nomeia a moeda na recusa (vocabulário em uma fonte só, lição DEC-96)", () => {
    expect(() => applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "remove", -1, 10)).toThrow("Moedas não podem ser negativos");
    expect(() => applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "remove", 999, 10)).toThrow("Usuário não possui moedas suficientes");
  });

  it("`add` de moeda tem o mesmo chão 0 do `add` de pontos", () => {
    expect(applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "add", -50, 30)).toBe(0);
  });

  it("ajuste de moeda não toca pontos e vice-versa: a trilha decide a régua, o número é o mesmo", () => {
    expect(applyTrackAdjustment(COINS_GAMIFICATION_TRACK, "set", 500, 0)).toBe(500);
    expect(applyTrackAdjustment(POINTS_GAMIFICATION_TRACK, "set", 500, 0)).toBe(500);
  });
});

describe("vocabulário do ajuste (uma fonte só)", () => {
  it("o nome da trilha na frase vem da trilha", () => {
    expect(trackLabel(POINTS_GAMIFICATION_TRACK)).toBe("pontos");
    expect(trackLabel(COINS_GAMIFICATION_TRACK)).toBe("moedas");
    expect(trackLabelSentence(POINTS_GAMIFICATION_TRACK)).toBe("Pontos");
    expect(trackLabelSentence(COINS_GAMIFICATION_TRACK)).toBe("Moedas");
  });

  it("parseBalanceTrack aceita ausente como a trilha histórica e recusa o resto", () => {
    expect(parseBalanceTrack(undefined)).toBe(POINTS_GAMIFICATION_TRACK);
    expect(parseBalanceTrack("POINTS")).toBe(POINTS_GAMIFICATION_TRACK);
    expect(parseBalanceTrack("COINS")).toBe(COINS_GAMIFICATION_TRACK);
    // XP não é trilha de ajuste: é a trilha da temporada, escrita por rotina de sistema (DEC-214),
    // e o painel não a ajusta — o comando do painel é sobre saldo.
    expect(parseBalanceTrack("XP")).toBeNull();
    expect(parseBalanceTrack("points")).toBeNull();
    expect(parseBalanceTrack(null)).toBeNull();
    expect(parseBalanceTrack(7)).toBeNull();
  });

  it("a chave do ajuste é nomeada e não confunde com credit de evento", () => {
    expect(trackAdjustmentDescription(POINTS_GAMIFICATION_TRACK, "set", -20)).toBe("GAMIFICATION:ADJUSTMENT:POINTS:set:-20");
    expect(trackAdjustmentDescription(COINS_GAMIFICATION_TRACK, "add", 300)).toBe("GAMIFICATION:ADJUSTMENT:COINS:add:300");
    // A chave do award (buildAwardDescription) é GAMIFICATION:<sourceType>:<sourceId>; ajuste tem
    // AJUSTE no meio, e o `action` da linha (TRACK_ADJUSTMENT) é família separada do GAMIFICATION_AWARD
    // que as rotinas de idempotência leem.
  });
});

/**
 * plan-v8 V8-6 (DEC-217) — a escada de elo da temporada e os slots de troféu.
 *
 * O que este arquivo é sozinho em segurar: os seis degraus com umbral e slot na MESMA linha da
 * tabela, as fronteiras inclusivas do umbral, e o fato de que elo é função do XP da temporada — não
 * dos pontos (a rodada 4 do dono corrigiu: "elo mede a temporada") e não do saldo vitalício que a
 * escada antiga de `Progression.ts` media (0/700/1500/2500 sobre `points`).
 *
 * A derivada antiga também é conferida aqui, como saída: `level`, `nextLevelXp`, `progressToNextLevel`
 * e a escada por faixa de points não podem voltar — a dívida XP-DUPLICADO (medida na V8-3) fecha na
 * V8-6, e voltar com ela seria a dívida reabrindo sem ninguém pedir.
 *
 * Umbrais 0/400/900/1500/2400/3600 são estimativa da primeira temporada (MODELO §9, ASK-V8-22):
 * congelados aqui para que a recalibração seja uma decisão, não uma edição silenciosa.
 */
import { describe, expect, it } from "vitest";

import * as gamificationDomain from "@/backend/domain/gamification";

import {
  ELO_LABELS,
  ELO_LADDER,
  ELO_TIERS,
  FIRST_SEASON_ELO,
  computeSeasonProgression,
  eloForSeasonXp,
  eloLadderStep,
  isEloTier,
  nextEloLadderStep,
  seasonClosingEloForXp,
  seasonXpForElo,
  trophySlotMessage,
  trophySlotsForElo,
} from "@/backend/domain/gamification";

describe("domain/gamification: a escada de elo (DEC-217)", () => {
  it("seis degraus, cada um com umbral e slot na mesma linha da tabela", () => {
    expect(ELO_TIERS).toEqual(["BRONZE", "PRATA", "OURO", "PLATINA", "DIAMANTE", "DESAFIANTE"]);
    expect(ELO_LADDER).toEqual([
      { elo: "BRONZE", minSeasonXp: 0, trophySlots: 0 },
      { elo: "PRATA", minSeasonXp: 400, trophySlots: 1 },
      { elo: "OURO", minSeasonXp: 900, trophySlots: 2 },
      { elo: "PLATINA", minSeasonXp: 1500, trophySlots: 2 },
      { elo: "DIAMANTE", minSeasonXp: 2400, trophySlots: 3 },
      { elo: "DESAFIANTE", minSeasonXp: 3600, trophySlots: 3 },
    ]);
    // Slot e umbral na mesma linha é a decisão: duas tabelas diferentes é o jeito de eles divergirem.
    expect(ELO_LADDER.map((step) => step.trophySlots)).toEqual([0, 1, 2, 2, 3, 3]);
  });

  it("o umbral é inclusivo, degrau a degrau, na fronteira e um XP antes dela", () => {
    const boundaries: Array<[number, string]> = [
      [0, "BRONZE"],
      [399, "BRONZE"],
      [400, "PRATA"],
      [899, "PRATA"],
      [900, "OURO"],
      [1499, "OURO"],
      [1500, "PLATINA"],
      [2399, "PLATINA"],
      [2400, "DIAMANTE"],
      [3599, "DIAMANTE"],
      [3600, "DESAFIANTE"],
      [999999, "DESAFIANTE"],
    ];
    for (const [xp, elo] of boundaries) {
      expect(eloForSeasonXp(xp)).toBe(elo);
    }
  });

  it("XP fora da promessa (negativo, NaN, Infinity) entra como 0: não há degrau abaixo do primeiro", () => {
    // A trilha tem piso 0 no domínio (`applyXpFloor`, DEC-214). Uma regra que recebesse um valor fora
    // dessa promessa não pode inventar um degrau nem quebrar a leitura de um saldo corrompido.
    expect(eloForSeasonXp(-5)).toBe(FIRST_SEASON_ELO);
    expect(eloForSeasonXp(Number.NaN)).toBe(FIRST_SEASON_ELO);
    expect(eloForSeasonXp(Number.POSITIVE_INFINITY)).toBe(FIRST_SEASON_ELO);
    expect(FIRST_SEASON_ELO).toBe("BRONZE");
  });

  it("o elo é vocabulário fechado, e o degrau inteiro vem junto do umbral", () => {
    expect(isEloTier("PRATA")).toBe(true);
    expect(isEloTier("bronze")).toBe(false);
    expect(isEloTier("MESTRE")).toBe(false);
    expect(isEloTier(null)).toBe(false);

    expect(eloLadderStep("OURO")).toEqual({ elo: "OURO", minSeasonXp: 900, trophySlots: 2 });
    expect(seasonXpForElo("DIAMANTE")).toBe(2400);
    expect(() => eloLadderStep("LENDÁRIO" as never)).toThrow("elo fora da escada: LENDÁRIO");
  });

  it("BRONZE tem slot zero: sem elo, sem troféu equipado", () => {
    expect(trophySlotsForElo("BRONZE")).toBe(0);
    for (const elo of ELO_TIERS) {
      expect(trophySlotsForElo(elo)).toBe(eloLadderStep(elo).trophySlots);
    }
  });

  it("o próximo degrau diz quanto falta, e o topo não tem próximo", () => {
    expect(nextEloLadderStep(0)).toEqual({ elo: "PRATA", minSeasonXp: 400, trophySlots: 1, xpMissing: 400 });
    expect(nextEloLadderStep(399)).toEqual({ elo: "PRATA", minSeasonXp: 400, trophySlots: 1, xpMissing: 1 });
    // OURO é o degrau seguinte de quem está em PLATINA? Não: o próximo é o primeiro acima do XP.
    expect(nextEloLadderStep(1500)?.elo).toBe("DIAMANTE");
    expect(nextEloLadderStep(3600)).toBeNull();
    expect(nextEloLadderStep(-10)?.elo).toBe("PRATA");
  });

  it("a frase do slot é uma família só e lida no singular quando o slot é um", () => {
    // "até 1 troféus" na tela da pessoa é a mesma regra escrita errado. Uma família de frase, porque
    // "elo sem slot" e "slot cheio" são a mesma conta contada em momentos diferentes.
    expect(trophySlotMessage("BRONZE")).toBe("Seu elo Bronze permite equipar até 0 troféus.");
    expect(trophySlotMessage("PRATA")).toBe("Seu elo Prata permite equipar até 1 troféu.");
    expect(trophySlotMessage("OURO")).toBe("Seu elo Ouro permite equipar até 2 troféus.");
    expect(trophySlotMessage("DESAFIANTE")).toBe("Seu elo Desafiante permite equipar até 3 troféus.");
    for (const elo of ELO_TIERS) {
      expect(trophySlotMessage(elo)).toContain(ELO_LABELS[elo]);
    }
  });

  it("o elo do livro-caixa é o mesmo degrau do XP (seasonClosingEloForXp)", () => {
    expect(seasonClosingEloForXp(0)).toBe("BRONZE");
    expect(seasonClosingEloForXp(480)).toBe("PRATA");
    expect(seasonClosingEloForXp(940)).toBe("OURO");
  });
});

describe("domain/gamification: progressão da temporada (DEC-212/214/215/217)", () => {
  it("as três trilhas passam e o elo com os slots são derivados do XP lido", () => {
    expect(computeSeasonProgression({ userId: 4, points: 120, xp: 940, coins: 30 })).toEqual({
      userId: 4,
      points: 120,
      xp: 940,
      coins: 30,
      elo: "OURO",
      trophySlots: 2,
      // V8-7 (DEC-220): o cartão da temporada mostra o próximo degrau com o XP que falta — o número
      // sai da escada, não da tela.
      nextElo: "PLATINA",
      xpToNextElo: 560,
    });
  });

  it("no topo da escada não há próximo degrau, e a tela não inventa progresso", () => {
    const top = computeSeasonProgression({ userId: 9, points: 0, xp: 3600, coins: 0 });
    expect(top.elo).toBe("DESAFIANTE");
    expect(top.nextElo).toBeNull();
    expect(top.xpToNextElo).toBeNull();

    const justBelow = computeSeasonProgression({ userId: 9, points: 0, xp: 3599, coins: 0 });
    expect(justBelow.nextElo).toBe("DESAFIANTE");
    expect(justBelow.xpToNextElo).toBe(1);
  });

  it("placar do mês não move o elo: quem decide a escada é o XP da temporada", () => {
    // O número que a escada antiga usava (points) hoje é o placar que zera todo mês (DEC-212). Medir
    // elo por ele seria o elo zerando com o mês, contra a decisão da rodada 4.
    const low = computeSeasonProgression({ userId: 1, points: 5000, xp: 0, coins: 0 });
    expect(low.elo).toBe("BRONZE");
    expect(low.points).toBe(5000);

    const crossed = computeSeasonProgression({ userId: 1, points: 0, xp: 400, coins: 0 });
    expect(crossed.elo).toBe("PRATA");
    expect(crossed.trophySlots).toBe(1);
  });

  it("o XP e a moeda fora da promessa entram como 0, o placar passa como é (negativo é regra, DEC-39)", () => {
    const progression = computeSeasonProgression({ userId: 1, points: -37140, xp: Number.NaN, coins: Number.NaN });
    expect(progression.points).toBe(-37140);
    expect(progression.xp).toBe(0);
    expect(progression.coins).toBe(0);
    expect(progression.elo).toBe("BRONZE");
  });
});

describe("domain/gamification: a derivada antiga saiu do sistema (fecha XP-DUPLICADO)", () => {
  it("nem `level`, nem escada por faixa de points, nem `eloForXp` voltam pela porta do domínio", () => {
    // `users.xp` (trilha da temporada, DEC-214) e `UserProgression.xp` (derivado de points) eram o
    // mesmo nome para duas coisas diferentes. A derivada saiu inteira na V8-6; quem a reintroduzir
    // por qualquer um dos três nomes quebra aqui.
    const exported = Object.keys(gamificationDomain);
    expect(exported).not.toContain("levelForXp");
    expect(exported).not.toContain("eloForXp");
    expect(exported).not.toContain("computeUserProgression");
    expect(exported).not.toContain("USER_LEVELS_FOR_XP");
    expect(exported).toContain("computeSeasonProgression");
    expect(exported).toContain("eloForSeasonXp");
  });
});

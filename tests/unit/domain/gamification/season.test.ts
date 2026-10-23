/**
 * plan-v8 V8-4 (DEC-213) — as regras puras da temporada, congeladas antes do use case e do cron:
 * qual ano fecha, o prefixo que seleciona os meses do ano, quem entra no livro-caixa, a ordem da
 * temporada e o campeão.
 *
 * O que cada caso segura:
 *   - o ano fechado é o ANTERIOR ao do instante da run, em dia civil do laboratório (DEC-132): o
 *     job roda 1º/jan às 00:05 SP, cinco minutos depois do fechamento mensal, e fecha o ano que
 *     terminou — nunca o ano em curso;
 *   - o prefixo do ano é o formato do mês do domínio (`YYYY-MM`): seleciona os doze meses do ano e
 *     não seleciona o primeiro mês do ano seguinte;
 *   - a audiência do livro-caixa é atividade fotografada no ano OU trilha de XP aberta — quem não
 *     tem nenhum dos dois não ganha linha de zeros;
 *   - a ordem é pontos → tarefas → XP → userId, e `userId` único torna a ordem TOTAL: existe um
 *     primeiro colocado e um só, inclusive quando os números são idênticos;
 *   - o negativo do snapshot entra na conta (a dívida do mês está no livro, DEC-212) e perde do 0.
 */
import { describe, expect, it } from "vitest";

import {
  SEASON_CHAMPION_BADGE_NAME,
  SEASON_POINTS_AFTER_CLOSE,
  SEASON_XP_AFTER_CLOSE,
  closingSeasonYearOfInstant,
  compareSeasonStandings,
  isSeasonParticipant,
  rankSeasonStandings,
  seasonChampionDescription,
  seasonChampionOf,
  seasonMonthPrefix,
} from "@/backend/domain/gamification";

import type { SeasonStanding } from "@/backend/domain/gamification";

function standing(input: Partial<SeasonStanding> & { userId: number }): SeasonStanding {
  return {
    name: `usuário ${input.userId}`,
    points: 0,
    completedTasks: 0,
    xp: 0,
    ...input,
  };
}

describe("temporada — o ano que fecha (DEC-213)", () => {
  it("a run das 00:05 de 1º de janeiro fecha o ANO ANTERIOR", () => {
    // 2027-01-01T03:05:00Z é 00:05 de 01/01/2027 em America/Sao_Paulo.
    expect(closingSeasonYearOfInstant(new Date("2027-01-01T03:05:00.000Z"))).toBe(2026);
  });

  it("uma run um segundo antes (ainda 31/12) fecha o ano anterior AO daquele dia", () => {
    // 2026-12-31T02:59:59Z é 23:59:59 de 31/12/2026 SP — 2026 ainda está em curso.
    expect(closingSeasonYearOfInstant(new Date("2026-12-31T02:59:59.000Z"))).toBe(2025);
    expect(closingSeasonYearOfInstant(new Date("2026-12-31T03:00:00.000Z"))).toBe(2025);
  });

  it("a virada não fecha o ano em curso nem deixa o anterior aberto", () => {
    expect(closingSeasonYearOfInstant(new Date("2028-01-01T03:05:00.000Z"))).toBe(2027);
  });

  it("o prefixo do ano é o formato do mês do domínio, e não alcança o ano seguinte", () => {
    const prefix = seasonMonthPrefix(2025);
    expect(prefix).toBe("2025-");
    expect("2025-12".startsWith(prefix)).toBe(true);
    expect("2025-01".startsWith(prefix)).toBe(true);
    // O primeiro mês do ano seguinte não entra na soma do ano que fechou.
    expect("2026-01".startsWith(prefix)).toBe(false);
    // Nem um mês mal formado de outro ano entra por substring solta.
    expect("2026-1".startsWith(prefix)).toBe(false);
  });
});

describe("temporada — quem entra no livro-caixa", () => {
  it("linha existe quando o ano tem mês fotografado", () => {
    expect(isSeasonParticipant({ monthsInYear: 1, xp: 0 })).toBe(true);
    expect(isSeasonParticipant({ monthsInYear: 12, xp: 0 })).toBe(true);
  });

  it("linha existe quando a trilha da temporada está aberta, mesmo sem snapshot de mês", () => {
    expect(isSeasonParticipant({ monthsInYear: 0, xp: 10 })).toBe(true);
    // XP pode ter sido zerado pelo piso 0 depois de penalidade; o valor gravado ainda é da temporada.
    expect(isSeasonParticipant({ monthsInYear: 0, xp: -30 })).toBe(true);
  });

  it("cadastro sem atividade no ano não ganha linha de zeros", () => {
    expect(isSeasonParticipant({ monthsInYear: 0, xp: 0 })).toBe(false);
  });

  it("o que a coluna recebe na virada é 0 nas duas trilhas da temporada", () => {
    expect(SEASON_POINTS_AFTER_CLOSE).toBe(0);
    expect(SEASON_XP_AFTER_CLOSE).toBe(0);
  });
});

describe("temporada — a ordem da temporada (MODELO §3/§4)", () => {
  it("pontuação maior vence; o negativo do snapshot perde do zero", () => {
    expect(compareSeasonStandings(standing({ userId: 1, points: 5 }), standing({ userId: 2, points: -20 }))).toBeLessThan(0);
    expect(compareSeasonStandings(standing({ userId: 1, points: 0 }), standing({ userId: 2, points: -1 }))).toBeLessThan(0);
  });

  it("empate em pontos é decidido por tarefas; empate em tarefas, por XP", () => {
    expect(compareSeasonStandings(standing({ userId: 1, points: 40, completedTasks: 3 }), standing({ userId: 2, points: 40, completedTasks: 9 }))).toBeGreaterThan(0);
    expect(
      compareSeasonStandings(
        standing({ userId: 1, points: 40, completedTasks: 3, xp: 300 }),
        standing({ userId: 2, points: 40, completedTasks: 3, xp: 120 }),
      ),
    ).toBeLessThan(0);
  });

  it("empate nos três números é decidido por userId, e a ordem fica total", () => {
    const ranked = rankSeasonStandings([
      standing({ userId: 7, points: 100, completedTasks: 4, xp: 80 }),
      standing({ userId: 3, points: 100, completedTasks: 4, xp: 80 }),
      standing({ userId: 5, points: 100, completedTasks: 4, xp: 80 }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual([3, 5, 7]);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3]);
    // O desempate termina antes do troféu: não existe "conceder a todos os empatados".
    expect(ranked[0].position).toBe(1);
  });

  it("a tabela completa sai ordenada pela régua, com posições 1..n", () => {
    const ranked = rankSeasonStandings([
      standing({ userId: 10, name: "Ana", points: 120, completedTasks: 12, xp: 240 }),
      standing({ userId: 11, name: "Bia", points: 300, completedTasks: 5, xp: 90 }),
      standing({ userId: 12, name: "Caio", points: 120, completedTasks: 12, xp: 500 }),
      standing({ userId: 13, name: "Duda", points: -40, completedTasks: 1, xp: 0 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Bia", "Caio", "Ana", "Duda"]);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("o campeão é o primeiro colocado, e temporada sem participante não tem campeão", () => {
    const ranked = rankSeasonStandings([standing({ userId: 4, points: 1 }), standing({ userId: 9, points: 2 })]);
    expect(seasonChampionOf(ranked)?.userId).toBe(9);
    expect(seasonChampionOf([])).toBeNull();
  });

  it("o input do chamador não é mutado pela ordenação", () => {
    const input = [standing({ userId: 2, points: 1 }), standing({ userId: 1, points: 5 })];
    rankSeasonStandings(input);
    expect(input.map((s) => s.userId)).toEqual([2, 1]);
  });
});

describe("temporada — o troféu do campeão", () => {
  it("o nome do troféu é o nome do catálogo", () => {
    expect(SEASON_CHAMPION_BADGE_NAME).toBe("CAMPEÃO");
  });

  it("a chave de reexecução do troféu é o par ano + pessoa", () => {
    expect(seasonChampionDescription(2026, 42)).toBe("GAMIFICATION:SEASON_CHAMPION:2026:42");
    // Troféu de outro ano é outra chave: a pessoa pode ser campeã duas vezes.
    expect(seasonChampionDescription(2027, 42)).toBe("GAMIFICATION:SEASON_CHAMPION:2027:42");
  });
});

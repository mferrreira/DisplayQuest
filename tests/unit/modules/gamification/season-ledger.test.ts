/**
 * plan-v8 V8-7 (DEC-220) — `ReadSeasonLedgerUseCase` sobre port falsa, sem banco.
 *
 * O contrato congelado é UM: o livro-caixa é lido COMO FOI ESCRITO. O caso central entrega linhas em
 * que a posição do livro NÃO casa com a conta que a régua viva faria sobre os pontos (o campeão do
 * livro tem menos pontos que o segundo) — e exige que a tela receba a posição da linha, não uma posição
 * recalculada. Depois da virada o XP zerou e o elo voltou ao primeiro degrau: nenhuma régua viva sabe
 * quem fechou aquele ano em que lugar. Re-aritmética-la na tela seria o livro mentir sobre si mesmo.
 *
 * Também congelado: `year: null` quando nenhuma temporada fechou (o ano em curso não tem livro), e
 * nesse caso nenhuma linha de standings é pedida.
 */
import { beforeEach, describe, expect, it } from "vitest";

import type {
  ClosedSeasonStanding,
  SeasonCyclePort,
} from "@/backend/modules/gamification/application/ports/season-cycle.port";
import { ReadSeasonLedgerUseCase } from "@/backend/modules/gamification/application/use-cases/read-season-ledger.use-case";

const CLOSED_YEAR = 2025;

function standing(overrides: Partial<ClosedSeasonStanding> & { userId: number; name: string }): ClosedSeasonStanding {
  return { points: 0, completedTasks: 0, xp: 0, elo: null, position: null, ...overrides };
}

describe("ReadSeasonLedgerUseCase (V8-7)", () => {
  let standings: ClosedSeasonStanding[];
  let latestYear: number | null;
  let standingsAsked: number[];
  let useCase: ReadSeasonLedgerUseCase;

  beforeEach(() => {
    standings = [];
    latestYear = CLOSED_YEAR;
    standingsAsked = [];
    const notUsed = (name: string) => () => {
      throw new Error(`${name} não deveria ser usada por esta leitura`);
    };
    const cycle = {
      async latestClosedSeasonYear() {
        return latestYear;
      },
      async listSeasonStandings(year: number) {
        standingsAsked.push(year);
        return standings.map((entry) => ({ ...entry }));
      },
      listCandidatesForSeasonClose: notUsed("cycle.listCandidatesForSeasonClose"),
      getSeasonSnapshot: notUsed("cycle.getSeasonSnapshot"),
      closeSeason: notUsed("cycle.closeSeason"),
      listSeasonHistoryForUser: notUsed("cycle.listSeasonHistoryForUser"),
    } as unknown as SeasonCyclePort;
    useCase = new ReadSeasonLedgerUseCase({ cycle });
  });

  it("sem ano fechado, o livro é null e nenhuma linha é pedida", async () => {
    latestYear = null;

    const result = await useCase.execute();

    expect(result).toEqual({ year: null, standings: [] });
    expect(standingsAsked).toEqual([]);
  });

  it("devolve o último ano fechado com as linhas como foram escritas", async () => {
    standings = [
      standing({ userId: 3, name: "Campeao", points: 120, completedTasks: 6, xp: 480, elo: "PRATA", position: 1 }),
      standing({ userId: 9, name: "Segundo", points: 400, completedTasks: 2, xp: 90, elo: "BRONZE", position: 2 }),
    ];

    const result = await useCase.execute();

    expect(standingsAsked).toEqual([CLOSED_YEAR]);
    expect(result.year).toBe(CLOSED_YEAR);
    // A posição vem da COLUNA DO LIVRO: o "campeão" tem menos pontos que o segundo de propósito.
    // Uma tela que reordenasse por pontos devolveria [Segundo, Campeao] e chamaria 400 pontos de campeão.
    expect(result.standings.map((entry) => entry.name)).toEqual(["Campeao", "Segundo"]);
    expect(result.standings.map((entry) => entry.position)).toEqual([1, 2]);
    expect(result.standings.map((entry) => entry.elo)).toEqual(["PRATA", "BRONZE"]);
  });

  it("linha antiga do livro (V8-4) continua legível com elo nulo e posição preenchida", async () => {
    standings = [standing({ userId: 4, name: "SemElo", points: 30, position: 1 })];

    const result = await useCase.execute();

    expect(result.standings[0].elo).toBeNull();
    expect(result.standings[0].position).toBe(1);
    expect(result.standings[0].completedTasks).toBe(0);
  });
});

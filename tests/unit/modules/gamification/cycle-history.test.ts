/**
 * plan-v8 V8-7 (DEC-220) — `ReadUserCycleHistoryUseCase` sobre port falsa, sem banco.
 *
 * Congelado aqui:
 *   1. o histórico vem das DUAS tabelas do livro (`month_history` pela port do ciclo mensal,
 *      `season_history` pela port da temporada) — uma port por tabela, então o histórico da tela e a
 *      soma que o fechamento faz não viram dois leitores com duas ordens próprias;
 *   2. o destaque de campeão é a POSIÇÃO DO LIVRO (`position === SEASON_CHAMPION_POSITION`), a mesma
 *      constante que concede o troféu na V8-4: tela e rotina nomeiam o campeão pelo mesmo número;
 *   3. mais de um ano de campeão é vitalício (a unique de `user_badges` não duplica a conquista, e o
 *      livro tem uma linha por ano);
 *   4. `position: null` (linha da V8-4, anterior à coluna ser preenchida) não é campeão;
 *   5. pessoa sem linha não tem histórico — o livro registra o que aconteceu, não um 0 por cadastro.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { SEASON_CHAMPION_POSITION } from "@/backend/domain";
import type {
  MonthHistoryRow,
  MonthlyPointsCyclePort,
} from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port";
import type {
  SeasonCyclePort,
  SeasonHistoryRow,
} from "@/backend/modules/gamification/application/ports/season-cycle.port";
import { ReadUserCycleHistoryUseCase } from "@/backend/modules/gamification/application/use-cases/read-user-cycle-history.use-case";

describe("ReadUserCycleHistoryUseCase (V8-7)", () => {
  let months: MonthHistoryRow[];
  let seasons: SeasonHistoryRow[];
  let monthsAsked: number[];
  let seasonsAsked: number[];
  let useCase: ReadUserCycleHistoryUseCase;

  beforeEach(() => {
    months = [];
    seasons = [];
    monthsAsked = [];
    seasonsAsked = [];
    const notUsed = (name: string) => () => {
      throw new Error(`${name} não deveria ser usada por esta leitura`);
    };
    const monthlyCycle = {
      async listMonthHistory(userId: number) {
        monthsAsked.push(userId);
        return months.map((entry) => ({ ...entry }));
      },
      listAllUsersForClose: notUsed("monthlyCycle.listAllUsersForClose"),
      countTasksCompletedInMonth: notUsed("monthlyCycle.countTasksCompletedInMonth"),
      hasMonthSnapshot: notUsed("monthlyCycle.hasMonthSnapshot"),
      closeMonth: notUsed("monthlyCycle.closeMonth"),
    } as unknown as MonthlyPointsCyclePort;
    const seasonCycle = {
      async listSeasonHistoryForUser(userId: number) {
        seasonsAsked.push(userId);
        return seasons.map((entry) => ({ ...entry }));
      },
      listCandidatesForSeasonClose: notUsed("seasonCycle.listCandidatesForSeasonClose"),
      getSeasonSnapshot: notUsed("seasonCycle.getSeasonSnapshot"),
      closeSeason: notUsed("seasonCycle.closeSeason"),
      listSeasonStandings: notUsed("seasonCycle.listSeasonStandings"),
      latestClosedSeasonYear: notUsed("seasonCycle.latestClosedSeasonYear"),
    } as unknown as SeasonCyclePort;
    useCase = new ReadUserCycleHistoryUseCase({ monthlyCycle, seasonCycle });
  });

  it("devolve os meses e as temporadas da pessoa, e lê as duas tabelas", async () => {
    months = [
      { month: "2026-09", points: 60, completedTasks: 3 },
      { month: "2026-08", points: -25, completedTasks: 1 },
    ];
    seasons = [{ year: 2025, points: 35, completedTasks: 4, xp: 120, elo: "BRONZE", position: 3 }];

    const result = await useCase.execute({ userId: 12 });

    expect(monthsAsked).toEqual([12]);
    expect(seasonsAsked).toEqual([12]);
    expect(result.months.map((entry) => entry.month)).toEqual(["2026-09", "2026-08"]);
    // O negativo do snapshot continua legível (DEC-39 sobrevive ao fechamento).
    expect(result.months[1].points).toBe(-25);
    expect(result.championYears).toEqual([]);
  });

  it("o destaque de campeão vem da posição do livro, e pode ser mais de um ano", async () => {
    expect(SEASON_CHAMPION_POSITION).toBe(1);
    seasons = [
      { year: 2025, points: 90, completedTasks: 5, xp: 480, elo: "PRATA", position: 1 },
      { year: 2024, points: 40, completedTasks: 2, xp: 100, elo: "BRONZE", position: 4 },
      { year: 2023, points: 70, completedTasks: 4, xp: 300, elo: "BRONZE", position: 1 },
    ];

    const result = await useCase.execute({ userId: 7 });

    expect(result.championYears).toEqual([2025, 2023]);
  });

  it("posição nula (linha anterior à coluna preenchida) não é campeão", async () => {
    seasons = [{ year: 2022, points: 10, completedTasks: 1, xp: 0, elo: null, position: null }];

    const result = await useCase.execute({ userId: 7 });

    expect(result.seasons).toHaveLength(1);
    expect(result.championYears).toEqual([]);
  });

  it("pessoa sem linha no livro tem histórico vazio, não zeros", async () => {
    const result = await useCase.execute({ userId: 3 });

    expect(result).toEqual({ months: [], seasons: [], championYears: [] });
  });
});

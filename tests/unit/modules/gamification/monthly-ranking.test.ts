/**
 * plan-v8 V8-7 (DEC-220) — `ListMonthlyRankingUseCase` sobre port falsa, sem banco.
 *
 * Congelado aqui é a ORQUESTRAÇÃO do quadro do mês:
 *   1. a janela entregue à port é a do mês em curso do `now` (domínio: `currentMonthOfInstant` +
 *      `monthWindow`) — se o recorte do mês errar, `windowsAsked` denuncia;
 *   2. a ordem é a régua da temporada (`rankSeasonStandings`: pontos → tarefas do mês → XP → userId),
 *      com o desempate provado ramo a ramo. Não existe comparador local para conferir: conferir contra
 *      um segundo comparador seria as duas réguas aprovando uma à outra;
 *   3. `completedTasks` da régua é a tarefa do MÊS (`monthTasks` da port), nunca a coluna vitalícia;
 *   4. o elo é DERIVADO do XP pela escada (`eloForSeasonXp`), e o caso mede o degrau ao lado do XP que
 *      o produz — a coluna `users.elo` não entra nesta leitura de propósito;
 *   5. todo cadastro tem linha, inclusive quem não pontuou: o quadro é o placar do mês, não um pódio.
 *
 * O que a port falsa NÃO reimplementa: as duas famílias de tarefa e os `groupBy` do adaptador. Isso é
 * conferido no roundtrip `monthly-ranking-roundtrip` contra o banco 5433, e por `trophy-window-guard`
 * contra as condições dos outros três adaptadores.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { currentMonthOfInstant, eloForSeasonXp, monthWindow } from "@/backend/domain";
import type {
  MonthlyRankingPort,
  MonthlyRankingRow,
} from "@/backend/modules/gamification/application/ports/monthly-ranking.port";
import { ListMonthlyRankingUseCase } from "@/backend/modules/gamification/application/use-cases/list-monthly-ranking.use-case";

const NOW = new Date("2026-10-15T15:00:00.000Z");

function row(overrides: Partial<MonthlyRankingRow> & { userId: number; name: string }): MonthlyRankingRow {
  return {
    avatar: null,
    bannerKey: null,
    roles: ["VOLUNTARIO"],
    points: 0,
    xp: 0,
    coins: 0,
    monthTasks: 0,
    trophiesEquipped: 0,
    trophiesTotal: 0,
    ...overrides,
  };
}

describe("ListMonthlyRankingUseCase (V8-7)", () => {
  let seeded: MonthlyRankingRow[];
  let windowsAsked: Array<{ start: Date; endExclusive: Date }>;
  let useCase: ListMonthlyRankingUseCase;

  beforeEach(() => {
    seeded = [];
    windowsAsked = [];
    const port: MonthlyRankingPort = {
      async listRows(window) {
        windowsAsked.push(window);
        return seeded.map((entry) => ({ ...entry }));
      },
    };
    useCase = new ListMonthlyRankingUseCase({ ranking: port });
  });

  it("a janela pedida à port é a do mês em curso do now", async () => {
    const result = await useCase.execute({ now: NOW });

    expect(result.month).toBe("2026-10");
    expect(windowsAsked).toHaveLength(1);
    const expected = monthWindow(currentMonthOfInstant(NOW));
    expect(windowsAsked[0].start.toISOString()).toBe(expected.start.toISOString());
    expect(windowsAsked[0].endExclusive.toISOString()).toBe(expected.endExclusive.toISOString());
  });

  it("ordena por pontos do mês e desempata por tarefa do mês, XP e userId", async () => {
    seeded = [
      row({ userId: 3, name: "XpAlto", points: 30, monthTasks: 1, xp: 500 }),
      row({ userId: 4, name: "MaisTarefaNoMes", points: 30, monthTasks: 4, xp: 0 }),
      row({ userId: 6, name: "MenosPontos", points: 10, monthTasks: 9, xp: 5000 }),
      row({ userId: 2, name: "XpBaixo", points: 30, monthTasks: 1, xp: 100 }),
      row({ userId: 1, name: "Lider", points: 50 }),
    ];

    const result = await useCase.execute({ now: NOW });

    expect(result.rows.map((entry) => entry.name)).toEqual([
      "Lider",
      // pontos iguais: a tarefa do MÊS desempata antes do XP;
      "MaisTarefaNoMes",
      // pontos e tarefas iguais: o XP da temporada desempata;
      "XpAlto",
      "XpBaixo",
      // tarefa não resgata placar menor: 9 tarefas do mês não passam 10 pontos de 30.
      "MenosPontos",
    ]);
    expect(result.rows.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("o desempate final é o userId crescente (ordem total)", async () => {
    seeded = [
      row({ userId: 5, name: "IdMaior", points: 30, monthTasks: 1, xp: 100 }),
      row({ userId: 2, name: "IdMenor", points: 30, monthTasks: 1, xp: 100 }),
    ];

    const result = await useCase.execute({ now: NOW });

    expect(result.rows.map((entry) => entry.name)).toEqual(["IdMenor", "IdMaior"]);
  });

  it("a tarefa que desempata é a do mês, não a vitalícia", async () => {
    // `trophiesTotal`/`coins` mostram que a port devolve outras contagens; nenhuma delas entra na régua.
    seeded = [
      row({ userId: 1, name: "VitalicioMuito", points: 20, monthTasks: 0, trophiesTotal: 99, coins: 99 }),
      row({ userId: 2, name: "MesCheio", points: 20, monthTasks: 3, trophiesTotal: 0, coins: 0 }),
    ];

    const result = await useCase.execute({ now: NOW });

    expect(result.rows.map((entry) => entry.name)).toEqual(["MesCheio", "VitalicioMuito"]);
  });

  it("o elo é derivado do XP pela escada, não lido de coluna", async () => {
    // Todos com pontos e tarefas 0: a própria ordem do quadro sai do XP (decrescente), e o degrau de
    // cada linha é o que a escada deriva do XP daquela linha.
    seeded = [
      row({ userId: 1, name: "Bronze", xp: 0 }),
      row({ userId: 2, name: "Prata", xp: 400 }),
      row({ userId: 3, name: "Ouro", xp: 940 }),
      row({ userId: 4, name: "Desafiante", xp: 3600 }),
    ];

    const result = await useCase.execute({ now: NOW });

    expect(result.rows.map((entry) => entry.name)).toEqual(["Desafiante", "Ouro", "Prata", "Bronze"]);
    expect(result.rows.map((entry) => entry.elo)).toEqual([
      "DESAFIANTE",
      "OURO",
      "PRATA",
      "BRONZE",
    ]);
    // Conferência com a escada, linha a linha (940 XP é OURO, não PRATA: o limiar de 900 é AVALIADO).
    expect(result.rows.map((entry) => entry.elo)).toEqual(result.rows.map((entry) => eloForSeasonXp(entry.xp)));
  });

  it("quem não pontuou no mês tem linha com zero", async () => {
    seeded = [row({ userId: 1, name: "Zerado" }), row({ userId: 2, name: "ComPontos", points: 5 })];

    const result = await useCase.execute({ now: NOW });

    expect(result.rows).toHaveLength(2);
    const zerado = result.rows.find((entry) => entry.name === "Zerado");
    expect(zerado?.points).toBe(0);
    expect(zerado?.monthTasks).toBe(0);
    expect(zerado?.position).toBe(2);
  });
});

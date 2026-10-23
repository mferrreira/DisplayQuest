/**
 * plan-v8 V8-4 (DEC-213) — `CloseSeasonUseCase` sobre port falsa, sem banco.
 *
 * Congelado aqui é a ORQUESTRAÇÃO, caso a caso:
 *   1. o ano fechado é o ANTERIOR ao `now` da run (`closingSeasonYearOfInstant`), e a port é chamada
 *      com esse ano — se o recorte errar, `yearsAsked` denuncia;
 *   2. snapshot antes da zeragem: a leitura `getSeasonSnapshot` decide o "já fechou" e o use case não
 *      escreve nem zera de novo (a unique `(userId, year)` do adaptador é o backstop, devolvido como
 *      `false`);
 *   3. o que zera é o par da temporada (`points`, `xp`); moeda, troféus conquistados e o contador
 *      vitalício de tarefas ficam — o caso lê os quatro antes e depois;
 *   4. posição é a régua do domínio (`rankSeasonStandings`), com o negativo do snapshot perdendo do 0
 *      e o empate fechado por userId;
 *   5. o campeão é lido DO LIVRO depois das escritas, e o troféu é idempotente pela chave
 *      `GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>`;
 *   6. `badge-ausente` e `sem-participante` não são erro: as linhas do ano continuam escritas;
 *   7. gate MANAGE_USERS com `systemActor` bypassando (DEC-54).
 *
 * A port falsa entrega fatos SEMEARADOS (agregados do ano, linhas do livro), não reimplementa as
 * queries do adaptador: o somatório de `month_history` pelo prefixo do ano, a zeragem das duas colunas
 * e a linha de auditoria do troféu estão congelados no roundtrip G4 `season-close-roundtrip`.
 * Reimplementá-los aqui deixaria o teste verde com o adaptador mentindo (DEC-90).
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  FIRST_SEASON_ELO,
  SEASON_CHAMPION_BADGE_NAME,
  SEASON_POINTS_AFTER_CLOSE,
  SEASON_XP_AFTER_CLOSE,
  ForbiddenError,
} from "@/backend/domain";
import { systemActor, userActor } from "@/backend/domain/identity";
import type { SeasonChampionPort } from "@/backend/modules/gamification/application/ports/season-champion.port";
import type {
  SeasonCandidate,
  SeasonCyclePort,
  SeasonSnapshot,
  SeasonSnapshotWrite,
} from "@/backend/modules/gamification/application/ports/season-cycle.port";
import {
  CloseSeasonUseCase,
  SEASON_CLOSE_DENIED_MESSAGE,
} from "@/backend/modules/gamification/application/use-cases/close-season.use-case";

import type { SeasonChampionAward } from "@/backend/modules/gamification/application/ports/season-champion.port";

const BADGE_ID = 775;
const RUN_2027 = new Date("2027-01-01T03:05:00.000Z"); // 00:05 de 01/01/2027 SP → fecha 2026
const CLOSED_YEAR = 2026;

interface LiveUser {
  userId: number;
  name: string;
  points: number;
  xp: number;
  /** V8-6 (DEC-217): a coluna existe e a virada a devolve ao primeiro degrau. */
  elo: string;
  coins: number;
  completedTasks: number;
}

interface SeededAggregate {
  monthsInYear: number;
  seasonPoints: number;
  seasonCompletedTasks: number;
}

interface FakeWorld {
  users: LiveUser[];
  /** Agregados do ano, semeados por ano → pessoa. É o que o adaptador calcula no banco. */
  aggregates: Record<number, Record<number, SeededAggregate>>;
  book: Map<string, SeasonSnapshot>;
  writes: SeasonSnapshotWrite[];
  awards: SeasonChampionAward[];
  awardedKeys: Set<string>;
  awardedBadges: Array<{ userId: number; badgeId: number }>;
  yearsAsked: number[];
  badgeExists: boolean;
  /** Linha que aparece entre a leitura e a escrita de outra run — o cenário de corrida. */
  race?: { userId: number; year: number; snapshot: SeasonSnapshot };
}

const keyOf = (userId: number, year: number) => `${userId}:${year}`;

function emptyAggregate(): SeededAggregate {
  return { monthsInYear: 0, seasonPoints: 0, seasonCompletedTasks: 0 };
}

function fakeCycle(world: FakeWorld): SeasonCyclePort {
  return {
    async listCandidatesForSeasonClose(year) {
      world.yearsAsked.push(year);
      const byYear = world.aggregates[year] ?? {};
      return world.users.map<SeasonCandidate>((user) => ({
        userId: user.userId,
        name: user.name,
        xp: user.xp,
        points: user.points,
        ...(byYear[user.userId] ?? emptyAggregate()),
      }));
    },
    async getSeasonSnapshot(userId, year) {
      return world.book.get(keyOf(userId, year)) ?? null;
    },
    async closeSeason(write) {
      const key = keyOf(write.userId, write.year);
      if (world.race && keyOf(world.race.userId, world.race.year) === key) {
        // Outra run escreveu a linha entre a leitura de idempotência e esta escrita.
        world.book.set(key, world.race.snapshot);
        world.race = undefined;
      }
      if (world.book.has(key)) {
        return false;
      }
      world.writes.push(write);
      world.book.set(key, {
        userId: write.userId,
        year: write.year,
        points: write.points,
        completedTasks: write.completedTasks,
        xp: write.xp,
        elo: write.elo,
        position: write.position,
      });
      // O adaptador zera as DUAS trilhas da temporada na mesma transação e nada mais — congelado no
      // roundtrip G4. A fake reproduz o efeito para o caso ter como provar que moeda, troféu e o
      // contador vitalício não foram tocados.
      const live = world.users.find((user) => user.userId === write.userId);
      if (live) {
        live.points = SEASON_POINTS_AFTER_CLOSE;
        live.xp = SEASON_XP_AFTER_CLOSE;
        // V8-6 (DEC-217): o elo da COLUNA volta ao primeiro degrau junto com o XP. O degrau do ano que
        // fechou não se perde: fica em `season_history.elo`, escrito acima com o valor de `write.elo`.
        live.elo = FIRST_SEASON_ELO;
      }
      return true;
    },
    async listSeasonStandings(year) {
      const standings = []
      for (const [key, snapshot] of world.book) {
        if (snapshot.year !== year) continue;
        const userId = Number(key.split(":")[0])
        const user = world.users.find((candidate) => candidate.userId === userId)
        standings.push({
          userId,
          name: user?.name ?? `usuário ${userId}`,
          points: snapshot.points,
          completedTasks: snapshot.completedTasks,
          xp: snapshot.xp,
        })
      }
      return standings
    },
  };
}

function fakeChampion(world: FakeWorld): SeasonChampionPort {
  return {
    async awardSeasonChampion(award) {
      world.awards.push(award);
      // A ordem é a do adaptador: primeiro a linha de auditoria, depois o catálogo.
      if (world.awardedKeys.has(award.description)) {
        return { status: "already-awarded", badgeId: null };
      }
      if (!world.badgeExists) {
        return { status: "badge-ausente", badgeId: null };
      }
      world.awardedKeys.add(award.description);
      world.awardedBadges.push({ userId: award.userId, badgeId: BADGE_ID });
      return { status: "awarded", badgeId: BADGE_ID };
    },
  };
}

function makeWorld(users: LiveUser[], aggregates: Record<number, Record<number, SeededAggregate>> = {}): FakeWorld {
  return {
    users,
    aggregates,
    book: new Map(),
    writes: [],
    awards: [],
    awardedKeys: new Set(),
    awardedBadges: [],
    yearsAsked: [],
    badgeExists: true,
  };
}

function useCase(world: FakeWorld) {
  return new CloseSeasonUseCase({ cycle: fakeCycle(world), champion: fakeChampion(world) });
}

/** Uma pessoa com atividade no ano: placar, XP e moeda vitalícia. */
function person(userId: number, over: Partial<LiveUser> = {}): LiveUser {
  return { userId, name: `usuário ${userId}`, points: 0, xp: 0, elo: FIRST_SEASON_ELO, coins: 0, completedTasks: 0, ...over };
}

describe("fechamento de temporada — gate e ano (DEC-213)", () => {
  it("quem não é gestão não fecha temporada de ninguém", async () => {
    const world = makeWorld([person(1)]);
    await expect(
      useCase(world).execute({ actor: userActor(1, ["VOLUNTARIO"]), now: RUN_2027 }),
    ).rejects.toThrow(new ForbiddenError(SEASON_CLOSE_DENIED_MESSAGE));
    expect(world.writes).toHaveLength(0);
  });

  it("rotina de sistema passa pelo gate (DEC-54) e fecha o ano ANTERIOR ao instante da run", async () => {
    const world = makeWorld([person(1, { xp: 10 })]);
    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });
    expect(result.year).toBe(CLOSED_YEAR);
    expect(world.yearsAsked).toEqual([CLOSED_YEAR]);
  });
});

describe("fechamento de temporada — snapshot, zeragem e o que fica", () => {
  it("fotografa o ano e zera as duas trilhas, deixando moeda, troféu e o contador vitalício", async () => {
    const world = makeWorld([person(7, { points: 30, xp: 240, coins: 500, completedTasks: 42 })], {
      [CLOSED_YEAR]: { 7: { monthsInYear: 3, seasonPoints: 120, seasonCompletedTasks: 8 } },
    });

    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(world.writes).toEqual([
      {
        userId: 7,
        year: CLOSED_YEAR,
        points: 120,
        completedTasks: 8,
        xp: 240,
        // V8-6 (DEC-217): a linha nasce com a posição E com o elo do ano que fecha — 240 XP ainda é
        // BRONZE (o umbral do PRATA é 400). Quem decide o degrau é o port, a partir do XP lido.
        elo: "BRONZE",
        position: 1,
      },
    ]);

    const live = world.users[0];
    expect(live.points).toBe(0);
    expect(live.xp).toBe(0);
    // Vitalício não reseta (MODELO §4): os dois continuam com o valor de antes.
    expect(live.coins).toBe(500);
    expect(live.completedTasks).toBe(42);

    expect(result.outcomes).toEqual([
      {
        userId: 7,
        name: "usuário 7",
        year: CLOSED_YEAR,
        status: "closed",
        points: 120,
        completedTasks: 8,
        xp: 240,
        elo: "BRONZE",
        position: 1,
      },
    ]);
    expect(result.closed).toBe(1);
    expect(result.alreadyClosed).toBe(0);
    expect(result.skippedWithoutActivity).toBe(0);
  });

  it("cadastro sem mês fotografado e sem XP não ganha linha de zeros nem é zerado", async () => {
    const world = makeWorld([person(8, { points: 0, xp: 0, coins: 12 })]);
    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(world.writes).toHaveLength(0);
    expect(world.users[0].coins).toBe(12);
    expect(result.skippedWithoutActivity).toBe(1);
    expect(result.outcomes[0]?.status).toBe("without-activity");
    expect(result.outcomes[0]?.position).toBeNull();
    // Sem participante, o livro do ano fica vazio e não há campeão.
    expect(result.champion.status).toBe("sem-participante");
    expect(result.champion.userId).toBeNull();
    expect(world.awards).toHaveLength(0);
  });

  it("XP aberto sem snapshot de mês entra no livro com o XP que a temporada tem", async () => {
    const world = makeWorld([person(9, { points: 0, xp: 20 })]);
    await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(world.writes).toEqual([
      {
        userId: 9,
        year: CLOSED_YEAR,
        points: 0,
        completedTasks: 0,
        xp: 20,
        elo: "BRONZE",
        position: 1,
      },
    ]);
  });
});

describe("fechamento de temporada — posição e campeão", () => {
  const fourUsers = [
    person(10, { xp: 240 }),
    person(11, { xp: 90 }),
    person(12, { xp: 500 }),
    person(13, { xp: 0 }),
  ];
  const fourAggregates = {
    [CLOSED_YEAR]: {
      10: { monthsInYear: 4, seasonPoints: 120, seasonCompletedTasks: 12 },
      11: { monthsInYear: 1, seasonPoints: 300, seasonCompletedTasks: 5 },
      12: { monthsInYear: 2, seasonPoints: 120, seasonCompletedTasks: 12 },
      13: { monthsInYear: 1, seasonPoints: -40, seasonCompletedTasks: 1 },
    },
  };

  it("o elo do livro é o degrau do XP do ano fechado, não o da coluna (DEC-217)", async () => {
    // Os quatro tem XP 240, 90, 500 e 0: três BRONZE e um PRATA. O elo entra na linha escrita pelo
    // port a partir do XP que a pessoa tem NA RUN — a coluna zera logo depois, e o degrau fotografado
    // é a única memória dele.
    // Cópias: os fixtures de `fourUsers` são compartilhados com os testes de posição, e a run zera o
    // XP dos objetos — compartilhar seria um teste depender do outro.
    const world = makeWorld(fourUsers.map((candidate) => ({ ...candidate })), fourAggregates);
    await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    const eloByUser = new Map(world.writes.map((write) => [write.userId, write.elo]));
    expect([...eloByUser.entries()].sort()).toEqual([
      [10, "BRONZE"],
      [11, "BRONZE"],
      [12, "PRATA"],
      [13, "BRONZE"],
    ]);
    // A coluna volta ao primeiro degrau junto com o XP; o livro guarda o degrau do ano.
    expect(world.users.map((u) => [u.xp, u.elo])).toEqual([
      [0, "BRONZE"],
      [0, "BRONZE"],
      [0, "BRONZE"],
      [0, "BRONZE"],
    ]);
  });

  it("a posição segue a régua do domínio, com o negativo do snapshot perdendo do 0", async () => {
    const world = makeWorld(fourUsers, fourAggregates);
    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    const byUser = new Map(result.outcomes.map((outcome) => [outcome.userId, outcome.position]));
    expect([...byUser.entries()].sort()).toEqual([
      [10, 3],
      [11, 1],
      [12, 2],
      [13, 4],
    ]);
    // Empatados em pontos e tarefas: XP desempata antes do userId (12 tem 500, 10 tem 240).
    expect(byUser.get(12)).toBe(2);
  });

  it("empate nos três números é fechado por userId, e o campeão é um só", async () => {
    const world = makeWorld(
      [person(20), person(21), person(22)],
      {
        [CLOSED_YEAR]: {
          20: { monthsInYear: 1, seasonPoints: 100, seasonCompletedTasks: 4 },
          21: { monthsInYear: 1, seasonPoints: 100, seasonCompletedTasks: 4 },
          22: { monthsInYear: 1, seasonPoints: 100, seasonCompletedTasks: 4 },
        },
      },
    );
    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(result.champion.userId).toBe(20);
    expect(result.champion.points).toBe(100);
    expect(result.champion.status).toBe("awarded");
    expect(result.champion.badgeId).toBe(BADGE_ID);
    expect(world.awardedBadges).toEqual([{ userId: 20, badgeId: BADGE_ID }]);
  });

  it("o campeão sai do livro lido de volta, com a chave do troféu do ano", async () => {
    const world = makeWorld(fourUsers, fourAggregates);
    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(result.champion).toEqual({
      userId: 11,
      name: "usuário 11",
      points: 300,
      badgeId: BADGE_ID,
      status: "awarded",
    });
    expect(world.awards).toEqual([
      {
        year: CLOSED_YEAR,
        userId: 11,
        badgeName: SEASON_CHAMPION_BADGE_NAME,
        description: `GAMIFICATION:SEASON_CHAMPION:${CLOSED_YEAR}:11`,
      },
    ]);
  });

  it("troféu ausente no catálogo não desfaz o ano: as linhas ficam e o estado é reportado", async () => {
    const world = makeWorld(fourUsers, fourAggregates);
    world.badgeExists = false;
    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(world.writes).toHaveLength(4);
    expect(result.closed).toBe(4);
    expect(result.champion.status).toBe("badge-ausente");
    expect(result.champion.userId).toBe(11);
    expect(result.champion.badgeId).toBeNull();
    expect(world.awardedBadges).toHaveLength(0);
  });
});

describe("fechamento de temporada — reexecução", () => {
  const seedBook = (world: FakeWorld) => {
    world.book.set(keyOf(30, CLOSED_YEAR), {
      userId: 30,
      year: CLOSED_YEAR,
      points: 400,
      completedTasks: 20,
      xp: 900,
      elo: null,
      position: 1,
    });
    world.awardedKeys.add(`GAMIFICATION:SEASON_CHAMPION:${CLOSED_YEAR}:30`);
  };

  it("uma linha já existente não é escrita de novo nem zera a coluna outra vez", async () => {
    const world = makeWorld([person(30, { points: 50, xp: 50, coins: 300 })]);
    seedBook(world);

    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(world.writes).toHaveLength(0);
    expect(result.closed).toBe(0);
    expect(result.alreadyClosed).toBe(1);
    // O que se reporta é o livro, não a coluna (que a run original já zerou).
    // O elo reportado vem do LIVRO lido de volta, e esta linha foi escrita antes de a escada existir
    // (V8-4): o livro não se reescreve, então ela continua com elo nulo.
    expect(result.outcomes[0]).toMatchObject({ status: "already-closed", points: 400, xp: 900, elo: null, position: 1 });
    // E o que ainda estava na coluna fica onde estava: zeragem não vem atrás de um dedup não lido.
    expect(world.users[0].points).toBe(50);
    expect(world.users[0].xp).toBe(50);
  });

  it("rodar duas vezes escolhe o mesmo campeão e não concede o troféu duas vezes", async () => {
    const world = makeWorld(
      [person(31, { xp: 100 }), person(32, { xp: 60 })],
      {
        [CLOSED_YEAR]: {
          31: { monthsInYear: 2, seasonPoints: 210, seasonCompletedTasks: 9 },
          32: { monthsInYear: 3, seasonPoints: 90, seasonCompletedTasks: 30 },
        },
      },
    );
    const runner = useCase(world);

    const first = await runner.execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });
    const second = await runner.execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(first.closed).toBe(2);
    expect(first.champion.userId).toBe(31);
    expect(first.champion.status).toBe("awarded");

    expect(second.closed).toBe(0);
    expect(second.alreadyClosed).toBe(2);
    expect(second.champion.userId).toBe(31);
    expect(second.champion.status).toBe("already-awarded");
    expect(world.writes).toHaveLength(2);
    expect(world.awardedBadges).toHaveLength(1);
    // As duas runs escreveram a chave do troféu; quem decide é a leitura da chave no port.
    expect(world.awards).toHaveLength(2);
  });

  it("a recusa do adaptador na corrida é reportada como já fechada, sem zerar outra vez", async () => {
    const world = makeWorld([person(33, { points: 40, xp: 70 })], {
      [CLOSED_YEAR]: { 33: { monthsInYear: 1, seasonPoints: 40, seasonCompletedTasks: 2 } },
    });
    world.race = {
      userId: 33,
      year: CLOSED_YEAR,
      snapshot: {
        userId: 33,
        year: CLOSED_YEAR,
        points: 40,
        completedTasks: 2,
        xp: 70,
        elo: null,
        position: 1,
      },
    };

    const result = await useCase(world).execute({ actor: systemActor("SEASON_CLOSE"), now: RUN_2027 });

    expect(result.closed).toBe(0);
    expect(result.alreadyClosed).toBe(1);
    expect(result.outcomes[0]?.status).toBe("already-closed");
    expect(result.outcomes[0]?.points).toBe(40);
    // A unique bloqueou a escrita, então a zeragem também não aconteceu: a corrida não apaga o mês.
    expect(world.writes).toHaveLength(0);
    expect(world.users[0].points).toBe(40);
    expect(world.users[0].xp).toBe(70);
  });
});

// @vitest-environment node
/**
 * plan-v8 V8-4 (DEC-54/DEC-213) — o job do cron do fechamento de temporada, do lado do CHAMADOR.
 *
 * Terceira vez do mesmo par rotina×ator (V8-2 mensal, V8-3 semanal): a lição medida da DEC-54 é que
 * um gate dentro de um use case chamado por rotina quebra a ROTINA e nenhum teste de rota vê. Aqui:
 *   1. o cron chama o use case REAL do módulo gamification (montado sobre port falsa — o mock troca o
 *      banco, não reimplementa regra) com `systemActor("SEASON_CLOSE")`; se o job passasse ator de
 *      pessoa sem MANAGE_USERS, o gate derrubava a virada e as asserções de snapshot ficavam vermelhas;
 *   2. `now` vem do relógio da rotina (fake timers) e o ano fechado é o ANTERIOR em dia civil de
 *      America/Sao_Paulo — o job das 00:05 de 1º/jan/2027 fecha 2026;
 *   3. reexecução não escreve linha de novo, não zera de novo e não concede o troféu de novo;
 *   4. falha do fechamento vira `console.error` e não rejeita (rejeição não tratada em job é exit 1 no
 *      gate — lição medida do V4-4b).
 *
 * O somatório de `month_history` pelo prefixo do ano e a linha de auditoria do troféu continuam no
 * adaptador (congelados no roundtrip G4 `season-close-roundtrip`): a port falsa entrega agregados
 * semeados, que é o que a DEC-90 manda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const world = {
    users: [] as Array<{ userId: number; name: string; points: number; xp: number; coins: number; completedTasks: number }>,
    /** Agregados do ano semeados por ano → pessoa: é o que o adaptador calcula no banco. */
    aggregates: {} as Record<number, Record<number, { monthsInYear: number; seasonPoints: number; seasonCompletedTasks: number }>>,
    book: new Map<string, { userId: number; year: number; points: number; completedTasks: number; xp: number; elo: string | null; position: number | null }>(),
    awardedKeys: new Set<string>(),
    awardedBadges: [] as Array<{ userId: number; badgeId: number }>,
    badgeExists: true,
    /** Quando não-nulo, a port explode: é como o teste injeta falha de banco na rotina. */
    failure: null as string | null,
  };
  const commands: Array<{ actor: { kind: string; id?: number; roles?: unknown; reason?: string }; now: Date }> = [];
  const yearsAsked: number[] = [];
  const ZERO_AGGREGATE = { monthsInYear: 0, seasonPoints: 0, seasonCompletedTasks: 0 };

  function makeSeasonCycle() {
    return {
      listCandidatesForSeasonClose: async (year: number) => {
        if (world.failure) throw new Error(world.failure);
        yearsAsked.push(year);
        const byYear = world.aggregates[year] ?? {};
        return world.users.map((user) => ({
          userId: user.userId,
          name: user.name,
          xp: user.xp,
          points: user.points,
          ...(byYear[user.userId] ?? ZERO_AGGREGATE),
        }));
      },
      getSeasonSnapshot: async (userId: number, year: number) => world.book.get(`${userId}:${year}`) ?? null,
      closeSeason: async (write: {
        userId: number;
        year: number;
        points: number;
        completedTasks: number;
        xp: number;
        elo: string | null;
        position: number;
      }) => {
        const key = `${write.userId}:${write.year}`;
        if (world.book.has(key)) return false;
        world.book.set(key, {
          userId: write.userId,
          year: write.year,
          points: write.points,
          completedTasks: write.completedTasks,
          xp: write.xp,
          elo: write.elo,
          position: write.position,
        });
        // O adaptador zera points e xp na mesma transação e nada mais (congelado no roundtrip G4).
        const live = world.users.find((u) => u.userId === write.userId)!;
        live.points = 0;
        live.xp = 0;
        return true;
      },
      listSeasonStandings: async (year: number) => {
        const standings: Array<{ userId: number; name: string; points: number; completedTasks: number; xp: number }> = [];
        for (const [key, snapshot] of world.book) {
          if (snapshot.year !== year) continue;
          const userId = Number(key.split(":")[0]);
          standings.push({
            userId,
            name: world.users.find((u) => u.userId === userId)?.name ?? `usuário ${userId}`,
            points: snapshot.points,
            completedTasks: snapshot.completedTasks,
            xp: snapshot.xp,
          });
        }
        return standings;
      },
    };
  }

  function makeSeasonChampion() {
    return {
      awardSeasonChampion: async (award: { year: number; userId: number; badgeName: string; description: string }) => {
        if (world.awardedKeys.has(award.description)) return { status: "already-awarded", badgeId: null };
        if (!world.badgeExists) return { status: "badge-ausente", badgeId: null };
        world.awardedKeys.add(award.description);
        world.awardedBadges.push({ userId: award.userId, badgeId: 775 });
        return { status: "awarded", badgeId: 775 };
      },
    };
  }

  return { world, commands, yearsAsked, makeSeasonCycle, makeSeasonChampion };
});

vi.mock("@/lib/database/prisma", () => ({
  // O job não fala com o Prisma cru: fala com o módulo. Qualquer query aqui é wiring novo não
  // planejado — o erro alto é o aviso, não o silêncio.
  prisma: new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("Prisma cru não deveria ser alcançado pelo job do cron");
      },
    },
  ),
}));

vi.mock("@/backend/composition/root", async () => {
  const { createGamificationModule } = await import("@/backend/modules/gamification");
  const real = createGamificationModule({
    ports: {
      seasonCycle: h.makeSeasonCycle() as never,
      seasonChampion: h.makeSeasonChampion() as never,
    },
  });
  const gamification = {
    ...real,
    closeSeason: (command: { actor: never; now: Date }) => {
      h.commands.push(command as (typeof h.commands)[number]);
      return real.closeSeason(command);
    },
  };
  return { getBackendComposition: () => ({ gamification }) };
});

vi.mock("node-cron", () => ({ schedule: () => ({ stop: () => undefined }) }));

import { cronService } from "@/lib/services/cron-service";

beforeEach(() => {
  h.world.users = [
    { userId: 1, name: "Ana Campeã", points: 40, xp: 400, coins: 800, completedTasks: 25 },
    { userId: 2, name: "Bruno Segundo", points: 10, xp: 300, coins: 200, completedTasks: 40 },
    { userId: 3, name: "Carla Sem Ano", points: 0, xp: 0, coins: 50, completedTasks: 3 },
  ];
  h.world.aggregates = {
    2026: {
      1: { monthsInYear: 4, seasonPoints: 300, seasonCompletedTasks: 22 },
      2: { monthsInYear: 2, seasonPoints: 300, seasonCompletedTasks: 18 },
    },
  };
  h.world.book = new Map();
  h.world.awardedKeys = new Set();
  h.world.awardedBadges = [];
  h.world.badgeExists = true;
  h.world.failure = null;
  h.commands = [];
  h.yearsAsked.length = 0;
  vi.useFakeTimers();
  // 03:05 UTC de 01/01 = 00:05 de 01/01 America/Sao_Paulo: o instante do job '5 0 1 1 *'.
  vi.setSystemTime(new Date("2027-01-01T03:05:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CronService.executeSeasonClose (V8-4, DEC-213)", () => {
  it("o job fecha 2026 com systemActor(SEASON_CLOSE), ordena pela régua e entrega o troféu", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await cronService.executeSeasonClose();

    // DEC-54: o bypass declarado, nomeado. Um ator de pessoa aqui morreria no gate do use case.
    expect(h.commands).toHaveLength(1);
    expect(h.commands[0].actor).toEqual({ kind: "system", reason: "SEASON_CLOSE" });
    expect(h.commands[0].now.toISOString()).toBe("2027-01-01T03:05:00.000Z");
    expect(h.yearsAsked).toEqual([2026]);

    // Ana e Bruno empatam em 300 pontos; a régua desempata pelas tarefas do livro (22 de Ana contra 18
    // de Bruno) e a posição 1 é de Ana. Carla não tem mês fotografado nem XP: fica fora do livro.
    const rows = [...h.world.book.values()].sort((a, b) => a.position! - b.position!);
    expect(rows.map((row) => [row.userId, row.position, row.points, row.completedTasks, row.xp])).toEqual([
      [1, 1, 300, 22, 400],
      [2, 2, 300, 18, 300],
    ]);
    // Elo nulo: a escada é a V8-6 (DEC-217).
    expect(rows.map((row) => row.elo)).toEqual([null, null]);

    // Zeragem seletiva: as duas trilhas da temporada zeram, moeda e contador vitalício ficam.
    expect(h.world.users.map((u) => [u.points, u.xp, u.coins, u.completedTasks])).toEqual([
      [0, 0, 800, 25],
      [0, 0, 200, 40],
      [0, 0, 50, 3],
    ]);

    expect(h.world.awardedBadges).toEqual([{ userId: 1, badgeId: 775 }]);
    expect([...h.world.awardedKeys]).toEqual(["GAMIFICATION:SEASON_CHAMPION:2026:1"]);
  });

  it("segunda run do MESMO ano não escreve linha, não zera e não concede troféu de novo", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await cronService.executeSeasonClose();

    // O que a pessoa ganha depois, na temporada em curso, não é tocado pela reexecução do ano fechado.
    h.world.users[0].points = 60;
    h.world.users[0].xp = 50;
    vi.setSystemTime(new Date("2027-03-14T15:00:00.000Z"));
    await cronService.executeSeasonClose();

    expect(h.commands).toHaveLength(2);
    expect(h.commands[1].actor).toEqual({ kind: "system", reason: "SEASON_CLOSE" });
    // O ano continua 2026: a run de 14/03 fecha 2026 (o ano anterior ao dia civil), e as linhas já
    // existem — nada é escrito nem zerado de novo.
    expect(h.yearsAsked).toEqual([2026, 2026]);
    expect(h.world.users[0].points).toBe(60);
    expect(h.world.users[0].xp).toBe(50);
    expect(h.world.book.size).toBe(2);
    expect(h.world.awardedBadges).toHaveLength(1);
  });

  it("falha do fechamento vira console.error e não rejeita o job", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.world.failure = "banco fora";

    await expect(cronService.executeSeasonClose()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

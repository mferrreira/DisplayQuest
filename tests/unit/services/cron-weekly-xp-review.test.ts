// @vitest-environment node
/**
 * plan-v8 V8-3 (DEC-54/DEC-214) — o job do cron da revisão semanal de XP, do lado do CHAMADOR.
 *
 * Mesmo motivo do arquivo do fechamento mensal (V8-2): a lição medida da DEC-54 é que um gate dentro
 * de um use case chamado por rotina quebra a ROTINA e nenhum teste de rota vê. Aqui o par provado é
 * rotina×ator:
 *   1. o cron chama o use case REAL do módulo gamification (montado sobre port falsa — o mock troca
 *      o banco, não reimplementa regra) com `systemActor("WEEKLY_XP_REVIEW")`; se o job passasse ator
 *      de pessoa sem MANAGE_USERS, o gate do use case derrubava a revisão e as asserções de XP
 *      ficavam vermelhas;
 *   2. `now` vem do relógio da rotina (fake timers) e a semana fechada é a ANTERIOR em dia civil de
 *      America/Sao_Paulo — o job das 00:10 de 19/10 revisa a semana de 12/10;
 *   3. reexecução da mesma semana não soma boost de novo;
 *   4. falha da revisão vira `console.error` e não rejeita (rejeição não tratada em job é exit 1 no
 *      gate — lição medida do V4-4b).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const world = {
    users: [] as Array<{ userId: number; name: string; xp: number; weekHoursGoal: number }>,
    facts: {} as Record<
      number,
      {
        daysWithSession: number;
        tasksApproved: number;
        tasksLate: number;
        activitiesLate: number;
        activitiesWithoutSession: number;
        hoursWorked: number;
      }
    >,
    writes: [] as Array<{ userId: number; weekStart: string; netAmount: number }>,
    /** Quando não-nulo, a port explode: é como o teste injeta falha de banco na rotina. */
    failure: null as string | null,
  };
  const commands: Array<{ actor: { kind: string; id?: number; roles?: unknown; reason?: string }; now: Date }> = [];
  const windowsAsked: Array<{ start: Date; endExclusive: Date }> = [];
  const ZERO_FACTS = {
    daysWithSession: 0,
    tasksApproved: 0,
    tasksLate: 0,
    activitiesLate: 0,
    activitiesWithoutSession: 0,
    hoursWorked: 0,
  };

  function makeWeeklyXp() {
    return {
      listUsersForWeeklyReview: async () => {
        if (world.failure) throw new Error(world.failure);
        return [...world.users];
      },
      hasWeeklyReview: async (userId: number, weekStart: string) =>
        world.writes.some((w) => w.userId === userId && w.weekStart === weekStart),
      getWeeklyFacts: async (userId: number, window: { start: Date; endExclusive: Date }) => {
        windowsAsked.push(window);
        // `{ ...ZERO, ...facts }` e não as chaves literais + spread: o `tsc` marca a chave duplicada.
        return { ...ZERO_FACTS, ...(world.facts[userId] ?? {}) };
      },
      applyWeeklyXpAdjustment: async (write: {
        userId: number;
        weekStart: string;
        netAmount: number;
      }) => {
        if (world.writes.some((w) => w.userId === write.userId && w.weekStart === write.weekStart)) {
          return { applied: false, xpBefore: 0, xpAfter: 0 };
        }
        world.writes.push({ userId: write.userId, weekStart: write.weekStart, netAmount: write.netAmount });
        const user = world.users.find((u) => u.userId === write.userId)!;
        const xpBefore = user.xp;
        user.xp = Math.max(0, xpBefore + write.netAmount);
        return { applied: true, xpBefore, xpAfter: user.xp };
      },
    };
  }

  return { world, commands, windowsAsked, makeWeeklyXp };
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
  const real = createGamificationModule({ ports: { weeklyXp: h.makeWeeklyXp() as never } });
  const gamification = {
    ...real,
    reviewWeeklyXp: (command: { actor: never; now: Date }) => {
      h.commands.push(command as (typeof h.commands)[number]);
      return real.reviewWeeklyXp(command);
    },
  };
  return { getBackendComposition: () => ({ gamification }) };
});

vi.mock("node-cron", () => ({ schedule: () => ({ stop: () => undefined }) }));

import { cronService } from "@/lib/services/cron-service";

beforeEach(() => {
  h.world.users = [
    { userId: 1, name: "Ana Constante", xp: 100, weekHoursGoal: 20 },
    { userId: 2, name: "Bruno Atrasado", xp: 15, weekHoursGoal: 20 },
    { userId: 3, name: "Carla Sem Semana", xp: 30, weekHoursGoal: 0 },
  ];
  h.world.facts = {
    1: {
      daysWithSession: 7,
      tasksApproved: 5,
      tasksLate: 0,
      activitiesLate: 0,
      activitiesWithoutSession: 0,
      hoursWorked: 22,
    },
    2: {
      daysWithSession: 1,
      tasksApproved: 0,
      tasksLate: 3,
      activitiesLate: 0,
      activitiesWithoutSession: 0,
      hoursWorked: 2,
    },
    3: {
      daysWithSession: 0,
      tasksApproved: 0,
      tasksLate: 0,
      activitiesLate: 0,
      activitiesWithoutSession: 0,
      hoursWorked: 0,
    },
  };
  h.world.writes = [];
  h.world.failure = null;
  h.commands = [];
  // `length = 0` e não reatribuir: o array é capturado pelo closure da port falsa, que continua
  // dando push no array original (mesma razão de `h.world.users = ...` no teste do fechamento mensal).
  h.windowsAsked.length = 0;
  vi.useFakeTimers();
  // 03:10 UTC de 19/10 = 00:10 de 19/10 America/Sao_Paulo: o instante do job '10 0 * * 1'.
  vi.setSystemTime(new Date("2026-10-19T03:10:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CronService.executeWeeklyXpReview (V8-3, DEC-214)", () => {
  it("o job revisa a semana de 12/10 com systemActor(WEEKLY_XP_REVIEW) e o use case real escreve o XP", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await cronService.executeWeeklyXpReview();

    // DEC-54: o bypass declarado, nomeado. Um ator de pessoa aqui morreria no gate do use case.
    expect(h.commands).toHaveLength(1);
    expect(h.commands[0].actor).toEqual({ kind: "system", reason: "WEEKLY_XP_REVIEW" });
    expect(h.commands[0].now.toISOString()).toBe("2026-10-19T03:10:00.000Z");

    // A janela da semana fechada: segunda 00:00 SP (03:00 UTC) → segunda seguinte, exclusive.
    expect(h.windowsAsked[0]).toEqual({
      start: new Date("2026-10-12T03:00:00.000Z"),
      endExclusive: new Date("2026-10-19T03:00:00.000Z"),
    });

    // Ana: +40 de constância (7 dias) +20 de tarefas (5) = 60, sem penalidade de meta (22 h ≥ 20 h).
    // Bruno: 3 tarefas atrasadas (−30) + meta não cumprida (2 h contra 20 h, −20) = −50, e o piso 0
    // sobre o XP 15 fecha em 0 (DEC-214). Carla: semana sem acontecimento, nenhuma linha escrita.
    expect(h.world.writes).toEqual([
      { userId: 1, weekStart: "2026-10-12", netAmount: 60 },
      { userId: 2, weekStart: "2026-10-12", netAmount: -50 },
    ]);
    expect(h.world.users.map((u) => u.xp)).toEqual([160, 0, 30]);
  });

  it("segunda run da MESMA semana não soma boost nenhum de novo", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await cronService.executeWeeklyXpReview();

    h.world.users[0].xp = 200; // o que a pessoa ganhou depois, na semana em curso
    vi.setSystemTime(new Date("2026-10-21T15:00:00.000Z"));
    await cronService.executeWeeklyXpReview();

    expect(h.world.writes).toHaveLength(2);
    expect(h.world.users[0].xp).toBe(200);
    expect(h.commands[1].actor).toEqual({ kind: "system", reason: "WEEKLY_XP_REVIEW" });
  });

  it("falha da revisão vira console.error e não rejeita o job", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.world.failure = "banco fora";

    await expect(cronService.executeWeeklyXpReview()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

// @vitest-environment node
/**
 * plan-v8 V8-2 (DEC-54/DEC-212) — o job do cron do fechamento mensal, do lado do CHAMADOR.
 *
 * Por que este arquivo existe se o use case já tem teste próprio: a lição medida da DEC-54 é que
 * mover um gate para dentro de um use case chamado por rotina quebra a rotina em produção e
 * NENHUM teste de rota vê. Aqui o que se prova é o par rotina×ator:
 *   1. o cron chama o use case REAL do módulo gamification (montado sobre port falsa — o mock não
 *      reimplementa a regra, só troca o banco) com `systemActor("MONTHLY_POINTS_RESET")`, o bypass
 *      declarado; se o job passasse um ator de pessoa sem MANAGE_USERS, o gate do use case derrubava
 *      o fechamento e as asserções de snapshot ficavam vermelhas;
 *   2. `now` vem do relógio da rotina (fake timers) e o mês fechado é o anterior em dia civil de
 *      America/Sao_Paulo;
 *   3. reexecução não duplica linha nem zera o mês em curso;
 *   4. falha do fechamento vira `console.error` e não rejeita — rejeição não tratada em job é exit
 *      1 no gate (lição medida do V4-4b).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeUser {
  userId: number;
  name: string;
  points: number;
}

interface FakeSnapshot {
  userId: number;
  month: string;
  points: number;
  completedTasksOfMonth: number;
}

const h = vi.hoisted(() => {
  const world = {
    users: [] as Array<{ userId: number; name: string; points: number }>,
    completions: [] as Array<{ userId: number; completedAt: Date }>,
    snapshots: [] as Array<{ userId: number; month: string; points: number; completedTasksOfMonth: number }>,
    /** Quando não-nulo, a port explode: é como o teste injeta falha de banco na rotina. */
    failure: null as string | null,
  };
  const commands: Array<{ actor: { kind: string; id?: number; roles?: unknown; reason?: string }; now: Date }> = [];

  function makeCycle() {
    return {
      listAllUsersForClose: async () => {
        if (world.failure) throw new Error(world.failure);
        return [...world.users];
      },
      countTasksCompletedInMonth: async (userId: number, window: { start: Date; endExclusive: Date }) =>
        world.completions.filter(
          (c) => c.userId === userId && c.completedAt >= window.start && c.completedAt < window.endExclusive,
        ).length,
      hasMonthSnapshot: async (userId: number, month: string) =>
        world.snapshots.some((s) => s.userId === userId && s.month === month),
      closeMonth: async (write: { userId: number; month: string; points: number; completedTasksOfMonth: number }) => {
        if (world.snapshots.some((s) => s.userId === write.userId && s.month === write.month)) return false;
        world.snapshots.push(write);
        const user = world.users.find((u) => u.userId === write.userId)!;
        user.points = 0;
        return true;
      },
    };
  }

  return { world, commands, makeCycle };
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
  const real = createGamificationModule({ ports: { monthlyCycle: h.makeCycle() as never } });
  const gamification = {
    ...real,
    resetMonthlyPoints: (command: { actor: never; now: Date }) => {
      h.commands.push(command as (typeof h.commands)[number]);
      return real.resetMonthlyPoints(command);
    },
  };
  return { getBackendComposition: () => ({ gamification }) };
});

vi.mock("node-cron", () => ({ schedule: () => ({ stop: () => undefined }) }));

import { cronService } from "@/lib/services/cron-service";

beforeEach(() => {
  h.world.users = [
    { userId: 1, name: "Ana Com Saldo", points: 830 },
    { userId: 2, name: "Bruno No Vermelho", points: -40 },
    { userId: 3, name: "Carla Sem Nada", points: 0 },
  ];
  h.world.completions = [
    { userId: 1, completedAt: new Date("2026-10-05T15:00:00.000Z") },
    { userId: 1, completedAt: new Date("2026-10-31T02:59:59.000Z") },
    { userId: 1, completedAt: new Date("2026-11-01T03:00:00.000Z") }, // 00:00 de 01/11 SP — novembro
  ];
  h.world.snapshots = [];
  h.world.failure = null;
  h.commands = [];
  vi.useFakeTimers();
  // 03:00 UTC de 01/11 = 00:00 de 01/11 America/Sao_Paulo: o instante do job.
  vi.setSystemTime(new Date("2026-11-01T03:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CronService.executeMonthlyPointsReset (V8-2, DEC-212)", () => {
  it("o job fecha OUTUBRO com systemActor(MONTHLY_POINTS_RESET) e o use case real escreve o snapshot", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await cronService.executeMonthlyPointsReset();

    // DEC-54: o bypass declarado, nomeado. Um ator de pessoa aqui morreria no gate do use case.
    expect(h.commands).toHaveLength(1);
    expect(h.commands[0].actor).toEqual({ kind: "system", reason: "MONTHLY_POINTS_RESET" });
    expect(h.commands[0].now.toISOString()).toBe("2026-11-01T03:00:00.000Z");

    expect(h.world.snapshots).toEqual([
      { userId: 1, month: "2026-10", points: 830, completedTasksOfMonth: 2 },
      { userId: 2, month: "2026-10", points: -40, completedTasksOfMonth: 0 },
    ]);
    expect(h.world.users.map((u) => u.points)).toEqual([0, 0, 0]);
  });

  it("segunda run do mesmo mês não duplica linha nem zera o mês em curso", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await cronService.executeMonthlyPointsReset();

    h.world.users[0].points = 120; // produção de novembro
    vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
    await cronService.executeMonthlyPointsReset();

    expect(h.world.snapshots).toHaveLength(2);
    expect(h.world.users[0].points).toBe(120);
    expect(h.commands[1].actor).toEqual({ kind: "system", reason: "MONTHLY_POINTS_RESET" });
  });

  it("falha do fechamento vira console.error e não rejeita o job", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.world.failure = "banco fora";

    await expect(cronService.executeMonthlyPointsReset()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

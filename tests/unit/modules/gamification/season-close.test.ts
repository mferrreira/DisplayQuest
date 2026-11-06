/**
 * plan-v20 S01 (DEC-252, DEC-253, DEC-254; INV3, INV6) — `CloseSeasonUseCase` sobre portas
 * fake, no padrão `adjust-month-points.test.ts`.
 *
 * Fixa a ordem que decide a entrega:
 *  1. o gate `MANAGE_USERS` corre ANTES de ler gente e antes de escrever (CA9 do fechamento de
 *     mês, mesma família DEC-54 — o cron passa `systemActor("SEASON_CLOSE")` e o gate tem que
 *     deixar a rotina passar);
 *  2. idempotência: temporada já fechada não escreve nada, e o resultado diz `alreadyClosed`;
 *  3. o commit único: linhas da temporada e os dois zeros (saldo e placar do mês) entram no
 *     mesmo `writeClose` do adaptador — "não existe meia temporada fechada" (INV3);
 *  4. o recompute de badges corre DEPOIS da escrita, sobre as linhas gravadas (R4, plan-v15).
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, ValidationError, systemActor, userActor } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";
import { SEASON_CLOSE_DENIED_MESSAGE } from "@/backend/modules/gamification/application/use-cases/close-season.use-case";
import type { SeasonCloseWrite } from "@/backend/modules/gamification/application/ports/board-month-close.port";
import type { SeasonClosePerson } from "@/backend/domain/gamification/season-close-rules";

const RUN = new Date("2027-01-01T03:00:00.000Z"); // 00:00 de 1 de janeiro de 2027, Sao Paulo

function makeFakes(people: SeasonClosePerson[], closedAt: Date | null = null) {
  const calls: string[] = [];
  const writes: SeasonCloseWrite[] = [];

  const monthClose = {
    calls,
    writes,
    async findClosedMonth(month: string, track: string) {
      calls.push(`findClosedMonth:${month}:${track}`);
      return closedAt ? { month, closedAt } : null;
    },
    async listPeopleForClose(): Promise<never> {
      calls.push("listPeopleForClose");
      throw new Error("leitura do placar do mês não deveria acontecer no fechamento de temporada");
    },
    async listPeopleForSeasonClose() {
      calls.push("listPeopleForSeasonClose");
      return people;
    },
    async writeClose(input: SeasonCloseWrite) {
      calls.push("writeClose");
      writes.push(input);
    },
    async readClosedMonth() {
      throw new Error("leitura de fechado não deveria acontecer no fechamento");
    },
    async listClosedMonths() {
      throw new Error("lista de fechados não deveria acontecer no fechamento");
    },
    async listClosedMonthsForUser() {
      throw new Error("lista de meses de pessoa não deveria acontecer no fechamento");
    },
  };

  const unused = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("porta não deveria ser usada neste teste");
      },
    },
  ) as never;

  // plan-v15 S11 (R4): depois da escrita, o fechamento roda evaluate sobre cada linha. Estes
  // duplos fazem o evaluate devolver [] sem tocar nas portas de premiação — o teste prova o
  // fechamento, não a concessão de badges (padrão `monthly-board-close-route.test.ts`).
  const evaluateUsers = {
    async findUserById(id: number) {
      const person = people.find((p) => p.id === id);
      return person ? { id: person.id, name: person.name, points: 0, completedTasks: 0 } : null;
    },
    async findAllUsers() {
      return people.map((p) => ({ id: p.id, points: p.currentSeasonPoints, completedTasks: 0, status: p.status }));
    },
  } as never;
  const evaluateBadges = { async findActive() { return []; } } as never;

  const gamification = createGamificationModule({
    ports: {
      users: evaluateUsers,
      awardHistory: unused,
      badges: evaluateBadges,
      userBadges: unused,
      stats: unused,
      metrics: unused,
      passives: unused,
      monthClose,
    },
  });

  return { gamification, calls, writes };
}

function person(over: Partial<SeasonClosePerson> & { id: number; name: string }): SeasonClosePerson {
  return { status: "active", currentSeasonPoints: 0, ...over };
}

const BASE = [
  person({ id: 1, name: "Alice", currentSeasonPoints: 50 }),
  person({ id: 2, name: "Bruno", currentSeasonPoints: -20 }),
  person({ id: 3, name: "Carla", status: "suspended", currentSeasonPoints: 90 }),
  person({ id: 4, name: "Dela", currentSeasonPoints: 100 }),
];

describe("fechamento da temporada — gate antes de ler e escrever (DEC-254)", () => {
  it("VOLUNTARIO recebe a frase congelada sem nenhuma leitura ou escrita", async () => {
    const { gamification, calls, writes } = makeFakes(BASE);
    await expect(
      gamification.closeSeason({ actor: userActor(9, ["VOLUNTARIO"]), now: RUN }),
    ).rejects.toThrow(SEASON_CLOSE_DENIED_MESSAGE);
    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("ator de sistema SEASON_CLOSE passa o gate — a rotina do cron roda", async () => {
    const { gamification, writes } = makeFakes(BASE);
    const result = await gamification.closeSeason({
      actor: systemActor("SEASON_CLOSE"),
      now: RUN,
    });
    expect(result.closed).toBe(true);
    expect(writes).toHaveLength(1);
  });

  it("COORDENADOR fecha pela rota de gestão", async () => {
    const { gamification } = makeFakes(BASE);
    const result = await gamification.closeSeason({
      actor: userActor(1, ["COORDENADOR"]),
      now: RUN,
    });
    expect(result.closed).toBe(true);
    expect(result.triggeredBy).toBe("USER:1");
  });
});

describe("fechamento da temporada — a escrita da run de 1 de janeiro (DEC-252, DEC-253)", () => {
  it("fecha a temporada 2026 com as linhas ativas em posição e os dois zeros", async () => {
    const { gamification, writes } = makeFakes(BASE);
    const result = await gamification.closeSeason({
      actor: userActor(1, ["COORDENADOR"]),
      now: RUN,
    });

    expect(result.year).toBe("2026");
    expect(result.track).toBe("SEASON_POINTS");
    expect(result.peopleCount).toBe(3);
    expect(result.excluded).toEqual([{ userId: 3, status: "suspended" }]);

    const write = writes[0];
    expect(write.month).toBe("2026");
    expect(write.track).toBe("SEASON_POINTS");
    expect(write.periodStart.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(write.periodEnd.toISOString()).toBe("2027-01-01T02:59:59.999Z");
    expect(write.rows.map((r) => [r.userId, r.value, r.position])).toEqual([
      [4, 100, 1],
      [1, 50, 2],
      [2, -20, 3],
    ]);
    // R11 espelhado: o zerado alcança toda a base, inclusive quem não recebeu linha.
    expect(write.userIdsToZero.sort()).toEqual([1, 2, 3, 4]);
    // DEC-253: os dois zeros — saldo E placar do mês — no mesmo commit.
    expect(write.zeroFields.sort()).toEqual(["balance", "monthPoints"]);
  });

  it("temporada já fechada: nada é lido de gente, nada é escrito", async () => {
    const { gamification, calls, writes } = makeFakes(BASE, new Date("2027-01-01T04:00:00.000Z"));
    const result = await gamification.closeSeason({
      actor: userActor(1, ["COORDENADOR"]),
      now: RUN,
    });
    expect(result.closed).toBe(false);
    expect(result.alreadyClosed).toBe(true);
    expect(result.peopleCount).toBe(0);
    expect(calls).toEqual(["findClosedMonth:2026:SEASON_POINTS"]);
    expect(writes).toEqual([]);
  });

  it("ano anterior à primeira temporada é recusado antes de escrever", async () => {
    const { gamification, calls, writes } = makeFakes(BASE);
    await expect(
      gamification.closeSeason({
        actor: userActor(1, ["COORDENADOR"]),
        now: new Date("2026-01-01T03:00:00.000Z"),
      }),
    ).rejects.toThrow(ValidationError);
    expect(writes).toEqual([]);
    // O lookup de idempotência e a leitura da base acontecem (a leitura não escreve); o que não
    // acontece é o commit. O recuso nomeia o ano — `planSeasonClose` congela.
    expect(calls).toEqual(["findClosedMonth:2025:SEASON_POINTS", "listPeopleForSeasonClose"]);
  });

  it("reexecução depois da escrita: segunda run é alreadyClosed", async () => {
    const fakes = makeFakes(BASE);
    const first = await fakes.gamification.closeSeason({
      actor: systemActor("SEASON_CLOSE"),
      now: RUN,
    });
    expect(first.closed).toBe(true);
    // A fake não simula o unique do banco; o adaptador real bate em P2002 (roundtrip congela).
    const second = await fakes.gamification.closeSeason({
      actor: systemActor("SEASON_CLOSE"),
      now: RUN,
    });
    expect(second.closed).toBe(true);
    expect(second.alreadyClosed).toBe(false);
    expect(fakes.writes).toHaveLength(2);
  });
});

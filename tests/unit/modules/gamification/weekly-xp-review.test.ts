/**
 * plan-v8 V8-3 (DEC-214) — `ReviewWeeklyXpUseCase` sobre port falsa, sem banco.
 *
 * Congelado aqui é a ORQUESTRAÇÃO, caso a caso:
 *   1. semana fechada = a segunda–domingo ANTERIOR ao `now` da run, em dia civil de
 *      America/Sao_Paulo (`xpClosedWeekOfInstant`); a janela entregue à port é `[segunda 00:00 SP,
 *      +7d)` com corte de fim exclusivo;
 *   2. quem decide é o domínio: boosts (constância 7 dias, tarefas 5+/10+ com o de 10+ SUBSTITUINDO
 *      o de 5+), penalidades por unidade, meta não cumprida — o use case aplica `weeklyXpAdjustments`
 *      e devolve os itens, não só o total;
 *   3. piso 0 aplicado por quem escreve (`applyXpFloor` no adaptador); o use case reporta o
 *      `xpAfter` que o adaptador devolveu, que é o valor com o piso, nunca um negativo seu;
 *   4. idempotência por `(userId, weekStart)` lida ANTES de escrever, e a recusa do adaptador
 *      (corrida) também é reportada como "já revisada" sem dobrar nada;
 *   5. semana sem ajuste não escreve linha (sem ledger de zeros);
 *   6. gate MANAGE_USERS com `systemActor` bypassando (DEC-54).
 *
 * A port falsa entrega fatos SEMEARADOS, não reimplementa as contagens: contar é responsabilidade do
 * adaptador (congelada no roundtrip G4 `weekly-xp-review-roundtrip`). Reimplementar aqui deixaria o
 * teste verde com o adaptador mentindo — o modo de falha documentado na DEC-90. O que a fake prova é
 * a JANELA que recebeu: se o recorte da semana errar, `windowAsked` denuncia.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ForbiddenError } from "@/backend/domain";
import { systemActor, userActor } from "@/backend/domain/identity";
import type {
  WeeklyReviewCandidate,
  WeeklyXpApplyResult,
  WeeklyXpDataFacts,
  WeeklyXpReviewPort,
  WeeklyXpReviewWrite,
  WeeklyXpWindow,
} from "@/backend/modules/gamification/application/ports/weekly-xp-review.port";
import {
  ReviewWeeklyXpUseCase,
  WEEKLY_XP_REVIEW_DENIED_MESSAGE,
} from "@/backend/modules/gamification/application/use-cases/review-weekly-xp.use-case";

const EMPTY_FACTS: WeeklyXpDataFacts = {
  daysWithSession: 0,
  tasksApproved: 0,
  tasksLate: 0,
  activitiesLate: 0,
  activitiesWithoutSession: 0,
  hoursWorked: 0,
};

interface FakeWorld {
  users: WeeklyReviewCandidate[];
  facts: Record<number, WeeklyXpDataFacts>;
  /** "Esta semana já tem linha de revisão para esta pessoa", semeado de propósito. */
  alreadyReviewed: Array<{ userId: number; weekStart: string }>;
  writes: WeeklyXpReviewWrite[];
  windowAsked: WeeklyXpWindow | null;
  /** Segunda escrita da mesma (userId, weekStart) recusada, como o adaptador faz dentro da transação. */
  denyOnRace: boolean;
}

function fakeWeeklyXp(world: FakeWorld): WeeklyXpReviewPort {
  const key = (userId: number, weekStart: string) => `${userId}:${weekStart}`;
  return {
    listUsersForWeeklyReview: async () => [...world.users],
    hasWeeklyReview: async (userId, weekStart) =>
      world.writes.some((w) => key(w.userId, w.weekStart) === key(userId, weekStart)) ||
      world.alreadyReviewed.some((a) => key(a.userId, a.weekStart) === key(userId, weekStart)),
    getWeeklyFacts: async (userId, window) => {
      world.windowAsked = window;
      return { ...EMPTY_FACTS, ...(world.facts[userId] ?? {}) };
    },
    applyWeeklyXpAdjustment: async (write) => {
      if (world.writes.some((w) => key(w.userId, w.weekStart) === key(write.userId, write.weekStart))) {
        return { applied: false, xpBefore: 0, xpAfter: 0 } satisfies WeeklyXpApplyResult;
      }
      world.writes.push(write);
      const user = world.users.find((u) => u.userId === write.userId)!;
      const xpBefore = user.xp;
      // O piso é regra do ADAPTADOR (`applyXpFloor` sobre o XP lido na transação). A fake reproduz
      // o efeito para o use case ter um `xpAfter` real para reportar; a fórmula em si é congelada em
      // tests/unit/domain/gamification/xp-rules.test.ts.
      user.xp = Math.max(0, xpBefore + write.netAmount);
      if (world.denyOnRace) return { applied: false, xpBefore, xpAfter: xpBefore };
      return { applied: true, xpBefore, xpAfter: user.xp };
    },
  };
}

let world: FakeWorld;
let useCase: ReviewWeeklyXpUseCase;

beforeEach(() => {
  world = {
    users: [
      { userId: 1, name: "Ana Constante", xp: 120, weekHoursGoal: 20 },
      { userId: 2, name: "Bruno Atrasado", xp: 5, weekHoursGoal: 20 },
      { userId: 3, name: "Carla Sem Semana", xp: 40, weekHoursGoal: 0 },
      { userId: 4, name: "Dora Alta Produtividade", xp: 0, weekHoursGoal: 10 },
    ],
    facts: {
      // 7 dias com sessão → boost de constância; 6 tarefas → boost de 5+; horas acima da meta → sem
      // penalidade de meta.
      1: { daysWithSession: 7, tasksApproved: 6, tasksLate: 0, activitiesLate: 0, activitiesWithoutSession: 0, hoursWorked: 26 },
      // Nada de constância; 2 tarefas das quais 1 atrasada; 1 atividade atrasada e 1 sem sessão;
      // 8 h contra meta de 20 h.
      2: { daysWithSession: 3, tasksApproved: 2, tasksLate: 1, activitiesLate: 1, activitiesWithoutSession: 1, hoursWorked: 8 },
      // Semana vazia: nenhum item.
      3: { ...EMPTY_FACTS },
      // 10 tarefas: o boost de 10+ substitui o de 5+, e a substituição tem que aparecer como UM item.
      4: { daysWithSession: 0, tasksApproved: 11, tasksLate: 0, activitiesLate: 0, activitiesWithoutSession: 0, hoursWorked: 12 },
    },
    alreadyReviewed: [],
    writes: [],
    windowAsked: null,
    denyOnRace: false,
  };
  useCase = new ReviewWeeklyXpUseCase({ weeklyXp: fakeWeeklyXp(world) });
});

const SYSTEM = systemActor("WEEKLY_XP_REVIEW");

describe("ReviewWeeklyXpUseCase — a semana que fechou (V8-3, DEC-214)", () => {
  it("fecha a semana anterior à do `now`: job de segunda 00:10 (SP) fecha a semana que terminou domingo", async () => {
    const result = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:10:00Z") });

    expect(result.weekStart).toBe("2026-10-12");
    // A janela que a port recebeu: segunda 00:00 SP = 03:00 UTC, e o corte de fim é EXCLUSIVO no
    // mesmo instante 7 dias depois — a conclusão das 00:00 da segunda seguinte é da semana nova.
    expect(world.windowAsked).toEqual({
      start: new Date("2026-10-12T03:00:00.000Z"),
      endExclusive: new Date("2026-10-19T03:00:00.000Z"),
    });
  });

  it("a semana em curso NUNCA é revisada: domingo à noite fecha a anterior (12/10 ainda está aberta)", async () => {
    // 18/10/2026 é domingo da semana que começou em 12/10. Ela só fecha na segunda seguinte — uma run
    // em qualquer instante de domingo revisa a semana de 05/10, que já terminou. É a mesma regra do
    // fechamento mensal (V8-2): `now` escolhe a semana, e a em curso fica de fora.
    const sundayNight = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-18T22:00:00Z") });
    expect(sundayNight.weekStart).toBe("2026-10-05");

    // O instante exato da virada (00:00 de 19/10 em SP = 03:00 UTC) já fecha a semana de 12/10.
    const justAfterMidnight = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:00:00.000Z") });
    expect(justAfterMidnight.weekStart).toBe("2026-10-12");

    // E um segundo antes da virada, não.
    const justBeforeMidnight = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T02:59:59.000Z") });
    expect(justBeforeMidnight.weekStart).toBe("2026-10-05");
  });

  it("boosts do domínio saem item a item, com o de 10+ substituindo o de 5+", async () => {
    const result = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:10:00Z") });

    const ana = result.outcomes.find((o) => o.userId === 1)!;
    expect(ana.status).toBe("adjusted");
    expect(ana.adjustments.map((a) => [a.code, a.units, a.amount])).toEqual([
      ["WEEK_DAYS_SESSION", 7, 40],
      ["TASKS_MEDIUM", 6, 20],
    ]);
    expect(ana.netAmount).toBe(60);
    expect(ana.xpBefore).toBe(120);
    expect(ana.xpAfter).toBe(180);

    const dora = result.outcomes.find((o) => o.userId === 4)!;
    expect(dora.adjustments).toHaveLength(1);
    expect(dora.adjustments[0]).toEqual({ code: "TASKS_HIGH", units: 11, amount: 40 });
    expect(dora.netAmount).toBe(40);
  });

  it("penalidades por unidade, e o piso 0 vem do que o adaptador devolve", async () => {
    const result = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:10:00Z") });

    const bruno = result.outcomes.find((o) => o.userId === 2)!;
    expect(bruno.adjustments.map((a) => [a.code, a.units, a.amount])).toEqual([
      ["TASKS_LATE", 1, -10],
      ["ACTIVITIES_LATE", 1, -20],
      ["ACTIVITIES_WITHOUT_SESSION", 1, -30],
      ["WEEKLY_GOAL", 1, -20],
    ]);
    expect(bruno.netAmount).toBe(-80);
    // XP 5 − 80 → 0 (DEC-214): o valor reportado é o do adaptador depois do `applyXpFloor`.
    expect(bruno.xpBefore).toBe(5);
    expect(bruno.xpAfter).toBe(0);
    expect(world.users.find((u) => u.userId === 2)!.xp).toBe(0);
  });

  it("semana sem acontecimento não escreve linha nenhuma (sem ledger de zeros)", async () => {
    const result = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:10:00Z") });

    const carla = result.outcomes.find((o) => o.userId === 3)!;
    expect(carla.status).toBe("without-adjustment");
    expect(carla.netAmount).toBe(0);
    expect(carla.xpBefore).toBe(40);
    expect(carla.xpAfter).toBe(40);
    expect(world.writes.some((w) => w.userId === 3)).toBe(false);
    expect(result.withoutAdjustment).toBe(1);
  });

  it("reexecução: a linha de revisão é lida ANTES de escrever e a segunda run não soma nada", async () => {
    const first = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:10:00Z") });
    expect(first.adjusted).toBe(3);

    const second = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:40:00Z") });
    expect(second.adjusted).toBe(0);
    expect(second.alreadyReviewed).toBe(3);
    expect(second.withoutAdjustment).toBe(1);
    expect(world.writes).toHaveLength(3);
    expect(world.users.map((u) => u.xp)).toEqual([180, 0, 40, 40]);
  });

  it("a recusa do adaptador dentro da transação (corrida) também conta como já revisada", async () => {
    world.denyOnRace = true;
    const result = await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:10:00Z") });

    expect(result.adjusted).toBe(0);
    expect(result.alreadyReviewed).toBe(3);
    for (const outcome of result.outcomes) {
      expect(outcome.netAmount).toBe(0);
      expect(outcome.xpAfter).toBe(outcome.xpBefore);
    }
  });

  it("a chave escrita é a de reexecução por pessoa e semana", async () => {
    await useCase.execute({ actor: SYSTEM, now: new Date("2026-10-19T03:10:00Z") });

    const write = world.writes.find((w) => w.userId === 1)!;
    expect(write.description).toBe("GAMIFICATION:XP:WEEKLY_REVIEW:1:2026-10-12");
    expect(write.weekStart).toBe("2026-10-12");
    expect(write.netAmount).toBe(60);
  });

  it("gate: gestão e ator de sistema passam, voluntário recebe a MESMA frase dos dois resets", async () => {
    await expect(
      useCase.execute({ actor: userActor(9, ["VOLUNTARIO"]), now: new Date("2026-10-19T03:10:00Z") }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({ actor: userActor(9, ["VOLUNTARIO"]), now: new Date() }),
    ).rejects.toThrow(WEEKLY_XP_REVIEW_DENIED_MESSAGE);

    await expect(
      useCase.execute({ actor: userActor(9, ["COORDENADOR"]), now: new Date("2026-10-19T03:10:00Z") }),
    ).resolves.toMatchObject({ weekStart: "2026-10-12" });
  });
});

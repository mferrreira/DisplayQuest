// @vitest-environment node
/**
 * plan-v8 V8-3 (DEC-214) — as regras puras do motor de XP da temporada.
 *
 * Congelam a tabela do MODELO §4 número a número (rodada 6: constantes planas, calibração adiada
 * ASK-V8-21) e as três coisas que o texto do MODELO diz e um número solto deixaria escapar:
 *   - o boost de 10+ SUBSTITUI o de 5+ (12 tarefas rendem UM item de +40, nunca 20 + 40);
 *   - a meta só cobra quando existe meta (`weekHours > 0`), e horas iguais à meta não são atraso;
 *   - o piso é por pessoa: −10 sobre 5 vira 0, não −5, e o 0 não é "dívida guardada".
 * A semana é civil (segunda 00:00 do laboratório, sete dias, corte de fim exclusivo) — os casos de
 * virada conferem que o instante das 23:59:59 de domingo ainda é da semana que fechou.
 */
import { describe, expect, it } from "vitest";

import {
  XP_BOOST_TASKS_HIGH,
  XP_BOOST_TASKS_MEDIUM,
  XP_BOOST_WEEK_DAYS,
  XP_EVENT_ACTIVITY_COMPLETED,
  XP_EVENT_TASK_COMPLETED,
  XP_EVENT_WORK_SESSION,
  XP_FLOOR,
  XP_PENALTY_ACTIVITY_LATE,
  XP_PENALTY_ACTIVITY_WITHOUT_SESSION,
  XP_PENALTY_TASK_LATE,
  XP_PENALTY_WEEKLY_GOAL,
  applyXpFloor,
  xpClosedWeekOfInstant,
  currentXpWeekStartOfInstant,
  netXpAdjustment,
  xpWeekDayCount,
  xpWeekWindow,
  weeklyConsistencyBoost,
  weeklyGoalMissed,
  weeklyTasksBoost,
  weeklyXpAdjustments,
  weeklyXpReviewDescription,
  xpAwardDescription,
} from "@/backend/domain/gamification/xp-rules";

import type { XpWeeklyFacts } from "@/backend/domain/gamification/xp-rules";

function facts(patch: Partial<XpWeeklyFacts> = {}): XpWeeklyFacts {
  return {
    daysWithSession: 0,
    tasksApproved: 0,
    tasksLate: 0,
    activitiesLate: 0,
    activitiesWithoutSession: 0,
    hoursWorked: 0,
    weekHoursGoal: 0,
    ...patch,
  };
}

describe("volume por evento (MODELO §4)", () => {
  it("as três constantes do evento", () => {
    expect(XP_EVENT_TASK_COMPLETED).toBe(10);
    expect(XP_EVENT_WORK_SESSION).toBe(10);
    expect(XP_EVENT_ACTIVITY_COMPLETED).toBe(20);
  });

  it("a chave de idempotência do XP separa a trilha E a fonte", () => {
    // sourceId é número de tabelas diferentes: tarefa 5 e sessão 5 não podem cair na mesma chave.
    expect(xpAwardDescription("TASK_COMPLETED", 5)).toBe("GAMIFICATION:XP:TASK_COMPLETED:5");
    expect(xpAwardDescription("WORK_SESSION_COMPLETED", 5)).toBe("GAMIFICATION:XP:WORK_SESSION_COMPLETED:5");
    expect(xpAwardDescription("ACTIVITY_COMPLETED", 7)).toBe("GAMIFICATION:XP:ACTIVITY_COMPLETED:7");
    expect(xpAwardDescription("TASK_COMPLETED", 5)).not.toBe(xpAwardDescription("WORK_SESSION_COMPLETED", 5));
  });

  it("a marca de revisão nomeia pessoa e semana", () => {
    expect(weeklyXpReviewDescription(3, "2026-10-12")).toBe("GAMIFICATION:XP:WEEKLY_REVIEW:3:2026-10-12");
  });
});

describe("boosts semanais", () => {
  it("constância: sete dias com sessão rendem +40; seis não rendem nada", () => {
    expect(weeklyConsistencyBoost(6)).toBe(0);
    expect(weeklyConsistencyBoost(7)).toBe(XP_BOOST_WEEK_DAYS);
    expect(XP_BOOST_WEEK_DAYS).toBe(40);
  });

  it("tarefas: 5+ é +20 e 10+ é +40 SUBSTITUINDO o de 5+, nunca somando", () => {
    expect(weeklyTasksBoost(4)).toBe(0);
    expect(weeklyTasksBoost(5)).toBe(XP_BOOST_TASKS_MEDIUM);
    expect(weeklyTasksBoost(9)).toBe(XP_BOOST_TASKS_MEDIUM);
    expect(weeklyTasksBoost(10)).toBe(XP_BOOST_TASKS_HIGH);
    expect(weeklyTasksBoost(30)).toBe(XP_BOOST_TASKS_HIGH);
    expect(XP_BOOST_TASKS_MEDIUM).toBe(20);
    expect(XP_BOOST_TASKS_HIGH).toBe(40);
  });

  it("com 12 tarefas aprovadas existe UM item de boost, o de 10+", () => {
    const items = weeklyXpAdjustments(facts({ tasksApproved: 12, daysWithSession: 3 }));
    const boosts = items.filter((i) => i.amount > 0);

    expect(boosts).toEqual([{ code: "TASKS_HIGH", units: 12, amount: 40 }]);
    expect(boosts.find((i) => i.code === "TASKS_MEDIUM")).toBeUndefined();
  });

  it("os dois boosts de naturezas diferentes convivem (constância + tarefas)", () => {
    const items = weeklyXpAdjustments(facts({ daysWithSession: 7, tasksApproved: 6 }));

    expect(items).toEqual([
      { code: "WEEK_DAYS_SESSION", units: 7, amount: 40 },
      { code: "TASKS_MEDIUM", units: 6, amount: 20 },
    ]);
    expect(netXpAdjustment(items)).toBe(60);
  });
});

describe("penalidades semanais", () => {
  it("as quatro constantes e seus valores", () => {
    expect(XP_PENALTY_TASK_LATE).toBe(-10);
    expect(XP_PENALTY_ACTIVITY_LATE).toBe(-20);
    expect(XP_PENALTY_ACTIVITY_WITHOUT_SESSION).toBe(-30);
    expect(XP_PENALTY_WEEKLY_GOAL).toBe(-20);
  });

  it("tarefa atrasada é −10 FLAT por tarefa, não por dia de atraso", () => {
    const items = weeklyXpAdjustments(facts({ tasksLate: 3 }));

    expect(items).toEqual([{ code: "TASKS_LATE", units: 3, amount: -30 }]);
  });

  it("atividade atrasada e atividade sem sessão são penalidades por membro, contadas por atividade", () => {
    const items = weeklyXpAdjustments(facts({ activitiesLate: 2, activitiesWithoutSession: 1 }));

    expect(items).toEqual([
      { code: "ACTIVITIES_LATE", units: 2, amount: -40 },
      { code: "ACTIVITIES_WITHOUT_SESSION", units: 1, amount: -30 },
    ]);
  });

  it("meta não cumprida cobra −20; meta zero não cobra nada; horas iguais à meta não são falta", () => {
    expect(weeklyGoalMissed({ weekHoursGoal: 20, hoursWorked: 12 })).toBe(true);
    expect(weeklyGoalMissed({ weekHoursGoal: 20, hoursWorked: 20 })).toBe(false);
    expect(weeklyGoalMissed({ weekHoursGoal: 20, hoursWorked: 31 })).toBe(false);
    expect(weeklyGoalMissed({ weekHoursGoal: 0, hoursWorked: 0 })).toBe(false);

    const items = weeklyXpAdjustments(facts({ weekHoursGoal: 0, hoursWorked: 0 }));
    expect(items.find((i) => i.code === "WEEKLY_GOAL")).toBeUndefined();
  });
});

describe("semana sem acontecimento nenhum", () => {
  it("não produz item nenhum (nem um 0 por linha)", () => {
    expect(weeklyXpAdjustments(facts({ daysWithSession: 4, tasksApproved: 2 }))).toEqual([]);
    expect(netXpAdjustment([])).toBe(0);
  });
});

describe("piso da trilha (MODELO §4: XP nunca abaixo de 0)", () => {
  it("a penalidade que passa do saldo para no 0 e não vira dívida", () => {
    expect(applyXpFloor(5, -10)).toBe(XP_FLOOR);
    expect(applyXpFloor(0, -20)).toBe(0);
    expect(applyXpFloor(100, -30)).toBe(70);
    expect(applyXpFloor(70, +40)).toBe(110);
    expect(XP_FLOOR).toBe(0);
  });
});

describe("a semana civil do laboratório", () => {
  it("a run de segunda 00:10 fecha a semana anterior (12/10 → 19/10, SP)", () => {
    // 03:10 UTC de 19/10 é 00:10 de segunda-feira em America/Sao_Paulo.
    expect(currentXpWeekStartOfInstant(new Date("2026-10-19T03:10:00.000Z"))).toBe("2026-10-19");
    expect(xpClosedWeekOfInstant(new Date("2026-10-19T03:10:00.000Z"))).toBe("2026-10-12");
  });

  it("rodar no meio da semana fecha a mesma semana anterior", () => {
    // 23:30 de domingo 25/10 (SP).
    expect(currentXpWeekStartOfInstant(new Date("2026-10-25T23:30:00.000Z"))).toBe("2026-10-19");
    expect(xpClosedWeekOfInstant(new Date("2026-10-25T23:30:00.000Z"))).toBe("2026-10-12");
  });

  it("23:59:59 de domingo (SP) ainda é domingo — a semana nova começa na segunda", () => {
    // 02:59:59 UTC de 19/10 é 23:59:59 de 18/10 em SP: dia civil 18/10, semana de 12/10.
    expect(currentXpWeekStartOfInstant(new Date("2026-10-19T02:59:59.000Z"))).toBe("2026-10-12");
    expect(xpClosedWeekOfInstant(new Date("2026-10-19T02:59:59.000Z"))).toBe("2026-10-05");
  });

  it("a janela tem sete dias, começa às 00:00 de SP e o corte de fim é exclusivo", () => {
    const { start, endExclusive } = xpWeekWindow("2026-10-12");

    expect(start.toISOString()).toBe("2026-10-12T03:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(xpWeekDayCount("2026-10-12")).toBe(7);
    expect(xpWeekDayCount("2026-11-02")).toBe(7);
  });

  it("recusa weekStart que não é segunda e grafia errada", () => {
    expect(() => xpWeekWindow("2026-10-13")).toThrow(/segunda-feira/);
    expect(() => xpWeekWindow("13/10/2026")).toThrow(/weekStart inválido/);
    expect(() => xpWeekWindow("2026-10")).toThrow(/weekStart inválido/);
  });
});

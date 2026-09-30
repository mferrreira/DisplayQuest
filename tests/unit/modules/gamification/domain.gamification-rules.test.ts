/**
 * OND6-B2 — regras puras de gamificacao (domain/gamification).
 * Os VALORES sao os mesmos congelados pelo golden OND6-B1 (legacy engines/gateway);
 * aqui as funcoes puras sao testadas direto (padrao domain.task-rules.test.ts).
 */
import { describe, expect, it } from "vitest";

import {
  applyBadgeUpdate,
  averageWeeklyHoursFrom,
  badgeCriteriaMet,
  buildAwardDescription,
  computeUserProgression,
  eloForXp,
  levelForXp,
  maxConsecutiveDaysFrom,
  selectBadgesToAward,
  taskAwardPoints,
  validateBadgeCreateInput,
  workSessionAwardPoints,
} from "@/backend/domain";
import type { Badge, BadgeCriteria } from "@/backend/domain";

describe("domain/gamification: workSessionAwardPoints (frozen golden)", () => {
  it.each([
    ["undefined", undefined, undefined, 10],
    ["null", null, undefined, 10],
    ["0s", 0, undefined, 10],
    ["1800s", 1800, undefined, 15],
    ["3599s (floor)", 3599, undefined, 19],
    ["7200s", 7200, undefined, 30],
    ["14400s (teto 40)", 14400, undefined, 50],
    ["72000s (cap 40)", 72000, undefined, 50],
    ["negativo -> clamp", -3600, undefined, 10],
    ["3 tarefas", undefined, [1, 2, 3], 25],
    ["10 tarefas (cap 30)", undefined, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 40],
    ["2h + 4 tarefas", 7200, [1, 2, 3, 4], 50],
  ] as const)("%s => %i pontos", (_label, duration, tasks, expected) => {
    expect(workSessionAwardPoints(duration as number | null | undefined, tasks as number[] | undefined)).toBe(expected);
  });
});

describe("domain/gamification: taskAwardPoints (frozen golden)", () => {
  it("undefined/null => 10; fracionado => floor; 0 => 0 (sem clamp); negativo passa", () => {
    expect(taskAwardPoints()).toBe(10);
    expect(taskAwardPoints(null)).toBe(10);
    expect(taskAwardPoints(15.7)).toBe(15);
    expect(taskAwardPoints(0)).toBe(0);
    expect(taskAwardPoints(-5)).toBe(-5);
  });
});

describe("domain/gamification: progression (frozen golden)", () => {
  it("buildAwardDescription", () => {
    expect(buildAwardDescription("WORK_SESSION_COMPLETED", 42)).toBe("GAMIFICATION:WORK_SESSION_COMPLETED:42");
    expect(buildAwardDescription("TASK_COMPLETED", 7)).toBe("GAMIFICATION:TASK_COMPLETED:7");
  });

  it("pontos negativos: xp clampado, points cru", () => {
    const p = computeUserProgression(1, -50);
    expect(p.points).toBe(-50);
    expect(p.xp).toBe(0);
    expect(p.level).toBe(0);
    expect(p.nextLevelXp).toBe(100);
    expect(p.progressToNextLevel).toBe(0);
    expect(p.elo).toBe("BRONZE");
  });

  it("level/next/progress", () => {
    const p = computeUserProgression(1, 250);
    expect(p.level).toBe(2);
    expect(p.nextLevelXp).toBe(300);
    expect(p.progressToNextLevel).toBe(50);
  });

  it("fronteiras de level", () => {
    expect(computeUserProgression(1, 100).level).toBe(1);
    expect(computeUserProgression(1, 100).progressToNextLevel).toBe(0);
    expect(computeUserProgression(1, 199).progressToNextLevel).toBe(99);
  });

  it.each([
    [0, "BRONZE"],
    [699, "BRONZE"],
    [700, "PRATA"],
    [1499, "PRATA"],
    [1500, "OURO"],
    [2499, "OURO"],
    [2500, "DIAMANTE"],
  ] as const)("elo %i => %s", (xp, elo) => {
    expect(eloForXp(xp)).toBe(elo);
  });

  it("levelForXp", () => {
    expect(levelForXp(-10)).toBe(0);
    expect(levelForXp(999)).toBe(9);
  });
});

describe("domain/gamification: validateBadgeCreateInput (frozen golden BadgeEngine)", () => {
  const valid = { name: "n", description: "d", category: "achievement", createdBy: 1 };

  it("validacoes com mensagens legadas exatas", () => {
    expect(() => validateBadgeCreateInput({ ...valid, name: undefined })).toThrow("Nome do badge é obrigatório");
    expect(() => validateBadgeCreateInput({ ...valid, name: "   " })).toThrow("Nome do badge é obrigatório");
    expect(() => validateBadgeCreateInput({ ...valid, description: "  " })).toThrow("Descrição do badge é obrigatória");
    expect(() => validateBadgeCreateInput({ ...valid, category: undefined })).toThrow("Categoria do badge é obrigatória");
    expect(() => validateBadgeCreateInput({ ...valid, category: "bogus" })).toThrow("Categoria de badge inválida");
    expect(() => validateBadgeCreateInput({ ...valid, createdBy: undefined })).toThrow("Criador do badge é obrigatório");
    expect(() => validateBadgeCreateInput({ ...valid, createdBy: 0 })).toThrow("Criador do badge é obrigatório");
  });

  it("normaliza trim/icon/color/criteria e FORCA isActive=true (QUIRK-6B)", () => {
    const data = validateBadgeCreateInput({
      name: "  Herói  ",
      description: "  salva o dia  ",
      category: "special",
      icon: "",
      criteria: { points: 50 },
      isActive: false,
      createdBy: 5,
    });
    expect(data.name).toBe("Herói");
    expect(data.description).toBe("salva o dia");
    expect(data.icon).toBeNull();
    expect(data.color).toBeNull();
    expect(data.criteria).toEqual({ points: 50 });
    expect(data.isActive).toBe(true); // QUIRK-6B preservado
    expect(data.createdBy).toBe(5);
  });
});

describe("domain/gamification: applyBadgeUpdate (frozen golden BadgeEngine)", () => {
  const current: Badge = {
    id: 1,
    name: "Original",
    description: "desc",
    icon: "i.svg",
    color: "red",
    category: "milestone",
    criteria: { tasks: 3 },
    isActive: true,
    createdBy: 1,
  };

  it("merge parcial preserva campos ausentes; isActive Boolean()", () => {
    const merged = applyBadgeUpdate(current, { name: "Novo", isActive: 0 as any });
    expect(merged.name).toBe("Novo");
    expect(merged.description).toBe("desc");
    expect(merged.icon).toBe("i.svg");
    expect(merged.criteria).toEqual({ tasks: 3 });
    expect(merged.isActive).toBe(false);
  });

  it("rejeita nome/descricao vazios quando presentes", () => {
    expect(() => applyBadgeUpdate(current, { name: "" })).toThrow("Nome do badge é obrigatório");
    expect(() => applyBadgeUpdate(current, { description: "   " })).toThrow("Descrição do badge é obrigatória");
  });

  it("QUIRK: categoria bogus passa sem revalidacao", () => {
    expect(applyBadgeUpdate(current, { category: "bogus" as any }).category).toBe("bogus");
  });

  it("nao muta o original", () => {
    applyBadgeUpdate(current, { name: "Outro" });
    expect(current.name).toBe("Original");
  });
});

describe("domain/gamification: badgeCriteriaMet (frozen golden BadgeRulesEngine)", () => {
  const baseStats = {
    points: 0,
    completedTasks: 0,
    projectsCount: 0,
    workSessionsCount: 0,
    averageWeeklyHours: 0,
    maxConsecutiveDays: 0,
  };

  function met(criteria: BadgeCriteria | null | undefined, overrides: Partial<Parameters<typeof badgeCriteriaMet>[0]> = {}) {
    return badgeCriteriaMet({
      userId: 1,
      criteria,
      stats: baseStats,
      roles: [],
      weekHours: 0,
      allUsers: [],
      ...overrides,
    });
  }

  it("sem criteria => false (badge manual nunca e automatico)", () => {
    expect(met(null)).toBe(false);
    expect(met(undefined)).toBe(false);
  });

  it("thresholds numericos em AND", () => {
    expect(met({ points: 20 }, { stats: { ...baseStats, points: 20 } })).toBe(true);
    expect(met({ points: 20 }, { stats: { ...baseStats, points: 19 } })).toBe(false);
    expect(met({ points: 10, tasks: 5 }, { stats: { ...baseStats, points: 100, completedTasks: 4 } })).toBe(false);
    expect(met({ projects: 2 }, { stats: { ...baseStats, projectsCount: 2 } })).toBe(true);
    expect(met({ workSessions: 1 }, { stats: { ...baseStats, workSessionsCount: 1 } })).toBe(true);
    expect(met({ weeklyHours: 32 }, { stats: { ...baseStats, averageWeeklyHours: 32.5 } })).toBe(true);
    expect(met({ consecutiveDays: 7 }, { stats: { ...baseStats, maxConsecutiveDays: 7 } })).toBe(true);
  });

  it("QUIRK: threshold 0 e ignorado", () => {
    expect(met({ points: 0 })).toBe(true);
  });

  it("specialCondition 'primeiro ... 100 tarefas': unico => true; empate => false", () => {
    const criteria = { specialCondition: "primeiro a atingir 100 tarefas" };
    const stats = { ...baseStats, completedTasks: 100 };
    expect(met(criteria, { stats, allUsers: [{ id: 1, points: 0, completedTasks: 100 }] })).toBe(true);
    expect(
      met(criteria, {
        stats,
        allUsers: [
          { id: 1, points: 0, completedTasks: 100 },
          { id: 2, points: 0, completedTasks: 100 },
        ],
      }),
    ).toBe(false);
  });

  it("specialCondition 'primeiro ... 100 pontos'", () => {
    const criteria = { specialCondition: "primeiro a ter 100 pontos" };
    expect(
      met(criteria, { stats: { ...baseStats, points: 150 }, allUsers: [{ id: 1, points: 150, completedTasks: 0 }] }),
    ).toBe(true);
  });

  it("specialCondition 'semana perfeita': media >= weekHours", () => {
    const criteria = { specialCondition: "semana perfeita" };
    expect(met(criteria, { stats: { ...baseStats, averageWeeklyHours: 40 }, weekHours: 40 })).toBe(true);
    expect(met(criteria, { stats: { ...baseStats, averageWeeklyHours: 40 }, weekHours: 41 })).toBe(false);
  });

  it("specialCondition 'sequência ... dias': streak >= 7", () => {
    const criteria = { specialCondition: "sequência de dias" };
    expect(met(criteria, { stats: { ...baseStats, maxConsecutiveDays: 7 } })).toBe(true);
    expect(met(criteria, { stats: { ...baseStats, maxConsecutiveDays: 6 } })).toBe(false);
  });

  it("QUIRK-6C: 'coordenador'/'gerente' sem o role caem no default true; desconhecida => true", () => {
    expect(met({ specialCondition: "grupo coordenador" }, { roles: ["COORDENADOR"] })).toBe(true);
    expect(met({ specialCondition: "grupo coordenador" }, { roles: ["LABORATORISTA"] })).toBe(true);
    expect(met({ specialCondition: "cargo de gerente" }, { roles: ["GERENTE"] })).toBe(true);
    expect(met({ specialCondition: "cargo de gerente" }, { roles: [] })).toBe(true);
    expect(met({ specialCondition: "condicao que ninguem entende" })).toBe(true);
  });
});

describe("domain/gamification: selectBadgesToAward", () => {
  const badge = (id: number, criteria: BadgeCriteria | null): Badge => ({
    id,
    name: `B${id}`,
    description: "d",
    category: "achievement",
    criteria,
    isActive: true,
    createdBy: 1,
  });

  it("pula ja conquistados e badges sem criterios; preserva ordem", () => {
    const badges = [badge(1, { points: 10 }), badge(2, null), badge(3, { points: 10 }), badge(4, { points: 999 })];
    const selected = selectBadgesToAward({
      badges,
      earnedBadgeIds: [1],
      userId: 1,
      stats: {
        points: 50,
        completedTasks: 0,
        projectsCount: 0,
        workSessionsCount: 0,
        averageWeeklyHours: 0,
        maxConsecutiveDays: 0,
      },
      roles: [],
      weekHours: 0,
      allUsers: [],
    });
    expect(selected.map((b) => b.id)).toEqual([3]);
  });

  it("badge sem id definido nunca e selecionado", () => {
    const noId: Badge = { name: "x", description: "d", category: "social", isActive: true, createdBy: 1 };
    expect(
      selectBadgesToAward({
        badges: [noId],
        earnedBadgeIds: [],
        userId: 1,
        stats: {
          points: 0,
          completedTasks: 0,
          projectsCount: 0,
          workSessionsCount: 0,
          averageWeeklyHours: 0,
          maxConsecutiveDays: 0,
        },
        roles: [],
        weekHours: 0,
        allUsers: [],
      }),
    ).toHaveLength(0);
  });
});

describe("domain/gamification: agregadores de stats (frozen golden)", () => {
  it("maxConsecutiveDaysFrom: vazio 0, 1 log => 1, streak com gap reseta", () => {
    const d = (day: number) => new Date(Date.UTC(2026, 0, day));
    expect(maxConsecutiveDaysFrom([])).toBe(0);
    expect(maxConsecutiveDaysFrom([d(1)])).toBe(1);
    expect(maxConsecutiveDaysFrom([d(1), d(2), d(3), d(10)])).toBe(3);
    expect(maxConsecutiveDaysFrom([d(10), d(1), d(2), d(3)])).toBe(3); // desordem: ordena internamente
    expect(
      maxConsecutiveDaysFrom([d(1), d(2), d(3), d(4), d(5), d(6), d(7)]),
    ).toBe(7);
  });

  it("averageWeeklyHoursFrom: vazio 0, media simples das amostras", () => {
    expect(averageWeeklyHoursFrom([])).toBe(0);
    expect(averageWeeklyHoursFrom([{ totalHours: 10 }, { totalHours: 10 }, { totalHours: 10 }, { totalHours: 100 }])).toBe(32.5);
  });
});

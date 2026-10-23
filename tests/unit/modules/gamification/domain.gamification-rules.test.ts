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
  ELO_TIERS,
  computeSeasonProgression,
  eloForSeasonXp,
  maxConsecutiveDaysFrom,
  selectBadgesToAward,
  taskAwardPoints,
  trophyMetricsForWindow,
  trophySlotsForElo,
  validateBadgeCreateInput,
  workSessionAwardPoints,
} from "@/backend/domain";
import type { Badge, BadgeCriteria, TrophyCriterionWindow, TrophyFacts } from "@/backend/domain";

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

describe("domain/gamification: progressao da temporada (plan-v8 V8-6, DEC-217)", () => {
  it("buildAwardDescription", () => {
    expect(buildAwardDescription("WORK_SESSION_COMPLETED", 42)).toBe("GAMIFICATION:WORK_SESSION_COMPLETED:42");
    expect(buildAwardDescription("TASK_COMPLETED", 7)).toBe("GAMIFICATION:TASK_COMPLETED:7");
  });

  it("as trilhas reportadas: placar do mes, XP da temporada, moeda, elo e slots", () => {
    const p = computeSeasonProgression({ userId: 1, points: -50, xp: 950, coins: 450 });
    expect(p.points).toBe(-50);
    expect(p.xp).toBe(950);
    expect(p.coins).toBe(450);
    expect(p.elo).toBe("OURO");
    expect(p.trophySlots).toBe(2);
  });

  it("XP negativo vira 0 (mesmo piso do motor), e o elo do 0 e o primeiro degrau", () => {
    const p = computeSeasonProgression({ userId: 1, points: -50, xp: -30, coins: 0 });
    expect(p.xp).toBe(0);
    expect(p.elo).toBe("BRONZE");
    expect(p.trophySlots).toBe(0);
  });

  it("a escada nos umbrais e nos degraus de teste (DEC-217)", () => {
    expect(eloForSeasonXp(0)).toBe("BRONZE");
    expect(eloForSeasonXp(399)).toBe("BRONZE");
    expect(eloForSeasonXp(400)).toBe("PRATA");
    expect(eloForSeasonXp(899)).toBe("PRATA");
    expect(eloForSeasonXp(900)).toBe("OURO");
    expect(eloForSeasonXp(1499)).toBe("OURO");
    expect(eloForSeasonXp(1500)).toBe("PLATINA");
    expect(eloForSeasonXp(2399)).toBe("PLATINA");
    expect(eloForSeasonXp(2400)).toBe("DIAMANTE");
    expect(eloForSeasonXp(3599)).toBe("DIAMANTE");
    expect(eloForSeasonXp(3600)).toBe("DESAFIANTE");
  });

  it("slots por elo (MODELO 6, rodada 4): BRONZE 0, PRATA 1, OURO 2, PLATINA 2, DIAMANTE 3, DESAFIANTE 3", () => {
    expect(ELO_TIERS.map((elo) => trophySlotsForElo(elo))).toEqual([0, 1, 2, 2, 3, 3]);
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
      criteria: { tasks: 50 },
      isActive: false,
      createdBy: 5,
    });
    expect(data.name).toBe("Herói");
    expect(data.description).toBe("salva o dia");
    expect(data.icon).toBeNull();
    expect(data.color).toBeNull();
    expect(data.criteria).toEqual({ window: "vida", tasks: 50 });
    expect(data.effects).toEqual([]);
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
    criteria: { window: "vida", tasks: 3 },
    isActive: true,
    createdBy: 1,
  };

  it("merge parcial preserva campos ausentes; isActive Boolean()", () => {
    const merged = applyBadgeUpdate(current, { name: "Novo", isActive: 0 as any });
    expect(merged.name).toBe("Novo");
    expect(merged.description).toBe("desc");
    expect(merged.icon).toBe("i.svg");
    expect(merged.criteria).toEqual({ window: "vida", tasks: 3 });
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

describe("domain/gamification: badgeCriteriaMet (plan-v8 V8-6, DEC-219)", () => {
  const baseFacts: TrophyFacts = {
    monthPoints: 0,
    monthTasks: 0,
    seasonXp: 0,
    closedSeasonPoints: 0,
    closedSeasonTasks: 0,
    lifetimeTasks: 0,
    coins: 0,
    workSessionsCount: 0,
    projectsCount: 0,
    averageWeeklyHours: 0,
    maxConsecutiveDays: 0,
  };

  function met(
    criteria: BadgeCriteria | null | undefined,
    overrides: { facts?: Partial<TrophyFacts>; roles?: string[]; weekHours?: number; allUsers?: { id: number; points: number; completedTasks: number }[] } = {},
  ) {
    const window: TrophyCriterionWindow = criteria?.window ?? "vida";
    return badgeCriteriaMet({
      userId: 1,
      criteria,
      metrics: trophyMetricsForWindow({ ...baseFacts, ...overrides.facts }, window),
      roles: overrides.roles ?? [],
      weekHours: overrides.weekHours ?? 0,
      allUsers: overrides.allUsers ?? [],
    });
  }

  it("sem criteria => false (trofeu manual nunca e automatico)", () => {
    expect(met(null)).toBe(false);
    expect(met(undefined)).toBe(false);
  });

  it("thresholds numericos em AND", () => {
    expect(met({ window: "vida", workSessions: 1 }, { facts: { workSessionsCount: 1 } })).toBe(true);
    expect(met({ window: "vida", workSessions: 1 }, { facts: { workSessionsCount: 0 } })).toBe(false);
    expect(met({ window: "vida", tasks: 5, projects: 2 }, { facts: { lifetimeTasks: 5, projectsCount: 1 } })).toBe(false);
    expect(met({ window: "vida", weeklyHours: 32 }, { facts: { averageWeeklyHours: 32.5 } })).toBe(true);
    expect(met({ window: "vida", consecutiveDays: 7 }, { facts: { maxConsecutiveDays: 7 } })).toBe(true);
    expect(met({ window: "vida", coins: 100 }, { facts: { coins: 100 } })).toBe(true);
  });

  it("DEC-219: o critério 0 é AVALIADO, não ignorado — placar mensal negativo não passa num limiar 0", () => {
    // Antes do conserto o `0` fazia a checagem ser pulada, e um placar de -50 (DEC-39: premiação sem
    // piso) passava num "pontos >= 0" que ninguém pediu.
    expect(met({ window: "mes", points: 0 }, { facts: { monthPoints: -50 } })).toBe(false);
    expect(met({ window: "mes", points: 0 }, { facts: { monthPoints: 0 } })).toBe(true);
    expect(met({ window: "mes", points: 0, tasks: 0 }, { facts: { monthPoints: -1, monthTasks: 40 } })).toBe(false);
  });

  it("DEC-219: chave fora do vocabulário não concede (o `minHours` do catálogo legado)", () => {
    // O catálogo real tem `{"window":"vida","minHours":10}` (ids 10/11). `minHours` nunca existiu no
    // vocabulário do sistema; a data migration `v8-6-badge-criteria-vocab.sql` reescreve para
    // `weeklyHours`. Até lá (e em qualquer linha ilegível), o motor recusa — era o QUIRK que concedia.
    expect(met({ window: "vida", minHours: 10 } as BadgeCriteria)).toBe(false);
  });

  it("DEC-219: métrica que a janela não mede não concede", () => {
    expect(met({ window: "mes", coins: 10 }, { facts: { coins: 500 } })).toBe(false);
    expect(met({ window: "mes", xp: 10 }, { facts: { seasonXp: 500 } })).toBe(false);
    expect(met({ window: "vida", points: 10 }, { facts: { monthPoints: 500 } })).toBe(false);
  });

  it("as tres janelas medem populacoes diferentes (DEC-219)", () => {
    const facts: TrophyFacts = {
      ...baseFacts,
      monthPoints: 40,
      monthTasks: 3,
      seasonXp: 900,
      closedSeasonPoints: 200,
      closedSeasonTasks: 12,
      lifetimeTasks: 70,
    };
    expect(trophyMetricsForWindow(facts, "mes")).toEqual({ window: "mes", points: 40, tasks: 3 });
    // A temporada é o livro fechado + o mes em curso: sem o mes vivo a janela estaria sempre atrasada.
    expect(trophyMetricsForWindow(facts, "temporada")).toEqual({ window: "temporada", points: 240, tasks: 15, xp: 900 });
    expect(trophyMetricsForWindow(facts, "vida").tasks).toBe(70);
  });

  it("specialCondition 'primeiro ... 100 tarefas' (janela vida): unico => true; empate => false", () => {
    const criteria: BadgeCriteria = { window: "vida", specialCondition: "primeiro a atingir 100 tarefas" };
    const facts = { lifetimeTasks: 100 };
    expect(met(criteria, { facts, allUsers: [{ id: 1, points: 0, completedTasks: 100 }] })).toBe(true);
    expect(
      met(criteria, {
        facts,
        allUsers: [
          { id: 1, points: 0, completedTasks: 100 },
          { id: 2, points: 0, completedTasks: 100 },
        ],
      }),
    ).toBe(false);
  });

  it("a unicidade compara a MESMA métrica que a lista de rank carrega: '100 tarefas' só na janela vida, '100 pontos' só na janela mes", () => {
    // `allUsers` carrega o placar do mês (`points`) e a contagem vitalícia (`completedTasks`). Casar
    // uma unicidade de temporada contra o placar mensal — ou de mês contra a contagem vitalícia — é
    // comparar uma métrica que não é a declarada: o critério não fecha.
    const tarefas: BadgeCriteria = { window: "mes", specialCondition: "primeiro a atingir 100 tarefas" };
    expect(met(tarefas, { facts: { monthTasks: 100 }, allUsers: [{ id: 1, points: 0, completedTasks: 100 }] })).toBe(false);

    const pontos: BadgeCriteria = { window: "mes", specialCondition: "primeiro a ter 100 pontos" };
    expect(met(pontos, { facts: { monthPoints: 150 }, allUsers: [{ id: 1, points: 150, completedTasks: 0 }] })).toBe(true);

    const pontosDeVida: BadgeCriteria = { window: "vida", specialCondition: "primeiro a ter 100 pontos" };
    expect(met(pontosDeVida, { facts: { monthPoints: 150 }, allUsers: [{ id: 1, points: 150, completedTasks: 0 }] })).toBe(false);
  });

  it("specialCondition 'semana perfeita': media >= weekHours (e não fecha onde a janela não mede horas)", () => {
    const criteria: BadgeCriteria = { window: "vida", specialCondition: "semana perfeita" };
    expect(met(criteria, { facts: { averageWeeklyHours: 40 }, weekHours: 40 })).toBe(true);
    expect(met(criteria, { facts: { averageWeeklyHours: 40 }, weekHours: 41 })).toBe(false);
    expect(met({ window: "mes", specialCondition: "semana perfeita" }, { facts: { averageWeeklyHours: 40 }, weekHours: 40 })).toBe(false);
  });

  it("specialCondition 'sequência ... dias': streak >= 7", () => {
    const criteria: BadgeCriteria = { window: "vida", specialCondition: "sequência de dias" };
    expect(met(criteria, { facts: { maxConsecutiveDays: 7 } })).toBe(true);
    expect(met(criteria, { facts: { maxConsecutiveDays: 6 } })).toBe(false);
  });

  it("QUIRK-6C consertado (DEC-219): papel sem o role => false; condição desconhecida => false", () => {
    expect(met({ window: "vida", specialCondition: "grupo coordenador" }, { roles: ["COORDENADOR"] })).toBe(true);
    expect(met({ window: "vida", specialCondition: "grupo coordenador" }, { roles: ["LABORATORISTA"] })).toBe(false);
    expect(met({ window: "vida", specialCondition: "cargo de gerente" }, { roles: ["GERENTE"] })).toBe(true);
    expect(met({ window: "vida", specialCondition: "cargo de gerente" }, { roles: [] })).toBe(false);
    expect(met({ window: "vida", specialCondition: "condicao que ninguem entende" })).toBe(false);
  });

  it("critério sem limiar e sem condição não concede (defesa do catálogo já gravado)", () => {
    expect(met({ window: "vida" })).toBe(false);
  });
});

describe("domain/gamification: normalizeBadgeCriteria (plan-v8 V8-6, DEC-219)", () => {
  it("janela ausente é `vida`, e `points`/`xp` não são métricas de vida (placar é mensal e XP é da temporada)", () => {
    const data = validateBadgeCreateInput({
      name: "  Herói  ",
      description: "  salva o dia  ",
      category: "special",
      icon: "",
      criteria: { tasks: 50 },
      isActive: false,
      createdBy: 5,
    });
    expect(data.criteria).toEqual({ window: "vida", tasks: 50 });
    // `points` não é métrica de vida: desde a DEC-212 o placar é mensal, e "pontos na vida inteira"
    // não tem coluna nem livro que meça — o critério é recusado em vez de medir outra coisa.
    expect(() => validateBadgeCreateInput({ name: "n", description: "d", category: "special", createdBy: 1, criteria: { points: 50 } }))
      .toThrow("Critério points não vale na janela vida");
    expect(() => validateBadgeCreateInput({ name: "n", description: "d", category: "special", createdBy: 1, criteria: { window: "vida", xp: 50 } }))
      .toThrow("Critério xp não vale na janela vida");
  });

  it("recusa janela desconhecida, campo fora do vocabulário e campo que a janela não mede", () => {
    expect(() => validateBadgeCreateInput({ name: "n", description: "d", category: "special", createdBy: 1, criteria: { window: "semana", tasks: 3 } }))
      .toThrow("Janela do critério inválida: use mes, temporada ou vida");
    expect(() => validateBadgeCreateInput({ name: "n", description: "d", category: "special", createdBy: 1, criteria: { minHours: 10 } }))
      .toThrow("Critério do troféu fora do vocabulário: minHours");
    expect(() => validateBadgeCreateInput({ name: "n", description: "d", category: "special", createdBy: 1, criteria: { window: "mes", coins: 10 } }))
      .toThrow("Critério coins não vale na janela mes");
    expect(() => validateBadgeCreateInput({ name: "n", description: "d", category: "special", createdBy: 1, criteria: { window: "temporada", xp: -1 } }))
      .toThrow("Critério xp do troféu deve ser um número maior ou igual a zero");
    expect(() => validateBadgeCreateInput({ name: "n", description: "d", category: "special", createdBy: 1, criteria: { window: "vida" } }))
      .toThrow("Defina pelo menos um critério do troféu");
  });

  it("efeito sem tier não existe: o número mora no tier (DEC-218)", () => {
    const data = validateBadgeCreateInput({
      name: "n",
      description: "d",
      category: "special",
      createdBy: 1,
      criteria: { window: "vida", tasks: 5 },
      effects: [{ verb: "pontos_tarefa", tier: "Tier2" }],
    });
    expect(data.effects).toEqual([{ verb: "pontos_tarefa", tier: "Tier2" }]);
    expect(() => validateBadgeCreateInput({ ...data, name: "n", createdBy: 1, effects: [{ verb: "pontos_extra", tier: "Tier2" }] }))
      .toThrow("Verbo de efeito do troféu inválido");
    expect(() => validateBadgeCreateInput({ ...data, name: "n", createdBy: 1, effects: [{ verb: "pontos_tarefa", tier: 20 }] }))
      .toThrow("Tier de efeito do troféu inválido");
    expect(() => validateBadgeCreateInput({ ...data, name: "n", createdBy: 1, effects: [{ verb: "pontos_tarefa", tier: "Tier2", percent: 40 }] }))
      .toThrow("Efeito do troféu só tem verbo e tier");
    expect(() => validateBadgeCreateInput({ ...data, name: "n", createdBy: 1, effects: [{ verb: "pontos_tarefa", tier: "Tier2" }, { verb: "pontos_tarefa", tier: "Tier2" }] }))
      .toThrow("Efeito do troféu duplicado");
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

  const baseFacts: TrophyFacts = {
    monthPoints: 0,
    monthTasks: 0,
    seasonXp: 0,
    closedSeasonPoints: 0,
    closedSeasonTasks: 0,
    lifetimeTasks: 0,
    coins: 0,
    workSessionsCount: 0,
    projectsCount: 0,
    averageWeeklyHours: 0,
    maxConsecutiveDays: 0,
  };

  it("pula ja conquistados e badges sem criterios; preserva ordem", () => {
    const badges = [badge(1, { window: "mes", points: 10 }), badge(2, null), badge(3, { window: "mes", points: 10 }), badge(4, { window: "mes", points: 999 })];
    const selected = selectBadgesToAward({
      badges,
      earnedBadgeIds: [1],
      userId: 1,
      facts: { ...baseFacts, monthPoints: 50 },
      roles: [],
      weekHours: 0,
      allUsers: [],
    });
    expect(selected.map((b) => b.id)).toEqual([3]);
  });

  it("cada troféu é avaliado com as métricas da SUA janela (DEC-219)", () => {
    const badges = [
      badge(1, { window: "mes", tasks: 4 }),
      badge(2, { window: "temporada", xp: 900 }),
      badge(3, { window: "vida", tasks: 40 }),
    ];
    const selected = selectBadgesToAward({
      badges,
      earnedBadgeIds: [],
      userId: 1,
      facts: { ...baseFacts, monthTasks: 5, monthPoints: 30, seasonXp: 950, lifetimeTasks: 12 },
      roles: [],
      weekHours: 0,
      allUsers: [],
    });
    // O de mês fecha, o da temporada fecha, o de vida ainda está longe (12 tarefas de 40).
    expect(selected.map((b) => b.id)).toEqual([1, 2]);
  });

  it("badge sem id definido nunca e selecionado", () => {
    const noId: Badge = { name: "x", description: "d", category: "social", isActive: true, createdBy: 1 };
    expect(
      selectBadgesToAward({
        badges: [noId],
        earnedBadgeIds: [],
        userId: 1,
        facts: baseFacts,
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

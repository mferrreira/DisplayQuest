/**
 * V5-5 (DEC-103/126/151/155) — as regras puras do cronograma, congeladas antes do resto.
 *
 * Por que este arquivo é o mais importante do batch: a grade é a única parte do plan-v5 em que
 * um erro de aritmética vira dinheiro. Recompensa é 100 × meses marcados; uma off-by-one no
 * intervalo inclusivo muda o prêmio distribuído aos membros no V5-7. É também a única regra que
 * existe em duas formas na fonte oficial (a tabela "Total em Meses" e a grade de "X" da brochura)
 * e as duas têm que bater.
 *
 * Nada aqui toca banco, HTTP ou relógio: `today` entra por parâmetro, como em todo o domínio.
 */
import { describe, expect, it } from "vitest";

import {
  ACTIVITY_MONTH_MESSAGE,
  ACTIVITY_PERIOD_MESSAGE,
  ACTIVITY_RESPONSIBLE_MESSAGE,
  CRONOGRAMA_FALLBACK_MONTHS,
  CRONOGRAMA_MAX_MONTH_COLUMNS,
  ValidationError,
  activityPeriod,
  activityReward,
  addMonths,
  countActivityMonths,
  cronogramaMonthColumns,
  isActivityCurrent,
  isActivityPast,
  lastCivilDayOfMonth,
  monthKeyOfCivilDay,
  monthKeysBetween,
  nextCronogramaOrder,
  normalizeActivityDescription,
  normalizeActivityMonth,
  normalizeActivityResponsibleId,
  normalizeActivityStatus,
  normalizeCronogramaSeed,
  normalizeGoalDescription,
  normalizeGoalTarget,
  toggleActivityMonthRange,
} from "@/backend/domain";

describe("normalizeActivityMonth — a chave de mês que a grade entrega", () => {
  it("aceita AAAA-MM e completa o mês de um dígito", () => {
    expect(normalizeActivityMonth("2026-10")).toBe("2026-10");
    expect(normalizeActivityMonth("2026-1")).toBe("2026-01");
    expect(normalizeActivityMonth("  2026-12  ")).toBe("2026-12");
  });

  it("recusa grafia de mês que não é calendário, nomeando o campo", () => {
    for (const value of ["13/2026", "2026-13", "2026-00", "out/2026", "2026", "", "2026-10-13"]) {
      expect(() => normalizeActivityMonth(value), value).toThrowError(ValidationError);
      expect(() => normalizeActivityMonth(value), value).toThrow(ACTIVITY_MONTH_MESSAGE);
    }
  });

  it("recusa ausente: mês não tem estado 'sem mês' na linha do cronograma", () => {
    expect(() => normalizeActivityMonth(null)).toThrow(ACTIVITY_MONTH_MESSAGE);
    expect(() => normalizeActivityMonth(undefined)).toThrow(ACTIVITY_MONTH_MESSAGE);
  });
});

describe("monthKeyOfCivilDay e addMonths — aritmética de calendário", () => {
  it("a data civil vira o mês dela", () => {
    expect(monthKeyOfCivilDay("2026-10-13")).toBe("2026-10");
    expect(monthKeyOfCivilDay("2026-12-31")).toBe("2026-12");
  });

  it("vira a data instantânea no dia do fuso antes de virar mês (DEC-132)", () => {
    // 2026-10-13T02:00Z é 13/10 às 23:00 de 12/10 em America/Sao_Paulo: o mês é 2026-10,
    // e o que a tela mostraria com `new Date(...).getMonth()` é o mês anterior.
    expect(monthKeyOfCivilDay("2026-10-13T02:00:00.000Z")).toBe("2026-10");
    expect(monthKeyOfCivilDay("2026-10-14T02:00:00.000Z")).toBe("2026-10");
  });

  it("cruza a borda do ano nos dois sentidos", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-10", 0)).toBe("2026-10");
    expect(addMonths("2026-10", 14)).toBe("2027-12");
  });

  it("o último dia do mês respeita ano bissexto", () => {
    expect(lastCivilDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastCivilDayOfMonth("2028-02")).toBe("2028-02-29");
    expect(lastCivilDayOfMonth("2026-04")).toBe("2026-04-30");
    expect(lastCivilDayOfMonth("2026-12")).toBe("2026-12-31");
  });
});

describe('meses marcados — o "Total em Meses" da brochura', () => {
  it("conta os meses inclusivos, sem meia-mês (DEC-126)", () => {
    expect(monthKeysBetween("2026-04", "2026-06")).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(countActivityMonths("2026-04", "2026-06")).toBe(3);
    expect(countActivityMonths("2026-11", "2027-02")).toBe(4);
    expect(countActivityMonths("2026-06", "2026-06")).toBe(1);
  });

  it("intervalo invertido é recusa nomeada, não intervalo às avessas", () => {
    expect(() => countActivityMonths("2026-06", "2026-03")).toThrow(ACTIVITY_PERIOD_MESSAGE);
    // `monthKeysBetween` é a projeção: devolve vazio em vez de travar o laço.
    expect(monthKeysBetween("2026-06", "2026-03")).toEqual([]);
  });

  it("as seis etapas da brochura valem 100 × meses (DEC-103)", () => {
    // Etapa 1 (2), 2 (2), 3 (3), 4 (8), 5 (5), 6 (10) — a tabela e a grade de X da seção 15.
    expect(activityReward("2026-01", "2026-02")).toBe(200);
    expect(activityReward("2026-04", "2026-06")).toBe(300);
    expect(activityReward("2026-04", "2026-11")).toBe(800);
    expect(activityReward("2026-01", "2026-12")).toBe(1200);
  });
});

describe("activityPeriod — derivado, nunca armazenado (DEC-126a)", () => {
  it("é do primeiro dia do primeiro mês ao último dia do último", () => {
    expect(activityPeriod("2026-04", "2026-06")).toEqual({
      periodoInicio: "2026-04-01",
      periodoFim: "2026-06-30",
    });
    expect(activityPeriod("2026-01", "2026-12")).toEqual({
      periodoInicio: "2026-01-01",
      periodoFim: "2026-12-31",
    });
    expect(activityPeriod("2026-02", "2026-02")).toEqual({
      periodoInicio: "2026-02-01",
      periodoFim: "2026-02-28",
    });
  });

  it("recusa o intervalo invertido", () => {
    expect(() => activityPeriod("2026-06", "2026-03")).toThrow(ACTIVITY_PERIOD_MESSAGE);
  });
});

describe("toggleActivityMonthRange — o clique na grade (DEC-126d)", () => {
  it("sem marca, clicar marca aquele mês", () => {
    expect(toggleActivityMonthRange(null, "2026-05")).toEqual({
      firstMonth: "2026-05",
      lastMonth: "2026-05",
    });
  });

  it("clicar depois do último estende o intervalo a partir do primeiro marcado", () => {
    expect(toggleActivityMonthRange({ firstMonth: "2026-04", lastMonth: "2026-06" }, "2026-08")).toEqual({
      firstMonth: "2026-04",
      lastMonth: "2026-08",
    });
  });

  it("clicar antes do primeiro estende para trás", () => {
    expect(toggleActivityMonthRange({ firstMonth: "2026-04", lastMonth: "2026-06" }, "2026-01")).toEqual({
      firstMonth: "2026-01",
      lastMonth: "2026-06",
    });
  });

  it("clicar no meio passa a ser o último mês da linha", () => {
    expect(toggleActivityMonthRange({ firstMonth: "2026-04", lastMonth: "2026-06" }, "2026-05")).toEqual({
      firstMonth: "2026-04",
      lastMonth: "2026-05",
    });
  });

  it("clicar no último remove o último; a marca única some", () => {
    expect(toggleActivityMonthRange({ firstMonth: "2026-04", lastMonth: "2026-06" }, "2026-06")).toEqual({
      firstMonth: "2026-04",
      lastMonth: "2026-05",
    });
    expect(toggleActivityMonthRange({ firstMonth: "2026-05", lastMonth: "2026-05" }, "2026-05")).toBeNull();
  });

  it("a linha nunca fica com buraco, em qualquer sequência de cliques", () => {
    let range = toggleActivityMonthRange(null, "2026-03");
    const clicks = ["2026-07", "2026-01", "2026-05", "2026-02", "2026-05", "2026-04"];
    for (const click of clicks) {
      range = toggleActivityMonthRange(range, click);
      if (range === null) continue;
      const months = monthKeysBetween(range.firstMonth, range.lastMonth);
      expect(months.length, `clique em ${click}`).toBe(countActivityMonths(range.firstMonth, range.lastMonth));
      // Contíguo: cada mês da lista é o seguinte do anterior.
      for (let index = 1; index < months.length; index += 1) {
        expect(months[index], `clique em ${click}`).toBe(addMonths(months[index - 1], 1));
      }
    }
  });

  it("mês inválido é recusado no clique, não ignorado", () => {
    expect(() => toggleActivityMonthRange(null, "2026-13")).toThrow(ACTIVITY_MONTH_MESSAGE);
  });
});

describe("isActivityCurrent — a atividade vigente do V5-6 (regra 8 do plano)", () => {
  const range = { firstMonth: "2026-04", lastMonth: "2026-06" };

  it("casa pelo mês marcado que contém hoje, inclusive nas bordas", () => {
    expect(isActivityCurrent(range, "2026-04-01")).toBe(true);
    expect(isActivityCurrent(range, "2026-05-17")).toBe(true);
    expect(isActivityCurrent(range, "2026-06-30")).toBe(true);
  });

  it("fora do intervalo não é vigente", () => {
    expect(isActivityCurrent(range, "2026-03-31")).toBe(false);
    expect(isActivityCurrent(range, "2026-07-01")).toBe(false);
  });
});

describe("isActivityPast — o que o seletor do formulário não oferece (DEC-99)", () => {
  const range = { firstMonth: "2026-04", lastMonth: "2026-06" };

  it("passada é a que terminou antes do mês de hoje", () => {
    expect(isActivityPast(range, "2026-07-01")).toBe(true);
    expect(isActivityPast(range, "2026-12-31")).toBe(true);
  });

  it("vigente e futura não são passadas — a borda é o último dia do último mês", () => {
    expect(isActivityPast(range, "2026-06-30")).toBe(false);
    expect(isActivityPast(range, "2026-04-15")).toBe(false);
    expect(isActivityPast({ firstMonth: "2026-11", lastMonth: "2026-12" }, "2026-10-14")).toBe(false);
  });

  it("hoje dentro do intervalo não é passada mesmo que o intervalo tenha começado antes", () => {
    expect(isActivityPast({ firstMonth: "2025-01", lastMonth: "2026-10" }, "2026-10-14")).toBe(false);
  });
});

describe("cronogramaMonthColumns — as colunas da grade (DEC-151)", () => {
  it("são os meses do período do projeto", () => {
    expect(
      cronogramaMonthColumns({ startDate: "2026-03-15", endDate: "2026-08-20", today: "2026-10-14" }),
    ).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  });

  it("sem datas, 12 meses a partir do mês atual — a janela da brochura", () => {
    const months = cronogramaMonthColumns({ startDate: null, endDate: null, today: "2026-10-14" });
    expect(months).toHaveLength(CRONOGRAMA_FALLBACK_MONTHS);
    expect(months[0]).toBe("2026-10");
    expect(months[months.length - 1]).toBe("2027-09");
  });

  it("com uma data só, a janela de 12 meses é ancorada nela", () => {
    const fromStart = cronogramaMonthColumns({ startDate: "2026-03-01", endDate: null, today: "2026-10-14" });
    expect(fromStart[0]).toBe("2026-03");
    expect(fromStart).toHaveLength(12);

    const fromEnd = cronogramaMonthColumns({ startDate: null, endDate: "2026-03-31", today: "2026-10-14" });
    expect(fromEnd[fromEnd.length - 1]).toBe("2026-03");
    expect(fromEnd).toHaveLength(12);
  });

  it("marca fora da janela alarga a janela: nenhuma linha some da tela por mudança de data", () => {
    const months = cronogramaMonthColumns({
      startDate: "2026-03-01",
      endDate: "2026-05-31",
      today: "2026-10-14",
      markedRanges: [{ firstMonth: "2025-11", lastMonth: "2026-01" }],
    });

    expect(months[0]).toBe("2025-11");
    expect(months).toContain("2026-01");
    expect(months).toContain("2026-05");
  });

  it("o teto existe para período digitado errado, e é o mesmo para a janela padrão", () => {
    const months = cronogramaMonthColumns({
      startDate: "2000-01-01",
      endDate: "2099-12-31",
      today: "2026-10-14",
    });

    expect(months).toHaveLength(CRONOGRAMA_MAX_MONTH_COLUMNS);
    expect(months[0]).toBe("2000-01");
  });
});

describe("ordem, descrição e os campos opcionais", () => {
  it("a ordem seguinte é a livre (max + 1)", () => {
    expect(nextCronogramaOrder([])).toBe(1);
    expect(nextCronogramaOrder([1, 2, 3])).toBe(4);
    expect(nextCronogramaOrder([2, 5])).toBe(6);
  });

  it("descrição obrigatória, com o teto da descrição de projeto", () => {
    expect(normalizeActivityDescription("  Revisão sistemática  ")).toBe("Revisão sistemática");
    expect(() => normalizeActivityDescription("")).toThrow("Descrição da atividade é obrigatória");
    expect(() => normalizeActivityDescription("x".repeat(501))).toThrow(
      "Descrição da atividade não pode ter mais de 500 caracteres",
    );
    expect(() => normalizeGoalDescription(null)).toThrow("Descrição da meta é obrigatória");
  });

  it("a meta numérica é opcional; quando existe é inteira e pequena (DEC-156)", () => {
    expect(normalizeGoalTarget(null)).toBeNull();
    expect(normalizeGoalTarget(undefined)).toBeNull();
    expect(normalizeGoalTarget("")).toBeNull();
    expect(normalizeGoalTarget("2")).toBe(2);
    expect(normalizeGoalTarget(9999)).toBe(9999);

    for (const value of [0, -1, 1.5, 10000, "muitas"]) {
      expect(() => normalizeGoalTarget(value), String(value)).toThrow(
        "Meta numérica deve ser um inteiro entre 1 e 9999",
      );
    }
  });

  it("responsável ausente é sem responsável; responsável inválido é recusa", () => {
    expect(normalizeActivityResponsibleId(null)).toBeNull();
    expect(normalizeActivityResponsibleId(undefined)).toBeNull();
    expect(normalizeActivityResponsibleId("")).toBeNull();
    expect(normalizeActivityResponsibleId("7")).toBe(7);

    for (const value of [0, -3, "abc", 1.5]) {
      expect(() => normalizeActivityResponsibleId(value), String(value)).toThrow(
        "Responsável da atividade é inválido",
      );
    }
  });

  it("o vocabulário de status é a lista fechada, com rótulo ao lado do token", () => {
    expect(normalizeActivityStatus(null)).toBe("OPEN");
    expect(normalizeActivityStatus("done")).toBe("DONE");
    expect(() => normalizeActivityStatus("Afastado")).toThrow("Status da atividade é inválido");
  });
});

describe("normalizeCronogramaSeed — o passo opcional do wizard (DEC-100, regra 9)", () => {
  it("pular o passo devolve null: a criação continua a criação simples de antes", () => {
    expect(normalizeCronogramaSeed(undefined, [1])).toBeNull();
    expect(normalizeCronogramaSeed({}, [1])).toBeNull();
    expect(normalizeCronogramaSeed({ goals: [], activities: [] }, [1])).toBeNull();
  });

  it("a ordem é atribuída na ordem em que as linhas chegaram", () => {
    const seed = normalizeCronogramaSeed(
      {
        goals: [{ description: "Revisar a literatura" }, { description: "Publicar artigo", target: "2" }],
        activities: [
          { description: "Revisão", firstMonth: "2026-01", lastMonth: "2026-02" },
          { description: "Codificação", firstMonth: "2026-03", lastMonth: "2026-10", responsibleId: 7 },
        ],
      },
      [1, 7],
    );

    expect(seed?.goals.map((goal) => goal.order)).toEqual([1, 2]);
    expect(seed?.goals[1]).toEqual({ order: 2, target: 2, description: "Publicar artigo" });
    expect(seed?.activities.map((activity) => activity.order)).toEqual([1, 2]);
    expect(seed?.activities[1]).toEqual({
      order: 2,
      description: "Codificação",
      responsibleId: 7,
      firstMonth: "2026-03",
      lastMonth: "2026-10",
    });
  });

  it("responsável que não vai participar do projeto é recusado na criação", () => {
    expect(
      () =>
        normalizeCronogramaSeed(
          { activities: [{ description: "Codificação", firstMonth: "2026-01", lastMonth: "2026-02", responsibleId: 99 }] },
          [1, 7],
        ),
    ).toThrow(ACTIVITY_RESPONSIBLE_MESSAGE);
  });

  it("linha inválida derruba o passo inteiro, nomeando o motivo (rollback completo)", () => {
    expect(
      () =>
        normalizeCronogramaSeed(
          { activities: [{ description: "Codificação", firstMonth: "2026-08", lastMonth: "2026-02" }] },
          [1],
        ),
    ).toThrow(ACTIVITY_PERIOD_MESSAGE);

    expect(
      () =>
        normalizeCronogramaSeed(
          { goals: [{ description: "Publicar artigo", target: "muitos" }], activities: [] },
          [1],
        ),
    ).toThrow("Meta numérica deve ser um inteiro entre 1 e 9999");
  });
});

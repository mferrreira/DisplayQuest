// @vitest-environment node
/**
 * plan-v8 V8-6 (DEC-217/219) — guarda das janelas do troféu e das três contas de tarefa que as sustentam.
 *
 * Por que este arquivo existe: a janela do critério (`mes | temporada | vida`) é decidida no domínio,
 * mas a MÉTRICA que ela mede sai de três adaptadores diferentes, escritos em ondas diferentes:
 *   - `prisma-monthly-points-cycle.port.ts` (V8-2) — o placar mensal e `month_history.completedTasks`;
 *   - `prisma-weekly-xp-review.port.ts` (V8-3) — a régua semanal de XP;
 *   - `prisma-user-stats.port.ts` → `countTasksCompletedSince` (V8-6) — o critério do troféu.
 *
 * As três contam a mesma população de tarefas com as MESMAS condições (as duas famílias que creditam
 * `users.completedTasks`, com o filtro de visibilidade medido em `complete-task.use-case.ts` e
 * `approve-task.use-case.ts`). Se uma delas escrever `taskVisibility` de um jeito próprio, o critério,
 * o placar e a revisão de XP passam a contar pessoas diferentes — e o `tsc` não vê: as três são `number`.
 * É o mesmo modo de falha que a DEC-90/96 (mock reimplementando regra) e a DEC-95/96 (vocabulário em
 * cópia), e por isso a fechadura é estrutural, lendo o código de produção.
 *
 * O que está congelado aqui:
 *   - o vocabulário das janelas e o default (`vida`), e que o vocabulário NÃO tem cópia na application
 *     layer nem na UI;
 *   - `trophyFactReadsFor` (a resposta do domínio a "que leitura eu pago?") conferida contra a
 *     composição real das métricas em `trophyMetricsForWindow` — para que as listas de leitura não
 *     virem uma tabela paralela;
 *   - as condições das três contas de tarefa, idênticas letra a letra;
 *   - a soma da temporada lida pelo prefixo nomeado pelo domínio (`seasonMonthPrefix`), não por um
 *     `2026%` escrito à mão.
 *
 * Roda em ambiente `node` porque lê arquivo do disco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLOSED_SEASON_WINDOWS,
  DEFAULT_TROPHY_CRITERION_WINDOW,
  MONTH_TASK_WINDOWS,
  TROPHY_CRITERION_WINDOWS,
  trophyFactReadsFor,
  trophyMetricsForWindow,
  type TrophyCriterionWindow,
  type TrophyFacts,
} from "@/backend/domain";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

const MONTHLY_PORT = "backend/modules/gamification/infrastructure/repositories/prisma-monthly-points-cycle.port.ts";
const WEEKLY_PORT = "backend/modules/gamification/infrastructure/repositories/prisma-weekly-xp-review.port.ts";
const STATS_PORT = "backend/modules/gamification/infrastructure/repositories/prisma-user-stats.port.ts";
const EVALUATE_USE_CASE = "backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case.ts";
const CONTRACTS = "backend/modules/gamification/application/contracts.ts";
const BADGE_PANEL = "components/admin/badge-manager.tsx";
const APPROVE_TASK_USE_CASE = "backend/modules/task-management/application/use-cases/approve-task.use-case.ts";

/**
 * Fatos todos primos e diferentes entre si: qualquer número que apareça numa métrica onde não deveria
 * é achado por igualdade exata, sem sorteio de coincidência.
 */
const FACTS: TrophyFacts = {
  monthPoints: 11,
  monthTasks: 13,
  seasonXp: 17,
  closedSeasonPoints: 23,
  closedSeasonTasks: 29,
  lifetimeTasks: 31,
  coins: 37,
  workSessionsCount: 41,
  projectsCount: 43,
  averageWeeklyHours: 47,
  maxConsecutiveDays: 53,
};

describe("o vocabulário da janela do critério (DEC-218/219)", () => {
  it("são três janelas, e o default é a vitalícia", () => {
    expect([...TROPHY_CRITERION_WINDOWS]).toEqual(["mes", "temporada", "vida"]);
    expect(DEFAULT_TROPHY_CRITERION_WINDOW).toBe("vida");
  });

  it("`trophyFactReadsFor` diz o que cada combinação de janela paga", () => {
    expect(trophyFactReadsFor([])).toEqual({ needsMonthTasks: false, needsClosedSeason: false });
    expect(trophyFactReadsFor(["mes"])).toEqual({ needsMonthTasks: true, needsClosedSeason: false });
    expect(trophyFactReadsFor(["vida"])).toEqual({ needsMonthTasks: false, needsClosedSeason: false });
    expect(trophyFactReadsFor(["temporada"])).toEqual({ needsMonthTasks: true, needsClosedSeason: true });
    // Catálogo misto: basta UMA troféu de temporada para a leitura anual entrar.
    expect(trophyFactReadsFor(["vida", "temporada"])).toEqual({ needsMonthTasks: true, needsClosedSeason: true });
  });
});

describe("as listas de leitura são a MESMA tabela das métricas", () => {
  /**
   * A conferência não compara a lista com ela mesma: ela mede a COMPOSIÇÃO de `trophyMetricsForWindow`
   * (quem entra na métrica da janela) e confere com `trophyFactReadsFor` (o que a avaliação paga).
   * Sem isso, `MONTH_TASK_WINDOWS`/`CLOSED_SEASON_WINDOWS` seriam uma segunda régua dormindo ao lado
   * da primeira.
   */
  it("cada janela mede exatamente o que a janela mede", () => {
    const mes = trophyMetricsForWindow(FACTS, "mes");
    expect(mes).toEqual({ window: "mes", points: FACTS.monthPoints, tasks: FACTS.monthTasks });

    // A temporada é `meses fechados + mês em curso`: o `month_history` só é escrito no fechamento, e
    // uma janela que ignorasse o mês em curso estaria sempre um mês atrasada.
    const temporada = trophyMetricsForWindow(FACTS, "temporada");
    expect(temporada).toEqual({
      window: "temporada",
      points: FACTS.closedSeasonPoints + FACTS.monthPoints,
      tasks: FACTS.closedSeasonTasks + FACTS.monthTasks,
      xp: FACTS.seasonXp,
    });

    const vida = trophyMetricsForWindow(FACTS, "vida");
    expect(vida.tasks).toBe(FACTS.lifetimeTasks);
    expect(vida.coins).toBe(FACTS.coins);
    expect(vida.workSessions).toBe(FACTS.workSessionsCount);
    expect(vida.projects).toBe(FACTS.projectsCount);
    expect(vida.weeklyHours).toBe(FACTS.averageWeeklyHours);
    expect(vida.consecutiveDays).toBe(FACTS.maxConsecutiveDays);
    expect(vida.points).toBeUndefined();
    expect(vida.xp).toBeUndefined();
  });

  it("nenhuma métrica de vida toca o mês em curso nem o ano fechado", () => {
    const vidaValues = Object.values(trophyMetricsForWindow(FACTS, "vida"));
    for (const value of vidaValues) {
      expect(value).not.toBe(FACTS.monthPoints);
      expect(value).not.toBe(FACTS.monthTasks);
      expect(value).not.toBe(FACTS.closedSeasonPoints);
      expect(value).not.toBe(FACTS.closedSeasonTasks);
    }
  });

  it("`trophyFactReadsFor` casa com a composição, janela por janela", () => {
    for (const window of TROPHY_CRITERION_WINDOWS) {
      const metrics = trophyMetricsForWindow(FACTS, window);
      const measuresCurrentMonth =
        metrics.points === FACTS.monthPoints ||
        metrics.points === FACTS.closedSeasonPoints + FACTS.monthPoints ||
        metrics.tasks === FACTS.monthTasks ||
        metrics.tasks === FACTS.closedSeasonTasks + FACTS.monthTasks;
      const measuresClosedSeason =
        metrics.points === FACTS.closedSeasonPoints + FACTS.monthPoints ||
        metrics.tasks === FACTS.closedSeasonTasks + FACTS.monthTasks;

      const reads = trophyFactReadsFor([window]);
      expect(reads.needsMonthTasks).toBe(measuresCurrentMonth);
      expect(reads.needsClosedSeason).toBe(measuresClosedSeason);
    }
  });

  it("as listas do domínio são as janelas que a composição mede", () => {
    expect([...MONTH_TASK_WINDOWS]).toEqual(["mes", "temporada"]);
    expect([...CLOSED_SEASON_WINDOWS]).toEqual(["temporada"]);
  });
});

describe("as três contas de tarefa obedecem as MESMAS condições", () => {
  /**
   * As duas famílias que creditam `users.completedTasks` (medido nos dois incrementos):
   *   - `task_user_progress.completedAt` — a conclusão individual (caminho pública/global);
   *   - `tasks` com `assignedTo` e `completedAt` — a aprovação da tarefa delegada, com o filtro de
   *     visibilidade. Sem o filtro, a tarefa pública atribuída entra nas duas queries e o número cresce.
   */
  const SHARED_FRAGMENTS = [
    "completedAt: { gte: start, lt: endExclusive }",
    "isGlobal: false",
    'taskVisibility: { not: "public" }',
    "prisma.task_user_progress",
    "assignedTo: userId",
  ] as const;

  for (const [label, relativePath] of Object.entries({ monthly: MONTHLY_PORT, weekly: WEEKLY_PORT, stats: STATS_PORT })) {
    it(`${label}: as duas famílias e o corte de janela exclusivos`, () => {
      const source = read(relativePath);
      for (const fragment of SHARED_FRAGMENTS) {
        expect(source, `${label} perdeu "${fragment}"`).toContain(fragment);
      }
      // A variante solta (`taskVisibility: "public"`) contaria a população errada de propósito.
      expect(source).not.toContain('taskVisibility: "public"');
    });
  }

  it("a soma das duas famílias é feita na port, não no use case", () => {
    expect(read(STATS_PORT)).toContain("progressos + delegadasAprovadas");
    expect(read(MONTHLY_PORT)).toContain("progressos + delegadasAprovadas");
  });

  it("as duas famílias espelham os dois incrementos de `completedTasks`", () => {
    // A régua de verdade está nos use cases de tarefa; a port copia as condições, e a cópia é o risco.
    expect(read(APPROVE_TASK_USE_CASE)).toContain('task.taskVisibility !== "public" && !task.isGlobal');
  });
});

describe("nenhum lugar escreve o vocabulário da janela por conta própria", () => {
  it("a application layer re-exporta o tipo do domínio em vez de copiar a união", () => {
    const contracts = read(CONTRACTS);
    expect(contracts).toContain("window?: TrophyCriterionWindow");
    expect(contracts).not.toContain('"mes" | "temporada" | "vida"');
  });

  it("a avaliação pergunta ao domínio o que ler, em vez de testar token", () => {
    const evaluate = read(EVALUATE_USE_CASE);
    expect(evaluate).toContain("trophyFactReadsFor(windows)");
    expect(evaluate).not.toContain('windows.has("');
  });

  it("o painel fala o vocabulário do domínio e não tem janela própria", () => {
    const panel = read(BADGE_PANEL);
    expect(panel).toContain("@/backend/domain");
    expect(panel).not.toMatch(/["'](mes|temporada|vida)["']/);
  });
});

describe("a soma dos meses fechados da temporada usa o prefixo nomeado pelo domínio", () => {
  it("`closedSeasonSums` lê `month_history` por `seasonMonthPrefix(year)`", () => {
    const source = read(STATS_PORT);
    expect(source).toContain('import { seasonMonthPrefix } from "@/backend/domain"');
    expect(source).toContain("month: { startsWith: seasonMonthPrefix(year) }");
    // Um `startsWith(`2026`)` ou `LIKE '2026%'` escrito à mão é o mesmo erro da DEC-90/96: a régua do
    // ano passando a existir em dois lugares.
    expect(source).not.toMatch(/startsWith\(\s*`?\$\{/);
    expect(source).not.toMatch(/startsWith\(\s*["']\d{4}/);
  });
});

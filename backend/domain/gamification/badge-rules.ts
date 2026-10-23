/**
 * Regras puras de troféu — o motor de critérios (plan-v8 V8-6, DEC-218/219).
 *
 * As regras RECEBEM dados por argumento (fatos, métricas, roles, todos os usuários, troféus
 * conquistados) — nenhum repositório no construtor (RG-01, mesma disciplina da OND6-B2).
 *
 * O que esta reescrita muda de comportamento, e cada mudança é decisão registrada (MODELO §8,
 * DEC-219) — não é arrumação de detalhes:
 *   - **condição desconhecida deixa de ser verdadeira** (era o QUIRK-6C: qualquer `specialCondition`
 *     que o motor não conhecia devolvia `true`, e "coordenador" sem o papel também).
 *   - **critério `0` deixa de ser ignorado** (era `if (criteria.points && ...)`: `{ points: 0 }` não
 *     media nada e concedia). Agora `0` é um limiar de verdade.
 *   - **campo fora do vocabulário não concede** (o catálogo real tem linhas com `minHours`, chave que
 *     nenhum lugar do sistema media: hoje ela é ignorada e o troféu vai para todo mundo).
 *   - **critério declara a janela** (`mes | temporada | vida`) e só lê as métricas daquela janela.
 *
 * Os quirks do CRUD ficam onde estavam (pinados desde OND6-B1, preservados por AGENTS §5.2):
 *   - QUIRK-6B: create força `isActive = true` mesmo com `isActive: false` no input.
 *   - `createdBy` falsy (0) é tratado como ausente.
 *   - update NÃO revalida categoria; `isActive` é coercido por `Boolean()`.
 */

import { ValidationError } from "@/backend/domain/errors/DomainError";
import {
  DEFAULT_TROPHY_CRITERION_WINDOW,
  TROPHY_CRITERION_WINDOWS,
  type Badge,
  type BadgeCategory,
  type BadgeCriteria,
  type TrophyCriterionWindow,
} from "@/backend/domain/gamification/Badge";
import { normalizeTrophyEffects, type TrophyEffect } from "@/backend/domain/gamification/trophy-effects";

export const BADGE_CATEGORIES: readonly BadgeCategory[] = ["achievement", "milestone", "special", "social"];

/** Shape normalizado que o CreateBadgeUseCase entrega ao BadgeCatalogPort. */
export interface BadgeCreateData {
  name: string;
  description: string;
  icon: string | null;
  color: string | null;
  category: BadgeCategory;
  criteria: BadgeCriteria | null;
  effects: TrophyEffect[];
  isActive: boolean;
  createdBy: number;
}

/**
 * A forma CRUA do que o painel manda (`unknown` em criteria/effects de propósito): quem dá tipo ao
 * critério e aos efeitos é a normalização (`normalizeBadgeCriteria` / `normalizeTrophyEffects`), que
 * devolve `BadgeCriteria | null` e `TrophyEffect[]` ou recusa nomeando o campo. Tipar o input como
 * `TrophyEffect[]` seria o tipo do resultado posto na porta de entrada — o `tsc` aprovaria um
 * `{ verb: "pontos_extra", tier: 7 }` vindo do painel e a recusa deixaria de existir.
 */
export interface BadgeCreateInput {
  name?: string;
  description?: string;
  category?: string;
  icon?: string | null;
  color?: string | null;
  criteria?: unknown;
  effects?: unknown;
  isActive?: boolean;
  createdBy?: number;
}

/** Validacoes + normalizacoes do create (frozen golden do BadgeEngine.create, com o critério novo). */
export function validateBadgeCreateInput(data: BadgeCreateInput): BadgeCreateData {
  if (!data.name || !data.name.trim()) {
    throw new ValidationError("Nome do badge é obrigatório");
  }
  if (!data.description || !data.description.trim()) {
    throw new ValidationError("Descrição do badge é obrigatória");
  }
  if (!data.category) {
    throw new ValidationError("Categoria do badge é obrigatória");
  }
  if (!data.createdBy) {
    // QUIRK: createdBy 0 e tratado como ausente (falsy check legado).
    throw new ValidationError("Criador do badge é obrigatório");
  }

  const validCategories: BadgeCategory[] = [...BADGE_CATEGORIES];
  if (!validCategories.includes(data.category as BadgeCategory)) {
    throw new ValidationError("Categoria de badge inválida");
  }

  return {
    name: data.name.trim(),
    description: data.description.trim(),
    icon: data.icon || null,
    color: data.color || null,
    category: data.category as BadgeCategory,
    criteria: normalizeBadgeCriteria(data.criteria),
    effects: normalizeTrophyEffects(data.effects),
    // QUIRK-6B: o caminho legado (Badge.create) forca isActive=true; preservado.
    isActive: true,
    createdBy: data.createdBy,
  };
}

/** Merge parcial do update (frozen golden do BadgeEngine.update). */
export function applyBadgeUpdate(current: Badge, data: Partial<BadgeCreateInput>): Badge {
  const merged: Badge = { ...current };

  if (data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw new ValidationError("Nome do badge é obrigatório");
    merged.name = name;
  }
  if (data.description !== undefined) {
    const description = String(data.description || "").trim();
    if (!description) throw new ValidationError("Descrição do badge é obrigatória");
    merged.description = description;
  }
  if (data.icon !== undefined) {
    merged.icon = data.icon;
  }
  if (data.color !== undefined) {
    merged.color = data.color;
  }
  if (data.category !== undefined) {
    // QUIRK: update nao revalida categoria (categoria bogus passa).
    merged.category = data.category as BadgeCategory;
  }
  if (data.criteria !== undefined) {
    merged.criteria = normalizeBadgeCriteria(data.criteria);
  }
  if (data.effects !== undefined) {
    merged.effects = normalizeTrophyEffects(data.effects);
  }
  if (data.isActive !== undefined) {
    merged.isActive = Boolean(data.isActive);
  }

  return merged;
}

// ─── o critério, na forma validada ──────────────────────────────────────────────────────────────

/** As métricas que cada janela mede. Fechado, e é dele que saem as duas frases de recusa. */
export const TROPHY_CRITERION_FIELDS = [
  "points",
  "tasks",
  "xp",
  "coins",
  "workSessions",
  "projects",
  "weeklyHours",
  "consecutiveDays",
  "specialCondition",
] as const;

const WINDOW_METRICS: Record<TrophyCriterionWindow, readonly (keyof BadgeCriteria)[]> = {
  mes: ["points", "tasks"],
  temporada: ["points", "tasks", "xp"],
  vida: ["tasks", "coins", "workSessions", "projects", "weeklyHours", "consecutiveDays", "specialCondition"],
};

/**
 * O rótulo de cada métrica de critério, na ordem em que o formulário do painel as mostra. A UI não
 * tem vocabulário próprio (a lição medida da DEC-96: rótulo no componente é segunda tabela, e a
 * primeira deixa de ser lida por ninguém).
 */
export const TROPHY_CRITERION_LABELS: Record<Exclude<(typeof TROPHY_CRITERION_FIELDS)[number], "specialCondition">, string> = {
  points: "Pontos",
  tasks: "Tarefas",
  xp: "XP da temporada",
  coins: "Moedas",
  workSessions: "Sessões de trabalho",
  projects: "Projetos",
  weeklyHours: "Horas semanais",
  consecutiveDays: "Dias consecutivos",
};

export const TROPHY_CRITERION_WINDOW_LABELS: Record<TrophyCriterionWindow, string> = {
  mes: "Mês em curso",
  temporada: "Temporada (ano em curso)",
  vida: "Vida inteira",
};

/**
 * Os campos que uma janela mede. É o que o formulário do painel mostra: um troféu de mês não ganha
 * campo de "moedas" porque a janela `mes` não mede moedas (DEC-219), e o painel não pode oferecer um
 * critério que a validação do domínio ia recusar.
 */
export function trophyCriterionFieldsForWindow(window: TrophyCriterionWindow): readonly (keyof BadgeCriteria)[] {
  return WINDOW_METRICS[window];
}

export function isTrophyCriterionWindow(value: unknown): value is TrophyCriterionWindow {
  return typeof value === "string" && (TROPHY_CRITERION_WINDOWS as readonly string[]).includes(value);
}

/**
 * Validação/normalização do critério gravado no catálogo (DEC-219).
 *
 * Ausente ou nulo é "troféu sem critério" — o motor nunca concede sozinho, e é assim que o CAMPEÃO
 * (critério nulo, V8-4) continua sendo concedido só pela rotina de fechamento.
 */
export function normalizeBadgeCriteria(raw: unknown): BadgeCriteria | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Critério do troféu deve ser um objeto");
  }

  const source = raw as Record<string, unknown>;
  const window = source.window === undefined || source.window === null
    ? DEFAULT_TROPHY_CRITERION_WINDOW
    : source.window;
  if (!isTrophyCriterionWindow(window)) {
    throw new ValidationError("Janela do critério inválida: use mes, temporada ou vida");
  }

  const criteria: BadgeCriteria = { window };
  let thresholds = 0;

  for (const key of Object.keys(source)) {
    if (key === "window") continue;
    if (!(TROPHY_CRITERION_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Critério do troféu fora do vocabulário: ${key}`);
    }
    if (!(WINDOW_METRICS[window] as readonly string[]).includes(key)) {
      throw new ValidationError(`Critério ${key} não vale na janela ${window}`);
    }

    const value = source[key];
    if (key === "specialCondition") {
      if (typeof value !== "string" || !value.trim()) {
        throw new ValidationError("Condição especial do troféu deve ser um texto");
      }
      criteria.specialCondition = value.trim();
      thresholds += 1;
      continue;
    }

    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new ValidationError(`Critério ${key} do troféu deve ser um número maior ou igual a zero`);
    }
    criteria[key as "points" | "tasks" | "xp" | "coins" | "workSessions" | "projects" | "weeklyHours" | "consecutiveDays"] = value;
    thresholds += 1;
  }

  if (thresholds === 0) {
    // Sem métrica nenhuma o critério não mede nada, e "não mede nada" foi exatamente como o motor
    // antigo concedia um troféu a todo mundo.
    throw new ValidationError("Defina pelo menos um critério do troféu");
  }

  return criteria;
}

// ─── as métricas que a janela resolve ───────────────────────────────────────────────────────────

/**
 * Os fatos lidos pela port, uma vez por pessoa. A port devolve FATOS (mesma disciplina da V8-2 e da
 * V8-3); a soma da temporada e a divisão por janela são daqui.
 */
export interface TrophyFacts {
  /** `users.points` — o placar do mês em curso. */
  monthPoints: number;
  /** Tarefas aprovadas no mês em curso (as duas famílias que creditam `completedTasks`). */
  monthTasks: number;
  /** `users.xp` — a trilha da temporada. */
  seasonXp: number;
  /** Somatório de `month_history.points` dos meses FECHADOS do ano em curso. */
  closedSeasonPoints: number;
  /** Somatório de `month_history.completedTasks` dos meses fechados do ano em curso. */
  closedSeasonTasks: number;
  /** `users.completedTasks` — vitalícia (DEC-219: a contagem vitalícia continua métrica de `vida`). */
  lifetimeTasks: number;
  /** `users.coins` — saldo vitalício da loja. */
  coins: number;
  workSessionsCount: number;
  projectsCount: number;
  averageWeeklyHours: number;
  maxConsecutiveDays: number;
}

/** As métricas resolvíveis numa janela. Campo ausente é "esta janela não mede isto". */
export interface TrophyWindowMetrics {
  window: TrophyCriterionWindow;
  points?: number;
  tasks?: number;
  xp?: number;
  coins?: number;
  workSessions?: number;
  projects?: number;
  weeklyHours?: number;
  consecutiveDays?: number;
}

/**
 * A métrica da janela, resolvida pelo domínio. A temporada é `meses fechados + mês em curso`: o
 * `month_history` só é escrito no fechamento (V8-2), e uma janela que ignorasse o mês em curso
 * estaria sempre um mês atrasada.
 */
export function trophyMetricsForWindow(facts: TrophyFacts, window: TrophyCriterionWindow): TrophyWindowMetrics {
  if (window === "mes") {
    return { window, points: facts.monthPoints, tasks: facts.monthTasks };
  }
  if (window === "temporada") {
    return {
      window,
      points: facts.closedSeasonPoints + facts.monthPoints,
      tasks: facts.closedSeasonTasks + facts.monthTasks,
      xp: facts.seasonXp,
    };
  }
  return {
    window,
    tasks: facts.lifetimeTasks,
    coins: facts.coins,
    workSessions: facts.workSessionsCount,
    projects: facts.projectsCount,
    weeklyHours: facts.averageWeeklyHours,
    consecutiveDays: facts.maxConsecutiveDays,
  };
}

/**
 * As janelas que medem o MÊS EM CURSO e as que medem o ANO FECHADO. Mesma tabela de
 * `trophyMetricsForWindow`: `mes` e `temporada` somam o mês que ainda não fechou (o `month_history`
 * só é escrito no fechamento — uma janela que ignorasse o mês em curso estaria sempre um mês
 * atrasada), e `vida` não soma nada disso.
 *
 * Nomeado no domínio para o use case deixar de escrever os tokens (a lição medida da DEC-95/96:
 * vocabulário em uma fonte só — uma cópia `"mes"` no application layer é a segunda régua, e o `tsc`
 * não vê quando ela diverge). O guarda `trophy-window-guard.test.ts` confere estas listas contra a
 * composição das métricas, para que não virem uma tabela paralela.
 */
export const MONTH_TASK_WINDOWS: readonly TrophyCriterionWindow[] = ["mes", "temporada"];
export const CLOSED_SEASON_WINDOWS: readonly TrophyCriterionWindow[] = ["temporada"];

/** O que a avaliação dos troféus precisa LER para as janelas que existem no catálogo ativo. */
export interface TrophyFactReads {
  needsMonthTasks: boolean;
  needsClosedSeason: boolean;
}

export function trophyFactReadsFor(windows: Iterable<TrophyCriterionWindow>): TrophyFactReads {
  const set = new Set(windows);
  return {
    needsMonthTasks: MONTH_TASK_WINDOWS.some((window) => set.has(window)),
    needsClosedSeason: CLOSED_SEASON_WINDOWS.some((window) => set.has(window)),
  };
}

/** Resumo de usuario exigido pelas condicoes "primeiro ... 100". */
export interface UserRankEntry {
  id: number;
  points: number;
  completedTasks: number;
}

export interface BadgeCriteriaContext {
  userId: number;
  criteria: BadgeCriteria | null | undefined;
  /** As métricas da janela do critério (resolvidas por `trophyMetricsForWindow`). */
  metrics: TrophyWindowMetrics;
  roles: string[];
  weekHours: number;
  /** Todos os usuarios (para as condicoes de unicidade "primeiro ... 100"). */
  allUsers: UserRankEntry[];
}

/**
 * O critério avaliado. `false` nos três casos de critério que não se pode confiar: ausente, com
 * chave fora do vocabulário, ou que pede uma métrica que a janela não mede (um critério gravado
 * antes da V8-6, por exemplo). Conceder por "não entendi" é o exato QUIRK que a DEC-219 enterrou.
 */
export function badgeCriteriaMet(context: BadgeCriteriaContext): boolean {
  const { criteria, metrics } = context;
  if (!criteria) return false;

  const window = criteria.window ?? DEFAULT_TROPHY_CRITERION_WINDOW;
  if (!isTrophyCriterionWindow(window)) return false;

  let thresholds = 0;

  for (const [key, value] of Object.entries(criteria)) {
    if (key === "window" || key === "specialCondition") continue;
    if (!(TROPHY_CRITERION_FIELDS as readonly string[]).includes(key)) return false;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;

    const measured = metricOf(metrics, key);
    if (measured === null) return false;
    // DEC-219: o critério 0 é AVALIADO — 0 é limiar, não ausência. A diferença prática é o negativo:
    // um placar mensal de -50 (DEC-39: premiação sem piso) não passa num "pontos >= 0" que a
    // checagem ignorada deixava passar.
    if (measured < value) return false;
    thresholds += 1;
  }

  if (criteria.specialCondition !== undefined) {
    // AND dos dois lados: os limiares acima já passaram, e a condição decide o resto.
    return specialConditionMet({ ...context, window }, criteria.specialCondition);
  }

  // Limiar nenhum e condição nenhuma: não concede. (A criação recusa esse critério; aqui é a defesa
  // do catálogo que já estava gravado.)
  return thresholds > 0;
}

type NumericMetric = "points" | "tasks" | "xp" | "coins" | "workSessions" | "projects" | "weeklyHours" | "consecutiveDays";

function metricOf(metrics: TrophyWindowMetrics, key: string): number | null {
  const value = metrics[key as NumericMetric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * As condições especiais, na forma fechada (DEC-219). O texto continua casado porsubstring — é
 * como o catálogo legado está gravado — mas a diferença é o fim: o que não é reconhecido devolve
 * FALSE (era o QUIRK-6C: devolvia true) e o que pede uma métrica que a janela não tem também.
 */
function specialConditionMet(
  context: BadgeCriteriaContext & { window: TrophyCriterionWindow },
  condition: string,
): boolean {
  const { userId, metrics, roles, weekHours, allUsers } = context;
  const text = condition.toLowerCase();

  // As condições de unicidade comparam TODOS com a MESMA métrica, e o que a lista de rank entrega é
  // o placar do mês corrente (`points`) e a contagem vitalícia (`completedTasks`). Uma condição que
  // pede unicidade sobre uma métrica diferente da que a lista carrega não fecha: era o modo de falha
  // de casar "primeiro a ter 100 pontos" de temporada contra o placar mensal de cada pessoa — a
  // comparação passaria com uma métrica que não é a declarada (DEC-219).
  if (text.includes("primeiro") && text.includes("100")) {
    if (text.includes("tarefas")) {
      if (metrics.window !== "vida") return false;
      const mine = metricOf(metrics, "tasks");
      if (mine === null || mine < 100) return false;
      const with100 = allUsers.filter((user) => user.completedTasks >= 100);
      return with100.length === 1 && with100[0].id === userId;
    }

    if (text.includes("pontos")) {
      if (metrics.window !== "mes") return false;
      const mine = metricOf(metrics, "points");
      if (mine === null || mine < 100) return false;
      const with100 = allUsers.filter((user) => user.points >= 100);
      return with100.length === 1 && with100[0].id === userId;
    }

    return false;
  }

  if (text.includes("semana perfeita")) {
    const average = metricOf(metrics, "weeklyHours");
    if (average === null) return false;
    return average >= weekHours;
  }

  if (text.includes("sequência") && text.includes("dias")) {
    const streak = metricOf(metrics, "consecutiveDays");
    if (streak === null) return false;
    return streak >= 7;
  }

  if (text.includes("coordenador")) return roles.includes("COORDENADOR");
  if (text.includes("gerente")) return roles.includes("GERENTE");

  // QUIRK-6C consertado (DEC-219): condição desconhecida não concede.
  return false;
}

/**
 * evaluateUserForBadges como DECISAO pura: quais troféus a pessoa ainda não tem e cujos critérios
 * estão atingidos. A persistência (e o try/catch com console.error do caminho legado) fica no
 * EvaluateUserBadgesUseCase.
 *
 * Cada troféu é avaliado com as métricas da SUA janela — a mesma pessoa pode ter um troféu de mês
 * pronto e um de vida ainda longe.
 */
export function selectBadgesToAward(input: {
  badges: Badge[];
  earnedBadgeIds: number[];
  userId: number;
  facts: TrophyFacts;
  roles: string[];
  weekHours: number;
  allUsers: UserRankEntry[];
}): Badge[] {
  const metricsByWindow = new Map<TrophyCriterionWindow, TrophyWindowMetrics>();
  const metricsFor = (window: TrophyCriterionWindow) => {
    const cached = metricsByWindow.get(window);
    if (cached) return cached;
    const resolved = trophyMetricsForWindow(input.facts, window);
    metricsByWindow.set(window, resolved);
    return resolved;
  };

  const newlyEarned: Badge[] = [];

  for (const badge of input.badges) {
    if (badge.id === undefined || input.earnedBadgeIds.includes(badge.id)) {
      continue;
    }

    const window = badge.criteria?.window ?? DEFAULT_TROPHY_CRITERION_WINDOW;

    if (
      badgeCriteriaMet({
        userId: input.userId,
        criteria: badge.criteria,
        metrics: metricsFor(isTrophyCriterionWindow(window) ? window : DEFAULT_TROPHY_CRITERION_WINDOW),
        roles: input.roles,
        weekHours: input.weekHours,
        allUsers: input.allUsers,
      })
    ) {
      newlyEarned.push(badge);
    }
  }

  return newlyEarned;
}

/** streak maximo de daily_logs — frozen golden (comeca em 1, gap reseta, Math.ceil). */
export function maxConsecutiveDaysFrom(dates: Date[]): number {
  const ordered = [...dates].sort((a, b) => a.getTime() - b.getTime());
  if (ordered.length === 0) {
    return 0;
  }

  let maxConsecutive = 0;
  let currentConsecutive = 1;

  for (let i = 1; i < ordered.length; i++) {
    const diffTime = ordered[i].getTime() - ordered[i - 1].getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentConsecutive++;
    } else {
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      currentConsecutive = 1;
    }
  }

  return Math.max(maxConsecutive, currentConsecutive);
}

/**
 * Media das amostras semanais (as amostras ja vem recortadas em "4 mais recentes"
 * pela porta — query congelada pelo golden: orderBy weekStart desc, take 4).
 */
export function averageWeeklyHoursFrom(samples: Array<{ totalHours: number }>): number {
  if (samples.length === 0) {
    return 0;
  }
  const totalHours = samples.reduce((sum, week) => sum + week.totalHours, 0);
  return totalHours / samples.length;
}

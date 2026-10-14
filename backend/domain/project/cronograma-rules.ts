/**
 * Cronograma rules — a modelagem pura do cronograma de projeto (V5-5, DEC-103/DEC-126/DEC-151).
 *
 * De onde isso vem: a brochura oficial do projeto de pesquisa (`docs/Projeto/`, seção 15) traz o
 * cronograma em duas formas que dizem a mesma coisa:
 *
 *   Etapas | Descrição da Atividade | Total em Meses      (Etapa 1 … Etapa 6, 2, 2, 3, 8, 5, 10)
 *   (Marque com X os meses correspondentes às Atividades)  grade Atividades × meses 1..12
 *
 * O DEC-126 escolheu a SEGUNDA forma como autoridade: a pessoa marca meses numa grade, e a
 * duração é a contagem das marcas. Não existe meia-mês — ceil, floor e proporcional morreram
 * naquela decisão. Consequência direta: a linha da atividade é um intervalo contíguo de meses
 * (DEC-126d: "clicar num mês estende o intervalo a partir do primeiro marcado"), então
 * `firstMonth`/`lastMonth` chegam para descrever a linha inteira e o conjunto de marcas é
 * derivado, não guardado.
 *
 * Um mês civil é `"YYYY-MM"`. É a mesma natureza de `projects.startDate`/`tasks.dueDate`
 * (DEC-132): texto de calendário, nunca `Date`. `new Date("2026-10")` é 1º de outubro UTC e
 * `toLocaleDateString("pt-BR")` devolve 30/09 no fuso do laboratório — o erro que o plan-v3
 * fechou, reaberto em outra forma.
 *
 * A economia (prêmio, atraso, distribuição) não mora aqui: é `activity-rules.ts`, no V5-7.
 * Aqui só existe o que a grade precisa para existir: mês, intervalo, período derivado, ordem.
 */
import { ValidationError } from "../errors";
import { civilDayOfDate } from "../time/civil-day";

/** Vocabulário de status da atividade (DEC-76: duas fases, solicitar e aprovar). */
export const ACTIVITY_STATUSES = ["OPEN", "COMPLETION_REQUESTED", "DONE"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Rótulos da interface ao lado do token — lição da DEC-96, o componente não tem vocabulário próprio. */
export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  OPEN: "Aberta",
  COMPLETION_REQUESTED: "Conclusão solicitada",
  DONE: "Concluída",
};

/** A coluna nasce aberta; fechar é o que o fluxo do V5-7 faz. */
export const DEFAULT_ACTIVITY_STATUS: ActivityStatus = "OPEN";

/** DEC-103: base da atividade é 100 por mês marcado na grade. Escala própria, não a das tasks. */
export const ACTIVITY_REWARD_PER_MONTH = 100;

/** Mesmo teto da descrição de projeto (`project-rules.ts:198`): a linha do formulário oficial. */
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 500;
export const GOAL_DESCRIPTION_MAX_LENGTH = 500;

/**
 * DEC-151: sem datas no projeto, a grade abre uma janela de 12 meses a partir do mês atual —
 * que é exatamente a janela da brochura (1º ao 12º mês do ano do projeto).
 */
export const CRONOGRAMA_FALLBACK_MONTHS = 12;

/**
 * Teto de colunas. Não é política de edital, é usabilidade medida: a grade é uma tabela HTML
 * rolável, e um período digitado errado (`2000-01-01` a `2099-12-31`) produziria 1.200 colunas
 * na tela. O que passa deste teto continua gravado — o período da atividade é armazenado, não
 * derivado da janela — só deixa de ser editável pela grade.
 */
export const CRONOGRAMA_MAX_MONTH_COLUMNS = 60;

export const ACTIVITY_MONTH_MESSAGE = "Mês do cronograma é inválido (use AAAA-MM)";
export const ACTIVITY_PERIOD_MESSAGE = "O cronograma da atividade não pode terminar antes de começar";
export const ACTIVITY_DESCRIPTION_MESSAGE = `Descrição da atividade não pode ter mais de ${ACTIVITY_DESCRIPTION_MAX_LENGTH} caracteres`;
export const ACTIVITY_GOAL_MESSAGE = "Descrição da meta não pode ter mais de " + GOAL_DESCRIPTION_MAX_LENGTH + " caracteres";
export const ACTIVITY_GOAL_TARGET_MESSAGE = "Meta numérica deve ser um inteiro entre 1 e 9999";
export const ACTIVITY_STATUS_MESSAGE = "Status da atividade é inválido";
export const ACTIVITY_RESPONSIBLE_MESSAGE = "Responsável da atividade precisa participar do projeto";

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Chave de mês a partir de uma data civil. Aceita só data civil: instante não entra aqui porque
 * o cronograma é calendário, e a lição do DEC-132 é justamente não misturar os dois.
 */
export function monthKeyOfCivilDay(civilDay: string): string {
  const day = civilDayOfDate(civilDay);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new ValidationError(ACTIVITY_MONTH_MESSAGE);
  }
  return day.slice(0, 7);
}

/**
 * Normaliza a grafia de mês que chega da tela. `"2026-1"` (o `<input type="month">` devolve
 * assim em alguns navegadores) é aceito e completado; `"13/2026"` e `"2026-13"` são recusados
 * nomeando o campo, porque virar `2026-01` por tolerância mudaria o período e o prêmio.
 */
export function normalizeActivityMonth(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ValidationError(ACTIVITY_MONTH_MESSAGE);
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    throw new ValidationError(ACTIVITY_MONTH_MESSAGE);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new ValidationError(ACTIVITY_MONTH_MESSAGE);
  }
  return `${pad(year)}-${pad(month)}`;
}

export function isValidMonthKey(value: string): boolean {
  if (!MONTH_KEY_PATTERN.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

/** Desloca uma chave de mês. `addMonths("2026-01", -1)` é `2025-12` — aritmética de calendário, não de milissegundos. */
export function addMonths(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const absolute = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = absolute - nextYear * 12 + 1;
  return `${pad(nextYear)}-${pad(nextMonth)}`;
}

/** Meses inclusivos entre dois meses, ascendente. Mesma chave nos dois lados devolve um mês. */
export function monthKeysBetween(firstMonth: string, lastMonth: string): string[] {
  const months: string[] = [];
  let cursor = firstMonth;
  // Guarda de laço infinito: `lastMonth` antes de `firstMonth` é entrada inválida, e o contrato
  // de quem chama é validar antes — mas uma regra pura que trava a máquina é pior que uma que devolve vazio.
  for (let guard = 0; cursor <= lastMonth && guard <= CRONOGRAMA_MAX_MONTH_COLUMNS * 20; guard += 1) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** Primeiro dia civil do mês e último dia civil do mês — o período derivado da DEC-126(a). */
export function firstCivilDayOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

export function lastCivilDayOfMonth(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${pad(lastDay)}`;
}

export interface ActivityMonthRange {
  firstMonth: string;
  lastMonth: string;
}

/**
 * O clique na grade (DEC-126d). A linha é sempre um intervalo contíguo, sem buraco:
 *
 *   sem marca + mês            → marca aquele mês
 *   mês depois do último       → estende até ele            ("estende o intervalo a partir do primeiro marcado")
 *   mês antes do primeiro      → estende para trás
 *   mês entre primeiro e último → o mês clicado passa a ser o último
 *   mês igual ao último        → remove o último (e a marca única some)
 *
 * Não existe desmarcar um mês do meio: isso criaria o buraco que o DEC-126 não tem.
 */
export function toggleActivityMonthRange(
  current: ActivityMonthRange | null,
  monthKey: string,
): ActivityMonthRange | null {
  const month = normalizeActivityMonth(monthKey);
  if (current === null) {
    return { firstMonth: month, lastMonth: month };
  }

  const { firstMonth, lastMonth } = current;

  if (month > lastMonth) {
    return { firstMonth, lastMonth: month };
  }
  if (month < firstMonth) {
    return { firstMonth: month, lastMonth };
  }
  if (month === lastMonth) {
    if (firstMonth === lastMonth) return null;
    return { firstMonth, lastMonth: addMonths(lastMonth, -1) };
  }
  return { firstMonth, lastMonth: month };
}

/** Meses marcados = contagem inclusiva. É o "Total em Meses" da brochura. */
export function countActivityMonths(firstMonth: string, lastMonth: string): number {
  const first = normalizeActivityMonth(firstMonth);
  const last = normalizeActivityMonth(lastMonth);
  if (last < first) {
    throw new ValidationError(ACTIVITY_PERIOD_MESSAGE);
  }
  const span =
    (Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7))) -
    (Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)));
  return span + 1;
}

/** DEC-103: recompensa da linha = 100 × meses marcados. */
export function activityReward(firstMonth: string, lastMonth: string): number {
  return ACTIVITY_REWARD_PER_MONTH * countActivityMonths(firstMonth, lastMonth);
}

/**
 * DEC-126(a): período da atividade é do primeiro dia do primeiro mês marcado ao último dia do
 * último mês marcado. Derivado, nunca armazenado — é o que o atraso do V5-7 e a seleção
 * automática do V5-6 consultam.
 */
export function activityPeriod(
  firstMonth: string,
  lastMonth: string,
): { periodoInicio: string; periodoFim: string } {
  const first = normalizeActivityMonth(firstMonth);
  const last = normalizeActivityMonth(lastMonth);
  if (last < first) {
    throw new ValidationError(ACTIVITY_PERIOD_MESSAGE);
  }
  return { periodoInicio: firstCivilDayOfMonth(first), periodoFim: lastCivilDayOfMonth(last) };
}

/** V5-6 (regra 8 do plano): a atividade vigente é a cujo intervalo contém hoje. */
export function isActivityCurrent(
  range: ActivityMonthRange,
  todayCivilDay: string,
): boolean {
  const { periodoInicio, periodoFim } = activityPeriod(range.firstMonth, range.lastMonth);
  return todayCivilDay >= periodoInicio && todayCivilDay <= periodoFim;
}

export interface CronogramaWindowInput {
  /** `projects.startDate`/`endDate`, data civil ou nulos. */
  startDate: string | null;
  endDate: string | null;
  /** Data civil de hoje, sempre parâmetro (regra da casa: `now` nunca é lido dentro do domínio). */
  today: string;
  /** Intervalos já marcados no projeto: nenhuma marca pode ficar invisível na grade. */
  markedRanges?: ActivityMonthRange[];
}

/**
 * As colunas da grade (DEC-151): o período do projeto. Sem datas, 12 meses a partir do mês
 * atual. Com uma data só, a janela de 12 meses ancorada nela.
 *
 * A janela é depois alargada para cobrir toda marca existente: se o período do projeto for
 * editado depois, as marcas antigas continuam visíveis e editáveis. Sem isso, mudar uma data
 * do projeto faria uma linha do cronograma sumir da tela com os dados dela intactos no banco.
 */
export function cronogramaMonthColumns(input: CronogramaWindowInput): string[] {
  const startMonth = input.startDate ? monthKeyOfCivilDay(input.startDate) : null;
  const endMonth = input.endDate ? monthKeyOfCivilDay(input.endDate) : null;

  let first: string;
  let last: string;

  if (startMonth && endMonth) {
    first = startMonth <= endMonth ? startMonth : endMonth;
    last = startMonth <= endMonth ? endMonth : startMonth;
  } else if (startMonth) {
    first = startMonth;
    last = addMonths(startMonth, CRONOGRAMA_FALLBACK_MONTHS - 1);
  } else if (endMonth) {
    last = endMonth;
    first = addMonths(endMonth, -(CRONOGRAMA_FALLBACK_MONTHS - 1));
  } else {
    first = monthKeyOfCivilDay(input.today);
    last = addMonths(first, CRONOGRAMA_FALLBACK_MONTHS - 1);
  }

  for (const range of input.markedRanges ?? []) {
    if (range.firstMonth < first) first = range.firstMonth;
    if (range.lastMonth > last) last = range.lastMonth;
  }

  const months = monthKeysBetween(first, last);
  return months.length > CRONOGRAMA_MAX_MONTH_COLUMNS
    ? months.slice(0, CRONOGRAMA_MAX_MONTH_COLUMNS)
    : months;
}

/** Ordem da linha seguinte: a próxima livre (max + 1). A ordem é atribuída pelo servidor. */
export function nextCronogramaOrder(existingOrders: number[]): number {
  if (existingOrders.length === 0) return 1;
  return Math.max(...existingOrders) + 1;
}

// ---------------------------------------------------------------------------
// O passo de cronograma do wizard (DEC-100, regra 9 do plano)
// ---------------------------------------------------------------------------

export interface RawCronogramaGoal {
  description: unknown
  target?: unknown
}

export interface RawCronogramaActivity {
  description: unknown
  firstMonth: unknown
  lastMonth: unknown
  responsibleId?: unknown
}

export interface RawCronogramaInput {
  goals?: RawCronogramaGoal[]
  activities?: RawCronogramaActivity[]
}

export interface CronogramaSeedGoal {
  order: number
  target: number | null
  description: string
}

export interface CronogramaSeedActivity {
  order: number
  description: string
  responsibleId: number | null
  firstMonth: string
  lastMonth: string
}

export interface CronogramaSeed {
  goals: CronogramaSeedGoal[]
  activities: CronogramaSeedActivity[]
}

/**
 * Normaliza o passo opcional do wizard. `undefined`, listas vazias ou ausentes devolvem `null`:
 * é o "pular o passo", e o chamador segue exatamente a criação simples de antes (regra 9).
 *
 * A ordem é atribuída aqui, na ordem em que as linhas chegaram — a tela não manda número de
 * etapa. `allowedResponsibleIds` é o conjunto de quem VAI participar do projeto: na criação, o
 * próprio ator, o líder e os voluntários do passo de equipe. Ele é parâmetro porque a
 * participação ainda não existe no banco quando o projeto está nascendo.
 */
export function normalizeCronogramaSeed(
  input: RawCronogramaInput | undefined,
  allowedResponsibleIds: number[],
): CronogramaSeed | null {
  const rawGoals = Array.isArray(input?.goals) ? input!.goals! : [];
  const rawActivities = Array.isArray(input?.activities) ? input!.activities! : [];
  if (rawGoals.length === 0 && rawActivities.length === 0) {
    return null;
  }

  const allowed = new Set(allowedResponsibleIds);
  const goals: CronogramaSeedGoal[] = rawGoals.map((goal, index) => ({
    order: index + 1,
    target: normalizeGoalTarget(goal.target),
    description: normalizeGoalDescription(goal.description),
  }));

  const activities: CronogramaSeedActivity[] = rawActivities.map((activity, index) => {
    const description = normalizeActivityDescription(activity.description);
    const firstMonth = normalizeActivityMonth(activity.firstMonth);
    const lastMonth = normalizeActivityMonth(activity.lastMonth);
    activityPeriod(firstMonth, lastMonth);

    const responsibleId = normalizeActivityResponsibleId(activity.responsibleId);
    if (responsibleId !== null && !allowed.has(responsibleId)) {
      throw new ValidationError(ACTIVITY_RESPONSIBLE_MESSAGE);
    }

    return { order: index + 1, description, responsibleId, firstMonth, lastMonth };
  });

  return { goals, activities };
}

export function normalizeActivityDescription(value: unknown): string {
  const description = String(value ?? "").trim();
  if (description.length === 0) {
    throw new ValidationError("Descrição da atividade é obrigatória");
  }
  if (description.length > ACTIVITY_DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(ACTIVITY_DESCRIPTION_MESSAGE);
  }
  return description;
}

export function normalizeGoalDescription(value: unknown): string {
  const description = String(value ?? "").trim();
  if (description.length === 0) {
    throw new ValidationError("Descrição da meta é obrigatória");
  }
  if (description.length > GOAL_DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(ACTIVITY_GOAL_MESSAGE);
  }
  return description;
}

/**
 * A meta numérica é opcional (DEC-156): a brochura tem as duas formas de objetivo — os
 * OBJETIVOS ESPECÍFICOS são só texto ("Elaborar a revisão da literatura") e os ENTREGÁVEIS
 * quantitativos trazem número ("Artigo publicado em periódico 02"). Recusar número absurdo é
 * o mesmo critério do teto de carga do vínculo: acima disto é erro de digitação.
 */
export function normalizeGoalTarget(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const target = Number(value);
  if (!Number.isInteger(target) || target < 1 || target > 9999) {
    throw new ValidationError(ACTIVITY_GOAL_TARGET_MESSAGE);
  }
  return target;
}

/** O status não é escrevível pelo formulário: só o fluxo de solicitar/aprovar do V5-7 muda isso. */
export function normalizeActivityStatus(value: unknown): ActivityStatus {
  if (value === null || value === undefined || String(value).trim() === "") {
    return DEFAULT_ACTIVITY_STATUS;
  }
  const raw = String(value).trim().toUpperCase();
  if (!(ACTIVITY_STATUSES as readonly string[]).includes(raw)) {
    throw new ValidationError(ACTIVITY_STATUS_MESSAGE);
  }
  return raw as ActivityStatus;
}

/**
 * O responsável é opcional: `null`, ausente e string vazia significam "sem responsável" (a
 * coluna é nula por decisão). Um valor que não é id positivo é recusado nomeando o campo —
 * `responsibleId: "0"` não pode virar "sem responsável" por tolerância, porque zero é uma
 * escolha da tela, não a ausência dela.
 */
export function normalizeActivityResponsibleId(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Responsável da atividade é inválido");
  }
  return id;
}

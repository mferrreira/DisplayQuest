/**
 * backend/domain/gamification/monthly-cycle.ts — o ciclo mensal dos pontos (plan-v8 V8-2, DEC-212).
 *
 * A regra do dono é literal (MODELO §2): "todo mês a pontuação resete, mas que haja um histórico
 * de meses com o estado do quadro até o último dia do mês". O fechamento fotografa o saldo no
 * instante da run e a coluna vai a 0 — o snapshot guarda o negativo (DEC-39 sobrevive no
 * histórico), o mês novo começa limpo ("o mês perdoa, o histórico não apaga").
 *
 * Três regras puras, todas recebendo `now` por parâmetro (lição da DEC-132: regra nenhuma lê
 * `new Date()`), e todas ancoradas na MESMA aritmética de dia civil do laboratório
 * (`backend/domain/time/civil-day.ts`) — duas contas de "que mês é este" divergiriam na virada.
 *
 * O mês de um prêmio é o mês do crédito, não o da conclusão (MODELO mensal §4): a consequência cai
 * do desenho (o snapshot fotografa a coluna, e a coluna só muda por evento real), e por isso aqui
 * não há reatribuição retroativa nenhuma.
 */
import { civilDayOfInstant, startOfCivilDayInstant } from "@/backend/domain/time/civil-day";

/** Grafia da chave de mês civil: `2026-10`. É o que `month_history.month` guarda. */
export type MonthKey = string;

export const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * O mês que a run de fechamento fecha: o mês civil ANTERIOR ao instante da run, visto em
 * America/Sao_Paulo. A rotina roda dia 1 às 00:00 — depois do sweep das 23:59 do último dia, que
 * já persistiu o que tinha a persistir — então o mês a fotografar nunca é o mês do relógio no
 * instante da chamada.
 */
export function closingMonthOfInstant(instant: Date): MonthKey {
  const [year, month] = civilDayOfInstant(instant).split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 12));
  const previous = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() - 1, 1, 12));
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}`;
}

/**
 * O mês CIVIL EM CURSO do instante, visto em America/Sao_Paulo. Não é o mês que a rotina fecha
 * (`closingMonthOfInstant`): o fechamento fotografa o anterior, enquanto a janela `mes` de um
 * critério de troféu (DEC-219) mede o que a pessoa está fazendo agora — e o snapshot do mês em
 * curso ainda não existe, porque ele só nasce no fechamento.
 */
export function currentMonthOfInstant(instant: Date): MonthKey {
  const [year, month] = civilDayOfInstant(instant).split("-").map(Number);
  return `${year}-${pad(month)}`;
}

/**
 * Janela do mês em instantâneos UTC, meia-noite de America/Sao_Paulo nos dois cortes:
 * `[start, endExclusive)`. O corte é EXCLUSIVO de propósito — `completedAt` e companhia são
 * instântes, e uma tarefa concluída às 23:59:59 do último dia tem que entrar no mês.
 *
 * As duas pontas passam pela MESMA `startOfCivilDayInstant` que corta a limpeza do feed de
 * atividade (V6-11k): o meio-dia UTC de cada dia é o truque que faz o dia civil sair certo, e é a
 * mesma função nos dois lugares que impede duas contas de mês divergirem.
 */
export function monthWindow(month: MonthKey): { start: Date; endExclusive: Date } {
  if (!MONTH_KEY_PATTERN.test(month)) {
    throw new Error(`mês inválido: ${month} (esperado YYYY-MM)`);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: startOfCivilDayInstant(new Date(Date.UTC(year, monthNumber - 1, 1, 12))),
    endExclusive: startOfCivilDayInstant(new Date(Date.UTC(year, monthNumber, 1, 12))),
  };
}

/**
 * Quem ganha snapshot (audiência ampla, não só ativos — o precedente semanal usa
 * `findActiveUsers()` e o modelo mensal recusa essa seleção): todo usuário com saldo ≠ 0 **ou**
 * atividade no mês. Um suspenso com saldo no fechamento fecha histórico em vez de evaporar; um
 * cadastro sem saldo e sem atividade não ganha linha (e a coluna dele já está em 0).
 */
export function shouldSnapshotClosedMonth(input: { points: number; completedTasksOfMonth: number }): boolean {
  return input.points !== 0 || input.completedTasksOfMonth > 0;
}

/**
 * O que a coluna recebe no fechamento: sempre 0. O negativo guardado é o do snapshot, nunca o da
 * coluna — é a resposta da Q4 do modelo mensal ("o mês perdoa a dívida"), e o motivo pelo qual o
 * ranking volta a ser comparável todo mês.
 */
export const POINTS_AFTER_MONTH_CLOSE = 0;

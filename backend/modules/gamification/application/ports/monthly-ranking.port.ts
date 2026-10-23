import type { MonthKey } from "@/backend/domain/gamification";
import type { MonthWindowInstants } from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port";

/**
 * MonthlyRankingPort — plan-v8 V8-7 (DEC-220). A leitura do quadro do MÊS em curso.
 *
 * MODELO §3: "o ranking deixa de ser cumulativo desde sempre: cada mês é um quadro próprio". O que a
 * tela mostra, linha por linha:
 *   - `points` — o placar do mês em curso (a coluna `users.points`, que o fechamento zera);
 *   - `monthTasks` — as tarefas do mês em curso, contadas pelas DUAS famílias que creditam
 *     `users.completedTasks`, com as MESMAS condições do fechamento mensal (V8-2) e do critério de
 *     troféu (V8-6). O `month_history` do mês em curso NÃO existe (ele só nasce no fechamento), então
 *     o quadro do mês em curso lê a janela, não o snapshot;
 *   - `xp` / `coins` — as trilhas da temporada e vitalícia;
 *   - `trophiesEquipped` / `trophiesTotal` — os troféus conquistados e quantos estão equipados.
 *
 * O ELO não está nesta port de propósito: o degrau é derivado do `xp` pela escada (`elo-rules.ts`), a
 * mesma função que decide os slots do equip (V8-6) e que o read model da progressão reporta. Ler a
 * coluna `users.elo` aqui seria mostrar um degrau que pode não casar com os slots que a pessoa tem —
 * a coluna é a cópia que as escritas de XP mantêm e o livro fotografa, não a régua.
 *
 * A contagem de tarefas é feita em LOTE (dois `groupBy`), não pessoa a pessoa: o quadro é uma leitura
 * de tela, e uma query por pessoa o faria custar linearmente pelo cadastro. O lote não é uma segunda
 * régua: as condições das duas famílias são letra a letra as mesmas dos três adaptadores conferidos
 * por `trophy-window-guard.test.ts` (agora quatro), e `monthly-ranking-roundtrip` confere no banco
 * 5433 que o lote devolve o mesmo número que `UserStatsPort.countTasksCompletedSince` por pessoa.
 */

export interface MonthlyRankingRow {
  userId: number;
  name: string;
  avatar: string | null;
  /** A capa do 1º lugar entra no bloco do campeão (V5-3, DEC-137). */
  bannerKey: string | null;
  roles: string[];
  points: number;
  xp: number;
  coins: number;
  monthTasks: number;
  trophiesEquipped: number;
  trophiesTotal: number;
}

export interface MonthlyRankingMonth {
  /** `YYYY-MM` do mês em curso que o quadro mostra. */
  month: MonthKey;
  rows: MonthlyRankingRow[];
}

export interface MonthlyRankingPort {
  listRows(window: MonthWindowInstants): Promise<MonthlyRankingRow[]>;
}

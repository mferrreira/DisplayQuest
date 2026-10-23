import type { MonthKey } from "@/backend/domain/gamification";

/**
 * MonthlyPointsCyclePort — plan-v8 V8-2 (DEC-212). As leituras e as escritas que o fechamento
 * mensal precisa, na forma mínima: quem fecha, quantas tarefas a pessoa concluiu na janela, se o
 * mês já fechou para ela, e o par "snapshot + zeragem" numa única transação.
 *
 * O precedente da casa é o semanal (`ReportingDirectory` + `WeeklyHoursHistoryRepository` no
 * módulo reporting). A diferença é deliberada e é a razão deste arquivo existir: aqui o dedup é
 * contrato, não quirk. O semanal (QUIRK-7C) não deduplica; o mensal não pode herdar isso.
 */

export interface MonthlyPointsCandidate {
  userId: number;
  name: string;
  /** Saldo atual de `users.points` — o placar do mês corrente. */
  points: number;
}

export interface MonthWindowInstants {
  start: Date;
  endExclusive: Date;
}

export interface MonthSnapshotWrite {
  userId: number;
  /** `YYYY-MM` do mês que fechou. */
  month: MonthKey;
  /** O valor fotografado — pode ser negativo (DEC-39). */
  points: number;
  completedTasksOfMonth: number;
}

export interface MonthlyPointsCyclePort {
  /**
   * Todos os usuários, qualquer status — inclusive suspenso e pendente. A audiência do fechamento
   * é ampla de propósito: quem está suspenso no fechamento tem que fechar histórico, não evaporar
   * (o `findActiveUsers()` do semanal faria exatamente o contrário).
   */
  listAllUsersForClose(): Promise<MonthlyPointsCandidate[]>;

  /**
   * Tarefas da pessoa concluídas na janela. Duas famílias de evento, as mesmas duas que hoje
   * incrementam `users.completedTasks` (completeTask no caminho pública/global, approveTask no
   * caminho delegada): ver o adapter para o porquê de cada query.
   */
  countTasksCompletedInMonth(userId: number, window: MonthWindowInstants): Promise<number>;

  /** "Este mês já fechou para esta pessoa" — é a trava da idempotência, lida antes de zerar. */
  hasMonthSnapshot(userId: number, month: MonthKey): Promise<boolean>;

  /**
   * Snapshot + `users.points = 0` na MESMA transação (MODELO mensal §2: não existe estado em que o
   * mês está fechado e a coluna aberta, nem o inverso). Devolve `false` quando o mês já fechou — a
   * unique `(userId, month)` é quem diz, e o chamador não zera de novo.
   */
  closeMonth(write: MonthSnapshotWrite): Promise<boolean>;

  /**
   * V8-7 (DEC-220): o histórico mensal DA PESSOA — a memória que o ranking mensal perdeu ao virar
   * quadro de um mês só (MODELO §3). É esta port que lê `month_history`: uma port por tabela, para
   * o histórico da tela e a soma da temporada não virarem dois leitores com duas ordens próprias.
   * Mais recente primeiro; a pessoa que não tem linha não tem histórico (o livro registra o que
   * aconteceu, não um 0 por cadastro).
   */
  listMonthHistory(userId: number): Promise<MonthHistoryRow[]>;
}

/** Uma linha fotografada pelo fechamento. O negativo do snapshot está aqui (DEC-39 sobrevive). */
export interface MonthHistoryRow {
  month: MonthKey;
  points: number;
  completedTasks: number;
}

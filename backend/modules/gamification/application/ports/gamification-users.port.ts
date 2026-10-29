import type { UserRankEntry, MonthPointsAction } from "@/backend/domain";

/**
 * GamificationUsersPort — OND6-B2. Leitura de usuarios que a gamificacao precisa,
 * na forma MINIMA usada pelas regras (o gateway legado ia via UserRepository com
 * include completo de relacoes; aqui so as colunas que as regras leem).
 */

export interface GamificationUserRecord extends UserRankEntry {
  weekHours: number;
  roles: string[];
}

/** plan-v9 S05 (DEC-228) — payload do ajuste do placar do mes, ja resolvido pela regra pura. */
export interface AdjustMonthPointsData {
  userId: number;
  /** Placar do mes lido pela regra antes da escrita — vira o "de" da auditoria. */
  previous: number;
  /** Valor seguinte, saida da regra do dominio (decisao de set/add/remove ja aplicada). */
  next: number;
  /** Mes civil "AAAA-MM" ao qual o ajuste pertence (o corrente por definicao). */
  month: string;
  performedBy: number;
  description: string;
  detail: {
    action: MonthPointsAction;
    points: number;
    month: string;
  };
}

export interface GamificationUsersPort {
  /** select { id, points } — fonte do getUserProgression. */
  findProgressionById(userId: number): Promise<{ id: number; points: number } | null>;
  /** Leitura completa p/ avaliacao de badges (points, completedTasks, weekHours, roles). */
  findUserById(userId: number): Promise<GamificationUserRecord | null>;
  /** Todos os usuarios — exigido pelas condicoes "primeiro ... 100". */
  findAllUsers(): Promise<UserRankEntry[]>;
  /**
   * plan-v9 S05 (DEC-228): select mínimo do placar do mês corrente, para a regra do ajuste
   * decidir chão 0 (add) e suficiência (remove) ANTES de qualquer escrita.
   */
  findMonthPointsById(userId: number): Promise<{ id: number; currentMonthPoints: number } | null>;
  /**
   * plan-v9 S05 (DEC-228) — ajuste do placar do mês corrente com a linha de auditoria.
   *
   * Uma chamada só, uma escrita só: `users.update` da coluna do mês e `history.create` da
   * auditoria (quem/quando/de→para) entram no MESMO `$transaction`. O `previous` vem do use
   * case, que já aplicou a regra pura; o adaptador re-lê o valor dentro da transação e recusa
   * quando o banco não casa mais (a leitura ficou valsa entre a regra e a escrita) — a linha
   * de auditoria não pode anunciar um "de" que não existiu.
   */
  adjustMonthPoints(data: AdjustMonthPointsData): Promise<void>;
}


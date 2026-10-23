import type { UserRankEntry } from "@/backend/domain";

/**
 * GamificationUsersPort — OND6-B2. Leitura de usuarios que a gamificacao precisa,
 * na forma MINIMA usada pelas regras (o gateway legado ia via UserRepository com
 * include completo de relacoes; aqui so as colunas que as regras leem).
 */

export interface GamificationUserRecord extends UserRankEntry {
  weekHours: number;
  roles: string[];
  /** V8-6 (DEC-219): a janela `temporada` mede XP, e a `vida` mede moeda — as duas colunas passam
   *  a ser lidas pela avaliacao de trofeu. */
  xp: number;
  coins: number;
}

export interface GamificationUsersPort {
  /**
   * V8-6 (DEC-217): as trilhas que a progressao reporta — placar do mes, XP da temporada e moeda
   * vitalicia. O elo e derivado do XP pela escada (`elo-rules.ts`), nunca lido como verdade propria;
   * a coluna `users.elo` e a copia que o ranking le (V8-7), escrita pela mesma regra.
   */
  findProgressionById(userId: number): Promise<{ id: number; points: number; xp: number; coins: number } | null>;
  /** Leitura completa p/ avaliacao de badges (points, completedTasks, weekHours, roles, xp, coins). */
  findUserById(userId: number): Promise<GamificationUserRecord | null>;
  /** Todos os usuarios — exigido pelas condicoes "primeiro ... 100". */
  findAllUsers(): Promise<UserRankEntry[]>;
}

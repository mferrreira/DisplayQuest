import type { UserRankEntry } from "@/backend/domain";

/**
 * GamificationUsersPort — OND6-B2. Leitura de usuarios que a gamificacao precisa,
 * na forma MINIMA usada pelas regras (o gateway legado ia via UserRepository com
 * include completo de relacoes; aqui so as colunas que as regras leem).
 */

export interface GamificationUserRecord extends UserRankEntry {
  weekHours: number;
  roles: string[];
}

export interface GamificationUsersPort {
  /** select { id, points } — fonte do getUserProgression. */
  findProgressionById(userId: number): Promise<{ id: number; points: number } | null>;
  /** Leitura completa p/ avaliacao de badges (points, completedTasks, weekHours, roles). */
  findUserById(userId: number): Promise<GamificationUserRecord | null>;
  /** Todos os usuarios — exigido pelas condicoes "primeiro ... 100". */
  findAllUsers(): Promise<UserRankEntry[]>;
}

/**
 * Badge / UserBadge — pure domain contracts of the gamification aggregate (SPEC §4.5).
 *
 * Authored here: the type-only mirror source (`backend/models/Badge.ts`) was removed in D-2
 * (DEC-142), and this is the only Badge vocabulary in the codebase.
 *
 * plan-v8 V8-6 (DEC-218/219) re-significa o critério e acrescenta as duas coisas que a onda traz:
 *   - `criteria.window` — cada critério declara a janela que mede (`mes | temporada | vida`);
 *   - `effects` — a lista fechada de `{ verb, tier }` do boost (DEC-218), sem número livre;
 *   - `UserBadge.equipped` — conquistado é uma coisa, equipado é outra (DEC-218; a coluna entrou na
 *     V8-1 e a onda que a usa é esta).
 */

import type { TrophyEffect } from "@/backend/domain/gamification/trophy-effects";

export type BadgeCategory = "achievement" | "milestone" | "special" | "social";

/**
 * As três janelas de critério (DEC-219, MODELO §6 rodada 6): `mes` mede o mês em curso, `temporada`
 * mede o ano em curso, `vida` mede contadores vitalícios. Ausente é `vida` — é a janela que a data
 * migration da V8-1 escreveu no catálogo existente.
 */
export const TROPHY_CRITERION_WINDOWS = ["mes", "temporada", "vida"] as const;

export type TrophyCriterionWindow = (typeof TROPHY_CRITERION_WINDOWS)[number];

export const DEFAULT_TROPHY_CRITERION_WINDOW: TrophyCriterionWindow = "vida";

/**
 * O critério, na forma gravada em `badges.criteria` (Json, String-as-Json como `track`, DEC-141).
 * Cada campo é uma MÉTRICA, e a janela é quem diz qual trilha ela lê:
 *
 *   | campo            | `mes`                  | `temporada`               | `vida`                     |
 *   |------------------|------------------------|---------------------------|----------------------------|
 *   | `points`         | placar do mês corrente | soma dos pontos do ano    | — (não medível)            |
 *   | `tasks`          | tarefas do mês         | tarefas do ano            | `completedTasks` vitalícia |
 *   | `xp`             | —                      | XP da temporada           | —                          |
 *   | `coins`          | —                      | —                         | saldo de moeda             |
 *   | `workSessions`   | —                      | —                         | sessões concluídas         |
 *   | `projects`       | —                      | —                         | projetos                   |
 *   | `weeklyHours`    | —                      | —                         | média das 4 semanas novas  |
 *   | `consecutiveDays`| —                      | —                         | streak máximo de daily_log |
 *   | `specialCondition` | ver `badge-rules.ts` (as condições pedem a métrica da própria janela) | | | |
 *
 * Campo fora da janela é critério inválido — recusado na criação e tratado como "não concede" na
 * avaliação. É o que fecha a porta do critério que não media nada e concedia a todo mundo.
 */
export interface BadgeCriteria {
  window?: TrophyCriterionWindow;
  points?: number;
  tasks?: number;
  xp?: number;
  coins?: number;
  workSessions?: number;
  projects?: number;
  weeklyHours?: number;
  consecutiveDays?: number;
  specialCondition?: string;
}

export interface Badge {
  id?: number;
  name: string;
  description: string;
  icon?: string | null | undefined;
  color?: string | null | undefined;
  category: BadgeCategory;
  criteria?: BadgeCriteria | null;
  /** Efeitos equipáveis (DEC-218). Ausente é "troféu sem efeito". */
  effects?: TrophyEffect[] | null;
  isActive: boolean;
  createdAt?: Date;
  createdBy: number;
}

export interface UserBadge {
  id?: number;
  userId: number;
  badgeId: number;
  /**
   * DEC-218: a conquista é vitalícia (a unique `(userId, badgeId)` é a trava) e a pessoa escolhe
   * quais conquistados ficam ativos, no teto dos slots do elo do momento.
   */
  equipped?: boolean;
  earnedAt?: Date;
  earnedBy?: number | null;
}

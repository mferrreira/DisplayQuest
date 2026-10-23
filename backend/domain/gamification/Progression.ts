/**
 * Progressao da gamificacao — regras puras (OND6-B2, R1).
 *
 * Congeladas pelo golden OND6-B1 contra `PrismaGamificationGateway` (284 linhas):
 *   - pontos de sessao: 10 + min(40, floor(horas*10)) + min(30, tarefas*5), minimo 1;
 *   - pontos de task: default 10 em undefined/null, senao Math.floor (QUIRK: 0 => 0,
 *     sem clamp minimo — ao contrario do caminho de sessao);
 *   - idempotencia por DESCRICAO `GAMIFICATION:<sourceType>:<sourceId>` no history.
 *
 * plan-v8 V8-6 (DEC-217) tira desta arquivo a outra metade do que ele fazia: `xp = max(0, points)`,
 * `level = floor(xp/100)` e a escada de elo por faixa de points (0/700/1500/2500). MODELO §8 nomeia
 * essa derivação como o que sai do sistema: ela media pontos vitalícios numa trilha que a virada de
 * temporada zera, duplicava o nome "XP" com a trilha nova (`users.xp`, DEC-214) e não tinha
 * consumidor nenhum de UI. A dívida XP-DUPLICADO, medida na V8-3, fecha aqui.
 *
 * O que entra no lugar: a progressão DA TEMPORADA — placar do mês, XP da temporada, elo derivado do
 * XP pela escada `elo-rules.ts` (DEC-217), moeda vitalícia e os slots que o elo do momento abre.
 *
 * Pureza (RG-01): nenhuma porta, nenhum repo — os dados entram por argumento.
 */

import { eloForSeasonXp, trophySlotsForElo, type EloTier } from "@/backend/domain/gamification/elo-rules";

export type GamificationSourceType =
  | "WORK_SESSION_COMPLETED"
  | "TASK_COMPLETED"
  | "ACTIVITY_COMPLETED"
  | "MANUAL_ADJUSTMENT";

/**
 * As trilhas da pessoa, como a gamificação as reporta (V8-6). `points` é o placar DO MÊS (DEC-212),
 * `xp` é a trilha da temporada (DEC-214), `coins` é vitalícia (DEC-215) e `elo` é a escada da
 * temporada lida do XP (DEC-217). `trophySlots` é o teto de troféus equipados do elo do momento.
 */
export interface UserProgression {
  userId: number;
  points: number;
  xp: number;
  coins: number;
  elo: EloTier;
  trophySlots: number;
}

/** Chave de idempotencia do award (history.description) — frozen golden. */
export function buildAwardDescription(sourceType: GamificationSourceType, sourceId: number): string {
  return `GAMIFICATION:${sourceType}:${sourceId}`;
}

/** Pontos de uma sessao concluida — frozen golden (teto 40h-bonus / 30-task-bonus). */
export function workSessionAwardPoints(durationSeconds?: number | null, completedTaskIds?: number[]): number {
  const durationHours = Math.max(0, (durationSeconds || 0) / 3600);
  const durationBonus = Math.min(40, Math.floor(durationHours * 10));
  const taskBonus = Math.min(30, (completedTaskIds?.length || 0) * 5);
  const basePoints = 10;
  return Math.max(1, basePoints + durationBonus + taskBonus);
}

/** Pontos de uma task concluida — frozen golden (default 10; Math.floor; 0 => 0). */
export function taskAwardPoints(taskPoints?: number | null): number {
  return taskPoints === undefined || taskPoints === null ? 10 : Math.floor(taskPoints);
}

/**
 * A progressão observável, derivada das trilhas lidas. O elo é DERIVADO do XP — nunca lido como
 * verdade própria: `users.elo` é a coluna que os eventos escrevem com esta mesma função (para o
 * ranking ler sem re-aritmética), e o read model reporta o que a regra diz. As duas são o mesmo
 * número enquanto toda escrita de XP recomputa o elo na mesma transação, e o roundtrip da onda
 * confere isso no banco.
 */
export interface SeasonProgressionInput {
  userId: number;
  points: number;
  xp: number;
  coins: number;
}

export function computeSeasonProgression(input: SeasonProgressionInput): UserProgression {
  const xp = Number.isFinite(input.xp) ? Math.max(0, input.xp) : 0;
  const elo = eloForSeasonXp(xp);
  return {
    userId: input.userId,
    points: input.points,
    xp,
    coins: Number.isFinite(input.coins) ? input.coins : 0,
    elo,
    trophySlots: trophySlotsForElo(elo),
  };
}

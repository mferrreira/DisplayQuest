/**
 * Progressao da gamificacao — regras puras (OND6-B2, R1).
 *
 * Congeladas pelo golden OND6-B1 contra `PrismaGamificationGateway` (284 linhas):
 *   - pontos de sessao: 10 + min(40, floor(horas*10)) + min(30, tarefas*5), minimo 1;
 *   - pontos de task: default 10 em undefined/null, senao Math.floor (QUIRK: 0 => 0,
 *     sem clamp minimo — ao contrario do caminho de sessao);
 *   - idempotencia por DESCRICAO `GAMIFICATION:<sourceType>:<sourceId>` no history;
 *   - level = floor(xp/100), nextLevelXp = (level+1)*100, progress = xp%100,
 *     xp = max(0, points) mas `points` reportado cru;
 *   - elo por faixa: 0 BRONZE / 700 PRATA / 1500 OURO / 2500 DIAMANTE.
 *
 * Pureza (RG-01): nenhuma porta, nenhum repo — os dados entram por argumento.
 */

export type GamificationSourceType = "WORK_SESSION_COMPLETED" | "TASK_COMPLETED" | "MANUAL_ADJUSTMENT";

export interface UserProgression {
  userId: number;
  points: number;
  xp: number;
  level: number;
  elo: string;
  nextLevelXp: number;
  progressToNextLevel: number;
}

export const LEVEL_XP_STEP = 100;

export const ELO_THRESHOLDS: ReadonlyArray<{ min: number; elo: string }> = [
  { min: 2500, elo: "DIAMANTE" },
  { min: 1500, elo: "OURO" },
  { min: 700, elo: "PRATA" },
  { min: 0, elo: "BRONZE" },
];

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

export function levelForXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / LEVEL_XP_STEP);
}

export function eloForXp(xp: number): string {
  const normalizedXp = Math.max(0, xp);
  const band = ELO_THRESHOLDS.find((entry) => normalizedXp >= entry.min);
  return band?.elo || "BRONZE";
}

/** Progressao observavel (getUserProgression) — frozen golden, inclusive o clamp de NaN. */
export function computeUserProgression(userId: number, points: number): UserProgression {
  const xp = Math.max(0, points);
  const level = levelForXp(xp);
  const nextLevelXp = (level + 1) * LEVEL_XP_STEP;
  const previousLevelXp = level * LEVEL_XP_STEP;
  const progressToNextLevel = Math.min(
    100,
    Math.floor(((xp - previousLevelXp) / (nextLevelXp - previousLevelXp)) * 100),
  );

  return {
    userId,
    points,
    xp,
    level,
    elo: eloForXp(xp),
    nextLevelXp,
    progressToNextLevel: Number.isFinite(progressToNextLevel) ? Math.max(0, progressToNextLevel) : 0,
  };
}

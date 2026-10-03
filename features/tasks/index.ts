/**
 * features/tasks — public API.
 * Cross-feature consumers MUST import from here (constitution A2), never from internals.
 */
export { useTasks, useTaskMutations, useInvalidateTaskGraph } from "./hooks/use-tasks"
export {
  resolveMove,
  allowedTargets,
  optimisticStatusFor,
  isArchivedTask,
  isTaskOverdue,
  isTaskDueToday,
  sortTasksByUrgencyAndDueDate,
  PRIORITY_RANK,
  latePenalty,
  projectedAward,
  parseBacklogLines,
  BOARD_COLUMNS,
  TASK_STATUSES,
  ARCHIVE_AFTER_DAYS,
} from "./utils/move-rules"
export type { MoveDecision, ParsedBacklogLine } from "./utils/move-rules"
/**
 * plan-v3 OND1-C: a premiação é regra do domínio, não da feature. Re-exportada aqui para que
 * componente nenhum precise conhecer caminho interno do backend (constituição A2) — mesmo
 * padrão de `lib/auth/features.ts`.
 */
export { POINTS_PER_TASK } from "@/backend/domain"

/**
 * features/tasks — public API.
 * Cross-feature consumers MUST import from here (constitution A2), never from internals.
 */
export { useTasks, useTaskMutations, useInvalidateTaskGraph } from "./hooks/use-tasks"
export {
  resolveMove,
  optimisticStatusFor,
  isArchivedTask,
  isTaskOverdue,
  isTaskDueToday,
  latePenalty,
  projectedAward,
  parseBacklogLines,
  BOARD_COLUMNS,
  TASK_STATUSES,
  ARCHIVE_AFTER_DAYS,
} from "./utils/move-rules"
export type { MoveDecision, ParsedBacklogLine } from "./utils/move-rules"

/**
 * features/tasks — public API.
 * Cross-feature consumers MUST import from here (constitution A2), never from internals.
 */
export { useTasks, useTaskMutations, useInvalidateTaskGraph } from "./hooks/use-tasks"
export {
  resolveMove,
  allowedTargets,
  moveBlockedMessage,
  completionAwardMessage,
  openSubtasksOf,
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
 * plan-v3 OND3-C: ordenação por coluna + chave da preferência. `urgencia` delega ao
 * `sortTasksByUrgencyAndDueDate` de dentro, então quem importa daqui não precisa saber qual das
 * duas funções ordena o quadro.
 */
export {
  COLUMN_ORDERS,
  DEFAULT_COLUMN_ORDER,
  columnOrderStorageKey,
  columnOrderTitle,
  defaultColumnOrders,
  isColumnOrder,
  sortTasksByColumnOrder,
} from "./utils/column-order"
export type { ColumnOrder } from "./utils/column-order"
/**
 * plan-v3 OND1-C: a premiação é regra do domínio, não da feature. Re-exportada aqui para que
 * componente nenhum precise conhecer caminho interno do backend (constituição A2) — mesmo
 * padrão de `lib/auth/features.ts`.
 */
/**
 * plan-v4 · V4-5 — mesma regra, mesma origem. O cartão e o diálogo de detalhe precisam dizer a
 * MESMA frase que a rota real diz (trava e janela), então o vocabulário de subtask entra pela API
 * pública da feature em vez de cada componente importar o caminho interno do backend.
 */
export {
  POINTS_PER_TASK,
  openSubtasksCount,
  openSubtasksMessage,
  subtaskWindowMessage,
  supportsSubtasks,
  SUBTASK_EDITABLE_STATUSES,
  SUBTASK_TITLE_MAX_LENGTH,
} from "@/backend/domain"

/**
 * Task — pure domain contract of the task aggregate (SPEC §4.5, AC-00-01).
 *
 * BATCH 0.4 FINDING (recorded in STATE.json): the HTTP routes read these contracts as
 * `task.toJSON()`. A data-only interface therefore is NOT the same shape the ports expose
 * today, and AGENT.md §5 forbids changing the shape of what a consumer reads. `Task` here is
 * therefore the DATA plus the serialisation the adapters already rely on; `ITask` stays the
 * plain input shape. `toJSON(): any` mirrors `backend/models/Task.ts` verbatim — OND4-B2/B4
 * replace it with a real read model instead of quietly widening the contract further.
 */
import type { TaskStatus } from "./TaskStatus";
import type { TaskVisibility } from "./TaskVisibility";
import type { ISubtask } from "./subtask-rules";

/** `tasks.priority` is a plain String column; these are the values the backend writes. */
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface ITask {
  id?: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: number | null;
  assigneeIds?: number[];
  projectId?: number | null;
  dueDate?: string | null;
  points: number;
  completed: boolean;
  completedAt?: Date | string | null;
  taskVisibility: TaskVisibility;
  isGlobal?: boolean;
  groupTaskId?: number | null;
  createdBy?: number | null;
  /**
   * plan-v4 · V4-4 — as subtasks da tarefa (DEC-78). É um read model, não uma coluna: o
   * adaptador Prisma escreve `tasks` sem tocar aqui (ver `toRow` em
   * `prisma-task.repository.ts`) e quem preenche é o caso de uso, pela `TaskSubtasksPort`.
   */
  subtasks?: ISubtask[];
}

/** What the ports return: the data plus the serialisation the route adapters call. */
export interface Task extends ITask {
  toJSON(): any;
}

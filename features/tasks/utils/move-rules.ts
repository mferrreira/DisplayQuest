/**
 * Pure task-board rules (E2/T2.3) — unit-test target.
 * Mirrors backend authority (task-service.gateway.ts) for DISPLAY decisions only:
 * the server remains the enforcer; these functions decide optimistic UI + which call to fire.
 */
import type { Task, TaskStatus } from "@/entities/task";

export const TASK_STATUSES: TaskStatus[] = ["to-do", "in-progress", "in-review", "adjust", "done"];

export const BOARD_COLUMNS: Array<{ id: TaskStatus; title: string }> = [
  { id: "to-do", title: "A Fazer" },
  { id: "in-progress", title: "Em Andamento" },
  { id: "in-review", title: "Em Revisão" },
  { id: "adjust", title: "Ajustes" },
  { id: "done", title: "Concluído" },
];

/** Legacy parity kanban-board.tsx:137 — "leader" = MANAGE_TASKS holders. */
export type MoveDecision =
  | { kind: "blocked"; reason: "done-is-terminal-for-non-leaders" }
  | { kind: "remap-to-review" }
  | { kind: "complete"; status: "done" }
  | { kind: "status-update"; status: TaskStatus };

/**
 * Resolve what a drag/menu move means BEFORE calling the API.
 * - Non-leaders cannot move tasks OUT of done (legacy :139–146).
 * - Non-leaders moving TO done on a delegated/private task → remap to in-review (:164).
 * - done on public/global (or by leader) → completeTask (server decides done vs review,
 *   but optimistic state shows done for public/global, in-review otherwise — gateway :401).
 */
export function resolveMove(params: {
  task: Pick<Task, "taskVisibility" | "isGlobal" | "status">;
  target: TaskStatus;
  isLeader: boolean;
}): MoveDecision {
  const { task, target, isLeader } = params;

  if (task.status === "done" && target !== "done" && !isLeader) {
    return { kind: "blocked", reason: "done-is-terminal-for-non-leaders" };
  }

  if (target === "done") {
    if (!isLeader && task.taskVisibility !== "public" && !task.isGlobal) {
      return { kind: "remap-to-review" };
    }
    return { kind: "complete", status: "done" };
  }

  return { kind: "status-update", status: target };
}

/** Optimistic status the board should show for a move (before/without server confirm). */
export function optimisticStatusFor(decision: MoveDecision, task: Pick<Task, "taskVisibility" | "isGlobal">): TaskStatus {
  switch (decision.kind) {
    case "blocked":
      return "done";
    case "remap-to-review":
      return "in-review";
    case "complete":
      return task.isGlobal || task.taskVisibility === "public" ? "done" : "in-review";
    case "status-update":
      return decision.status;
  }
}

// ---- archive (legacy :95–109 parity) ----
export const ARCHIVE_AFTER_DAYS = 7;

export function isArchivedTask(
  task: Task,
  now: Date = new Date(),
): boolean {
  if (task.status !== "done" || !task.completed) return false;
  const reference = task.completedAt ?? task.dueDate;
  if (!reference) return false;
  const date = new Date(reference);
  if (Number.isNaN(date.getTime())) return false;
  const threshold = now.getTime() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return date.getTime() < threshold;
}

// ---- overdue + penalty display ----
export function isTaskOverdue(task: Task, now: Date = new Date()): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const dayOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return dayOf(due) < dayOf(now);
}

/**
 * True when a non-done task has a dueDate on the current calendar day (local time).
 */
export function isTaskDueToday(task: Task, now: Date = new Date()): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const d = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return d(due) === d(now);
}

/** Gateway :593–607 — display-side mirror of the server's penalty math. */
export function latePenalty(task: Pick<Task, "dueDate" | "points">, completion: Date = new Date()): number {
  if (!task.dueDate) return 0;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  const daysLate = Math.ceil((completion.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
  if (daysLate <= 0) return 0;
  return daysLate * task.points;
}

/** Points the actor would receive if completed now (can be ≤ 0). */
export function projectedAward(task: Pick<Task, "dueDate" | "points">, now: Date = new Date()): number {
  return task.points - latePenalty(task, now);
}

// ---- backlog parser (legacy backlog-dialog parity) ----
/**
 * One task per line. Optional prefixes: `!alta`/`!media`/`!baixa`/`!urgente` set priority,
 * `@pontos` (integer) sets points. Everything else is the title.
 */
export interface ParsedBacklogLine {
  title: string;
  priority: Task["priority"];
  points: number;
  dueDate: string | null; // ISO date string (YYYY-MM-DD) or null
}

/** Parse #dd/mm or #dd/mm/yyyy into YYYY-MM-DD. Returns null on invalid. */
function parseDateToken(token: string): string | null {
  const m = token.match(/^#(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getDate() !== day || date.getMonth() !== month - 1) return null; // overflow check
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseBacklogLines(raw: string): ParsedBacklogLine[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let priority: Task["priority"] = "medium";
      let points = 0;
      let dueDate: string | null = null;
      let title = line;

      const dateMatch = title.match(/\s#(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\b/);
      if (dateMatch) {
        const parsed = parseDateToken(`#${dateMatch[1]}`);
        if (parsed) {
          dueDate = parsed;
          title = title.replace(dateMatch[0], "");
        }
      }

      const pointsMatch = title.match(/\s@(\d+)\b/);
      if (pointsMatch) {
        points = Number(pointsMatch[1]);
        title = title.replace(pointsMatch[0], "");
      }
      const priorityMatch = title.match(/\s!(alta|media|média|baixa|urgente)\b/i);
      if (priorityMatch) {
        const p = priorityMatch[1].toLowerCase();
        priority = p === "alta" ? "high" : p === "baixa" ? "low" : p === "urgente" ? "urgent" : "medium";
        title = title.replace(priorityMatch[0], "");
      }
      return { title: title.trim(), priority, points, dueDate };
    })
    .filter((t) => t.title.length > 0);
}

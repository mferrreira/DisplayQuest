/**
 * Pure task-board rules (E2/T2.3) — unit-test target.
 * Mirrors backend authority (task-service.gateway.ts) for DISPLAY decisions only:
 * the server remains the enforcer; these functions decide optimistic UI + which call to fire.
 */
import type { Task, TaskStatus } from "@/entities/task";
import { awardPointsForCompletion, calculateLatePenalty } from "@/backend/domain";

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

import { isOverdueDateOnly, isDueTodayDateOnly } from "@/lib/date-only"

/** Urgency rank — `urgent` first, `low` last. Used by sortTasksByUrgencyAndDueDate. */
export const PRIORITY_RANK: Record<Task["priority"], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Sort board tasks by urgency (priority) then by due date (earliest first).
 * Tasks without a dueDate sink to the bottom of their urgency group;
 * ties fall back to newest-first (repository `orderBy id desc` parity).
 */
export function sortTasksByUrgencyAndDueDate<T extends Pick<Task, "priority" | "dueDate" | "id">>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const byUrgency = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byUrgency !== 0) return byUrgency;
    const aDue = a.dueDate;
    const bDue = b.dueDate;
    if (aDue != null && bDue != null) {
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return b.id - a.id; // same date — newest first
    }
    if (aDue != null) return -1;
    if (bDue != null) return 1;
    return b.id - a.id; // no due dates — newest first
  });
}

export function isTaskOverdue(task: Task, _now?: Date): boolean {
  if (!task.dueDate || task.status === "done") return false;
  return isOverdueDateOnly(task.dueDate);
}

/**
 * True when a non-done task has a dueDate on the current calendar day (local time).
 */
export function isTaskDueToday(task: Task, _now?: Date): boolean {
  if (!task.dueDate || task.status === "done") return false;
  return isDueTodayDateOnly(task.dueDate);
}

/**
 * plan-v3 OND1-C — o espelho de exibição **deixou de ter matemática própria**.
 *
 * Antes, esta função replicava a penalidade do servidor ancorando `dueDate` date-only no
 * **meio-dia local**, enquanto o backend ancorava na meia-noite UTC. As duas contas davam
 * números diferentes para a mesma tarefa e o mesmo instante: no dia do prazo, às 02h e 08h de
 * Brasília o cartão mostrava 10 pontos e o servidor creditava 0 (divergência R5, pinada em
 * `tests/unit/modules/task-management/domain.points-characterization.test.ts`).
 *
 * Agora há uma aritmética só: `backend/domain/task/points-rules.ts`. Importar o domínio puro
 * daqui é permitido pelo gate (RG-05 só veda Prisma e `lib/database/prisma`) e já é padrão da
 * casa (`lib/api/domain-error-response.ts`, `lib/auth/features.ts`).
 */
export function latePenalty(task: Pick<Task, "dueDate">, completion: Date = new Date()): number {
  return calculateLatePenalty(task, completion);
}

/** Pontos que a pessoa receberia se concluí agora (pode ser ≤ 0 — DEC-39). */
export function projectedAward(task: Pick<Task, "dueDate">, now: Date = new Date()): number {
  return awardPointsForCompletion(task, now);
}

// ---- backlog parser (legacy backlog-dialog parity) ----
/**
 * One task per line. Optional prefixes: `!alta`/`!media`/`!baixa`/`!urgente` set priority,
 * `#dd/mm` sets the due date. Everything else is the title.
 *
 * plan-v3 DEC-41: `@pontos` é aceito e ignorado (o número define menos valor que antes — toda
 * tarefa vale `POINTS_PER_TASK`), então ele não aparece mais no tipo de saída.
 */
export interface ParsedBacklogLine {
  title: string;
  priority: Task["priority"];
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
        // plan-v3 DEC-41: a sintaxe `@N` continua aceita — backlog que as pessoas já têm
        // escrito não quebra — mas o número não define ponto nenhum: toda tarefa vale
        // POINTS_PER_TASK. O token é removido do título como antes.
        title = title.replace(pointsMatch[0], "");
      }
      const priorityMatch = title.match(/\s!(alta|media|média|baixa|urgente)\b/i);
      if (priorityMatch) {
        const p = priorityMatch[1].toLowerCase();
        priority = p === "alta" ? "high" : p === "baixa" ? "low" : p === "urgente" ? "urgent" : "medium";
        title = title.replace(priorityMatch[0], "");
      }
      return { title: title.trim(), priority, dueDate };
    })
    .filter((t) => t.title.length > 0);
}

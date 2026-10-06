/**
 * backend/domain/task/subtask-rules — plano-v4 · V4-4 (DEC-56, DEC-57, DEC-78, D-D).
 *
 * Uma subtask é uma linha de trabalho da tarefa mãe: **título e conclusão**. Ela não tem
 * responsável próprio, não tem prazo próprio (herda o da mãe) e não credita ponto nenhum por
 * conta própria — o que ela faz é mudar o valor da mãe e travar a mãe.
 *
 * As três regras que moram aqui:
 *
 *   1. **trava** (DEC-57): a mãe não entra em `in-review` nem em `done` enquanto houver subtask
 *      aberta. Vale vindo de qualquer coluna — o quadro oferece `A Fazer → Em Revisão` direto
 *      (`features/tasks/utils/move-rules.ts:71`), e uma trava que só olhasse "sair de Em
 *      Andamento" deixaria esse caminho passar.
 *   2. **janela**: mexer na lista de subtasks (criar, renomear, apagar) só enquanto a mãe não
 *      está em `in-review` nem em `done`. Decidir a lista é uma coisa; concluir é outra — a
 *      conclusão continua aberta até a mãe ser aprovada.
 *   3. **auto-mover**: a última subtask concluída empurra a mãe de `in-progress` para
 *      `in-review`. Só dessa coluna: uma tarefa que ninguém começou não entra na fila de
 *      aprovação sozinha.
 *
 * Como o resto do domínio: funções puras, `now` entra por parâmetro, nada de Prisma nem relógio.
 */
import { ValidationError } from "../errors";
import { POINTS_PER_TASK } from "./points-rules";
import type { TaskStatus } from "./TaskStatus";
import type { TaskVisibility } from "./TaskVisibility";

/** Mesmo teto do título da tarefa (`createTaskRecord`): uma subtask não pode ser maior que a mãe. */
export const SUBTASK_TITLE_MAX_LENGTH = 200;

/** Estados da mãe que aceitam criar/renomear/apagar subtask. */
export const SUBTASK_EDITABLE_STATUSES: readonly TaskStatus[] = ["to-do", "in-progress", "adjust"];

/** Estados que a mãe não alcança com subtask aberta. */
export const SUBTASK_BLOCKED_TARGETS: readonly TaskStatus[] = ["in-review", "done"];

/** O que a subtask é, no domínio. `id`/`taskId` pertencem à persistência. */
export interface ISubtask {
  id?: number;
  taskId?: number;
  title: string;
  completed: boolean;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface NewSubtaskInput {
  title?: unknown;
}

/** Por que a pessoa estava tentando mover — só muda a frase, nunca a regra. */
export type SubtaskLockAction = "review" | "complete" | "approve";

const ACTION_LABEL: Record<SubtaskLockAction, string> = {
  review: "enviar para revisão",
  complete: "concluir a tarefa",
  approve: "aprovar a tarefa",
};

/**
 * Valida o título de uma subtask. Mensagens na mesma família das da tarefa
 * (`createTaskRecord`), para a pessoa não ver dois vocabulários diferentes no mesmo formulário.
 */
export function createSubtaskRecord(data: NewSubtaskInput): ISubtask {
  const title = String(data.title ?? "").trim();
  if (!title) throw new ValidationError("Título da subtask é obrigatório");
  if (title.length > SUBTASK_TITLE_MAX_LENGTH) {
    throw new ValidationError(
      `Título da subtask não pode ter mais de ${SUBTASK_TITLE_MAX_LENGTH} caracteres`,
    );
  }
  return { title, completed: false, completedAt: null };
}

/** Base gravada em `tasks.points`: a tarefa (10) mais 10 por subtask (DEC-56, resposta do dono). */
export function subtaskBasePoints(subtaskCount: number): number {
  return POINTS_PER_TASK + subtaskCount * POINTS_PER_TASK;
}

/** Quantas subtasks ainda faltam. */
export function openSubtasksCount(subtasks: ReadonlyArray<Pick<ISubtask, "completed">>): number {
  return subtasks.filter((subtask) => !subtask.completed).length;
}

/**
 * A frase que a pessoa vê. O número está na mensagem porque a DEC-57 promete dizer
 * **quantas** faltam — e o singular é escrito à parte para não sair "as 1 subtask restantes".
 */
export function openSubtasksMessage(openCount: number, action: SubtaskLockAction): string {
  const label = ACTION_LABEL[action];
  if (openCount === 1) return `Conclua a subtask restante antes de ${label}`;
  return `Conclua as ${openCount} subtasks restantes antes de ${label}`;
}

/** Destinos que a trava governa. */
export function isCompletionTargetStatus(status: TaskStatus): boolean {
  return SUBTASK_BLOCKED_TARGETS.includes(status);
}

/**
 * A frase da JANELA (DEC-80): criar/renomear/apagar a lista só enquanto a mãe aceita. É 409
 * porque o que está em conflito é o estado do mundo, não a transição pedida.
 *
 * Foi movida do `internal/task-view.ts` para o domínio no V4-5 porque passou a ter chamadores
 * fora do módulo — o mock de teste (`tests/mocks/handlers.ts`) precisa dizer exatamente a mesma
 * frase que a rota real diz, e importar interno de módulo para isso seria a regra em duas cópias.
 */
export function subtaskWindowMessage(motherStatus: TaskStatus): string {
  return motherStatus === "done"
    ? "A tarefa já foi concluída e a lista de subtasks não muda mais."
    : "A tarefa está em revisão e a lista de subtasks não muda mais.";
}

/**
 * DEC-57 — a trava, aplicada antes de qualquer escrita. `ValidationError` porque é a
 * transição pedida que é inválida (400), não o estado do mundo (409): a distinção com a janela
 * está registrada em DEC-80.
 */
export function assertSubtasksAllowTransition(
  nextStatus: TaskStatus,
  openCount: number,
  action?: SubtaskLockAction,
): void {
  if (openCount <= 0) return;
  if (!isCompletionTargetStatus(nextStatus)) return;
  const resolved: SubtaskLockAction = action ?? (nextStatus === "done" ? "complete" : "review");
  throw new ValidationError(openSubtasksMessage(openCount, resolved));
}

/** Janela de edição da lista. */
export function canEditSubtasksOf(motherStatus: TaskStatus): boolean {
  return SUBTASK_EDITABLE_STATUSES.includes(motherStatus);
}

/**
 * A última subtask concluída move a mãe para `in-review`. `in-progress` é a única coluna de
 * partida: de `to-do` a mãe ainda não foi começada, e de `in-review`/`done` não há para onde mover.
 */
export function shouldAutoMoveMotherToReview(
  motherStatus: TaskStatus,
  subtasks: ReadonlyArray<Pick<ISubtask, "completed">>,
): boolean {
  if (motherStatus !== "in-progress") return false;
  if (subtasks.length === 0) return false;
  return subtasks.every((subtask) => subtask.completed);
}

/** Read model da subtask — a mesma shape que `entities/task.ts` valida no cliente. */
export function serializeSubtask(subtask: ISubtask): {
  id: number | null;
  taskId: number | null;
  title: string;
  completed: boolean;
  completedAt: string | null;
} {
  return {
    id: subtask.id ?? null,
    taskId: subtask.taskId ?? null,
    title: subtask.title,
    completed: subtask.completed,
    completedAt: subtask.completedAt ? new Date(subtask.completedAt).toISOString() : null,
  };
}

/**
 * D-D: subtask só existe em tarefa **delegada ou privada**. Pública e quest global ficam fora
 * porque não têm responsável único — a trava da mãe e o "+10 por subtask" não teriam a quem
 * pertencer.
 */
export function supportsSubtasks(visibility: TaskVisibility, isGlobal: boolean): boolean {
  return !isGlobal && visibility !== "public";
}

/**
 * Normaliza a lista de subtasks vinda de um corpo HTTP. `undefined` é "sem subtask"; lista que
 * não é lista é erro — um corpo `{subtasks: "x"}` não pode virar "nenhuma subtask" em silêncio.
 */
export function normalizeNewSubtasks(input: unknown): ISubtask[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ValidationError("Subtasks inválidas");
  return input.map((item) => {
    const title = typeof item === "string" ? item : (item as { title?: unknown })?.title;
    return createSubtaskRecord({ title });
  });
}

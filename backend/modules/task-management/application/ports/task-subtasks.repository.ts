import type { ISubtask } from "@/backend/domain";

/**
 * TaskSubtasksPort — plano-v4 · V4-4. A costura das subtasks da tarefa mãe.
 *
 * Devolve `ISubtask` (a forma do domínio), não a linha da tabela: o vocabulário de persistência
 * para no adaptador, como já fazem as outras portas deste módulo.
 *
 * Não há `isAvailable()` aqui, ao contrário de `TaskProgressPort`: a tabela existe desde a
 * migration `20261006171259_add_task_subtasks` e não tem caminho legado. Uma porta que sabe que
 * a tabela existe não precisa fingir que pode não saber.
 */
export interface TaskSubtasksPort {
  /** Ordem de criação (`id ASC`) — é a ordem que a pessoa escreveu no formulário. */
  listByTaskId(taskId: number): Promise<ISubtask[]>;
  /** Variante em lote, para a lista do quadro não virar N+1. */
  listByTaskIds(taskIds: number[]): Promise<Map<number, ISubtask[]>>;
  findById(subtaskId: number): Promise<ISubtask | null>;
  /**
   * A trava (DEC-57) pergunta "quantas faltam", não "quais são". Contar na tabela evita trazer
   * as linhas para o processo só para um `filter`.
   */
  countOpenByTaskId(taskId: number): Promise<number>;
  create(taskId: number, title: string): Promise<ISubtask>;
  createMany(taskId: number, titles: string[]): Promise<ISubtask[]>;
  update(
    subtaskId: number,
    data: { title?: string; completed?: boolean; completedAt?: Date | null },
  ): Promise<ISubtask>;
  delete(subtaskId: number): Promise<void>;
}

export interface TaskCompletedEvent {
  userId: number;
  taskId: number;
  taskPoints: number;
  /**
   * V5-7b (DEC-63): o projeto da tarefa concluída, ou `null` para quest global. É o que
   * permite ao publicador incrementar `projects.points` na mesma conclusão — o adaptador só
   * escreve quando há projeto.
   */
  projectId: number | null;
}

export interface TaskUncompletedEvent {
  userId: number;
  taskId: number;
  projectId: number | null;
}

/**
 * R13 (S13): quando a tarefa sai de `done` por gestão (R12), o valor creditado naquela
 * tarefa é retirado de quem o recebeu. A porta é espelho da de conclusão: ela devolve o
 * valor EFETIVAMENTE revertido (`reversedPoints`), que o chamador usa para baixar
 * `projects.points` pelo mesmo total (piso 0, DEC-74). `null` = nada a reverter.
 */
export interface TaskProgressEvents {
  /** `creditedPoints` = valor creditado (0 quando o award já existia); `null` = ninguém creditado. */
  onTaskCompleted(event: TaskCompletedEvent): Promise<number | null>;
  /**
   * R13 (S13): a tarefa saiu de `done`. Optional de propósito — o caminho de conclusão não
   * exige reversão, e um publisher parcial (roundtrip sem award, testes de unidade) só conhece
   * `onTaskCompleted`. `reversedPoints` = valor efetivamente revertido; `null` = nada a reverter.
   */
  onTaskUncompleted?(event: TaskUncompletedEvent): Promise<number | null>;
}

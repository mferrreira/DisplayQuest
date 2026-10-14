/**
 * V5-6 (DEC-99) — a leitura mínima da linha do cronograma que a ligação de tarefa precisa:
 * existe e a que projeto pertence. Nem mês, nem status, nem recompensa.
 *
 * O módulo de tarefas não importa o módulo de projeto (RG-04). É a mesma razão pela qual a
 * `TaskProjectsPort` lê a tabela `projects` por conta própria: a porta é do módulo que consome,
 * o adaptador é dele também.
 */
export interface TaskActivityRecord {
  id: number
  projectId: number
}

export interface TaskActivitiesPort {
  findActivityById(activityId: number): Promise<TaskActivityRecord | null>
}

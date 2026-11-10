/**
 * V5-6 (DEC-99) — a leitura mínima da linha do cronograma que a ligação de tarefa precisa:
 * existe, a que projeto pertence e o status (plan-v21 S01, DEC-257: só OPEN é destino de tarefa
 * nova na criação). Nem mês, nem recompensa.
 *
 * O módulo de tarefas não importa o módulo de projeto (RG-04). É a mesma razão pela qual a
 * `TaskProjectsPort` lê a tabela `projects` por conta própria: a porta é do módulo que consome,
 * o adaptador é dele também. O vocabulário de status vem do barrel do domínio.
 */
import type { ActivityStatus } from "@/backend/domain"

export interface TaskActivityRecord {
  id: number
  projectId: number
  status: ActivityStatus
}

export interface TaskActivitiesPort {
  findActivityById(activityId: number): Promise<TaskActivityRecord | null>
}

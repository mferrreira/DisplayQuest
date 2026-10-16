/**
 * TaskActivityPort — registro de atividade de tarefa para o feed "Atividade recente" da Home.
 *
 * Reaproveita a tabela `history` (entityType "task") em vez de criar schema novo: `history`
 * ja e o auditoria da casa (gamification, lab notices, leituras de lider). O append grava a
 * linha; o listRecent le as mais recentes com o nome de quem agiu. Sem migration.
 *
 * A acao e rotulada (CREATE/MOVE/COMPLETE) e guarda o status de destino — o feed diz
 * "criou", "moveu para Fazendo", "concluiu". Nao ha `fromStatus`: o ponto de escrita (os
 * metodos do modulo) so conhece o status resultante, e e o que a frase do feed precisa.
 */
export type TaskActivityAction = "CREATE" | "MOVE" | "COMPLETE"

export interface TaskActivityEntry {
  taskId: number
  taskTitle: string
  actorId: number
  action: TaskActivityAction
  toStatus?: string | null
}

export interface TaskActivityItem {
  id: number
  action: TaskActivityAction
  taskId: number
  taskTitle: string
  toStatus: string | null
  actorId: number
  actorName: string
  at: string
}

export interface TaskActivityPort {
  append(entry: TaskActivityEntry): Promise<void>
  listRecent(limit: number): Promise<TaskActivityItem[]>
}

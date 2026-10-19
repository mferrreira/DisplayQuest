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
  listRecent(limit: number, since?: Date): Promise<TaskActivityItem[]>
  /**
   * Apaga os registros de atividade de tarefa anteriores a `cutoff` e devolve quantos saíram.
   *
   * ESCOPO ESTREITO DE PROPÓSITO (V6-11k): só `entityType = "task"` — a tabela `history` é
   * compartilhada com as premiações de gamification (`action GAMIFICATION_AWARD`, cuja
   * idempotência LÊ essas linhas para não premiar duas vezes) e com os avisos do laboratório
   * (`entityType LAB_NOTICE`, que são o próprio quadro de avisos). Apagar qualquer uma dessas
   * duas famílias é defeito de dados, não limpeza — o filtro por `entityType` é a trava.
   */
  purgeOlderThan(cutoff: Date): Promise<number>
}

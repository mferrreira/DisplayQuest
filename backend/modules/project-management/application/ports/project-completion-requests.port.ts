/**
 * ProjectCompletionRequestsPort — projeção de leitura do flag "conclusão solicitada" por projeto
 * (fix 4, 2026-10-28) e da FILA global de solicitações (S01, plan-v12, DEC-238).
 *
 * I/O apenas: a lista de projetos marca, por projeto, se ele tem solicitação em aberto; a fila
 * devolve as linhas `COMPLETION_REQUESTED` com o nome do projeto e de quem pediu. Nenhuma regra
 * aqui: o prêmio previsto e o gate de quem aprova são dos use cases, e o botão é da tela.
 */
export interface CompletionRequestRecord {
  projectId: number
  projectName: string
  activityId: number
  order: number
  description: string
  firstMonth: string
  lastMonth: string
  requestedBy: number | null
  requestedByName: string | null
  requestedAt: string | null
}

export interface ProjectCompletionRequestsPort {
  listProjectIdsWithRequests(): Promise<number[]>
  listCompletionRequests(): Promise<CompletionRequestRecord[]>
}

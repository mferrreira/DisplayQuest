/**
 * ProjectCompletionRequestsPort — projeção de leitura do flag "conclusão solicitada" por projeto
 * (fix 4, 2026-10-28). A lista de projetos marca, por projeto, se ele tem alguma atividade em
 * COMPLETION_REQUESTED; a tela de gestão pinta o cartão avermelhado por esse flag. Não é coluna:
 * é projeção sobre `project_activities`, no mesmo desenho do `isMember` (R11, S11).
 *
 * I/O apenas: devolve os ids dos projetos com solicitação em aberto. A decisão de pintar é da tela.
 */
export interface ProjectCompletionRequestsPort {
  listProjectIdsWithRequests(): Promise<number[]>;
}

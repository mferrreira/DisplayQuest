import type { CompletedTaskCredit } from "@/backend/domain"

/**
 * V5-7b (DEC-104/163) — leitura de tarefa que a economia da atividade precisa: as tarefas
 * CONCLUÍDAS do projeto com seus participantes (responsáveis de `task_assignees` e
 * completadores de `task_user_progress` com `completedAt`). A deduplicação por par
 * (membro, tarefa) é da função pura `memberTaskCredits`, no domínio — aqui só chega a
 * matéria-prima, pelo desenho medido do `ActivityTasksPort` (o módulo de projeto lê a tabela
 * de tasks por adaptador próprio, RG-04).
 */
export interface ActivityEconomyTasksPort {
  listCompletedTaskCredits(projectId: number): Promise<CompletedTaskCredit[]>
}

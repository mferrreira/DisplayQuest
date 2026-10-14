import { prisma } from "@/lib/database/prisma"
import type { ActivityTasksPort } from "@/backend/modules/project-management/application/ports/activity-tasks.port"

/**
 * V5-7a (DEC-99) — contagem de tarefa aberta da atividade, lida da tabela do módulo de tasks
 * por adaptador próprio do módulo de projeto (mesmo desenho do `prisma-project-hours.port`).
 *
 * "Aberta" é `completed: false` — a trava DEC-99 pergunta o que falta concluir, e coluna é a
 * que o fluxo de conclusão das tarefas escreve nos três caminhos (PUT status / PATCH complete /
 * POST approve). Tarefa sem `activityId` não pertence a etapa nenhuma e não entra.
 */
export function createPrismaActivityTasksPort(): ActivityTasksPort {
  return {
    async countOpenByActivity(activityId: number) {
      return prisma.tasks.count({ where: { activityId, completed: false } })
    },
  }
}

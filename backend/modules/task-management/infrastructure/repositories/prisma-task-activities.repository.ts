import type { ActivityStatus } from "@/backend/domain"
import { prisma } from "@/lib/database/prisma"
import type {
  TaskActivitiesPort,
  TaskActivityRecord,
} from "@/backend/modules/task-management/application/ports/task-activities.port"

/**
 * PrismaTaskActivitiesRepository — V5-6 (DEC-99). Lê só as colunas que o gate de ligação consome:
 * id, projeto e o status da linha (DEC-257: só OPEN é destino de tarefa nova na criação). Não é
 * a leitura do cronograma (essa é do módulo de projeto, `prisma-project-cronograma.repository.ts`):
 * aqui o que importa é decidir se a tarefa pode apontar para aquela linha, e nada mais.
 */
export function createPrismaTaskActivitiesRepository(): TaskActivitiesPort {
  return {
    async findActivityById(activityId) {
      const row = await prisma.project_activities.findUnique({
        where: { id: activityId },
        select: { id: true, projectId: true, status: true },
      })
      // A coluna é `String`; o vocabulário escrito é o do domínio (`ACTIVITY_STATUSES`), e o
      // adaptador que lê a linha devolve o token como o tipo do vocabulário.
      return row ? ({ ...row, status: row.status as ActivityStatus } satisfies TaskActivityRecord) : null
    },
  }
}

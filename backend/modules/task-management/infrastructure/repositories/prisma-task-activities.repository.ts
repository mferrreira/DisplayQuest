import { prisma } from "@/lib/database/prisma"
import type {
  TaskActivitiesPort,
  TaskActivityRecord,
} from "@/backend/modules/task-management/application/ports/task-activities.port"

/**
 * PrismaTaskActivitiesRepository — V5-6 (DEC-99). Lê só as duas colunas que o gate de ligação
 * consome. Não é a leitura do cronograma (essa é do módulo de projeto,
 * `prisma-project-cronograma.repository.ts`): aqui o que importa é decidir se a tarefa pode
 * apontar para aquela linha, e nada mais.
 */
export function createPrismaTaskActivitiesRepository(): TaskActivitiesPort {
  return {
    async findActivityById(activityId) {
      const row = await prisma.project_activities.findUnique({
        where: { id: activityId },
        select: { id: true, projectId: true },
      })
      return row ? (row satisfies TaskActivityRecord) : null
    },
  }
}

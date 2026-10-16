import { prisma } from "@/lib/database/prisma"
import type {
  TaskActivityEntry,
  TaskActivityItem,
  TaskActivityPort,
} from "@/backend/modules/task-management/application/ports/task-activity.port"

/**
 * Adapter sobre `history` (entityType "task"). Espelha o padrao do auditoria existente
 * (gamification escreve history.create com entityType/action/performedBy/description/metadata).
 * `performedBy` e FK RESTRICT para users — quem tem atividade de tarefa nao e excluido, e sim
 * suspenso (ja e o caso com os awards). A leitura traz o nome do performer junto.
 */
export function createPrismaTaskActivityPort(): TaskActivityPort {
  return {
    async append(entry: TaskActivityEntry): Promise<void> {
      await prisma.history.create({
        data: {
          entityType: "task",
          entityId: entry.taskId,
          action: entry.action,
          performedBy: entry.actorId,
          description: entry.taskTitle,
          metadata: { toStatus: entry.toStatus ?? null },
        },
      })
    },

    async listRecent(limit: number): Promise<TaskActivityItem[]> {
      const rows = await prisma.history.findMany({
        where: { entityType: "task" },
        orderBy: { performedAt: "desc" },
        take: limit,
        include: { performer: { select: { id: true, name: true } } },
      })
      return rows.map((row) => {
        const meta = row.metadata as { toStatus?: unknown } | null
        return {
          id: row.id,
          action: row.action as TaskActivityItem["action"],
          taskId: row.entityId,
          taskTitle: row.description ?? "",
          toStatus: typeof meta?.toStatus === "string" ? meta.toStatus : null,
          actorId: row.performedBy,
          actorName: row.performer.name,
          at: row.performedAt.toISOString(),
        }
      })
    },
  }
}

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

    async listRecent(limit: number, since?: Date): Promise<TaskActivityItem[]> {
      const rows = await prisma.history.findMany({
        where: { entityType: "task", ...(since ? { performedAt: { gte: since } } : {}) },
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

    /**
     * Limpeza periódica (V6-11k): UMA instrução, um só `where`. O filtro por `entityType`
     * é a trava dura do escopo — as outras famílias de `history` (premiação e avisos) nunca
     * entram. `deleteMany` é atômico por instrução; não precisa (nem deve) de transação.
     */
    async purgeOlderThan(cutoff: Date): Promise<number> {
      const { count } = await prisma.history.deleteMany({
        where: { entityType: "task", performedAt: { lt: cutoff } },
      })
      return count
    },
  }
}

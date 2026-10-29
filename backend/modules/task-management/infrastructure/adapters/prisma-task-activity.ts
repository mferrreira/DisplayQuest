import { prisma } from "@/lib/database/prisma"
import type {
  TaskActivityEntry,
  TaskActivityItem,
  TaskActivityPort,
  TaskActivityScope,
} from "@/backend/modules/task-management/application/ports/task-activity.port"

/**
 * Teto de linhas lidas antes do recorte por projeto. O feed so mostra o dia corrente (o cron
 * apaga o resto), entao 1000 e folga; o recorte e por projeto e nao pode ser empurrado para o
 * `take` sem perder a ordem quando ha tarefa global no meio.
 */
const MAX_ACTIVITY_ROWS = 1000

type ActivityMeta = { toStatus?: unknown; projectId?: unknown } | null

function projectIdFromMeta(meta: ActivityMeta): number | null | undefined {
  if (!meta || !("projectId" in meta)) return undefined
  return typeof meta.projectId === "number" ? meta.projectId : null
}

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
          metadata: { toStatus: entry.toStatus ?? null, projectId: entry.projectId ?? null },
        },
      })
    },

    async listRecent(
      limit: number,
      since?: Date,
      scope?: TaskActivityScope,
    ): Promise<TaskActivityItem[]> {
      const rows = await prisma.history.findMany({
        where: { entityType: "task", ...(since ? { performedAt: { gte: since } } : {}) },
        orderBy: { performedAt: "desc" },
        take: MAX_ACTIVITY_ROWS,
        include: { performer: { select: { id: true, name: true } } },
      })

      // Linhas gravadas antes da coluna de projeto no metadata (o dia da entrega) nao tem
      // `projectId`; a tarefa ainda existe, entao o projeto e resolvido por ela em UMA consulta.
      const missingIds = rows
        .filter((row) => projectIdFromMeta(row.metadata as ActivityMeta) === undefined)
        .map((row) => row.entityId)
      const tasksById = missingIds.length
        ? await prisma.tasks.findMany({
            where: { id: { in: missingIds } },
            select: { id: true, projectId: true },
          })
        : []
      const projectByTaskId = new Map(tasksById.map((task) => [task.id, task.projectId]))

      const resolved = rows.map((row) => {
        const meta = row.metadata as ActivityMeta
        const fromMeta = projectIdFromMeta(meta)
        return {
          row,
          meta,
          projectId:
            fromMeta === undefined ? (projectByTaskId.get(row.entityId) ?? null) : fromMeta,
        }
      })

      const visible = resolved.filter(({ projectId }) => {
        if (!scope) return true
        if (scope.projectId != null) return projectId === scope.projectId
        if (scope.projectIds) return projectId === null || scope.projectIds.includes(projectId)
        return true
      })

      return visible.slice(0, limit).map(({ row, meta }) => ({
        id: row.id,
        action: row.action as TaskActivityItem["action"],
        taskId: row.entityId,
        taskTitle: row.description ?? "",
        toStatus: typeof meta?.toStatus === "string" ? meta.toStatus : null,
        actorId: row.performedBy,
        actorName: row.performer.name,
        at: row.performedAt.toISOString(),
      }))
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

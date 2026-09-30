import { prisma } from "@/lib/database/prisma"
import type {
  TaskProgressPort,
  TaskUserProgressRecord,
} from "@/backend/modules/task-management/application/ports/task-progress.repository"
import type { TaskStatus } from "@/backend/domain"

/**
 * PrismaTaskProgressRepository — OND4-B3 (R1) thin adapter over `task_user_progress`,
 * mirroring the legacy TaskUserProgressRepository (composite-key upsert; the update branch
 * leaves `undefined` fields untouched, which is what the domain patches rely on).
 */
function map(record: any): TaskUserProgressRecord {
  return {
    id: record.id,
    taskId: record.taskId,
    userId: record.userId,
    status: record.status as TaskStatus,
    pickedAt: record.pickedAt ?? null,
    completedAt: record.completedAt ?? null,
    awardedPoints: record.awardedPoints ?? 0,
  }
}

export function createPrismaTaskProgressRepository(): TaskProgressPort {
  const table = () => (prisma as any).task_user_progress

  return {
    isAvailable() {
      return !!table()
    },
    async findByTaskAndUser(taskId, userId) {
      const tableRef = table()
      if (!tableRef) return null
      const row = await tableRef.findUnique({
        where: { taskId_userId: { taskId, userId } },
      })
      return row ? map(row) : null
    },
    async findByTaskIdsAndUser(taskIds, userId) {
      const tableRef = table()
      if (!tableRef || taskIds.length === 0) return []
      const rows = await tableRef.findMany({
        where: { taskId: { in: taskIds }, userId },
      })
      return rows.map(map)
    },
    async upsert(input) {
      const tableRef = table()
      if (!tableRef) {
        throw new Error("task_user_progress indisponível. Rode prisma generate/migrate antes de usar progresso individual.")
      }
      await tableRef.upsert({
        where: { taskId_userId: { taskId: input.taskId, userId: input.userId } },
        create: {
          taskId: input.taskId,
          userId: input.userId,
          status: input.status,
          pickedAt: input.pickedAt ?? null,
          completedAt: input.completedAt ?? null,
          awardedPoints: input.awardedPoints ?? 0,
        },
        update: {
          status: input.status,
          pickedAt: input.pickedAt,
          completedAt: input.completedAt,
          awardedPoints: input.awardedPoints,
        },
      })
    },
    async listCompletedByTaskIds(taskIds) {
      const tableRef = table()
      if (!tableRef || taskIds.length === 0) return []
      const rows = await tableRef.findMany({
        where: { taskId: { in: taskIds }, completedAt: { not: null } },
        select: { taskId: true, userId: true },
      })
      return rows.map((row: any) => ({ taskId: Number(row.taskId), userId: Number(row.userId) }))
    },
    async listSessionCompletionsByTaskIds(taskIds) {
      if (taskIds.length === 0) return []
      const rows = await prisma.work_session_tasks.findMany({
        where: {
          taskId: { in: taskIds },
          workSession: { status: "completed" },
        },
        select: { taskId: true, workSession: { select: { userId: true } } },
      })
      return rows
        .filter((row) => row.workSession?.userId != null)
        .map((row) => ({ taskId: row.taskId, userId: row.workSession!.userId }))
    },
  }
}

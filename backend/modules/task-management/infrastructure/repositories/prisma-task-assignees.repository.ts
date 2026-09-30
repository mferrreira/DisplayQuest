import { prisma } from "@/lib/database/prisma"
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository"

/**
 * PrismaTaskAssigneesRepository — OND4-B3 (R1) thin adapter over `task_assignees`,
 * mirroring the legacy TaskAssigneeRepository (ordered by assignedAt ASC, replace-all
 * semantics, availability check on the table's presence).
 */
export function createPrismaTaskAssigneesRepository(): TaskAssigneesPort {
  const table = () => (prisma as any).task_assignees

  return {
    isAvailable() {
      return !!table()
    },
    async listUserIdsByTaskId(taskId) {
      const tableRef = table()
      if (!tableRef) return []
      const rows = await tableRef.findMany({
        where: { taskId },
        select: { userId: true },
        orderBy: { assignedAt: "asc" },
      })
      return rows.map((row: any) => Number(row.userId)).filter((id: number) => !Number.isNaN(id))
    },
    async listTaskIdsByUserId(userId) {
      const tableRef = table()
      if (!tableRef) return []
      const rows = await tableRef.findMany({
        where: { userId },
        select: { taskId: true },
      })
      return rows.map((row: any) => Number(row.taskId)).filter((id: number) => !Number.isNaN(id))
    },
    async listUserIdsByTaskIds(taskIds) {
      const map = new Map<number, number[]>()
      const tableRef = table()
      if (!tableRef || taskIds.length === 0) return map
      const rows = await tableRef.findMany({
        where: { taskId: { in: taskIds } },
        select: { taskId: true, userId: true },
        orderBy: { assignedAt: "asc" },
      })
      for (const row of rows) {
        const taskId = Number(row.taskId)
        const userId = Number(row.userId)
        if (Number.isNaN(taskId) || Number.isNaN(userId)) continue
        const arr = map.get(taskId)
        if (arr) arr.push(userId)
        else map.set(taskId, [userId])
      }
      return map
    },
    async isUserAssigned(taskId, userId) {
      const tableRef = table()
      if (!tableRef) return false
      const row = await tableRef.findUnique({
        where: { taskId_userId: { taskId, userId } },
        select: { id: true },
      })
      return !!row
    },
    async replaceAssignees(taskId, userIds, assignedBy) {
      const tableRef = table()
      if (!tableRef) {
        throw new Error("task_assignees indisponível. Rode prisma generate/migrate antes de usar multiatribuição.")
      }
      const normalized = Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)))
      await tableRef.deleteMany({ where: { taskId } })
      if (normalized.length === 0) return
      await tableRef.createMany({
        data: normalized.map((userId) => ({
          taskId,
          userId,
          assignedBy: assignedBy ?? null,
        })),
        skipDuplicates: true,
      })
    },
  }
}

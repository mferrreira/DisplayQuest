import { prisma } from "@/lib/database/prisma"
import type { TaskActorRecord, TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port"

/**
 * PrismaTaskActorsRepository — OND4-B3 (R1) thin adapter over `users` + `project_members`.
 * The legacy gateway did `user.completedTasks += 1; userRepository.update(user)` (a full
 * row write); this adapter narrows that to the observable effect: an atomic increment.
 */
export function createPrismaTaskActorsRepository(): TaskActorsPort {
  return {
    async findById(id) {
      const row = await prisma.users.findUnique({
        where: { id },
        select: { id: true, name: true, roles: true, completedTasks: true },
      })
      if (!row) return null
      return {
        id: row.id,
        name: row.name,
        roles: (row.roles ?? []) as unknown as string[],
        completedTasks: row.completedTasks,
      }
    },
    async incrementCompletedTasks(userId) {
      await prisma.users.update({
        where: { id: userId },
        data: { completedTasks: { increment: 1 } },
      })
    },
    async getUserProjectMemberships(userId) {
      const rows = await prisma.project_members.findMany({
        where: { userId },
        select: { projectId: true },
      })
      return rows.map((row) => ({ projectId: row.projectId }))
    },
    async listActiveUsers() {
      const rows = await prisma.users.findMany({
        where: { status: "active" },
        select: { id: true, name: true, email: true, roles: true },
        orderBy: { name: "asc" },
      })
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        roles: (row.roles ?? []) as unknown as string[],
      }))
    },
  }
}

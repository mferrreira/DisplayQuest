import { prisma } from "@/lib/database/prisma"
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port"

/** PrismaTaskProjectsRepository — OND4-B3 (R1): the leader/creator gates' minimal read. */
export function createPrismaTaskProjectsRepository(): TaskProjectsPort {
  return {
    async findById(id) {
      const row = await prisma.projects.findUnique({
        where: { id },
        select: { id: true, leaderId: true, createdBy: true },
      })
      return row ?? null
    },
  }
}

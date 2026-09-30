import { prisma } from "@/lib/database/prisma"
import type {
  CompletedTaskRef,
  TaskVerificationPort,
} from "@/backend/modules/work-execution/application/ports/task-verification.port"

/**
 * PrismaTaskVerification (OND3-B2, R2) — read-only adapter for the completed-task check.
 * Query frozen by golden OND3-B1: id in taskIds AND completed AND assignedTo = userId.
 */
export class PrismaTaskVerification implements TaskVerificationPort {
  async findCompletedAssignedTasks(userId: number, taskIds: number[]): Promise<CompletedTaskRef[]> {
    if (taskIds.length === 0) return []

    const tasks = await prisma.tasks.findMany({
      where: {
        id: { in: taskIds },
        completed: true,
        assignedTo: userId,
      },
      select: {
        id: true,
        projectId: true,
      },
    })

    return tasks.map((task) => ({ id: task.id, projectId: task.projectId }))
  }
}

export function createPrismaTaskVerification(): PrismaTaskVerification {
  return new PrismaTaskVerification()
}

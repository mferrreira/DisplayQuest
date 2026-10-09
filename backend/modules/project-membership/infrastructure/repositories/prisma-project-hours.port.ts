import { prisma } from "@/lib/database/prisma"
import type { ProjectHoursPort } from "@/backend/modules/project-membership/application/ports/project-hours.port"

/**
 * OND5-B2 (R1) — thin `work_sessions` aggregation adapter: SUM(duration) per user over
 * COMPLETED sessions of a project, optionally windowed (the week window is computed by the
 * use case via domain/project/weekWindow — the adapter only receives the range).
 */
export function createPrismaProjectHoursPort(): ProjectHoursPort {
  return {
    async sumCompletedSecondsByUser(projectId, window) {
      const rows = await prisma.work_sessions.groupBy({
        by: ["userId"],
        where: {
          projectId,
          status: "completed",
          ...(window ? { startTime: { gte: window.start, lte: window.end } } : {}),
        },
        _sum: { duration: true },
      })
      return rows.map((row) => ({ userId: row.userId, seconds: row._sum.duration ?? 0 }))
    },
  }
}

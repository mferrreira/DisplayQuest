import { prisma } from "@/lib/database/prisma"
import type { ProjectHoursPort } from "@/backend/modules/project-management/application/ports/project-hours.port"

/**
 * OND5-B2 (R1) — thin `work_sessions` SUM for the volunteer stats. The legacy gateway ran
 * two findMany per member and reduced the durations; the port narrows that to the SUM
 * (the observable value), keeping the same filters (completed + optional week window).
 */
export function createPrismaProjectHoursPort(): ProjectHoursPort {
  return {
    async sumCompletedSeconds(userId, projectId, window) {
      const rows = await prisma.work_sessions.findMany({
        where: {
          userId,
          projectId,
          status: "completed",
          ...(window ? { startTime: { gte: window.start, lte: window.end } } : {}),
        },
        select: { duration: true },
      })
      return rows.reduce((sum, row) => sum + (row.duration ?? 0), 0)
    },
  }
}

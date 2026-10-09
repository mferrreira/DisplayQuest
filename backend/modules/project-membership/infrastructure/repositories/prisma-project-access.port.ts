import { prisma } from "@/lib/database/prisma"
import type { ProjectAccessPort } from "@/backend/modules/project-membership/application/ports/project-access.port"

/**
 * OND5-B2 (R1) — thin projects/users adapter for the membership module: existence checks,
 * the single-leader conflict read and the leader write. No rules here (the single-leader
 * RULE lives in the use case; this is the query).
 */
export function createPrismaProjectAccessPort(): ProjectAccessPort {
  return {
    async projectExists(projectId) {
      const project = await prisma.projects.findUnique({ where: { id: projectId }, select: { id: true } })
      return Boolean(project)
    },
    async userExists(userId) {
      const user = await prisma.users.findUnique({ where: { id: userId }, select: { id: true } })
      return Boolean(user)
    },
    async leadsAnotherProject(targetUserId, projectId) {
      const conflict = await prisma.projects.findFirst({
        where: { leaderId: targetUserId, id: { not: projectId } },
        select: { id: true },
      })
      return Boolean(conflict)
    },
    async setProjectLeader(projectId, leaderId) {
      const updated = await prisma.projects.update({
        where: { id: projectId },
        data: { leaderId },
        select: { id: true, leaderId: true },
      })
      return { projectId: updated.id, leaderId: updated.leaderId }
    },
  }
}

import { prisma } from "@/lib/database/prisma"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"

/**
 * OND5-B2 (R1) — thin actors/projects reads the access + manage decisions need. These are
 * the queries ProjectServiceGateway used to run inline against `prisma` (rg06 debt inside
 * the module, now behind a port).
 */
export function createPrismaProjectActorsPort(): ProjectActorsPort {
  return {
    async findActor(userId) {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true, roles: true },
      })
      return user ? { id: user.id, roles: (user.roles ?? []) as unknown as string[] } : null
    },
    async membershipExists(projectId, userId) {
      const membership = await prisma.project_members.findFirst({
        where: { projectId, userId },
        select: { id: true },
      })
      return Boolean(membership)
    },
    async findProjectRelation(projectId) {
      const project = await prisma.projects.findUnique({
        where: { id: projectId },
        select: { leaderId: true, createdBy: true },
      })
      return project ? { leaderId: project.leaderId, createdBy: project.createdBy } : null
    },
  }
}

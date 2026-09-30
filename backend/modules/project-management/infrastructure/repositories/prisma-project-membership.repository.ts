import { prisma } from "@/lib/database/prisma"
import type { Role } from "@/backend/domain"
import type {
  ProjectManagementMembershipPort,
  ProjectMemberWithUser,
} from "@/backend/modules/project-management/application/ports/project-membership.repository"

/**
 * OND5-B2 (R1) — thin `project_members` adapter for the MANAGEMENT module (creator/leader/
 * volunteer memberships + the canActorManageProject read + the volunteer-stats join).
 * listMembersWithUser keeps getProjectMembersWithDetails' joinedAt ASC ordering.
 */
export function createPrismaProjectManagementMembershipRepository(): ProjectManagementMembershipPort {
  return {
    async findMembership(projectId, userId) {
      const row = await prisma.project_members.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { id: true, roles: true },
      })
      return row ? { id: row.id, roles: (row.roles ?? []) as Role[] } : null
    },
    async createMembership(input) {
      await prisma.project_members.create({
        data: { projectId: input.projectId, userId: input.userId, roles: input.roles },
      })
    },
    async updateMembershipRoles(membershipId, roles) {
      await prisma.project_members.update({
        where: { id: membershipId },
        data: { roles },
      })
    },
    async listMembersWithUser(projectId) {
      const rows = await prisma.project_members.findMany({
        where: { projectId },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, points: true, completedTasks: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      })
      return rows.map(
        (row): ProjectMemberWithUser => ({
          id: row.id,
          projectId: row.projectId,
          userId: row.userId,
          roles: (row.roles ?? []) as Role[],
          joinedAt: row.joinedAt,
          user: row.user
            ? {
                id: row.user.id,
                name: row.user.name,
                email: row.user.email,
                avatar: row.user.avatar ?? null,
                points: row.user.points,
                completedTasks: row.user.completedTasks,
              }
            : null,
        }),
      )
    },
  }
}

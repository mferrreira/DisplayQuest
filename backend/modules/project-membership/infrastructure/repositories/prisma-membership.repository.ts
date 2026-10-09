import { prisma } from "@/lib/database/prisma"
import type { Role } from "@/backend/domain"
import type {
  MembershipDetailRecord,
  MembershipRecord,
  MembershipSummary,
  ProjectMembershipRepositoryPort,
} from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * OND5-B2 (R1) — thin `project_members` adapter for the membership module. Query shapes
 * mirror the legacy gateway 1:1 (joinedAt DESC list, projectId_userId unique lookup,
 * roles-has count); no business rules live here.
 */
const userSelect = { id: true, name: true, email: true } as const

type MemberRow = {
  id: number
  projectId: number
  userId: number
  roles: Role[]
  joinedAt: Date
  user?: { id: number; name: string; email: string } | null
}

function toRecord(row: MemberRow): MembershipRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    roles: row.roles ?? [],
    joinedAt: row.joinedAt,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
  }
}

export function createPrismaMembershipRepository(): ProjectMembershipRepositoryPort {
  return {
    async listMembersWithUser(projectId) {
      const rows = await prisma.project_members.findMany({
        where: { projectId },
        include: { user: { select: userSelect } },
        orderBy: { joinedAt: "desc" },
      })
      return rows.map((row) => toRecord(row as MemberRow))
    },
    async findMembership(projectId, userId) {
      const row = await prisma.project_members.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { id: true, roles: true },
      })
      return row ? { id: row.id, roles: (row.roles ?? []) as Role[] } satisfies MembershipSummary : null
    },
    async findMembershipById(membershipId, projectId) {
      const row = await prisma.project_members.findFirst({
        where: { id: membershipId, projectId },
        include: { user: { select: { name: true } } },
      })
      if (!row) return null
      return {
        id: row.id,
        userId: row.userId,
        roles: (row.roles ?? []) as Role[],
        userName: row.user?.name ?? null,
      } satisfies MembershipDetailRecord
    },
    async countMembersWithRole(projectId, role) {
      return prisma.project_members.count({
        where: { projectId, roles: { has: role } },
      })
    },
    async createMembership(input) {
      const row = await prisma.project_members.create({
        data: { projectId: input.projectId, userId: input.userId, roles: input.roles },
        include: { user: { select: userSelect } },
      })
      return toRecord(row as MemberRow)
    },
    async updateMembershipRoles(membershipId, roles) {
      const row = await prisma.project_members.update({
        where: { id: membershipId },
        data: { roles },
        include: { user: { select: userSelect } },
      })
      return toRecord(row as MemberRow)
    },
    async deleteMembership(membershipId) {
      await prisma.project_members.delete({ where: { id: membershipId } })
    },
  }
}

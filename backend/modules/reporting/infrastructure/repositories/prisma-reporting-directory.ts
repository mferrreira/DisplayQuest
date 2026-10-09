import { prisma } from "@/lib/database/prisma"
import { REPORT_NOTIFICATION_ROLES } from "@/backend/domain/reporting"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"

/** OND7-B3 — thin Prisma read adapter over `users`/`projects`/`project_members` + the
 * `currentWeekHours` write frozen from resetWeeklyHoursHistory. */
export class PrismaReportingDirectory implements ReportingDirectory {
  async findUserById(id: number): Promise<{ id: number; name: string } | null> {
    return await prisma.users.findUnique({ where: { id }, select: { id: true, name: true } })
  }

  async findActiveUsers(): Promise<Array<{ id: number; name: string }>> {
    return await prisma.users.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    })
  }

  async findReportManagers(excludeUserId: number): Promise<Array<{ id: number }>> {
    return await prisma.users.findMany({
      where: {
        status: "active",
        roles: { hasSome: REPORT_NOTIFICATION_ROLES as never },
        NOT: { id: excludeUserId },
      },
      select: { id: true },
    })
  }

  async resetCurrentWeekHours(userId: number): Promise<void> {
    await prisma.users.update({ where: { id: userId }, data: { currentWeekHours: 0 } })
  }

  async projectExists(projectId: number): Promise<boolean> {
    const project = await prisma.projects.findUnique({ where: { id: projectId }, select: { id: true } })
    return Boolean(project)
  }

  async getProjectName(projectId: number): Promise<string | null> {
    const project = await prisma.projects.findUnique({ where: { id: projectId }, select: { name: true } })
    return project?.name ?? null
  }

  async isProjectLeader(projectId: number, userId: number): Promise<boolean> {
    const project = await prisma.projects.findFirst({
      where: { id: projectId, leaderId: userId },
      select: { id: true },
    })
    return Boolean(project)
  }

  async findLedProjectIds(userId: number): Promise<number[]> {
    const projects = await prisma.projects.findMany({
      where: { leaderId: userId },
      select: { id: true },
    })
    return projects.map((project) => project.id)
  }

  async findMemberships(userId: number): Promise<Array<{ project: { id: number; name: string; status: string } | null }>> {
    const memberships = await prisma.project_members.findMany({
      where: { userId },
      include: { project: true },
    })
    return memberships.map((membership) => ({ project: membership.project }))
  }

  async findAllProjectsWithMembers(): Promise<
    Array<{
      id: number
      name: string
      status: string
      members: Array<{ userId: number; user: { name: string } | null; roles: string[] }>
    }>
  > {
    const projects = await prisma.projects.findMany({
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    })
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      members: project.members.map((member) => ({
        userId: member.userId,
        user: member.user,
        roles: member.roles,
      })),
    }))
  }
}

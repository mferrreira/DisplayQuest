import { endOfWeek, format, startOfWeek, subWeeks } from "date-fns"
import { prisma } from "@/lib/database/prisma"
import type {
  ProjectHoursHistoryQuery,
  ProjectHoursQuery,
  ProjectHoursResult,
  UpsertWeeklyReportCommand,
  UserProjectHoursQuery,
  WeeklyHoursHistoryItem,
  WeeklyHoursHistoryQuery,
  WeeklyReportListQuery,
  WeeklyReportReadModel,
  WeeklyReportSessionLog,
} from "@/backend/modules/reporting/application/contracts"
import type { ReportingGateway } from "@/backend/modules/reporting/application/ports/reporting.gateway"

type SessionWithRelations = any

export class PrismaReportingGateway implements ReportingGateway {
  async listWeeklyReports(query: WeeklyReportListQuery): Promise<WeeklyReportReadModel[]> {
    const reports = await prisma.weekly_reports.findMany({
      where: {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.weekStart ? { weekStart: { gte: new Date(query.weekStart) } } : {}),
        ...(query.weekEnd ? { weekEnd: { lte: new Date(query.weekEnd) } } : {}),
      },
      orderBy: { weekStart: "desc" },
    })

    const enriched = await Promise.all(
      reports.map(async (report) => {
        const totalLogs = await prisma.work_sessions.count({
          where: {
            userId: report.userId,
            status: "completed",
            startTime: {
              gte: report.weekStart,
              lte: report.weekEnd,
            },
          },
        })

        return {
          id: report.id,
          userId: report.userId,
          userName: report.userName,
          weekStart: report.weekStart.toISOString(),
          weekEnd: report.weekEnd.toISOString(),
          totalLogs,
          summary: report.summary,
          createdAt: report.createdAt.toISOString(),
        } satisfies WeeklyReportReadModel
      }),
    )

    return enriched
  }

  async getWeeklyReportById(id: number): Promise<WeeklyReportReadModel | null> {
    const report = await prisma.weekly_reports.findUnique({
      where: { id },
    })

    if (!report) {
      return null
    }

    const sessions = await this.findCompletedSessions({
      userId: report.userId,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
    })

    const logs: WeeklyReportSessionLog[] = sessions.map((session) => this.mapSessionToWeeklyLog(session))

    return {
      id: report.id,
      userId: report.userId,
      userName: report.userName,
      weekStart: report.weekStart.toISOString(),
      weekEnd: report.weekEnd.toISOString(),
      totalLogs: logs.length,
      summary: report.summary,
      createdAt: report.createdAt.toISOString(),
      logs,
    }
  }

  async upsertWeeklyReport(command: UpsertWeeklyReportCommand): Promise<WeeklyReportReadModel> {
    const user = await prisma.users.findUnique({
      where: { id: command.userId },
      select: { id: true, name: true },
    })
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    const weekStart = new Date(command.weekStart)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(command.weekEnd)
    weekEnd.setHours(23, 59, 59, 999)

    const sessions = await this.findCompletedSessions({
      userId: user.id,
      weekStart,
      weekEnd,
    })

    const totalLogs = sessions.length
    const summary = this.buildWeeklySummary(command.summary, sessions)

    const existing = await prisma.weekly_reports.findFirst({
      where: {
        userId: user.id,
        weekStart,
        weekEnd,
      },
      select: { id: true },
    })

    const report = existing
      ? await prisma.weekly_reports.update({
          where: { id: existing.id },
          data: {
            userName: user.name,
            totalLogs,
            summary,
          },
        })
      : await prisma.weekly_reports.create({
          data: {
            userId: user.id,
            userName: user.name,
            weekStart,
            weekEnd,
            totalLogs,
            summary,
          },
        })

    const logs: WeeklyReportSessionLog[] = sessions.map((session) => this.mapSessionToWeeklyLog(session))

    return {
      id: report.id,
      userId: report.userId,
      userName: report.userName,
      weekStart: report.weekStart.toISOString(),
      weekEnd: report.weekEnd.toISOString(),
      totalLogs: logs.length,
      summary: report.summary,
      createdAt: report.createdAt.toISOString(),
      logs,
    }
  }

  async deleteWeeklyReport(id: number): Promise<void> {
    await prisma.weekly_reports.delete({ where: { id } })
  }

  async getProjectHours(query: ProjectHoursQuery): Promise<ProjectHoursResult> {
    const sessions = await this.findCompletedSessions({
      projectId: query.projectId,
      weekStart: query.weekStart ? new Date(query.weekStart) : undefined,
      weekEnd: query.weekEnd ? new Date(query.weekEnd) : undefined,
    })

    return this.buildProjectHoursResult(query.projectId, sessions)
  }

  async getProjectWeeklyHours(projectId: number, weekStart: string): Promise<ProjectHoursResult> {
    const normalizedWeekStart = new Date(weekStart)
    const normalizedWeekEnd = endOfWeek(normalizedWeekStart, { weekStartsOn: 1 })

    return await this.getProjectHours({
      projectId,
      weekStart: normalizedWeekStart.toISOString(),
      weekEnd: normalizedWeekEnd.toISOString(),
    })
  }

  async getProjectHoursHistory(query: ProjectHoursHistoryQuery) {
    const months = Math.max(1, query.months || 4)
    const now = new Date()

    const weeks = []
    for (let i = 0; i < months * 4; i++) {
      const weekStart = subWeeks(now, i)
      const weekStartNormalized = startOfWeek(weekStart, { weekStartsOn: 1 })
      const weekEndNormalized = endOfWeek(weekStart, { weekStartsOn: 1 })

      const weekData = await this.getProjectHours({
        projectId: query.projectId,
        weekStart: weekStartNormalized.toISOString(),
        weekEnd: weekEndNormalized.toISOString(),
      })

      weeks.push({
        weekStart: format(weekStartNormalized, "dd/MM/yyyy"),
        weekEnd: format(weekEndNormalized, "dd/MM/yyyy"),
        totalHours: weekData.totalHours,
        sessionCount: weekData.sessionCount,
        hoursByUser: weekData.hoursByUser,
      })
    }

    const totalHours = weeks.reduce((sum, week) => sum + week.totalHours, 0)

    return {
      projectId: query.projectId,
      weeks,
      totalHours,
      averageHoursPerWeek: weeks.length > 0 ? totalHours / weeks.length : 0,
    }
  }

  async getUserProjectHours(query: UserProjectHoursQuery) {
    const memberships = await prisma.project_members.findMany({
      where: { userId: query.userId },
      include: {
        project: true,
      },
    })

    const projectsWithHours = []

    for (const membership of memberships) {
      const projectHours = await this.getProjectHours({
        projectId: membership.project.id,
        weekStart: query.weekStart,
        weekEnd: query.weekEnd,
      })

      const userHours = projectHours.hoursByUser.find((entry) => entry.userId === query.userId)

      projectsWithHours.push({
        projectId: membership.project.id,
        projectName: membership.project.name,
        projectStatus: membership.project.status,
        userHours: userHours?.totalHours || 0,
        projectTotalHours: projectHours.totalHours,
        sessionCount: userHours?.sessions?.length || 0,
        userSessions: userHours?.sessions || [],
      })
    }

    return projectsWithHours
  }

  async listWeeklyHoursHistory(query: WeeklyHoursHistoryQuery): Promise<WeeklyHoursHistoryItem[]> {
    const where = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.weekStart
        ? {
            weekStart: {
              gte: startOfWeek(new Date(query.weekStart), { weekStartsOn: 1 }),
              lt: endOfWeek(new Date(query.weekStart), { weekStartsOn: 1 }),
            },
          }
        : {}),
    }

    const history = await prisma.weekly_hours_history.findMany({
      where,
      orderBy: query.weekStart ? { totalHours: "desc" } : { weekStart: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
          },
        },
      },
    })

    return history.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      userName: entry.userName,
      weekStart: entry.weekStart.toISOString(),
      weekEnd: entry.weekEnd.toISOString(),
      totalHours: entry.totalHours,
      createdAt: entry.createdAt.toISOString(),
      user: entry.user
        ? {
            id: entry.user.id,
            name: entry.user.name,
            email: entry.user.email,
            roles: entry.user.roles,
          }
        : undefined,
    }))
  }

  async getWeeklyHoursStats() {
    const now = new Date()
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 })

    const currentWeekHistory = await this.listWeeklyHoursHistory({
      weekStart: currentWeekStart.toISOString(),
    })

    const last4Weeks = []
    for (let i = 1; i <= 4; i++) {
      const weekStart = subWeeks(now, i)
      const weekHistory = await this.listWeeklyHoursHistory({
        weekStart: weekStart.toISOString(),
      })

      last4Weeks.push({
        weekStart: format(startOfWeek(weekStart, { weekStartsOn: 1 }), "dd/MM/yyyy"),
        weekEnd: format(endOfWeek(weekStart, { weekStartsOn: 1 }), "dd/MM/yyyy"),
        totalHours: weekHistory.reduce((sum, item) => sum + item.totalHours, 0),
        userCount: weekHistory.length,
      })
    }

    return {
      currentWeek: {
        weekStart: format(currentWeekStart, "dd/MM/yyyy"),
        weekEnd: format(currentWeekEnd, "dd/MM/yyyy"),
        totalHours: currentWeekHistory.reduce((sum, item) => sum + item.totalHours, 0),
        userCount: currentWeekHistory.length,
        topUsers: currentWeekHistory.slice(0, 5),
      },
      last4Weeks,
    }
  }

  async resetWeeklyHoursHistory() {
    const users = await prisma.users.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    })

    const now = new Date()
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 })

    const results = []

    for (const user of users) {
      const sessions = await prisma.work_sessions.findMany({
        where: {
          userId: user.id,
          status: "completed",
          startTime: {
            gte: currentWeekStart,
            lte: currentWeekEnd,
          },
        },
        select: {
          duration: true,
        },
      })

      const totalSeconds = sessions.reduce((sum, session) => sum + (session.duration || 0), 0)
      const totalHours = totalSeconds / 3600

      if (totalHours > 0) {
        await prisma.weekly_hours_history.create({
          data: {
            userId: user.id,
            userName: user.name,
            weekStart: currentWeekStart,
            weekEnd: currentWeekEnd,
            totalHours,
          },
        })

        results.push({
          userId: user.id,
          userName: user.name,
          savedHours: totalHours.toFixed(1),
          weekStart: format(currentWeekStart, "dd/MM/yyyy"),
          weekEnd: format(currentWeekEnd, "dd/MM/yyyy"),
        })
      }

      await prisma.users.update({
        where: { id: user.id },
        data: { currentWeekHours: 0 },
      })
    }

    return results
  }

  async createWeeklyHoursHistory(weekStart: string) {
    const normalizedWeekStart = startOfWeek(new Date(weekStart), { weekStartsOn: 1 })
    const normalizedWeekEnd = endOfWeek(new Date(weekStart), { weekStartsOn: 1 })

    const users = await prisma.users.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    })

    const results = []

    for (const user of users) {
      const existing = await prisma.weekly_hours_history.findFirst({
        where: {
          userId: user.id,
          weekStart: normalizedWeekStart,
        },
      })
      if (existing) continue

      const sessions = await prisma.work_sessions.findMany({
        where: {
          userId: user.id,
          status: "completed",
          startTime: {
            gte: normalizedWeekStart,
            lte: normalizedWeekEnd,
          },
        },
        select: {
          duration: true,
        },
      })

      const totalSeconds = sessions.reduce((sum, session) => sum + (session.duration || 0), 0)
      const totalHours = totalSeconds / 3600

      if (totalHours > 0) {
        await prisma.weekly_hours_history.create({
          data: {
            userId: user.id,
            userName: user.name,
            weekStart: normalizedWeekStart,
            weekEnd: normalizedWeekEnd,
            totalHours,
          },
        })

        results.push({
          userId: user.id,
          userName: user.name,
          totalHours,
          weekStart: format(normalizedWeekStart, "dd/MM/yyyy"),
          weekEnd: format(normalizedWeekEnd, "dd/MM/yyyy"),
        })
      }
    }

    return results
  }

  async getProjectStats() {
    const projects = await prisma.projects.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const currentWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })

    const stats = []
    for (const project of projects) {
      const weekHours = await this.getProjectHours({
        projectId: project.id,
        weekStart: currentWeekStart.toISOString(),
        weekEnd: currentWeekEnd.toISOString(),
      })

      stats.push({
        projectId: project.id,
        projectName: project.name,
        projectStatus: project.status,
        memberCount: project.members.length,
        currentWeekHours: weekHours.totalHours,
        currentWeekSessions: weekHours.sessionCount,
        members: project.members.map((member) => ({
          userId: member.userId,
          userName: member.user.name,
          roles: member.roles,
        })),
      })
    }

    return stats
  }

  private async findCompletedSessions({
    userId,
    projectId,
    weekStart,
    weekEnd,
  }: {
    userId?: number
    projectId?: number
    weekStart?: Date
    weekEnd?: Date
  }) {
    return await prisma.work_sessions.findMany({
      where: {
        status: "completed",
        ...(userId ? { userId } : {}),
        ...(projectId ? { projectId } : {}),
        ...((weekStart && weekEnd)
          ? {
              startTime: {
                gte: weekStart,
                lte: weekEnd,
              },
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                completed: true,
                projectId: true,
                points: true,
              },
            },
          },
        },
      },
      orderBy: {
        startTime: "desc",
      },
    })
  }

  private buildProjectHoursResult(projectId: number, sessions: SessionWithRelations[]): ProjectHoursResult {
    const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 3600

    const hoursByUserMap = sessions.reduce<Record<number, {
      userId: number
      userName: string | null
      totalHours: number
      sessions: unknown[]
    }>>((acc, session) => {
      if (!acc[session.userId]) {
        acc[session.userId] = {
          userId: session.userId,
          userName: session.userName,
          totalHours: 0,
          sessions: [],
        }
      }

      acc[session.userId].totalHours += (session.duration || 0) / 3600
      acc[session.userId].sessions.push(session)
      return acc
    }, {})

    return {
      projectId,
      totalHours,
      sessionCount: sessions.length,
      hoursByUser: Object.values(hoursByUserMap),
      sessions: sessions.map((session) => ({
        id: session.id,
        userId: session.userId,
        userName: session.userName,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime ? session.endTime.toISOString() : null,
        duration: session.duration,
        activity: session.activity,
        location: session.location,
        linkedTasks: session.tasks.map((sessionTask: any) => sessionTask.task),
      })),
    }
  }

  private mapSessionToWeeklyLog(session: SessionWithRelations): WeeklyReportSessionLog {
    return {
      id: session.id,
      userId: session.userId,
      projectId: session.projectId,
      date: (session.endTime || session.startTime).toISOString(),
      note: session.activity || "Sessão finalizada sem observações",
      createdAt: session.createdAt.toISOString(),
      project: session.project
        ? {
            id: session.project.id,
            name: session.project.name,
          }
        : null,
    }
  }

  private buildWeeklySummary(summary: string | null | undefined, sessions: SessionWithRelations[]) {
    if (typeof summary === "string" && summary.trim().length > 0) {
      return summary.trim()
    }

    if (sessions.length === 0) {
      return "Nenhuma sessão concluída para este período."
    }

    const uniqueDays = new Set(sessions.map((session) => session.startTime.toISOString().split("T")[0])).size
    const uniqueProjects = new Set(sessions.map((session) => session.project?.name).filter(Boolean)).size
    const completedTasks = sessions.reduce((sum, session) => sum + session.tasks.length, 0)

    let text = `Relatório semanal: ${sessions.length} sessões concluídas em ${uniqueDays} dia(s).`
    if (uniqueProjects > 0) {
      text += ` Projetos envolvidos: ${uniqueProjects}.`
    }
    if (completedTasks > 0) {
      text += ` Tasks vinculadas às sessões: ${completedTasks}.`
    }

    return text
  }
}

export function createReportingGateway() {
  return new PrismaReportingGateway()
}

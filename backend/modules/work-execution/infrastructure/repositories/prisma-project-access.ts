import { prisma } from "@/lib/database/prisma"
import { toWorkSessionStatus, type DailyLog, type WorkSession } from "@/backend/domain"
import type {
  LeaderLogsAudit,
  ProjectAccessPort,
} from "@/backend/modules/work-execution/application/ports/project-access.port"

/**
 * PrismaProjectAccess (OND3-B2, R2) — adapter for the cross-aggregate reads the gateway used
 * to do with a direct `prisma` import (membership check, leader scope, leader log reads and
 * the read_by_project_leader audit row). Mapping only; the rules live in the use cases.
 */
function toDailyLog(row: {
  id: number
  userId: number
  projectId: number | null
  date: Date
  note: string | null
  workSessionId: number | null
  createdAt: Date
}): DailyLog {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    date: row.date,
    note: row.note,
    workSessionId: row.workSessionId,
    createdAt: row.createdAt,
  }
}

function toWorkSession(row: {
  id: number
  userId: number
  userName: string
  startTime: Date
  endTime: Date | null
  duration: number | null
  activity: string | null
  location: string | null
  projectId: number | null
  status: string
  createdAt: Date
  updatedAt: Date
}): WorkSession {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.duration,
    activity: row.activity,
    location: row.location,
    projectId: row.projectId,
    status: toWorkSessionStatus(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PrismaProjectAccess implements ProjectAccessPort {
  async isProjectMember(userId: number, projectId: number): Promise<boolean> {
    const membership = await prisma.project_members.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { id: true },
    })
    return membership !== null
  }

  async ledProjectIds(leaderId: number): Promise<number[]> {
    const [ledProjects, managedMemberships] = await Promise.all([
      prisma.projects.findMany({
        where: { leaderId },
        select: { id: true },
      }),
      prisma.project_members.findMany({
        where: { userId: leaderId, roles: { has: "GERENTE_PROJETO" } },
        select: { projectId: true },
      }),
    ])

    return Array.from(
      new Set([
        ...ledProjects.map((project) => project.id),
        ...managedMemberships.map((membership) => membership.projectId),
      ]),
    )
  }

  async listProjectLogs(projectIds: number[], memberUserId?: number): Promise<DailyLog[]> {
    const rows = await prisma.daily_logs.findMany({
      where: {
        projectId: { in: projectIds },
        ...(memberUserId !== undefined ? { userId: memberUserId } : {}),
      },
      include: { user: true, project: true },
      orderBy: { createdAt: "desc" },
    })
    return rows.map(toDailyLog)
  }

  async listProjectSessions(projectIds: number[], memberUserId?: number): Promise<WorkSession[]> {
    const rows = await prisma.work_sessions.findMany({
      where: {
        projectId: { in: projectIds },
        ...(memberUserId !== undefined ? { userId: memberUserId } : {}),
      },
      orderBy: { startTime: "desc" },
    })
    return rows.map(toWorkSession)
  }

  async recordLeaderLogsAudit(audit: LeaderLogsAudit): Promise<void> {
    await prisma.history.create({
      data: {
        entityType: "project_logs",
        entityId: audit.projectId,
        action: "read_by_project_leader",
        performedBy: audit.leaderId,
        description: "Líder leu logs de projetos que lidera",
        metadata: {
          requestedProjectId: audit.requestedProjectId,
          memberUserId: audit.memberUserId,
          ledProjectIds: audit.ledProjectIds,
          logCount: audit.logCount,
          sessionCount: audit.sessionCount,
        },
      },
    })
  }
}

export function createPrismaProjectAccess(): PrismaProjectAccess {
  return new PrismaProjectAccess()
}

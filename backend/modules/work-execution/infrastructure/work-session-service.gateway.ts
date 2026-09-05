import { WorkSessionRepository } from "@/backend/repositories/WorkSessionRepository"
import { DailyLogRepository } from "@/backend/repositories/DailyLogRepository"
import { hasPermission } from "@/lib/auth/rbac"
import { WorkSession } from "@/backend/models/WorkSession"
import { DailyLog } from "@/backend/models/DailyLog"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"
import { prisma } from "@/lib/database/prisma"
import {
  getMissedScheduledPause,
  getNextScheduledPause,
  MAX_STRETCH_SEC,
} from "@/lib/work-sessions/schedule"
import type {
  StartWorkSessionCommand,
  CompleteWorkSessionCommand,
  CreateDailyLogFromSessionCommand,
  ListWorkSessionsQuery,
  ListDailyLogsQuery,
  ListProjectLogsForLeaderCommand,
  ProjectLogsForLeaderResult,
  DeleteWorkSessionCommand,
  UpdateWorkSessionCommand,
} from "@/backend/modules/work-execution/application/contracts"

export class WorkSessionServiceGateway implements WorkExecutionGateway {
  constructor(
    private readonly workSessionRepository: WorkSessionRepository,
    private readonly dailyLogRepository: DailyLogRepository,
  ) {}

  async startWorkSession(command: StartWorkSessionCommand) {
    if (command.projectId !== undefined && command.projectId !== null) {
      if (!hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
        await this.ensureUserIsProjectMember(command.userId, command.projectId)
      }
    }

    const activeSession = await this.workSessionRepository.findActiveByUserId(command.userId)
    if (activeSession?.id) {
      const endTime = new Date()
      const duration = this.closedSessionDuration(activeSession, endTime)

      await this.workSessionRepository.update(activeSession.id, {
        endTime,
        duration,
        status: "completed",
      })
    }

    const session = WorkSession.create(
      command.userId,
      command.userName,
      command.activity,
      command.location,
      command.projectId,
    )

    if (command.startTime) {
      const parsedStartTime = new Date(command.startTime)
      if (Number.isNaN(parsedStartTime.getTime())) {
        throw new Error("startTime inválido")
      }
      session.startTime = parsedStartTime
    }

    return await this.workSessionRepository.create(session)
  }

  async completeWorkSession(command: CompleteWorkSessionCommand) {
    const existingSession = await this.workSessionRepository.findById(command.sessionId)
    if (!existingSession) {
      throw new Error("Sessão não encontrada")
    }

    if (existingSession.userId !== command.actorUserId && !hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
      throw new Error("Não autorizado a atualizar esta sessão")
    }

    if (command.projectId !== undefined && command.projectId !== null) {
      if (!hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
        await this.ensureUserIsProjectMember(command.actorUserId, command.projectId)
      }
    }

    const targetProjectId = command.projectId !== undefined
      ? command.projectId
      : (existingSession.projectId ?? null)

    let taskIdsToAttach: number[] | undefined
    if (command.completedTaskIds !== undefined) {
      const willBeCompleted =
        existingSession.status === "completed" ||
        command.endTime !== undefined

      if (!willBeCompleted) {
        throw new Error("Só é possível vincular tasks em sessões finalizadas")
      }

      taskIdsToAttach = this.normalizeTaskIds(command.completedTaskIds)
      await this.validateCompletedTasksForSession(command.actorUserId, targetProjectId, taskIdsToAttach)
    }

    const endTime = command.endTime !== undefined
      ? (() => {
          const parsed = new Date(command.endTime)
          if (Number.isNaN(parsed.getTime())) {
            throw new Error("endTime inválido")
          }
          return parsed
        })()
      : new Date()

    // A completed session is idempotent: the duration is already final. A
    // paused session already froze its last stretch into duration at pause
    // time. Only an active session still has a stretch that must be counted,
    // and that stretch ends at a missed scheduled pause (the session should
    // have been auto-paused there) if one falls before the end time.
    if (existingSession.status === "active") {
      existingSession.duration = this.closedSessionDuration(existingSession, endTime)
    }

    existingSession.endTime = endTime
    existingSession.status = "completed"

    if (command.activity !== undefined) {
      existingSession.activity = command.activity
    }

    if (command.location !== undefined) {
      existingSession.location = command.location
    }

    if (command.projectId !== undefined) {
      existingSession.projectId = command.projectId
    }

    const completedSession = await this.workSessionRepository.update(command.sessionId, existingSession)

    if (taskIdsToAttach !== undefined) {
      await this.workSessionRepository.replaceSessionTasks(command.sessionId, taskIdsToAttach)
    }

    if (completedSession.status === "completed" && completedSession.id) {
      await this.upsertDailyLogFromSession(
        completedSession,
        command.dailyLogNote,
        command.dailyLogDate,
      )
    }

    return completedSession
  }

  async createDailyLogFromSession(command: CreateDailyLogFromSessionCommand) {
    const session = await this.workSessionRepository.findById(command.sessionId)
    if (!session) {
      throw new Error("Sessão não encontrada")
    }

    if (session.userId !== command.actorUserId) {
      throw new Error("Não autorizado a registrar log desta sessão")
    }

    if (session.status !== "completed") {
      throw new Error("A sessão precisa estar finalizada para gerar log")
    }

    const logDate = command.date || new Date().toISOString().split("T")[0]

    const user = await this.dailyLogRepository.findUserById(session.userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    return await this.dailyLogRepository.create(DailyLog.create({
      id: undefined,
      userId: session.userId,
      projectId: session.projectId || null,
      date: new Date(logDate),
      note: command.note || null,
      workSessionId: session.id,
    }))
  }

  async listWorkSessions(query: ListWorkSessionsQuery) {
    if (query.userId !== undefined && query.status !== undefined) {
      throw new Error("Consulta de sessões inválida")
    }

    if (query.userId !== undefined) {
      const sessions = await this.workSessionRepository.findByUserId(query.userId)
      return await this.normalizeExpiredActiveSessions(sessions)
    }

    if (query.status !== undefined) {
      const sessions = await this.workSessionRepository.findByStatus(query.status)
      const normalizedSessions = await this.normalizeExpiredActiveSessions(sessions)
      return normalizedSessions.filter((session) => session.status === query.status)
    }

    const sessions = await this.workSessionRepository.findAll()
    return await this.normalizeExpiredActiveSessions(sessions)
  }

  async listDailyLogs(query: ListDailyLogsQuery) {
    if (query.userId !== undefined) {
      if (query.date) {
        return await this.dailyLogRepository.findByDate(query.userId, new Date(query.date))
      }
      return await this.dailyLogRepository.findByUserId(query.userId)
    }

    if (query.projectId !== undefined) {
      return await this.dailyLogRepository.findByProjectId(query.projectId)
    }

    return await this.dailyLogRepository.findAll()
  }

  async listProjectLogsForLeader(command: ListProjectLogsForLeaderCommand) {
    // Leadership scope = projects formally led (leaderId) UNION projects where
    // the actor holds the GERENTE_PROJETO membership role.
    const [ledProjects, managedMemberships] = await Promise.all([
      prisma.projects.findMany({
        where: { leaderId: command.leaderId },
        select: { id: true },
      }),
      prisma.project_members.findMany({
        where: { userId: command.leaderId, roles: { has: "GERENTE_PROJETO" } },
        select: { projectId: true },
      }),
    ])
    const ledProjectIds = Array.from(
      new Set([
        ...ledProjects.map((p) => p.id),
        ...managedMemberships.map((m) => m.projectId),
      ]),
    )

    if (ledProjectIds.length === 0) {
      return { logs: [], sessions: [], ledProjectIds }
    }

    if (command.projectId !== undefined && !ledProjectIds.includes(command.projectId)) {
      throw new Error("Acesso negado")
    }

    const scopedProjectIds = command.projectId !== undefined ? [command.projectId] : ledProjectIds
    const logWhere = {
      projectId: { in: scopedProjectIds },
      ...(command.memberUserId !== undefined ? { userId: command.memberUserId } : {}),
    }
    const sessionWhere = {
      projectId: { in: scopedProjectIds },
      ...(command.memberUserId !== undefined ? { userId: command.memberUserId } : {}),
    }

    const [logData, sessionData] = await Promise.all([
      prisma.daily_logs.findMany({
        where: logWhere,
        include: { user: true, project: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.work_sessions.findMany({
        where: sessionWhere,
        orderBy: { startTime: "desc" },
      }),
    ])

    await prisma.history.create({
      data: {
        entityType: "project_logs",
        entityId: command.projectId ?? 0,
        action: "read_by_project_leader",
        performedBy: command.leaderId,
        description: "Líder leu logs de projetos que lidera",
        metadata: {
          requestedProjectId: command.projectId ?? null,
          memberUserId: command.memberUserId ?? null,
          ledProjectIds,
          logCount: logData.length,
          sessionCount: sessionData.length,
        },
      },
    })

    return {
      logs: logData.map((item) => DailyLog.fromPrisma(item)),
      sessions: sessionData.map((item) => WorkSession.fromPrisma(item)),
      ledProjectIds,
    }
  }

  async deleteWorkSession(command: DeleteWorkSessionCommand) {
    const session = await this.workSessionRepository.findById(command.sessionId)
    if (!session) {
      throw new Error("Sessão não encontrada")
    }

    if (session.userId !== command.actorUserId && !hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
      throw new Error("Não autorizado a excluir esta sessão")
    }

    await this.workSessionRepository.delete(command.sessionId)
  }

  async updateWorkSession(command: UpdateWorkSessionCommand) {
    const session = await this.workSessionRepository.findById(command.sessionId)
    if (!session) {
      throw new Error("Sessão não encontrada")
    }

    if (session.userId !== command.actorUserId && !hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
      throw new Error("Não autorizado a atualizar esta sessão")
    }

    if (command.projectId !== undefined && command.projectId !== null) {
      if (!hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
        await this.ensureUserIsProjectMember(command.actorUserId, command.projectId)
      }
    }

    const targetProjectId = command.projectId !== undefined
      ? command.projectId
      : (session.projectId ?? null)

    let taskIdsToAttach: number[] | undefined
    if (command.completedTaskIds !== undefined) {
      const willBeCompleted =
        session.status === "completed" ||
        command.status === "completed" ||
        command.endTime !== undefined

      if (!willBeCompleted) {
        throw new Error("Só é possível vincular tasks em sessões finalizadas")
      }

      taskIdsToAttach = this.normalizeTaskIds(command.completedTaskIds)
      await this.validateCompletedTasksForSession(command.actorUserId, targetProjectId, taskIdsToAttach)
    }

    if (command.endTime !== undefined || (command.status === "completed" && session.status === "active")) {
      // Completion is server-authoritative: the client endTime is only used as
      // a trigger that the operation is a completion; its VALUE is ignored so
      // the record reflects the server clock (clock-skew / manipulation safe).
      const endTime = new Date()
      session.duration = this.closedSessionDuration(session, endTime)
      session.endTime = endTime
      session.status = "completed"
    } else if (command.status === "paused" && session.status === "active") {
      // Server-authoritative pause: the stretch ends at a missed scheduled
      // pause (auto-pause) or now. Capped by MAX_STRETCH_SEC (anti-farm).
      const pausedAt = this.pauseInstantFor(session)
      session.duration = (session.duration || 0)
        + Math.min(MAX_STRETCH_SEC, Math.max(0, (pausedAt.getTime() - session.startTime.getTime()) / 1000))
      session.endTime = pausedAt
      session.status = "paused"
    } else if (command.status === "active" && session.status === "paused") {
      // Resume: a fresh active stretch starts NOW (server-authoritative); the
      // client must not dictate the resume instant (clock-skew safe).
      session.status = "active"
      session.endTime = null
      session.startTime = new Date()
    } else if (command.status !== undefined) {
      session.status = command.status
    }

    // Duration is server-computed on pause (see above); a plain status switch
    // such as resuming must never be overwritten by a stale client value.
    if (command.duration !== undefined && command.status !== "paused") {
      session.duration = Number(command.duration)
    }

    if (command.activity !== undefined) {
      session.activity = command.activity
    }

    if (command.location !== undefined) {
      session.location = command.location
    }

    if (command.projectId !== undefined) {
      session.projectId = command.projectId
    }

    const updated = await this.workSessionRepository.update(command.sessionId, session)

    if (taskIdsToAttach !== undefined) {
      await this.workSessionRepository.replaceSessionTasks(command.sessionId, taskIdsToAttach)
    }

    return updated
  }

  async getSessionById(sessionId: number) {
    const session = await this.workSessionRepository.findById(sessionId)
    if (!session) return null

    return await this.normalizeExpiredActiveSession(session)
  }

  async getDailyLogById(logId: number) {
    return await this.dailyLogRepository.findById(logId)
  }

  private async upsertDailyLogFromSession(
    session: WorkSession,
    note?: string,
    date?: string,
  ) {
    if (!session || !session.id) return

    const normalizedDate = this.resolveLogDate(date, session.endTime)
    const normalizedNote = this.resolveLogNote(note, session)
    const existingLog = await this.dailyLogRepository.findByWorkSessionId(session.id)

    if (existingLog?.id) {
      existingLog.note = normalizedNote
      existingLog.date = normalizedDate
      existingLog.projectId = session.projectId || null
      existingLog.workSessionId = session.id
      await this.dailyLogRepository.update(existingLog)
      return
    }

    await this.dailyLogRepository.create(DailyLog.create({
      userId: session.userId,
      projectId: session.projectId || null,
      date: normalizedDate,
      note: normalizedNote,
      workSessionId: session.id,
    }))
  }

  private resolveLogDate(date?: string, fallbackDate?: Date | null) {
    if (date) {
      return new Date(date)
    }
    if (fallbackDate) {
      return fallbackDate
    }
    return new Date()
  }

  private resolveLogNote(note: string | undefined, session: WorkSession) {
    const trimmed = note?.trim()
    if (trimmed) return trimmed

    const duration = typeof session.duration === "number"
      ? `${Math.floor(session.duration / 60)} minutos`
      : "duração não calculada"
    const activity = session.activity ? `Atividade: ${session.activity}` : ""
    const location = session.location ? `Local: ${session.location}` : ""

    return [
      `Sessão de trabalho finalizada - ${duration}`,
      activity,
      location,
    ]
      .filter(Boolean)
      .join("\n")
  }

  /**
   * Final duration of an active session closed at `closedAt`: the accumulated
   * duration plus the current stretch, which ends at `closedAt` or earlier at
   * the first scheduled pause crossed since `startTime` (the session should
   * have been auto-paused there).
   */
  private closedSessionDuration(session: WorkSession, closedAt: Date): number {
    const missedPause = getMissedScheduledPause(session.startTime, closedAt)
    const activeUntil =
      missedPause && missedPause.getTime() <= closedAt.getTime() ? missedPause : closedAt
    const elapsed = Math.min(
      MAX_STRETCH_SEC,
      Math.max(0, (activeUntil.getTime() - session.startTime.getTime()) / 1000),
    )
    return (session.duration || 0) + elapsed
  }

  /** The instant an active session must be paused at: the first scheduled
   * pause crossed since its start, or now when none was crossed. */
  private pauseInstantFor(session: WorkSession): Date {
    const now = new Date()
    const missedPause = getMissedScheduledPause(session.startTime, now)
    return missedPause && missedPause.getTime() <= now.getTime() ? missedPause : now
  }

  private async normalizeExpiredActiveSessions(sessions: WorkSession[]) {
    return await Promise.all(sessions.map((session) => this.normalizeExpiredActiveSession(session)))
  }

  private async normalizeExpiredActiveSession(session: WorkSession) {
    if (!session.id || session.status !== "active") return session

    // Scheduled auto-pause: a session active across a scheduled pause time
    // (09:30 / 12:00 / 15:00 / 17:00, America/Sao_Paulo) is paused at that
    // instant, not at the moment of this (possibly lazy) normalization.
    const missedPause = getMissedScheduledPause(session.startTime, new Date())
    if (!missedPause) {
      return session
    }

    const elapsedUntilPause = Math.min(
      MAX_STRETCH_SEC,
      Math.max(0, (missedPause.getTime() - session.startTime.getTime()) / 1000),
    )
    const accumulatedDuration = session.duration || 0

    return await this.workSessionRepository.update(session.id, {
      status: "paused",
      endTime: missedPause,
      duration: accumulatedDuration + elapsedUntilPause,
    })
  }

  private normalizeTaskIds(taskIds: number[]) {
    return Array.from(
      new Set(
        taskIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    )
  }

  private async ensureUserIsProjectMember(userId: number, projectId: number) {
    const membership = await prisma.project_members.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      select: { id: true },
    })

    if (!membership) {
      throw new Error("Usuário não é membro do projeto informado")
    }
  }

  private async validateCompletedTasksForSession(
    userId: number,
    projectId: number | null,
    taskIds: number[],
  ) {
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

    if (tasks.length !== taskIds.length) {
      throw new Error("Uma ou mais tasks informadas não foram concluídas por este usuário")
    }

    if (projectId !== null && tasks.some((task) => task.projectId !== projectId)) {
      throw new Error("Todas as tasks vinculadas devem pertencer ao projeto da sessão")
    }

    return tasks.map((task) => task.id)
  }
}

export function createWorkExecutionGateway() {
  return new WorkSessionServiceGateway(
    new WorkSessionRepository(),
    new DailyLogRepository(),
  )
}

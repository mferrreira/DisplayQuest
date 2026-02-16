import { WorkSessionRepository } from "@/backend/repositories/WorkSessionRepository"
import { DailyLogRepository } from "@/backend/repositories/DailyLogRepository"
import { WorkSession } from "@/backend/models/WorkSession"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"
import { prisma } from "@/lib/database/prisma"
import type {
  StartWorkSessionCommand,
  CompleteWorkSessionCommand,
  CreateDailyLogFromSessionCommand,
  ListWorkSessionsQuery,
  ListDailyLogsQuery,
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
      await this.ensureUserIsProjectMember(command.userId, command.projectId)
    }

    const activeSession = await this.workSessionRepository.findActiveByUserId(command.userId)
    if (activeSession?.id) {
      const endTime = new Date()
      const duration = (endTime.getTime() - activeSession.startTime.getTime()) / 1000

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

    if (existingSession.userId !== command.actorUserId) {
      throw new Error("Não autorizado a atualizar esta sessão")
    }

    if (command.projectId !== undefined && command.projectId !== null) {
      await this.ensureUserIsProjectMember(command.actorUserId, command.projectId)
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

    if (command.endTime !== undefined) {
      const endTime = new Date(command.endTime)
      if (Number.isNaN(endTime.getTime())) {
        throw new Error("endTime inválido")
      }
      existingSession.endTime = endTime
      existingSession.status = "completed"
      const accumulatedDuration = existingSession.duration || 0
      const elapsedFromCurrentStart = Math.max(0, (endTime.getTime() - existingSession.startTime.getTime()) / 1000)
      existingSession.duration = accumulatedDuration + elapsedFromCurrentStart
    } else if (existingSession.status === "active") {
      const endTime = new Date()
      existingSession.endTime = endTime
      existingSession.status = "completed"
      const accumulatedDuration = existingSession.duration || 0
      const elapsedFromCurrentStart = Math.max(0, (endTime.getTime() - existingSession.startTime.getTime()) / 1000)
      existingSession.duration = accumulatedDuration + elapsedFromCurrentStart
    }

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

    return await this.dailyLogRepository.create({
      id: undefined,
      userId: session.userId,
      projectId: session.projectId || null,
      date: new Date(logDate),
      note: command.note || null,
      workSessionId: session.id,
    } as any)
  }

  async listWorkSessions(query: ListWorkSessionsQuery) {
    if (query.userId !== undefined && query.status !== undefined) {
      throw new Error("Consulta de sessões inválida")
    }

    if (query.userId !== undefined) {
      return await this.workSessionRepository.findByUserId(query.userId)
    }

    if (query.status !== undefined) {
      return await this.workSessionRepository.findByStatus(query.status)
    }

    return await this.workSessionRepository.findAll()
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

  async deleteWorkSession(command: DeleteWorkSessionCommand) {
    const session = await this.workSessionRepository.findById(command.sessionId)
    if (!session) {
      throw new Error("Sessão não encontrada")
    }

    if (session.userId !== command.actorUserId) {
      throw new Error("Não autorizado a excluir esta sessão")
    }

    await this.workSessionRepository.delete(command.sessionId)
  }

  async updateWorkSession(command: UpdateWorkSessionCommand) {
    const session = await this.workSessionRepository.findById(command.sessionId)
    if (!session) {
      throw new Error("Sessão não encontrada")
    }

    if (session.userId !== command.actorUserId) {
      throw new Error("Não autorizado a atualizar esta sessão")
    }

    if (command.projectId !== undefined && command.projectId !== null) {
      await this.ensureUserIsProjectMember(command.actorUserId, command.projectId)
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

    if (command.endTime !== undefined) {
      const endTime = new Date(command.endTime)
      if (Number.isNaN(endTime.getTime())) {
        throw new Error("endTime inválido")
      }
      session.endTime = endTime
      session.status = "completed"
      const accumulatedDuration = session.duration || 0
      const elapsedFromCurrentStart = Math.max(0, (endTime.getTime() - session.startTime.getTime()) / 1000)
      session.duration = accumulatedDuration + elapsedFromCurrentStart
    } else if (command.status === "completed" && session.status === "active") {
      const endTime = new Date()
      session.endTime = endTime
      session.status = "completed"
      const accumulatedDuration = session.duration || 0
      const elapsedFromCurrentStart = Math.max(0, (endTime.getTime() - session.startTime.getTime()) / 1000)
      session.duration = accumulatedDuration + elapsedFromCurrentStart
    } else if (command.status !== undefined) {
      session.status = command.status
    }

    if (command.startTime !== undefined) {
      const startTime = new Date(command.startTime)
      if (Number.isNaN(startTime.getTime())) {
        throw new Error("startTime inválido")
      }
      session.startTime = startTime
    }

    if (command.duration !== undefined) {
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
    return await this.workSessionRepository.findById(sessionId)
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

    await this.dailyLogRepository.create({
      userId: session.userId,
      projectId: session.projectId || null,
      date: normalizedDate,
      note: normalizedNote,
      workSessionId: session.id,
    } as any)
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

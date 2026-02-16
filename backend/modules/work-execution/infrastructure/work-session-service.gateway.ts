import { WorkSessionService } from "@/backend/services/WorkSessionService"
import { DailyLogService } from "@/backend/services/DailyLogService"
import { DailyLogRepository } from "@/backend/repositories/DailyLogRepository"
import type { WorkSession } from "@/backend/models/WorkSession"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"
import type {
  StartWorkSessionCommand,
  CompleteWorkSessionCommand,
  CreateDailyLogFromSessionCommand,
  ListWorkSessionsQuery,
  DeleteWorkSessionCommand,
  UpdateWorkSessionCommand,
} from "@/backend/modules/work-execution/application/contracts"

export class WorkSessionServiceGateway implements WorkExecutionGateway {
  constructor(
    private readonly workSessionService: WorkSessionService,
    private readonly dailyLogService: DailyLogService,
  ) {}

  async startWorkSession(command: StartWorkSessionCommand) {
    return await this.workSessionService.createSession(
      command.userId,
      command.userName,
      command.activity,
      command.location,
      command.projectId,
    )
  }

  async completeWorkSession(command: CompleteWorkSessionCommand) {
    const existingSession = await this.workSessionService.getSessionById(command.sessionId)
    if (!existingSession) {
      throw new Error("Sessão não encontrada")
    }

    if (existingSession.userId !== command.actorUserId) {
      throw new Error("Não autorizado a atualizar esta sessão")
    }

    const completedSession = await this.workSessionService.updateSession(command.sessionId, command.actorUserId, {
      activity: command.activity,
      location: command.location,
      endTime: command.endTime,
      status: "completed",
      projectId: command.projectId,
      completedTaskIds: command.completedTaskIds,
    })

    if (completedSession.isCompleted() && completedSession.id) {
      await this.upsertDailyLogFromSession(
        completedSession,
        command.dailyLogNote,
        command.dailyLogDate,
      )
    }

    return completedSession
  }

  async createDailyLogFromSession(command: CreateDailyLogFromSessionCommand) {
    const session = await this.workSessionService.getSessionById(command.sessionId)
    if (!session) {
      throw new Error("Sessão não encontrada")
    }

    if (session.userId !== command.actorUserId) {
      throw new Error("Não autorizado a registrar log desta sessão")
    }

    if (!session.isCompleted()) {
      throw new Error("A sessão precisa estar finalizada para gerar log")
    }

    const logDate = command.date || new Date().toISOString().split("T")[0]

    return await this.dailyLogService.create({
      userId: session.userId,
      projectId: session.projectId || null,
      date: logDate,
      note: command.note || null,
      workSessionId: session.id,
    })
  }

  async listWorkSessions(query: ListWorkSessionsQuery) {
    if (query.userId !== undefined && query.status !== undefined) {
      throw new Error("Consulta de sessões inválida")
    }

    if (query.userId !== undefined) {
      return await this.workSessionService.getUserSessions(query.userId)
    }

    if (query.status !== undefined) {
      return await this.workSessionService.getSessionsByStatus(query.status)
    }

    return await this.workSessionService.getAllSessions()
  }

  async deleteWorkSession(command: DeleteWorkSessionCommand) {
    return await this.workSessionService.deleteSession(command.sessionId, command.actorUserId)
  }

  async updateWorkSession(command: UpdateWorkSessionCommand) {
    return await this.workSessionService.updateSession(command.sessionId, command.actorUserId, {
      activity: command.activity,
      location: command.location,
      status: command.status,
      endTime: command.endTime,
      projectId: command.projectId,
      completedTaskIds: command.completedTaskIds,
    })
  }

  async getSessionById(sessionId: number) {
    return await this.workSessionService.getSessionById(sessionId)
  }

  private async upsertDailyLogFromSession(
    session: WorkSession,
    note?: string,
    date?: string,
  ) {
    if (!session || !session.id) return

    const normalizedDate = this.resolveLogDate(date, session.endTime)
    const normalizedNote = this.resolveLogNote(note, session)
    const existingLog = await this.dailyLogService.findByWorkSessionId(session.id)

    if (existingLog?.id) {
      await this.dailyLogService.update(existingLog.id, {
        note: normalizedNote,
        date: normalizedDate,
        projectId: session.projectId || null,
        workSessionId: session.id,
      })
      return
    }

    await this.dailyLogService.create({
      userId: session.userId,
      projectId: session.projectId || null,
      date: normalizedDate.toISOString(),
      note: normalizedNote,
      workSessionId: session.id,
    })
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
}

export function createWorkExecutionGateway() {
  return new WorkSessionServiceGateway(
    new WorkSessionService(),
    new DailyLogService(new DailyLogRepository()),
  )
}

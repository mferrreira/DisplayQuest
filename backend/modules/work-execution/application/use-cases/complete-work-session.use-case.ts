import {
  closedSessionDuration,
  ForbiddenError,
  hasPermission,
  NotFoundError,
  normalizeTaskIds,
  resolveLogDate,
  resolveLogNote,
  ValidationError,
  type DailyLog,
  type WorkSession,
} from "@/backend/domain"
import type { CompleteWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { DailyLogRepositoryPort } from "@/backend/modules/work-execution/application/ports/daily-log.repository"
import type { ProjectAccessPort } from "@/backend/modules/work-execution/application/ports/project-access.port"
import type { TaskVerificationPort } from "@/backend/modules/work-execution/application/ports/task-verification.port"
import type { WorkExecutionEvents } from "@/backend/modules/work-execution/application/ports/work-execution.events"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"

/**
 * CompleteWorkSessionUseCase — OND3-B2 (R2): rules moved from WorkSessionServiceGateway.
 * Behavior frozen by the golden matrix (OND3-B1):
 *   - duration is recomputed ONLY for active sessions (completed/paused are idempotent);
 *   - the client endTime IS honored here (unlike updateWorkSession); the stretch still
 *     truncates at a crossed scheduled pause and is capped at MAX_STRETCH_SEC;
 *   - completedTaskIds require an already-finalized session, are normalized (dedupe,
 *     positive integers) and validated (completed + assigned to the actor + same project);
 *   - a completed session UPSERTS its daily log (auto-note format frozen).
 */
export interface CompleteWorkSessionDependencies {
  workSessions: WorkSessionRepositoryPort
  dailyLogs: DailyLogRepositoryPort
  projectAccess: ProjectAccessPort
  taskVerification: TaskVerificationPort
}

export class CompleteWorkSessionUseCase {
  constructor(
    private readonly dependencies: CompleteWorkSessionDependencies,
    private readonly events?: WorkExecutionEvents,
  ) {}

  async execute(command: CompleteWorkSessionCommand) {
    const existingSession = await this.dependencies.workSessions.findById(command.sessionId)
    if (!existingSession) {
      throw new NotFoundError("Sessão não encontrada")
    }

    if (existingSession.userId !== command.actorUserId && !hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
      throw new ForbiddenError("Não autorizado a atualizar esta sessão")
    }

    if (command.projectId !== undefined && command.projectId !== null) {
      if (!hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
        const isMember = await this.dependencies.projectAccess.isProjectMember(command.actorUserId, command.projectId)
        if (!isMember) {
          throw new ForbiddenError("Usuário não é membro do projeto informado")
        }
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
        throw new ValidationError("Só é possível vincular tasks em sessões finalizadas")
      }

      taskIdsToAttach = normalizeTaskIds(command.completedTaskIds)
      await this.validateCompletedTasks(command.actorUserId, targetProjectId, taskIdsToAttach)
    }

    const endTime = command.endTime !== undefined
      ? (() => {
          const parsed = new Date(command.endTime)
          if (Number.isNaN(parsed.getTime())) {
            throw new ValidationError("endTime inválido")
          }
          return parsed
        })()
      : new Date()

    // A completed session is idempotent: the duration is already final. A paused session
    // already froze its last stretch into duration at pause time. Only an active session
    // still has a stretch that must be counted (truncated at a missed scheduled pause).
    const durationPatch = existingSession.status === "active"
      ? { duration: closedSessionDuration(existingSession, endTime) }
      : {}

    const updates: Partial<WorkSession> = {
      endTime,
      status: "completed",
      ...durationPatch,
    }
    if (command.activity !== undefined) updates.activity = command.activity
    if (command.location !== undefined) updates.location = command.location
    if (command.projectId !== undefined) updates.projectId = command.projectId

    const completedSession = await this.dependencies.workSessions.update(command.sessionId, updates)

    if (taskIdsToAttach !== undefined) {
      await this.dependencies.workSessions.replaceSessionTasks(command.sessionId, taskIdsToAttach)
    }

    if (completedSession.status === "completed" && completedSession.id) {
      await this.upsertDailyLogFromSession(completedSession, command.dailyLogNote, command.dailyLogDate)
    }

    if (this.events && completedSession.status === "completed") {
      try {
        await this.events.onWorkSessionCompleted({
          session: completedSession,
          completedTaskIds: command.completedTaskIds,
        })
      } catch (error) {
        console.error("Erro ao publicar evento de conclusão de sessão para gamificação:", error)
      }
    }

    return completedSession
  }

  private async validateCompletedTasks(userId: number, projectId: number | null, taskIds: number[]) {
    if (taskIds.length === 0) return

    const tasks = await this.dependencies.taskVerification.findCompletedAssignedTasks(userId, taskIds)

    if (tasks.length !== taskIds.length) {
      throw new ValidationError("Uma ou mais tasks informadas não foram concluídas por este usuário")
    }

    if (projectId !== null && tasks.some((task) => task.projectId !== projectId)) {
      throw new ValidationError("Todas as tasks vinculadas devem pertencer ao projeto da sessão")
    }
  }

  private async upsertDailyLogFromSession(session: WorkSession, note?: string, date?: string) {
    if (!session.id) return

    const normalizedDate = resolveLogDate(date, session.endTime, new Date())
    const normalizedNote = resolveLogNote(note, session)
    const existingLog = await this.dependencies.dailyLogs.findByWorkSessionId(session.id)

    if (existingLog?.id) {
      const updatedLog: DailyLog & { id: number } = {
        ...existingLog,
        id: existingLog.id,
        note: normalizedNote,
        date: normalizedDate,
        projectId: session.projectId || null,
        workSessionId: session.id,
      }
      await this.dependencies.dailyLogs.update(updatedLog)
      return
    }

    await this.dependencies.dailyLogs.create({
      userId: session.userId,
      projectId: session.projectId || null,
      date: normalizedDate,
      note: normalizedNote,
      workSessionId: session.id,
    })
  }
}

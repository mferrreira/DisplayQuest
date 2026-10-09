import {
  canActorManageWorkSessions,
  closedSessionDuration,
  ForbiddenError,
  NotFoundError,
  normalizeTaskIds,
  pauseInstantFor,
  stretchSeconds,
  toWorkSessionStatus,
  ValidationError,
  type WorkSession,
} from "@/backend/domain"
import type { UpdateWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/work-execution/application/ports/project-access.port"
import type { TaskVerificationPort } from "@/backend/modules/work-execution/application/ports/task-verification.port"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"
import { requireSessionActor } from "@/backend/modules/work-execution/application/use-cases/internal/require-session-actor"

/**
 * UpdateWorkSessionUseCase — OND3-B2 (R2): rules moved from WorkSessionServiceGateway.
 * Server-authoritative transitions, frozen by the golden matrix (OND3-B1):
 *   - completion (endTime defined OR status completed on an active session): the client
 *     endTime VALUE is IGNORED — the server clock wins; duration = closedSessionDuration.
 *     QUIRK preserved: on an already-completed/paused session this DOUBLE-COUNTS the stretch.
 *   - pause (status paused on an active session): stretch ends at the missed scheduled pause
 *     (or now), accumulates into duration and is capped at MAX_STRETCH_SEC; a client-supplied
 *     duration is ignored on pause.
 *   - resume (status active on a paused session): fresh stretch starts NOW, endTime cleared,
 *     accumulated duration preserved.
 *   - any other status value is assigned verbatim; explicit duration coerced with Number().
 */
export interface UpdateWorkSessionDependencies {
  workSessions: WorkSessionRepositoryPort
  projectAccess: ProjectAccessPort
  taskVerification: TaskVerificationPort
}

export class UpdateWorkSessionUseCase {
  constructor(private readonly dependencies: UpdateWorkSessionDependencies) {}

  async execute(command: UpdateWorkSessionCommand) {
    const session = await this.dependencies.workSessions.findById(command.sessionId)
    if (!session) {
      throw new NotFoundError("Sessão não encontrada")
    }

    const actorUserId = requireSessionActor(
      command.actor,
      session.userId,
      "Não autorizado a atualizar esta sessão",
    )

    if (command.projectId !== undefined && command.projectId !== null) {
      if (!canActorManageWorkSessions(command.actor)) {
        const isMember = await this.dependencies.projectAccess.isProjectMember(actorUserId, command.projectId)
        if (!isMember) {
          throw new ForbiddenError("Usuário não é membro do projeto informado")
        }
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
        throw new ValidationError("Só é possível vincular tasks em sessões finalizadas")
      }

      taskIdsToAttach = normalizeTaskIds(command.completedTaskIds)
      await this.validateCompletedTasks(actorUserId, targetProjectId, taskIdsToAttach)
    }

    const next: Required<Pick<WorkSession, "status" | "endTime" | "duration" | "startTime" | "activity" | "location" | "projectId">> = {
      status: session.status,
      endTime: session.endTime ?? null,
      duration: session.duration ?? null,
      startTime: session.startTime,
      activity: session.activity ?? null,
      location: session.location ?? null,
      projectId: session.projectId ?? null,
    }

    if (command.endTime !== undefined || (command.status === "completed" && session.status === "active")) {
      // Completion is server-authoritative: the client endTime is only a trigger; its VALUE
      // is ignored so the record reflects the server clock (clock-skew / manipulation safe).
      const endTime = new Date()
      next.duration = closedSessionDuration(session, endTime)
      next.endTime = endTime
      next.status = "completed"
    } else if (command.status === "paused" && session.status === "active") {
      // Server-authoritative pause: the stretch ends at a missed scheduled pause
      // (auto-pause) or now, capped by MAX_STRETCH_SEC (anti-farm).
      const pausedAt = pauseInstantFor(session.startTime, new Date())
      next.duration = (session.duration || 0) + stretchSeconds(session.startTime, pausedAt)
      next.endTime = pausedAt
      next.status = "paused"
    } else if (command.status === "active" && session.status === "paused") {
      // Resume: a fresh active stretch starts NOW (server-authoritative).
      next.status = "active"
      next.endTime = null
      next.startTime = new Date()
    } else if (command.status !== undefined) {
      // B10 · D9 (DEC-125): reconciliacao na borda do use case (molde B6-7 — o gate decide
      // sobre o corpo cru). O golden antigo "unknown status assigned verbatim" e superado:
      // status fora de {active, paused, completed} agora e ValidationError (400).
      next.status = toWorkSessionStatus(command.status)
    }

    // Duration is server-computed on pause; a plain status switch must never be
    // overwritten by a stale client value.
    if (command.duration !== undefined && command.status !== "paused") {
      next.duration = Number(command.duration)
    }

    if (command.activity !== undefined) next.activity = command.activity
    if (command.location !== undefined) next.location = command.location
    if (command.projectId !== undefined) next.projectId = command.projectId

    const updated = await this.dependencies.workSessions.update(command.sessionId, next)

    if (taskIdsToAttach !== undefined) {
      await this.dependencies.workSessions.replaceSessionTasks(command.sessionId, taskIdsToAttach)
    }

    return updated
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
}

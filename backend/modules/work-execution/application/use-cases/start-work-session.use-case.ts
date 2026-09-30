import {
  closedSessionDuration,
  ForbiddenError,
  hasPermission,
  ValidationError,
} from "@/backend/domain"
import type { StartWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/work-execution/application/ports/project-access.port"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"

/**
 * StartWorkSessionUseCase — OND3-B2 (R2): rules moved from WorkSessionServiceGateway.
 * Behavior frozen by the golden matrix (OND3-B1):
 *   - membership check first (skipped for MANAGE_WORK_SESSIONS),
 *   - then the user's existing ACTIVE session is closed with the server clock
 *     (stretch truncated at a crossed scheduled pause),
 *   - then the new session is created (custom startTime validated).
 * `throw new Error` became typed errors (R2); messages preserved verbatim.
 */
export interface StartWorkSessionDependencies {
  workSessions: WorkSessionRepositoryPort
  projectAccess: ProjectAccessPort
}

export class StartWorkSessionUseCase {
  constructor(private readonly dependencies: StartWorkSessionDependencies) {}

  async execute(command: StartWorkSessionCommand) {
    if (command.projectId !== undefined && command.projectId !== null) {
      if (!hasPermission(command.actorRoles ?? [], "MANAGE_WORK_SESSIONS")) {
        const isMember = await this.dependencies.projectAccess.isProjectMember(command.userId, command.projectId)
        if (!isMember) {
          throw new ForbiddenError("Usuário não é membro do projeto informado")
        }
      }
    }

    const activeSession = await this.dependencies.workSessions.findActiveByUserId(command.userId)
    if (activeSession?.id) {
      const endTime = new Date()
      const duration = closedSessionDuration(activeSession, endTime)

      await this.dependencies.workSessions.update(activeSession.id, {
        endTime,
        duration,
        status: "completed",
      })
    }

    if (!command.userId || !command.userName?.trim()) {
      throw new ValidationError("Dados inválidos para criar sessão de trabalho")
    }

    const startTime = new Date()
    if (command.startTime) {
      const parsedStartTime = new Date(command.startTime)
      if (Number.isNaN(parsedStartTime.getTime())) {
        throw new ValidationError("startTime inválido")
      }
      startTime.setTime(parsedStartTime.getTime())
    }

    return await this.dependencies.workSessions.create({
      userId: command.userId,
      userName: command.userName,
      startTime,
      endTime: null,
      duration: null,
      activity: command.activity ?? null,
      location: command.location ?? null,
      projectId: command.projectId ?? null,
      status: "active",
    })
  }
}

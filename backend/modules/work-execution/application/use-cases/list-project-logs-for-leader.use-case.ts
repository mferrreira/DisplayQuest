import { ForbiddenError } from "@/backend/domain"
import type {
  ListProjectLogsForLeaderCommand,
  ProjectLogsForLeaderResult,
} from "@/backend/modules/work-execution/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/work-execution/application/ports/project-access.port"

/**
 * ListProjectLogsForLeaderUseCase — OND3-B2 (R2). Rules frozen by golden:
 * scope = projects formally led (leaderId) UNION projects where the actor holds
 * GERENTE_PROJETO; empty scope early-returns WITHOUT audit; a projectId outside the
 * scope is "Acesso negado"; every read with a non-empty scope writes the audit row
 * (even with no rows).
 */
export interface ListProjectLogsForLeaderDependencies {
  projectAccess: ProjectAccessPort
}

export class ListProjectLogsForLeaderUseCase {
  constructor(private readonly dependencies: ListProjectLogsForLeaderDependencies) {}

  async execute(command: ListProjectLogsForLeaderCommand): Promise<ProjectLogsForLeaderResult> {
    const ledProjectIds = await this.dependencies.projectAccess.ledProjectIds(command.leaderId)

    if (ledProjectIds.length === 0) {
      return { logs: [], sessions: [], ledProjectIds }
    }

    if (command.projectId !== undefined && !ledProjectIds.includes(command.projectId)) {
      throw new ForbiddenError("Acesso negado")
    }

    const scopedProjectIds = command.projectId !== undefined ? [command.projectId] : ledProjectIds

    const [logs, sessions] = await Promise.all([
      this.dependencies.projectAccess.listProjectLogs(scopedProjectIds, command.memberUserId),
      this.dependencies.projectAccess.listProjectSessions(scopedProjectIds, command.memberUserId),
    ])

    await this.dependencies.projectAccess.recordLeaderLogsAudit({
      projectId: command.projectId ?? 0,
      leaderId: command.leaderId,
      requestedProjectId: command.projectId ?? null,
      memberUserId: command.memberUserId ?? null,
      ledProjectIds,
      logCount: logs.length,
      sessionCount: sessions.length,
    })

    return { logs, sessions, ledProjectIds }
  }
}

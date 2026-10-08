import { ForbiddenError } from "@/backend/domain"
import type {
  ListProjectLogsForLeaderCommand,
  ProjectLogsForLeaderResult,
} from "@/backend/modules/work-execution/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/work-execution/application/ports/project-access.port"

/**
 * ListProjectLogsForLeaderUseCase — OND3-B2 (R2). Rules frozen by golden:
 * scope = projects formally led (leaderId) UNION projects where the actor holds
 * GERENTE_PROJETO; a projectId outside the scope is ForbiddenError; every read with a
 * non-empty scope writes the audit row (even with no rows).
 *
 * B6-5 (D4): escopo vazio passou de early-return (a decisao de 403 da rota vazada no contrato)
 * para ForbiddenError com a mensagem da rota chamadora (`deniedMessage`). O audit continua
 * so para escopo nao-vazio.
 */
export interface ListProjectLogsForLeaderDependencies {
  projectAccess: ProjectAccessPort
}

export class ListProjectLogsForLeaderUseCase {
  constructor(private readonly dependencies: ListProjectLogsForLeaderDependencies) {}

  async execute(command: ListProjectLogsForLeaderCommand): Promise<ProjectLogsForLeaderResult> {
    // B6-5 (D4): o ator e ActorRef, e a decisao de escopo vazio (antes 403 montado pela rota)
    // passou para aqui, com a mensagem congelada da rota chamadora (parametro `deniedMessage`):
    // "Acesso negado" no GET /api/work-sessions, "Acesso negado." (com ponto) no GET /api/daily_logs.
    // O early-return vazio do golden era a decisao de 403 da rota vazada no contrato — nenhum
    // outro chamador existia. System nao tem pessoa atras: o caminho do lider exige um.
    if (command.actor.kind !== "user") {
      throw new ForbiddenError(command.deniedMessage ?? "Acesso negado")
    }
    const leaderId = command.actor.id

    const ledProjectIds = await this.dependencies.projectAccess.ledProjectIds(leaderId)

    if (ledProjectIds.length === 0) {
      throw new ForbiddenError(command.deniedMessage ?? "Acesso negado")
    }

    if (command.projectId !== undefined && !ledProjectIds.includes(command.projectId)) {
      throw new ForbiddenError(command.deniedMessage ?? "Acesso negado")
    }

    const scopedProjectIds = command.projectId !== undefined ? [command.projectId] : ledProjectIds

    const [logs, sessions] = await Promise.all([
      this.dependencies.projectAccess.listProjectLogs(scopedProjectIds, command.memberUserId),
      this.dependencies.projectAccess.listProjectSessions(scopedProjectIds, command.memberUserId),
    ])

    await this.dependencies.projectAccess.recordLeaderLogsAudit({
      projectId: command.projectId ?? 0,
      leaderId,
      requestedProjectId: command.projectId ?? null,
      memberUserId: command.memberUserId ?? null,
      ledProjectIds,
      logCount: logs.length,
      sessionCount: sessions.length,
    })

    return { logs, sessions, ledProjectIds }
  }
}

import { canActorManageWorkSessions, ForbiddenError, ValidationError } from "@/backend/domain"
import type { ListWorkSessionsQuery } from "@/backend/modules/work-execution/application/contracts"
import { normalizeExpiredActiveSessions } from "@/backend/modules/work-execution/application/use-cases/internal/normalize-expired-active-sessions"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"
import type { ListProjectLogsForLeaderUseCase } from "@/backend/modules/work-execution/application/use-cases/list-project-logs-for-leader.use-case"

/**
 * ListWorkSessionsUseCase — OND3-B2 (R2). Frozen by golden: userId+status together is an
 * invalid query; expired active sessions are normalized to paused BEFORE filtering, so
 * status="active" EXCLUDES them.
 *
 * B6-5 (D4): a resolucao de ESCOPO que vivia na rota GET /api/work-sessions passou para aqui,
 * lendo o ActorRef (ordem medida na rota legado):
 *  - `projectId` vem ANTES do gate self: gestor ve o projeto por varredura; sem gestao cai no
 *    caminho do lider (403 "Acesso negado" quando o ator nao lidera nada — decisao que era da
 *    rota, agora no use case irmao com a mensagem passada por parametro).
 *  - sem gestao: `userId` de OUTRO e 403 "Acesso negado" (o ensureSelfOrPermission legado);
 *    sempre lista as proprias e o filtro de status/active e IGNORADO (quirk congelado: a rota
 *    nunca mandava status para nao-gestor).
 *  - gestor: `activeOnly` vence `userId`, que vence `status` (a ordem das branches da rota).
 *  - system (cron, NIGHTLY_SWEEP): bypass declarado (DEC-54) — varredura crua, sem escopo.
 * A rota mantem apenas a PRIORIDADE DE PARAMETROS (active > userId > status), que e semantica
 * de consulta, nao autorizacao; assim o quirk golden do userId+status invalido segue valendo
 * para chamadores diretos sem mudar a resposta da rota.
 */
export interface ListWorkSessionsDependencies {
  workSessions: WorkSessionRepositoryPort
  leaderLogs: ListProjectLogsForLeaderUseCase
}

export class ListWorkSessionsUseCase {
  constructor(private readonly dependencies: ListWorkSessionsDependencies) {}

  async execute(query: ListWorkSessionsQuery) {
    const { actor } = query

    if (query.projectId !== undefined) {
      if (canActorManageWorkSessions(actor)) {
        const sessions = await this.dependencies.workSessions.findAll()
        const normalized = await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
        return normalized.filter((session) => session.projectId === query.projectId)
      }

      const leader = await this.dependencies.leaderLogs.execute({
        actor,
        projectId: query.projectId,
        deniedMessage: "Acesso negado",
      })
      if (query.userId !== undefined) {
        return leader.sessions.filter((session) => session.userId === query.userId)
      }
      return leader.sessions
    }

    // Sem gestao so vale para PESSOA: system passa em `canActorManageWorkSessions` (bypass
    // declarado, DEC-54) e cai na varredura crua de baixo.
    if (actor.kind === "user" && !canActorManageWorkSessions(actor)) {
      if (query.userId !== undefined && query.userId !== actor.id) {
        throw new ForbiddenError("Acesso negado")
      }
      const sessions = await this.dependencies.workSessions.findByUserId(actor.id)
      return await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
    }

    if (query.userId !== undefined && query.status !== undefined) {
      throw new ValidationError("Consulta de sessões inválida")
    }

    if (query.activeOnly) {
      const sessions = await this.dependencies.workSessions.findByStatus("active")
      const normalizedSessions = await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
      return normalizedSessions.filter((session) => session.status === "active")
    }

    if (query.userId !== undefined) {
      const sessions = await this.dependencies.workSessions.findByUserId(query.userId)
      return await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
    }

    if (query.status !== undefined) {
      const sessions = await this.dependencies.workSessions.findByStatus(query.status)
      const normalizedSessions = await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
      return normalizedSessions.filter((session) => session.status === query.status)
    }

    const sessions = await this.dependencies.workSessions.findAll()
    return await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
  }
}

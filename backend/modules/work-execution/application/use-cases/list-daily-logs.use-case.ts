import { canViewAllDailyLogs } from "@/backend/domain"
import type { ListDailyLogsQuery } from "@/backend/modules/work-execution/application/contracts"
import type { DailyLogRepositoryPort } from "@/backend/modules/work-execution/application/ports/daily-log.repository"
import type { ListProjectLogsForLeaderUseCase } from "@/backend/modules/work-execution/application/use-cases/list-project-logs-for-leader.use-case"

/**
 * ListDailyLogsUseCase — OND3-B2 (R2). Dispatch frozen by golden:
 * userId+date -> findByDate (LOCAL day boundaries); userId -> findByUserId;
 * projectId -> findByProjectId; otherwise findAll.
 *
 * B6-5 (D4): a resolucao de ESCOPO do GET /api/daily_logs passou para aqui, lendo o ActorRef
 * (ordem medida na rota legado):
 *  - composta MANAGE_USERS || LABORATORISTA (DEC-117 — LABORATORISTA nao tem MANAGE_USERS na
 *    matriz, mas ve todos os logs) ve tudo no dispatch cru.
 *  - sem a composta: `userId` de OUTRO cai no caminho do lider (logs dos membros dos projetos
 *    que o ator lidera); `projectId` idem; sem parametros, as proprias linhas.
 *  - o 403 do caminho do lider (escopo vazio ou projeto fora do escopo) agora e o use case
 *    irmao que decide, com a mensagem congelada da rota: "Acesso negado." COM PONTO FINAL
 *    (diferente do "Acesso negado" do GET /api/work-sessions — medido).
 */
export interface ListDailyLogsDependencies {
  dailyLogs: DailyLogRepositoryPort
  leaderLogs: ListProjectLogsForLeaderUseCase
}

export class ListDailyLogsUseCase {
  constructor(private readonly dependencies: ListDailyLogsDependencies) {}

  async execute(query: ListDailyLogsQuery) {
    const { actor } = query

    // Sem a composta so vale para PESSOA: system passa em `canViewAllDailyLogs` (bypass
    // declarado, DEC-54) e cai no dispatch cru de baixo.
    if (actor.kind === "user" && !canViewAllDailyLogs(actor)) {
      if (query.userId !== undefined && query.userId !== actor.id) {
        const result = await this.dependencies.leaderLogs.execute({
          actor,
          memberUserId: query.userId,
          deniedMessage: "Acesso negado.",
        })
        return result.logs
      }

      if (query.projectId !== undefined) {
        const result = await this.dependencies.leaderLogs.execute({
          actor,
          projectId: query.projectId,
          deniedMessage: "Acesso negado.",
        })
        return result.logs
      }

      // Sem a composta e sem pedir outro usuario/projeto: so as proprias linhas (a rota legado
      // forçava `userId: actor.id` — nunca findAll). `date` so vale junto de userId proprio.
      if (query.userId !== undefined && query.date) {
        return await this.dependencies.dailyLogs.findByDate(actor.id, new Date(query.date))
      }
      return await this.dependencies.dailyLogs.findByUserId(actor.id)
    }

    return await this.dispatch(query)
  }

  private async dispatch(query: ListDailyLogsQuery) {
    if (query.userId !== undefined) {
      if (query.date) {
        return await this.dependencies.dailyLogs.findByDate(query.userId, new Date(query.date))
      }
      return await this.dependencies.dailyLogs.findByUserId(query.userId)
    }

    if (query.projectId !== undefined) {
      return await this.dependencies.dailyLogs.findByProjectId(query.projectId)
    }

    return await this.dependencies.dailyLogs.findAll()
  }
}

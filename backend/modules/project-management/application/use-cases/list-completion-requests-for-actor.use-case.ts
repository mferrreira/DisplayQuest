import {
  ForbiddenError,
  COMPLETION_QUEUE_DENIED_MESSAGE,
  activityCompletionAward,
  activityPeriod,
  civilDayOfInstant,
  hasFeatureAccess,
} from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"
import type { ProjectCompletionRequestsPort } from "@/backend/modules/project-management/application/ports/project-completion-requests.port"

/**
 * ListCompletionRequestsForActorUseCase — S01 (plan-v12, R1/R3, DEC-238). A leitura da fila
 * global de solicitações de conclusão para a aba "Conclusões" do painel.
 *
 * Gate: `DASHBOARD_ADMIN` — o mesmo conjunto dos aprovadores globais. Um use case de leitura
 * gateado é o padrão da casa (B6/D4): a rota autentica e a decisão mora aqui. System ator passa
 * (não há rota que o declare; o guarda de `systemActor(` em `app/api/**` continua a travar).
 *
 * O que o use case acrescenta ao port: `periodoInicio`/`periodoFim` derivados (DEC-126a, nunca
 * armazenados) e o **prêmio previsto** pela MESMA `activityCompletionAward` da economia, com
 * `approvedDay = civilDayOfInstant(now)` (DEC-132). Preview é leitura: nenhuma escrita, nenhum
 * estado; aprovar pela fila usa a rota existente. A tela não recalcula nada (R7 da casa).
 */
export interface ListCompletionRequestsForActorDependencies {
  completionRequests: ProjectCompletionRequestsPort
}

export interface CompletionRequestRow {
  projectId: number
  projectName: string
  activityId: number
  order: number
  description: string
  periodoInicio: string
  periodoFim: string
  requestedBy: number | null
  requestedByName: string | null
  requestedAt: string | null
  /** Prêmio previsto se a aprovação fosse hoje — a mesma função da fase de aprovar. */
  award: number
}

export class ListCompletionRequestsForActorUseCase {
  constructor(private readonly dependencies: ListCompletionRequestsForActorDependencies) {}

  async execute(command: { actor: ActorRef; now: Date }): Promise<CompletionRequestRow[]> {
    if (command.actor.kind === "user" && !hasFeatureAccess(command.actor.roles, "DASHBOARD_ADMIN")) {
      throw new ForbiddenError(COMPLETION_QUEUE_DENIED_MESSAGE)
    }

    const records = await this.dependencies.completionRequests.listCompletionRequests()
    const approvedDay = civilDayOfInstant(command.now)

    // A ordem da fila é regra do use case, não cortesia do adaptador: projeto, `order`, id.
    // Provar a ordem só no `orderBy` do Prisma deixava o guarantee fora do contrato.
    const sorted = [...records].sort(
      (a, b) => a.projectId - b.projectId || a.order - b.order || a.activityId - b.activityId,
    )

    return sorted.map((record) => {
      const { periodoInicio, periodoFim } = activityPeriod(record.firstMonth, record.lastMonth)
      return {
        projectId: record.projectId,
        projectName: record.projectName,
        activityId: record.activityId,
        order: record.order,
        description: record.description,
        periodoInicio,
        periodoFim,
        requestedBy: record.requestedBy,
        requestedByName: record.requestedByName,
        requestedAt: record.requestedAt,
        award: activityCompletionAward({
          firstMonth: record.firstMonth,
          lastMonth: record.lastMonth,
          approvedDay,
        }),
      }
    })
  }
}

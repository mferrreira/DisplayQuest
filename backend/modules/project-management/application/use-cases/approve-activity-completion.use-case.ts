import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  activityApproveConflictMessage,
  activityCompletionAward,
  canActorApproveActivityCompletionDecision,
  civilDayOfInstant,
  distributeActivityAward,
  isActivityApprovable,
  memberTaskCredits,
} from "@/backend/domain"
import type { ActivityStatus } from "@/backend/domain"
import type { ApproveActivityCompletionCommand } from "@/backend/modules/project-management/application/contracts"
import type { ActivityCompletionAwardPort } from "@/backend/modules/project-management/application/ports/activity-completion-award.port"
import type { ActivityEconomyTasksPort } from "@/backend/modules/project-management/application/ports/activity-economy-tasks.port"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ApproveActivityCompletionUseCase — V5-7b (DEC-63/74/76/77/103/104/163/164/165). A fase 2:
 * COMPLETION_REQUESTED → DONE, com o prêmio caindo na distribuição Hamilton sobre os membros
 * ATIVOS do vínculo e o saldo do projeto incrementado.
 *
 * A ordem das recusas espelha a fase de solicitar, com uma diferença medida: o gate precisa
 * do `requestedBy` da atividade (auto-aprovação, DEC-77), então ele corre DEPOIS do 404 da
 * atividade — 404 projeto → 404 atividade → 403 gate → 409 status.
 *
 * A ordem das ESCRITAS é a decisão medida (DEC-165), ajustada na V8-1 (DEC-215): prêmios
 * (idempotentes por membro, `GAMIFICATION:ACTIVITY_COMPLETED:<atividade>`) → transição de
 * status. O incremento de `projects.points` que ficava no meio saiu junto da coluna. Qualquer
 * falha antes da transição deixa o mundo re-executável: os prêmios já creditados devolvem 0 na
 * repetição e a atividade segue REQUESTED. A transição por último é o ponto de commit — é o que
 * impede a economia de rodar duas vezes para o mesmo membro.
 *
 * A falha de um crédito não quebra a conclusão (quirk congelado do caminho de tarefa,
 * `task-view.ts`): o fluxo registra a atividade concluída e o erro do crédito fica no log.
 */
export interface ApproveActivityCompletionDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
  economyTasks: ActivityEconomyTasksPort
  awards: ActivityCompletionAwardPort
}

export interface ActivityAwardShare {
  userId: number
  /** O que a distribuição calculou. 0 quando o crédito já estava registrado (idempotência) ou falhou. */
  points: number
}

export interface ApproveActivityCompletionResult {
  activity: Awaited<ReturnType<ProjectCronogramaPort["approveActivity"]>>
  award: number
  shares: ActivityAwardShare[]
}

export class ApproveActivityCompletionUseCase {
  constructor(private readonly dependencies: ApproveActivityCompletionDependencies) {}

  async execute(command: ApproveActivityCompletionCommand): Promise<ApproveActivityCompletionResult> {
    const project = await this.dependencies.projects.findById(command.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const activity = await this.dependencies.cronograma.findActivityById(command.activityId)
    if (!activity || activity.projectId !== command.projectId) {
      throw new NotFoundError("Atividade não encontrada")
    }

    // O gate da fase 2 é outro (DEC-76/77): só GLOBAL_PROJECT_MANAGERS, e GERENTE não aprova
    // o que ele mesmo pediu. Ele lê o `requestedBy` da atividade — por isso vem depois do 404.
    if (
      !canActorApproveActivityCompletionDecision(
        command.actorId,
        command.actorRoles,
        activity.requestedBy ?? null,
      )
    ) {
      throw new ForbiddenError("Usuário não tem permissão para aprovar a conclusão desta atividade")
    }

    const status = activity.status as ActivityStatus
    if (!isActivityApprovable(status)) {
      throw new ConflictError(activityApproveConflictMessage(status))
    }

    // Prêmio (DEC-103/74): o dia comparado ao prazo derivado é data civil do instante de
    // aprovação (DEC-132 — nunca `new Date()` solto em regra de tempo).
    const award = activityCompletionAward({
      firstMonth: activity.firstMonth,
      lastMonth: activity.lastMonth,
      approvedDay: civilDayOfInstant(command.now),
    })

    // Atribuição (DEC-163) e distribuição (DEC-104/164/165): só membros ATIVOS do vínculo
    // entram na conta; o denominador é a soma dos créditos DELES — a leitura literal "tasks
    // do projeto" diluiria o prêmio até ele sumir, e a regra congelada "soma das partes ==
    // prêmio" vence (DEC-165).
    const memberIds = await this.dependencies.memberships.listActiveMemberUserIds(command.projectId)
    const credits = memberTaskCredits(await this.dependencies.economyTasks.listCompletedTaskCredits(command.projectId))
    const shares = distributeActivityAward(
      award,
      memberIds.map((userId) => ({ userId, completedTasks: credits.get(userId) ?? 0 })),
    )

    const credited: ActivityAwardShare[] = []
    for (const [userId, points] of shares) {
      if (points <= 0) continue
      try {
        const outcome = await this.dependencies.awards.awardActivityCompletion({
          userId,
          activityId: activity.id,
          points,
        })
        credited.push({ userId, points: outcome?.pointsAwarded ?? 0 })
      } catch (error) {
        // Quirk congelado do caminho de tarefa: falha de award não quebra a conclusão.
        console.error("Erro ao creditar prêmio de atividade aprovada:", error)
        credited.push({ userId, points: 0 })
      }
    }

    const updated = await this.dependencies.cronograma.approveActivity(activity.id, {
      status: "DONE",
      approvedBy: command.actorId,
      approvedAt: command.now,
    })

    return { activity: updated, award, shares: credited }
  }
}

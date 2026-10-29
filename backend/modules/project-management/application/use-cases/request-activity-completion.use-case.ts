import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ACTIVITY_COMPLETION_REQUEST_TITLE,
  ACTIVITY_NO_PROOF_MESSAGE,
  activityCompletionRequestMessage,
  activityOpenTasksMessage,
  activityRequestConflictMessage,
  completionRequestRecipients,
  isActivityRequestable,
  systemActor,
  SYSTEM_REASONS,
} from "@/backend/domain"
import type { ActivityStatus } from "@/backend/domain"
import type { RequestActivityCompletionCommand } from "@/backend/modules/project-management/application/contracts"
import type { ActivityTasksPort } from "@/backend/modules/project-management/application/ports/activity-tasks.port"
import type { ActivityOverdueScanPort } from "@/backend/modules/project-management/application/ports/activity-overdue-scan.port"
import type { ActivityCompletionRequestNotifierPort } from "@/backend/modules/project-management/application/ports/activity-completion-request-notifier.port"
import type { ProjectActivityFilesPort } from "@/backend/modules/project-management/application/ports/project-activity-files.repository"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanRequestActivityCompletion } from "@/backend/modules/project-management/application/use-cases/internal/activity-completion-access"

/**
 * RequestActivityCompletionUseCase — V5-7a (DEC-76/99/162). A fase 1 das duas fases:
 * OPEN → COMPLETION_REQUESTED, com quem pediu e quando. O prêmio NÃO cai aqui — só na
 * aprovação (DEC-76), que é o batch V5-7b.
 *
 * A ordem das recusas é medida, não decorativa:
 *   1. projeto ausente → 404; gate (líder OU membership de gestor, DEC-76) → 403;
 *   2. atividade ausente ou de outro projeto → 404;
 *   3. status que já passou da fase → 409 com a frase do status (DEC-162; 409 porque o
 *      conflito é o estado do mundo, a gramática da janela DEC-80);
 *   4. trava DEC-99: tarefa aberta ligada à atividade → 400 dizendo QUANTAS (DEC-57 vale
 *      para a mãe-atividade);
 *   5. exigência de prova (DEC-162): nenhum arquivo → 400, e a atividade fica OPEN.
 *
 * O gate rechecha aqui de propósito (DEC-54): a rota já o executou antes do corpo; este é o
 * que protege qualquer outro chamador do use case.
 */
export interface RequestActivityCompletionDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  files: ProjectActivityFilesPort
  tasks: ActivityTasksPort
  memberships: ProjectManagementMembershipPort
  /** Fix 4: papéis globais de gestão ATIVOS (audiência da notificação de solicitação). */
  scan: ActivityOverdueScanPort
  /** Fix 4 (DEC-21): quem publica a notificação prioritária. O composition root injeta notifications. */
  notifier: ActivityCompletionRequestNotifierPort
}

export class RequestActivityCompletionUseCase {
  constructor(private readonly dependencies: RequestActivityCompletionDependencies) {}

  async execute(command: RequestActivityCompletionCommand) {
    const { project, canRequest } = await resolveCanRequestActivityCompletion(
      { projects: this.dependencies.projects, memberships: this.dependencies.memberships },
      command.projectId,
      command.actorId,
    )
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }
    if (!canRequest) {
      throw new ForbiddenError("Usuário não tem permissão para solicitar a conclusão desta atividade")
    }

    const activity = await this.dependencies.cronograma.findActivityById(command.activityId)
    if (!activity || activity.projectId !== command.projectId) {
      throw new NotFoundError("Atividade não encontrada")
    }

    const status = activity.status as ActivityStatus
    if (!isActivityRequestable(status)) {
      throw new ConflictError(activityRequestConflictMessage(status))
    }

    const openTasks = await this.dependencies.tasks.countOpenByActivity(activity.id)
    if (openTasks > 0) {
      throw new ValidationError(activityOpenTasksMessage(openTasks))
    }

    const proofs = await this.dependencies.files.countByActivity(activity.id)
    if (proofs === 0) {
      throw new ValidationError(ACTIVITY_NO_PROOF_MESSAGE)
    }

    const requested = await this.dependencies.cronograma.requestActivity(activity.id, {
      status: "COMPLETION_REQUESTED",
      requestedBy: command.actorId,
      requestedAt: command.now,
    })

    // Fix 4: a solicitação é um evento que a gestão precisa ver. Publica DEPOIS da escrita, com
    // `systemActor` (DEC-54) — quem pediu é pessoa, mas não publica; o sistema anuncia. A
    // audiência é a gestão global ATIVA (coordenação/gerência), não o líder que pediu. Falha de
    // notificação não derruba a solicitação: a atividade já está COMPLETION_REQUESTED, e o 409 da
    // fase protege a reentrada — perder aviso é o quirk aceito do caminho de atraso.
    const recipients = completionRequestRecipients(
      await this.dependencies.scan.listGlobalManagerUserIds(),
    )
    if (recipients.length > 0) {
      try {
        await this.dependencies.notifier.publishRequest(
          {
            activityId: activity.id,
            userIds: recipients,
            title: ACTIVITY_COMPLETION_REQUEST_TITLE,
            message: activityCompletionRequestMessage(project.name, activity.description),
          },
          systemActor(SYSTEM_REASONS.SYSTEM_EVENT),
        )
      } catch (error) {
        console.error(`⚠️ Não foi possível notificar a solicitação da atividade ${activity.id}:`, error)
      }
    }

    return requested
  }
}

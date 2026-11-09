import {
  ForbiddenError,
  NotFoundError,
} from "@/backend/domain"
import type { DeleteProjectDeliverableFileCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectDeliverableFilesPort } from "@/backend/modules/project-management/application/ports/project-deliverable-files.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * DeleteProjectDeliverableFileUseCase — S03 (plan-v21, DEC-258/133).
 *
 * Mesma ordem do add: projeto 404 → gate 403 → entregável 404 → arquivo 404. O vínculo
 * file↔entregável é a regra: arquivo de entregável vizinho do MESMO projeto é 404, não "achei e
 * apaguei" (a mesma régua do GET, medida na rota e na integração).
 *
 * O record removido sai daqui com a `blobKey` — a rota remove o objeto do bucket DEPOIS, e o
 * registro já era fora quando o bucket mexe. Se a escrita do bucket falhar, o registro não volta
 * (lição do V5-2d: o estado que o banco diz é a verdade; objeto órfão é lixo de bucket).
 */
export interface DeleteProjectDeliverableFileDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  files: ProjectDeliverableFilesPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class DeleteProjectDeliverableFileUseCase {
  constructor(private readonly dependencies: DeleteProjectDeliverableFileDependencies) {}

  async execute(command: DeleteProjectDeliverableFileCommand) {
    const project = await this.dependencies.projects.findById(command.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const canManage = await resolveCanActorManageProject(
      { memberships: this.dependencies.memberships, actors: this.dependencies.actors },
      command.projectId,
      command.actorId,
    )
    if (!canManage) {
      throw new ForbiddenError("Usuário não tem permissão para gerenciar este projeto")
    }

    const deliverable = await this.dependencies.deliverables.findById(command.deliverableId)
    if (!deliverable || deliverable.projectId !== command.projectId) {
      throw new NotFoundError("Entregável não encontrado")
    }

    const file = await this.dependencies.files.findById(command.fileId)
    if (!file || file.deliverableId !== deliverable.id) {
      throw new NotFoundError("Arquivo não encontrado")
    }

    const removed = await this.dependencies.files.delete(file.id)
    if (!removed) {
      throw new NotFoundError("Arquivo não encontrado")
    }
    return removed
  }
}
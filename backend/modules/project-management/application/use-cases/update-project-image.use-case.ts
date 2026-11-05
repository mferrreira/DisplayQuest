import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { ProjectImageSlot } from "@/backend/domain"
import type { UpdateProjectImageCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectImageUseCase — V5-2d (DEC-102). Escreve (ou limpa) um slot de imagem do projeto e
 * devolve a chave anterior.
 *
 * Devolver a chave anterior é o ponto: quem apaga o objeto velho do bucket é a rota, pelo seam
 * (DEC-133), e sem a chave anterior o projeto ficaria com um objeto que nenhuma tela alcança. O
 * use case não conhece bucket nenhum.
 *
 * `blobKey: null` é "tira a imagem", não "apaga o arquivo": o registro é limpo e a rota decide o
 * que fazer com o objeto.
 */
export interface UpdateProjectImageDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class UpdateProjectImageUseCase {
  constructor(private readonly dependencies: UpdateProjectImageDependencies) {}

  async execute(command: UpdateProjectImageCommand) {
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

    const field = command.slot === "logo" ? "logoKey" : "bannerKey"
    const previousKey = (project[field] as string | null | undefined) ?? null

    const updated = await this.dependencies.projects.update({
      ...project,
      [field]: command.blobKey,
    })

    return {
      slot: command.slot,
      blobKey: command.blobKey,
      previousKey,
      project: updated,
    }
  }
}

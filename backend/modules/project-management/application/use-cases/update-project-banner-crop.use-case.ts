import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { UpdateProjectBannerCropCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectBannerCropUseCase — plan-v12 (DEC-239): grava os parâmetros do recorte da capa
 * do projeto (`bannerCropX`/`bannerCropY`/`bannerCropZoom`).
 *
 * Gate: o MESMO da escrita de imagem do projeto (`resolveCanActorManageProject` — ACL do
 * vínculo, não `MANAGE_USERS`). O binário não passa por aqui (DEC-133): o recorte é parâmetro,
 * o original continua no bucket na mesma chave. A rota clampa por `clampBannerCrop` antes de
 * chamar; este use case escreve o que recebeu.
 */
export interface UpdateProjectBannerCropDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class UpdateProjectBannerCropUseCase {
  constructor(private readonly dependencies: UpdateProjectBannerCropDependencies) {}

  async execute(command: UpdateProjectBannerCropCommand) {
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

    const updated = await this.dependencies.projects.update({
      ...project,
      bannerCropX: command.params.x,
      bannerCropY: command.params.y,
      bannerCropZoom: command.params.zoom,
    })

    return {
      projectId: updated.id,
      bannerKey: updated.bannerKey ?? null,
      bannerCropX: updated.bannerCropX ?? null,
      bannerCropY: updated.bannerCropY ?? null,
      bannerCropZoom: updated.bannerCropZoom ?? null,
    }
  }
}

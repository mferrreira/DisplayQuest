import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { UpdateProjectLogoCropCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectLogoCropUseCase — DEC-242: grava os parâmetros do recorte quadrado do logo
 * (`logoCropX`/`logoCropY`/`logoCropZoom`).
 *
 * Gate: o MESMO da escrita de imagem do projeto (`resolveCanActorManageProject` — ACL do
 * vínculo, não `MANAGE_USERS`), medido no V5-2d. O binário não passa por aqui (DEC-133): o
 * recorte é parâmetro, o original continua no bucket na mesma chave. A rota clampa por
 * `clampCropCenterToBand` com a razão quadrada antes de chamar; este use case escreve o que
 * recebeu.
 */
export interface UpdateProjectLogoCropDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class UpdateProjectLogoCropUseCase {
  constructor(private readonly dependencies: UpdateProjectLogoCropDependencies) {}

  async execute(command: UpdateProjectLogoCropCommand) {
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
      logoCropX: command.params.x,
      logoCropY: command.params.y,
      logoCropZoom: command.params.zoom,
    })

    return {
      projectId: updated.id,
      logoKey: updated.logoKey ?? null,
      logoCropX: updated.logoCropX ?? null,
      logoCropY: updated.logoCropY ?? null,
      logoCropZoom: updated.logoCropZoom ?? null,
    }
  }
}

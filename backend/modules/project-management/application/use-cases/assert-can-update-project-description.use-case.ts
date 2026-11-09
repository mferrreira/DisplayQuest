import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * AssertCanUpdateProjectDescriptionUseCase — S07 (plan-v21, R11/DEC-262).
 *
 * O gate R9 (gestão da ACL OU membro ATIVO, DEC-261) precisa correr ANTES do corpo do
 * multipart ser lido (DEC-133): sem isso, quem não pode empurra bytes ao bucket e só depois
 * recebe o 403. Este assert é o mesmo par do `UpdateProjectDescriptionUseCase` — uma fonte
 * só da regra, porque a rota de upload não pode reimplementar o gate (DEC-90).
 */
export interface AssertCanUpdateProjectDescriptionDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class AssertCanUpdateProjectDescriptionUseCase {
  constructor(private readonly dependencies: AssertCanUpdateProjectDescriptionDependencies) {}

  async execute(command: { projectId: number; actorId: number }) {
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
      const activeMembership = await this.dependencies.memberships.findActiveMembership(command.projectId, command.actorId)
      if (!activeMembership) {
        throw new ForbiddenError("Usuário não tem permissão para gerenciar este projeto")
      }
    }
  }
}

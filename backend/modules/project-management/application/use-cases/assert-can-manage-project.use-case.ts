import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * AssertCanManageProjectUseCase — V5-2c (padrão `AssertCan*` do B6-2b/DEC-54).
 *
 * Existe para a rota de upload de anexo: a autorização tem que acontecer **antes** do corpo
 * ser lido. Sem isso, quem não gerencia o projeto consegue empurrar bytes para o bucket e só
 * depois recebe o 403 — o objeto fica órfão e o limite de tamanho é gasto à toa. É o mesmo
 * motivo do 403-antes-dos-400 das notificações, com o custo invertido: aqui o corpo é caro.
 *
 * Os use cases de escrita rechecam a gestão por conta própria (DEC-54: o gate protege também
 * os chamadores que não são rota). Este é a porta da rota.
 */
export interface AssertCanManageProjectDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class AssertCanManageProjectUseCase {
  constructor(private readonly dependencies: AssertCanManageProjectDependencies) {}

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
      throw new ForbiddenError("Usuário não tem permissão para gerenciar este projeto")
    }

    return { projectId: command.projectId }
  }
}

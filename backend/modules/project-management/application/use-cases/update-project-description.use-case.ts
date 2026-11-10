import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/backend/domain"
import type { UpdateProjectDescriptionCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRecord, ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectDescriptionUseCase — S06 (plan-v21, R9/DEC-261).
 *
 * Gate R9: gestão da ACL **ou** membro com situação ATIVA. Membro INATIVO e não-membro são 403.
 * A escrita completa do wizard (PUT do projeto) continua só da gestão — esta rota é a porta
 * estreita da descrição. Ordem medida: projeto 404 -> gate -> corpo. A validação é a regra de
 * descrição do domínio: não-string é recusada, string acima de 500 é recusada, null/não-enviado
 * limpa a linha, `""` é null (mesma postura de `normalizeProjectUpdate`: falsy -> null).
 */
export const DESCRIPTION_TYPE_MESSAGE = "Dados inválidos: Descrição do projeto é obrigatória"
export const DESCRIPTION_LENGTH_MESSAGE = "Descrição do projeto não pode ter mais de 500 caracteres"

export interface UpdateProjectDescriptionDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export function normalizeDescriptionInput(input: unknown): { description: string | null } | { error: string } {
  if (input === undefined || input === null) return { description: null }
  if (typeof input !== "string") return { error: DESCRIPTION_TYPE_MESSAGE }
  if (input.length > 500) return { error: DESCRIPTION_LENGTH_MESSAGE }
  return { description: input === "" ? null : input }
}

export class UpdateProjectDescriptionUseCase {
  constructor(private readonly dependencies: UpdateProjectDescriptionDependencies) {}

  async execute(command: UpdateProjectDescriptionCommand) {
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

    const normalized = normalizeDescriptionInput(command.description)
    if ("error" in normalized) {
      throw new ValidationError(normalized.error)
    }

    return await this.dependencies.projects.update({ ...project, description: normalized.description })
  }
}
